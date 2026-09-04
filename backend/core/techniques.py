"""The technique catalogue's database half: reading it, and writing one.

WHERE THE CATALOGUE ACTUALLY LIVES, because it is currently in two places. The
techniques the app ships with are hardcoded in
`frontend/src/data/techniques.ts`, transcribed from the client's DBT materials
and **still awaiting clinical review**; this table is what a specialist writes
from their own panel, and what a patient sees is the two merged (by slug, in
`frontend/src/utils/techniques.ts`). Moving the hardcoded half in here is the
obvious next step and deliberately not part of this change: that text is under
review, and a copy in a database nobody reviews is how the reviewed version
stops being the one on screen.

WHO SEES WHAT. Every published technique is visible to every patient — that is
the decision behind this feature, and it is why there is no per-patient
assignment table and no filtering by `patient.id_specjalist` here.
`author_id_specjalist` records who wrote a row and gates who may **edit** it; it
is not a visibility rule.

WHAT NEVER GOES ON THE WIRE. `author_id_specjalist` itself, and any name behind
it. Resolving a specialist's name would mean reading user_db from a medical_db
row, and this project keeps that meeting point in exactly one named module
(`core/account.py`). The panel needs no name — it only ever lists its own
techniques — and the patient's catalogue does not say who wrote an entry, which
is a question for the client rather than something to answer in a payload.

`TechniqueSerializer` lives here rather than in core/serializers.py, following
`DiaryEntrySerializer` in core/diary.py: that module is the authentication
endpoints' serializers, and the rules below are about the catalogue.
"""

from rest_framework import serializers

from .models import Technique
from .technique_vocabulary import (AVAILABILITIES, AVAILABILITY_GENERAL,
                                   DBT_GROUPS, DBT_MODULES, SCHOOLS)

#: The slugs the hardcoded catalogue already uses.
#:
#: A slug is what the patient's catalogue merges the two halves on, so a row here
#: claiming one of these would shadow (or be shadowed by) a built-in technique
#: depending on which side the merge reads first. Refusing the collision is the
#: only answer that cannot silently hide a description somebody wrote.
#:
#: A second copy of a list that lives in TypeScript, so it can drift —
#: `test_techniques.py` parses `frontend/src/data/techniques.ts` and fails when
#: it does, the same guard `test_emotions.py` puts on the emotion names.
BUILTIN_SLUGS = frozenset({
    'accepts', 'samokojenie', 'improve', 'za-i-przeciw', 'tipp', 'abc-please',
    'please', 'dear-man', 'uprawomocnienie', 'samouprawomocnienie',
    'dobrowolnosc', 'miarowe-oddychanie', 'progresywna-relaksacja-miesni',
})

#: Longest a step's description may be. Not a schema limit (the column is TEXT) —
#: a form guard, so a paste of an entire handbook chapter is refused at the API
#: rather than becoming a technique nobody can read on a phone.
MAX_STEP_DESCRIPTION = 4000
MAX_STEPS = 30
MAX_EXAMPLES = 10


def _step(raw):
    """One step as it is stored and sent: name (optional), description, examples.

    English keys, like every other column in this schema; the Polish field names
    on `TechniqueStep` in frontend/src/types/technique.ts are mapped in
    `api/techniques.ts`. `nazwa` is optional there because a few techniques in
    the source material are written as bare bullet points, and inventing names
    for them would be adding content.
    """
    return {
        'name': raw.get('name') or None,
        'description': raw.get('description') or '',
        'examples': list(raw.get('examples') or []),
    }


