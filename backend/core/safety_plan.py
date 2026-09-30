"""The patient's own safety plan — GET/PUT /api/safety-plan/.

WRITTEN BY THE PATIENT, READ BY THE PATIENT. Nobody else reads or writes it
here: not the guardian, not the specialist, not the admin panel (whose medical
view is app-wide totals only). A specialist can still help fill it in during a
visit, sitting next to the person, which is how a safety plan is usually made —
but the words are the patient's and the only write path is their session.

WHAT IT HOLDS — the parts of a Stanley-Brown plan this app can honestly carry in
a self-service form: warning signs, what helps, people to reach out to, a
professional to call, and notes. **Not** the "means restriction" step (listing
the ways somebody could hurt themselves): that belongs in a consulting room with
a clinician present, never in an app used by minors. The crisis lines are not
part of the plan either — they are on the screen for everybody, plan or not
(frontend/src/data/crisisLines.ts).

NOTHING IS REQUIRED, and a PUT replaces the whole plan, the rule the health
profile and every other form here follow: the screen submits its whole state,
so a line left out is a line taken back. An all-empty plan is a valid save.

GET ON A PLAN NOBODY HAS WRITTEN answers `null` rather than an empty plan or a
404: the screen shows an invitation to write one, which is a different thing
from a plan that exists and happens to be empty, and a 404 would be
indistinguishable from a missing endpoint.
"""

import re

from rest_framework import serializers

from .models import SafetyPlan

#: How much a plan may hold. Not schema limits (the columns are JSONB and TEXT)
#: — form guards, so a plan stays something a person in a bad moment can read
#: on a phone, and a paste of a whole document is refused rather than stored.
MAX_LINES = 20
MAX_LINE_LENGTH = 300
MAX_PEOPLE = 10
MAX_NAME_LENGTH = 100
MAX_NOTES_LENGTH = 2000

#: Digits, spaces, dashes, brackets and a leading plus — what people actually
#: type for a phone number — with at least three digits in it. Stored as typed:
#: the screen dials the digits and shows the text.
PHONE_RE = re.compile(r'^\+?[0-9 ()\-]{3,30}$')
PHONE_INVALID = 'Podaj numer telefonu — cyfry, spacje lub myślniki, np. 600 700 800.'


def _clean_line(value):
    return value.strip()


class PhoneField(serializers.CharField):
    """An optional phone number, blank meaning "no number"."""

    def __init__(self, **kwargs):
        super().__init__(max_length=30, required=False, allow_blank=True,
                         allow_null=True, **kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        value = (value or '').strip()
        if not value:
            return None
        if not PHONE_RE.match(value) or sum(ch.isdigit() for ch in value) < 3:
            raise serializers.ValidationError(PHONE_INVALID)
        return value


class TrustedPersonSerializer(serializers.Serializer):
    name = serializers.CharField(
        max_length=MAX_NAME_LENGTH,
        error_messages={
            'blank': 'Podaj imię lub nazwę osoby.',
            'required': 'Podaj imię lub nazwę osoby.',
        },
    )
    relation = serializers.CharField(
        max_length=MAX_NAME_LENGTH, required=False, allow_blank=True, allow_null=True,
    )
    phone = PhoneField()


class ProfessionalContactSerializer(serializers.Serializer):
    name = serializers.CharField(
        max_length=MAX_NAME_LENGTH,
        error_messages={
            'blank': 'Podaj imię i nazwisko lub nazwę miejsca.',
            'required': 'Podaj imię i nazwisko lub nazwę miejsca.',
        },
    )
    role = serializers.CharField(
        max_length=MAX_NAME_LENGTH, required=False, allow_blank=True, allow_null=True,
    )
    phone = PhoneField()


class LinesField(serializers.ListField):
    """A list of short free-text lines; blank lines are dropped, not stored."""

    def __init__(self, **kwargs):
        super().__init__(
            child=serializers.CharField(
                max_length=MAX_LINE_LENGTH, allow_blank=True,
                error_messages={
                    'max_length': f'Jedna pozycja może mieć najwyżej {MAX_LINE_LENGTH} znaków.',
                },
            ),
            required=False, max_length=MAX_LINES,
            error_messages={'max_length': f'Lista może mieć najwyżej {MAX_LINES} pozycji.'},
            **kwargs,
        )

    def to_internal_value(self, data):
        return [line for line in (_clean_line(v) for v in super().to_internal_value(data)) if line]


class SafetyPlanSerializer(serializers.Serializer):
    """What the plan form may write. Every field optional — see the module header."""

    warning_signs = LinesField()
    coping_strategies = LinesField()
    trusted_people = TrustedPersonSerializer(
        many=True, required=False, max_length=MAX_PEOPLE,
        error_messages={'max_length': f'Możesz dodać najwyżej {MAX_PEOPLE} osób.'},
    )
    professional_contact = ProfessionalContactSerializer(required=False, allow_null=True)
    notes = serializers.CharField(
        max_length=MAX_NOTES_LENGTH, required=False, allow_blank=True, allow_null=True,
    )

    def save_plan(self, id_medical):
        data = self.validated_data
        contact = data.get('professional_contact')
        plan, _ = SafetyPlan.objects.update_or_create(
            id_medical=id_medical,
            defaults={
                'warning_signs': data.get('warning_signs') or [],
                'coping_strategies': data.get('coping_strategies') or [],
                'trusted_people': [
                    {
                        'name': person['name'].strip(),
                        'relation': (person.get('relation') or '').strip() or None,
                        # '' never reaches `PhoneField.to_internal_value` — DRF
                        # short-circuits a blank string — so it is folded here.
                        'phone': person.get('phone') or None,
                    }
                    for person in data.get('trusted_people') or []
                ],
                'professional_contact': None if not contact else {
                    'name': contact['name'].strip(),
                    'role': (contact.get('role') or '').strip() or None,
                    'phone': contact.get('phone') or None,
                },
                'notes': (data.get('notes') or '').strip() or None,
            },
        )
        return plan


def serialize_plan(plan):
    """The plan as the screen reads it, or None when there is none."""
    if plan is None:
        return None
    return {
        'warning_signs': list(plan.warning_signs or []),
        'coping_strategies': list(plan.coping_strategies or []),
        'trusted_people': list(plan.trusted_people or []),
        'professional_contact': plan.professional_contact,
        'notes': plan.notes,
        'updated_at': plan.updated_at.isoformat() if plan.updated_at else None,
    }


def plan_for(id_medical):
    return SafetyPlan.objects.filter(id_medical=id_medical).first()
