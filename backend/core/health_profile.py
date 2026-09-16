"""Profil zdrowotny — §13 of `Makiety modułu dietetycznego`.

Out of the views like `core/sleep.py` and `core/activity.py` beside it, and
like them this module sees nothing but an `id_medical`.

WHY THIS LIVES IN medical_db, against the note the frontend contract left.
`frontend/src/api/healthProfile.ts` asks for a table in **user_db**, reasoning
that a body and a diagnosis are PII about a named person and that "putting a
weight next to a pseudonymous key would put identity into the database whose
whole point is not having any". The second half of that sentence is the one
that does not hold: a weight identifies nobody, and `id_medical` stays exactly
as pseudonymous with a height beside it as it is with a night's sleep beside
it. The direction of the risk is the other way round — 'eating-disorder' and
'depression' filed next to the e-mail address and the surname in `user_db` is
precisely the pairing the two-database split exists to prevent. So CLAUDE.md's
own rule decides it: clinical data goes in medical_db, and seventeen
diagnoses are clinical data of the plainest kind. The endpoint is still gated
by `_require_patient` exactly as that note asks.

WHAT §13 DECIDES, and most of it is about what this module must *not* do:

* **No BMI, no ratio, no verdict on a value** — not a column, not a serializer
  field, not a helper. §13 rules it out by name and says why: "Wśród pacjentek
  są osoby z zaburzeniami odżywiania — te dwie liczby są danymi dla
  specjalisty, nie celem pokazywanym codziennie." `weight_kg` and
  `target_weight_kg` are two independent numbers that happen to sit next to
  each other and nothing here subtracts one from the other.
* **No history.** One current row per patient. A weight series is what a chart
  is made of, and §13's whole argument is that there is no chart. `updated_at`
  records when the row last changed and nothing records what it said before.
* **No field blocks a save** (§05, the rule the whole module follows), so every
  column is nullable and every serializer field is optional.
* **No medicines.** `/diet/supplements` holds those with a dose, a frequency,
  hours and dates. §08's own note leaves open whether the profile's "przyjmowane
  leki" is that data or a second entry, and answering it with a column here
  would be answering it.

THE CONDITION VOCABULARY IS DECLARED TWICE, here and in
`frontend/src/utils/healthProfile.ts`, and `core/tests/test_health_profile.py`
compares the two in both directions — the same arrangement `core/emotions.py`
has with `utils/emotions.ts`, and CLAUDE.md asks for it by name. The keys are
technical and the Polish labels are the frontend's: a label is a thing clients
and translators reword, and rewording one must not silently orphan every row
that was stored under it.
"""

from decimal import Decimal

from rest_framework import serializers

from .models import HealthCondition, HealthProfile

#: The three answers §13 offers for "poziom aktywności fizycznej".
#:
#: A closed set, unlike the three eating fields below, because unlike an allergy
#: this question genuinely has three answers on the artboard and no space
#: between them. NULL — nobody answered — is a fourth state and not one of the
#: three: an untouched control that quietly meant 'low' would be the app
#: answering a question about somebody's body on their behalf.
ACTIVITY_LOW = 'low'
ACTIVITY_MODERATE = 'moderate'
ACTIVITY_HIGH = 'high'

ACTIVITY_LEVELS = (ACTIVITY_LOW, ACTIVITY_MODERATE, ACTIVITY_HIGH)

#: §13's seventeen, in the order the frontend draws them.
#:
#: **The psychiatric diagnoses are in the same tuple as the somatic ones** —
#: eating disorders, depression, anxiety, ADHD and autism sit after
#: hypercholesterolemia with nothing between them. That is §13's own note
#: ("Rozpoznania psychiatryczne stoją w tej samej liście, co somatyczne — bez
#: osobnej sekcji"), and splitting them here would put the seam back in the one
#: place it would be visible again: the API.
#:
#: The order is load-bearing in the same modest way `EMOTIONS`' order is:
#: `serialize_profile` sorts by it, so two clients reading one profile list the
#: chips in one order rather than in whatever order the rows were written.
CONDITIONS = (
    'diabetes-1',
    'diabetes-2',
    'insulin-resistance',
    'pcos',
    'hashimoto',
    'hypothyroidism',
    'hyperthyroidism',
    'coeliac',
    'bowel',
    'reflux',
    'hypertension',
    'hypercholesterolemia',
    'eating-disorder',
    'depression',
    'anxiety',
    'adhd',
    'autism',
)