def serialize_technique(technique):
    """One technique, as both the panel and the patient's catalogue read it."""
    return {
        # The slug, not the primary key: it is what the URL carries on the
        # patient's side, and what the merge with the built-in catalogue is keyed
        # on. `id_technique` rides along because the panel's own edit and delete
        # URLs address the row itself.
        'slug': technique.slug,
        'id_technique': technique.id_technique,
        'name': technique.name,
        'subtitle': technique.subtitle,
        'schools': list(technique.schools or []),
        'dbt_group': technique.dbt_group,
        'dbt_module': technique.dbt_module,
        'availability': technique.availability,
        'intro': technique.intro,
        'steps': [_step(step) for step in (technique.steps or [])],
        'duration_min': technique.duration_min,
        'description_ready': technique.description_ready,
        'created_at': technique.created_at.isoformat() if technique.created_at else None,
        'updated_at': technique.updated_at.isoformat() if technique.updated_at else None,
    }


def published():
    """Everything a patient may be shown, in the order it was written.

    Two conditions, mirroring `isPublished` in frontend/src/utils/techniques.ts,
    and both are gates rather than tidiness:

    * `description_ready`, so a technique recorded before its content exists
      never becomes a row that opens an empty screen. This is also what keeps the
      four rows `mock_data.sql` seeds out of the catalogue: they carry a name and
      a sentence, not the structure the detail screen renders.
    * `availability == 'ogolna'`. Nothing is flagged otherwise today, but the flag
      exists for techniques carrying medical contraindications — and a safety flag
      that does not actually withhold anything is worse than none.

    A slug is required as well: without one the technique has no URL to open, so
    a row missing it would be a list entry leading nowhere.
    """
    return (
        Technique.objects
        .filter(
            description_ready=True,
            availability=AVAILABILITY_GENERAL,
            slug__isnull=False,
        )
        .order_by('name', 'id_technique')
    )


def for_specjalist(specjalist):
    """The techniques this specialist wrote, newest first — published or not.

    Their own drafts included, which is the point of the panel: a technique is
    written over more than one sitting, and `description_ready` is what decides
    whether patients see it yet.
    """
    return (
        Technique.objects
        .filter(author_id_specjalist=specjalist.pk)
        .order_by('-created_at', '-id_technique')
    )


def find_for_specjalist(specjalist, id_technique):
    """One of this specialist's own techniques, or None.

    `author_id_specjalist` alongside the id is what makes somebody else's
    technique answer exactly like a nonexistent one — the same convention as
    /api/diary/<id>/. It is also the whole of the edit permission: a specialist
    may correct what they wrote and not what a colleague did.
    """
    return Technique.objects.filter(
        pk=id_technique, author_id_specjalist=specjalist.pk,
    ).first()


class TechniqueStepSerializer(serializers.Serializer):
    """One component skill of a technique."""

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
    examples = serializers.ListField(
        child=serializers.CharField(max_length=500),
        required=False, max_length=MAX_EXAMPLES,
    )


