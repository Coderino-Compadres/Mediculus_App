"""The psychodietetic catalogue's database half: reading it, and writing one.

The diet module's counterpart to core/techniques.py, and deliberately the same
arrangement: the techniques the app ships with are hardcoded in
`frontend/src/data/dietTechniques.ts` (the client's own text), this is what a
psychodietitian writes from their panel, and what a patient sees on
/diet/techniques is the two merged by slug (`utils/dietTechniques.ts`).

ONE TABLE, TWO CATALOGUES. The rows live in `technique` next to the DBT ones,
told apart by `module`. The rules around a technique are the same in both —
`author_id_specjalist` gates editing and nothing else, saving is publishing, the
slug is immutable and unique across the table, deleting a specialist keeps their
techniques with the author cleared (core/admin_panel.py) — and one table keeps
them the same rule rather than two copies of it. What differs is the shape: no
schools, no DBT group or module, and two fields the DBT catalogue has not got,
`example` and `note` (see `przyklad` / `notka` in types/dietTechnique.ts).

WHO MAY WRITE. A specialist whose `specjalist.module` is 'diet'. The DBT panel
refuses a psychodietitian (core/views.py, `_require_technique_author`) and this
one refuses a psychotherapist, so each module's catalogue is written by that
module's specialists.

WHAT NEVER GOES ON THE WIRE: the author, for the reason core/techniques.py gives.
"""

from rest_framework import serializers

from .models import Technique
from .modules import MODULE_DIET
from .technique_vocabulary import AVAILABILITY_GENERAL
from .techniques import (BUILTIN_SLUGS, DIET_BUILTIN_SLUGS, MAX_STEP_DESCRIPTION,
                         MAX_STEPS, create_technique)


def _step(raw):
    """One step as it is stored and sent: name (optional) and description.

    The same JSON shape the DBT rows use, minus `examples` — a diet technique's
    worked example belongs to the whole technique (`example`), not to a step.
    """
    return {
        'name': raw.get('name') or None,
        'description': raw.get('description') or '',
    }


def serialize_diet_technique(technique):
    """One technique, as both the panel and the patient's catalogue read it."""
    return {
        'slug': technique.slug,
        'id_technique': technique.id_technique,
        'name': technique.name,
        # "Kiedy po nią sięgnąć" — stored in `subtitle`, the short line the DBT
        # catalogue prints under a name; `momentZastosowania` on the frontend.
        'moment': technique.subtitle,
        'intro': technique.intro,
        'steps': [_step(step) for step in (technique.steps or [])],
        'example': technique.example,
        'note': technique.note,
        'duration_min': technique.duration_min,
        'created_at': technique.created_at.isoformat() if technique.created_at else None,
        'updated_at': technique.updated_at.isoformat() if technique.updated_at else None,
    }


def published():
    """Everything a patient may be shown — the same gates as `techniques.published`."""
    return (
        Technique.objects
        .filter(
            module=MODULE_DIET,
            description_ready=True,
            availability=AVAILABILITY_GENERAL,
            slug__isnull=False,
        )
        .order_by('created_at', 'id_technique')
    )


def for_specjalist(specjalist):
    """The diet techniques this specialist wrote, newest first."""
    return (
        Technique.objects
        .filter(author_id_specjalist=specjalist.pk, module=MODULE_DIET)
        .order_by('-created_at', '-id_technique')
    )


def find_for_specjalist(specjalist, id_technique):
    """One of this specialist's own diet techniques, or None.

    A colleague's technique, and a DBT row, answer exactly like a nonexistent one.
    """
    return Technique.objects.filter(
        pk=id_technique, author_id_specjalist=specjalist.pk, module=MODULE_DIET,
    ).first()


class DietTechniqueStepSerializer(serializers.Serializer):
    name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, allow_null=True,
    )
    description = serializers.CharField(
        max_length=MAX_STEP_DESCRIPTION,
        error_messages={
            'blank': 'Opis kroku nie może być pusty.',
            'required': 'Opis kroku nie może być pusty.',
        },
    )