#: Where a measurement stops being a measurement.
#:
#: 999.9 is what `NUMERIC(4,1)` holds, and the frontend's own field accepts
#: three digits and one decimal (`typeMeasurement`), so the two ends refuse the
#: same values. Not a judgement about any body — it is the point past which a
#: number is a held-down key rather than an answer, and the reason to catch it
#: here is that the alternative is a database error rendered as a 500.
MAX_MEASUREMENT = Decimal('999.9')

#: And where it starts. `parseMeasurement` on the frontend reads 0 as a typo
#: rather than an answer ("nobody is 0 cm tall"), and sends null; this is the
#: same rule for anything that arrives without passing through it.
MIN_MEASUREMENT = Decimal('0.1')

#: The three eating fields are free text on §13's own instruction ("Pola
#: opisowe, nie słownikowe — pacjentka wpisuje własnymi słowami"), so the only
#: limit is the one that keeps a runaway paste out of a clinical record. The
#: same number `MealSerializer.description` uses.
MAX_TEXT = 2000

#: A hand-written condition is a diagnosis, not an essay — the same length
#: `SupplementSerializer.name` allows.
MAX_OWN_CONDITION = 120

#: How many of them one profile may hold. Generous enough that no real intake
#: form meets it, low enough that the list stays a list.
MAX_OWN_CONDITIONS = 30