class TechniqueSerializer(serializers.Serializer):
    """What the specialist's form may write into `technique`.

    The vocabularies (`schools`, `dbt_group`, `dbt_module`, `availability`) are
    closed sets declared in core/technique_vocabulary.py, and they are the same
    strings the frontend's union types declare — a value outside them reaches a
    screen with no label for it, which is why this refuses one with a 400 rather
    than storing free text. `diary.time_of_day` is the cautionary tale: a plain
    `Serializer` silently drops what it does not declare, and a patient was told
    an answer had been saved when it had not.

    `slug` is immutable once set: it is in the URL of a technique patients may
    already have opened, and renaming it would break a bookmark and, worse,
    quietly free the old slug for something else.
    """

    slug = serializers.RegexField(
        r'^[a-z0-9]+(-[a-z0-9]+)*$', max_length=64,
        error_messages={
            'blank': 'Podaj identyfikator techniki.',
            'required': 'Podaj identyfikator techniki.',
            'invalid': (
                'Identyfikator może zawierać tylko małe litery bez polskich '
                'znaków, cyfry i pojedyncze łączniki (np. „radykalna-akceptacja”).'
            ),
        },
    )
    name = serializers.CharField(
        max_length=200,
        error_messages={
            'blank': 'Podaj nazwę techniki.', 'required': 'Podaj nazwę techniki.',
        },
    )
    subtitle = serializers.CharField(
        max_length=300, required=False, allow_blank=True,
    )
    schools = serializers.ListField(
        child=serializers.ChoiceField(
            choices=SCHOOLS,
            error_messages={'invalid_choice': 'Nieznana szkoła terapii.'},
        ),
        allow_empty=False,
        error_messages={
            'empty': 'Wybierz co najmniej jedną zakładkę katalogu.',
            'required': 'Wybierz co najmniej jedną zakładkę katalogu.',
        },
    )
    dbt_group = serializers.ChoiceField(
        choices=DBT_GROUPS, required=False, allow_null=True, allow_blank=True,
        error_messages={'invalid_choice': 'Nieznana grupa DBT.'},
    )
    dbt_module = serializers.ChoiceField(
        choices=DBT_MODULES, required=False, allow_null=True, allow_blank=True,
        error_messages={'invalid_choice': 'Nieznany moduł DBT.'},
    )
    availability = serializers.ChoiceField(
        choices=AVAILABILITIES, required=False,
        error_messages={'invalid_choice': 'Nieznany poziom dostępności.'},
    )
    intro = serializers.CharField(
        max_length=MAX_STEP_DESCRIPTION,
        error_messages={
            'blank': 'Napisz, czemu ta technika służy.',
            'required': 'Napisz, czemu ta technika służy.',
        },
    )
    steps = TechniqueStepSerializer(many=True)
    duration_min = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=600,
        error_messages={
            'min_value': 'Czas trwania musi być dodatni.',
            'max_value': 'Czas trwania wygląda na literówkę.',
        },
    )
    description_ready = serializers.BooleanField(required=False)

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
        if value in BUILTIN_SLUGS:
            raise serializers.ValidationError(self.SLUG_BUILTIN)
        taken = Technique.objects.filter(slug=value)
        # On an edit, the technique's own slug is not a collision with itself.
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
        """Model kwargs from validated input, with the empty strings normalized.

        A blank optional text field arrives as '' from a form that rendered an
        empty input; stored as NULL, so "not answered" is one value in the
        database rather than two the readers have to remember to treat alike.
        """
        fields = {
            'slug': validated_data['slug'],
            'name': validated_data['name'],
            'subtitle': validated_data.get('subtitle') or None,
            'schools': list(validated_data['schools']),
            'dbt_group': validated_data.get('dbt_group') or None,
            'dbt_module': validated_data.get('dbt_module') or None,
            'availability': validated_data.get('availability') or AVAILABILITY_GENERAL,
            'intro': validated_data['intro'],
            'steps': [_step(step) for step in validated_data['steps']],
            'duration_min': validated_data.get('duration_min'),
            'description_ready': validated_data.get('description_ready', True),
        }
        return fields

    def create(self, validated_data):
        return Technique.objects.create(
            author_id_specjalist=self.specjalist.pk,
            # The original column, kept in step rather than left behind: it is
            # what `raport.id_technique` joins to and what the home screen's
            # suggestion card reads, so a technique with a name here and nothing
            # in `type`/`description` would show up there as a blank suggestion.
            type=(validated_data['schools'] or [None])[0],
            description=validated_data['intro'],
            **self._fields(validated_data),
        )

    def update(self, instance, validated_data):
        fields = self._fields(validated_data)
        # The slug is in the URL of a technique patients may already have opened
        # — see the class docstring. Silently keeping the old one would be worse
        # than either alternative, so a change is refused rather than ignored.
        if fields['slug'] != instance.slug:
            raise serializers.ValidationError(
                {'slug': 'Identyfikatora nie można zmienić po utworzeniu techniki.'}
            )
        fields['description'] = fields['intro']
        fields['type'] = (fields['schools'] or [None])[0]
        for key, value in fields.items():
            setattr(instance, key, value)
        instance.save()
        return instance