class DietTechniqueSerializer(serializers.Serializer):
    """What the psychodietitian's form may write into `technique`.

    Same rules as `TechniqueSerializer`: the slug is immutable once set, and
    `description_ready` / `availability` are not inputs — saving is publishing.
    """

    slug = serializers.RegexField(
        r'^[a-z0-9]+(-[a-z0-9]+)*$', max_length=64,
        error_messages={
            'blank': 'Podaj identyfikator techniki.',
            'required': 'Podaj identyfikator techniki.',
            'invalid': (
                'Identyfikator może zawierać tylko małe litery bez polskich '
                'znaków, cyfry i pojedyncze łączniki.'
            ),
        },
    )
    name = serializers.CharField(
        max_length=200,
        error_messages={
            'blank': 'Podaj nazwę techniki.', 'required': 'Podaj nazwę techniki.',
        },
    )
    moment = serializers.CharField(
        max_length=300, required=False, allow_blank=True, allow_null=True,
    )
    intro = serializers.CharField(
        max_length=MAX_STEP_DESCRIPTION,
        error_messages={
            'blank': 'Napisz, czemu ta technika służy.',
            'required': 'Napisz, czemu ta technika służy.',
        },
    )
    steps = DietTechniqueStepSerializer(many=True)
    example = serializers.CharField(
        max_length=MAX_STEP_DESCRIPTION, required=False, allow_blank=True,
        allow_null=True,
    )
    note = serializers.CharField(
        max_length=MAX_STEP_DESCRIPTION, required=False, allow_blank=True,
        allow_null=True,
    )
    duration_min = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=600,
        error_messages={
            'min_value': 'Czas trwania musi być dodatni.',
            'max_value': 'Czas trwania wygląda na literówkę.',
        },
    )

    SLUG_TAKEN = 'Technika o tym identyfikatorze już istnieje.'
    SLUG_BUILTIN = (
        'Ten identyfikator należy do techniki wbudowanej w katalog. '
        'Wybierz inny.'
    )
    NO_STEPS = 'Dodaj co najmniej jeden krok — opis bez kroków nie ma czego wyświetlić.'
    TOO_MANY_STEPS = f'Technika może mieć najwyżej {MAX_STEPS} kroków.'

    @property
    def specjalist(self):
        return self.context['specjalist']

    def validate_slug(self, value):
        if value in BUILTIN_SLUGS or value in DIET_BUILTIN_SLUGS:
            raise serializers.ValidationError(self.SLUG_BUILTIN)
        # The whole table, not only the diet rows: the column is unique.
        taken = Technique.objects.filter(slug=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError(self.SLUG_TAKEN)
        return value

    def validate_steps(self, value):
        if not value:
            raise serializers.ValidationError(self.NO_STEPS)
        if len(value) > MAX_STEPS:
            raise serializers.ValidationError(self.TOO_MANY_STEPS)
        return value

    def _fields(self, validated_data):
        """Model kwargs, with blank optional text stored as NULL."""
        return {
            'slug': validated_data['slug'],
            'name': validated_data['name'],
            'subtitle': validated_data.get('moment') or None,
            'intro': validated_data['intro'],
            'steps': [_step(step) for step in validated_data['steps']],
            'example': validated_data.get('example') or None,
            'note': validated_data.get('note') or None,
            'duration_min': validated_data.get('duration_min'),
            # Not inputs — see `TechniqueSerializer._fields`.
            'availability': AVAILABILITY_GENERAL,
            'description_ready': True,
            # Kept in step like the DBT rows keep theirs, so nothing reading the
            # original columns finds a blank technique.
            'description': validated_data['intro'],
        }

    def create(self, validated_data):
        # The slug race is caught there — see `create_technique`.
        return create_technique(
            author_id_specjalist=self.specjalist.pk,
            module=MODULE_DIET,
            schools=[],
            **self._fields(validated_data),
        )

    def update(self, instance, validated_data):
        fields = self._fields(validated_data)
        if fields['slug'] != instance.slug:
            raise serializers.ValidationError(
                {'slug': 'Identyfikatora nie można zmienić po utworzeniu techniki.'}
            )
        for key, value in fields.items():
            setattr(instance, key, value)
        instance.save()
        return instance