class HealthProfileSerializer(serializers.Serializer):
    """What §13's "Zapisz" sends.

    NOTHING IS REQUIRED, §05's rule again: a profile that answers nothing is an
    ordinary row, and the screen says so in as many words ("Żadne pole nie
    blokuje zapisu"). A profile filled in halfway is better than one nobody
    dared start.

    PUT REPLACES RATHER THAN MERGES, the rule every form in this app follows —
    the diary, the meal form, the supplement form and the sleep panel all do it.
    The screen submits its whole state, so a field left out is an answer taken
    back rather than one left unchanged. A merge would make clearing an allergy
    impossible from the only form that writes it.

    `activity_level` and every entry of `conditions` are constrained rather than
    free, which is `0009`'s lesson twice over: a plain `Serializer` drops an
    undeclared key *without an error*, and a value outside the vocabulary would
    be stored and then fail to render as a chip — an allergy silently missing
    from a dietitian's intake form is the failure this screen can least afford.
    """

    height_cm = serializers.DecimalField(
        max_digits=4, decimal_places=1,
        min_value=MIN_MEASUREMENT, max_value=MAX_MEASUREMENT,
        required=False, allow_null=True,
        # A JSON number rather than DRF's default string. The frontend formats
        # it back into the field somebody types in, and '168.0' arriving as a
        # quoted string would make that a parse of a parse.
        coerce_to_string=False,
    )
    weight_kg = serializers.DecimalField(
        max_digits=4, decimal_places=1,
        min_value=MIN_MEASUREMENT, max_value=MAX_MEASUREMENT,
        required=False, allow_null=True, coerce_to_string=False,
    )
    target_weight_kg = serializers.DecimalField(
        max_digits=4, decimal_places=1,
        min_value=MIN_MEASUREMENT, max_value=MAX_MEASUREMENT,
        required=False, allow_null=True, coerce_to_string=False,
    )
    activity_level = serializers.ChoiceField(
        choices=ACTIVITY_LEVELS, required=False, allow_null=True,
        allow_blank=True,
    )
    allergies = serializers.CharField(
        max_length=MAX_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    intolerances = serializers.CharField(
        max_length=MAX_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    dietary_preferences = serializers.CharField(
        max_length=MAX_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    conditions = serializers.ListField(
        child=serializers.ChoiceField(choices=CONDITIONS),
        required=False, allow_empty=True,
    )
    own_conditions = serializers.ListField(
        # `allow_blank` because §05's "no field blocks a save" applies to the
        # entries of a list as much as to a field: a blank one is dropped by
        # `validate_own_conditions` rather than refused, which would fail the
        # whole profile over an entry that says nothing.
        child=serializers.CharField(
            max_length=MAX_OWN_CONDITION, allow_blank=True),
        required=False, allow_empty=True, max_length=MAX_OWN_CONDITIONS,
    )

    def validate_conditions(self, value):
        """One row per condition — picking 'Hashimoto' twice is one answer.

        The same rule `uq_health_condition` enforces in the database, caught
        here so a double-submitted form is a 400 with a sentence rather than an
        IntegrityError rendered as a 500.
        """
        if len(value) != len(set(value)):
            raise serializers.ValidationError(
                'Ta sama jednostka chorobowa może pojawić się tylko raz.',
            )
        return value

    def validate_own_conditions(self, value):
        """Trimmed, with the blanks dropped.

        The frontend already trims (`toHealthProfileInput`) and refuses to add
        an empty entry, so this is for anything that did not come through it.
        A blank row would draw an empty chip with a remove button next to it.

        Dropped rather than refused, for the reason `allow_blank` is set above:
        §05's rule is that nothing blocks a save, and a 400 over an entry that
        says nothing would lose the entries beside it that say something.
        """
        return [entry.strip() for entry in value if entry.strip()]

    def save_profile(self, id_medical):
        """Write the profile, replacing whatever was there.

        `update_or_create` against the `id_medical` unique constraint, so a
        second save is an edit and not a second profile — the same shape
        `sleep.SleepSerializer.save_night` gives a night, and the same reason.

        The conditions are replaced wholesale for the reason the meal form
        replaces its emotions (`meals._write_emotions`): a condition left out of
        the body is one the patient un-picked on the form, and the only way to
        tell that from one they never picked would be to diff the two — which
        for a form that submits its whole state is arithmetic in aid of nothing.
        """
        data = self.validated_data
        profile, _ = HealthProfile.objects.update_or_create(
            id_medical=id_medical,
            defaults={
                'height_cm': data.get('height_cm'),
                'weight_kg': data.get('weight_kg'),
                'target_weight_kg': data.get('target_weight_kg'),
                # `or None` rather than `.get(...)`: a ChoiceField that allows
                # blank lets '' through, and '' is not one of the three levels.
                # It means the same as null here -- nobody answered -- and
                # storing both would give that state two spellings.
                'activity_level': data.get('activity_level') or None,
                'allergies': _or_none(data.get('allergies')),
                'intolerances': _or_none(data.get('intolerances')),
                'dietary_preferences': _or_none(data.get('dietary_preferences')),
            },
        )
        _write_conditions(
            profile,
            data.get('conditions') or [],
            data.get('own_conditions') or [],
        )
        return profile


def _or_none(value):
    """Trimmed, or None when there is nothing but whitespace.

    '' and NULL would otherwise be two spellings of "not filled in", and the
    screen reads both as an empty field — so only one of them is ever stored.
    """
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _write_conditions(profile, conditions, own_conditions):
    """Replace this profile's conditions with exactly these.

    Delete-then-insert rather than a diff, which is what `meals._write_emotions`
    does and for the same reason: the form submits its whole state, so the set
    it sends *is* the answer. The rows carry no history and nothing references
    them, so there is nothing for an id to be stable for.

    `position` is the index within each of the two lists, and it is what the
    hand-written entries come back in: they have no vocabulary to be sorted by,
    so the order somebody typed them in is the only order there is. The picked
    chips carry one too and ignore it — `serialize_profile` sorts those by the
    vocabulary, so they come back in the order §13 draws them rather than in the
    order they happened to be tapped.
    """
    profile.conditions.all().delete()
    HealthCondition.objects.bulk_create(
        [
            HealthCondition(profile=profile, condition=condition, position=index)
            for index, condition in enumerate(conditions)
        ]
        + [
            HealthCondition(profile=profile, own_label=label, position=index)
            for index, label in enumerate(own_conditions)
        ]
    )


def empty_profile():
    """A profile nobody has filled in — what the endpoint answers when there is
    no row.

    An object rather than a 404, the same choice `/api/diet/sleep/` makes: the
    screen is a form, there is always a profile on it (this patient's), and the
    question is only whether anything has been written. An untouched profile and
    one saved with every field blank are the same thing in truth, so they are
    the same response.

    **EVERY VALUE HERE IS EMPTY AND MUST STAY EMPTY.** The temptation this
    comment exists to defuse is the artboard's 168 cm and 71 kg, filled in so
    the screen "shows something" — which is what `frontend/src/data/profile.ts`
    did with the mockup's example patient and why it was deleted. A height and a
    weight printed into somebody's own profile are a statement about that
    person's body, shown to that person, in a module whose §13 says in so many
    words that some of its users have eating disorders.
    """
    return {
        'height_cm': None,
        'weight_kg': None,
        'target_weight_kg': None,
        'activity_level': None,
        'allergies': None,
        'intolerances': None,
        'dietary_preferences': None,
        'conditions': [],
        'own_conditions': [],
    }


def build_health_profile(id_medical):
    """This patient's profile, or the empty one.

    One query for the row and one for its conditions (`prefetch_related`), which
    is what keeps a profile holding seventeen chips at two queries rather than
    eighteen.
    """
    profile = (
        HealthProfile.objects
        .filter(id_medical=id_medical)
        .prefetch_related('conditions')
        .first()
    )
    return empty_profile() if profile is None else serialize_profile(profile)


def serialize_profile(profile):
    """The profile as the screen reads it.

    The measurements go out as JSON numbers (`float`) rather than as Decimals
    or strings: `Decimal('168.0')` renders as 168.0 either way, and the cast is
    here so the shape does not depend on which renderer is in play — a test
    asserting on `response.data` sees the same thing the browser does.

    `conditions` and `own_conditions` are two lists rather than one, mirroring
    the two the form holds: the first is a closed vocabulary the frontend maps
    to labels, the second is somebody's own words. One list would make the
    reader guess which of the two each entry is, and a hand-written "hashimoto"
    would then be indistinguishable from the chip.
    """
    rows = list(profile.conditions.all())
    order = {condition: index for index, condition in enumerate(CONDITIONS)}
    picked = sorted(
        (row.condition for row in rows if row.condition),
        # A condition outside the vocabulary cannot be written through the API,
        # so the fallback is for a row that predates a rename -- last, and in a
        # fixed place rather than wherever the query happened to put it.
        key=lambda condition: (order.get(condition, len(order)), condition),
    )
    return {
        'height_cm': _number(profile.height_cm),
        'weight_kg': _number(profile.weight_kg),
        'target_weight_kg': _number(profile.target_weight_kg),
        'activity_level': profile.activity_level,
        'allergies': profile.allergies,
        'intolerances': profile.intolerances,
        'dietary_preferences': profile.dietary_preferences,
        'conditions': picked,
        # In the order they were written (`Meta.ordering` is `position`), which
        # for hand-typed entries is the only order there is: there is no
        # vocabulary to sort them by, and alphabetising somebody's own list
        # would rearrange it under them between one visit and the next.
        'own_conditions': [row.own_label for row in rows if row.own_label],
    }


def _number(value):
    """A Decimal column as a JSON number, or None."""
    return None if value is None else float(value)
