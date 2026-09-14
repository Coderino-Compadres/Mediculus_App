"""Sen — §09's second half, and the one rule about it nothing in the data states.

Out of the views like `core/activity.py` beside it, and like it this module sees
nothing but an `id_medical`.

**WHICH NIGHT A ROW DESCRIBES IS A CONVENTION, NOT A FACT IN THE DATA.** A night
carries the date of the *morning it ended on*: filled in on Friday, it is the
night from Thursday to Friday. A row holding 23:40 and 06:50 reads equally well
as either day, and the two answers put one night in two different weekly
reports — so the rule is written down here, at `models.DietSleep.entry_date`,
and at `frontend/src/types/diet.ts`'s own field. Changing it silently moves
nights between reports.

WHAT §09 DECIDES:

* **Five questions.** When you fell asleep, when you woke, how the night was on
  a 1-5 scale, how many times it was broken, and how you felt on waking. There
  is no sleep score, no weekly average, no seven-night chart and nothing
  relating sleep to meals or to mood — that last is a specialist's reading and
  belongs to the analysis screen, not to the form that collects it.
* **No field blocks a save** (§05), so every column but `awakenings` is
  nullable.
* **The length of the night is never stored.** It is the distance between the
  two hours, wrapping midnight, and `frontend/src/utils/sleep.ts` is the one
  place that arithmetic lives. A column would be a second answer free to
  disagree with the two hours beside it.

`WAKE_FEELINGS` are technical keys with the Polish labels in
`frontend/src/utils/sleep.ts` — the split `core/time_of_day.py` documents, and
the right way round for four words whose wording is a copy decision.
`core/tests/test_sleep.py` compares the two lists, names and order, in both
directions.
"""

from rest_framework import serializers

from .models import DietSleep

#: How the night is rated. Numbers rather than named grades, which is what the
#: mockup's other variant draws: "Bardzo zła … Bardzo dobra" asks the patient to
#: judge their night in words, and this module describes rather than grades.
SLEEP_QUALITY_VALUES = (1, 2, 3, 4, 5)

#: How somebody felt on waking, in the order §09 draws them. Technical keys; the
#: Polish labels are the frontend's.
WAKE_RESTED = 'rested'
WAKE_HEAVY = 'heavy'
WAKE_CALM = 'calm'
WAKE_TENSE = 'tense'

WAKE_FEELINGS = (WAKE_RESTED, WAKE_HEAVY, WAKE_CALM, WAKE_TENSE)

#: The most interruptions one night may record.
#:
#: Not a judgement about anybody's night — it is what a stepper somebody holds
#: down can otherwise write into a clinical record. Generous enough that no real
#: night meets it.
MAX_AWAKENINGS = 50


class SleepSerializer(serializers.Serializer):
    """What §09's "Zapisz" sends for one night.

    NOTHING IS REQUIRED, §05's rule again: a night that answers nothing is an
    ordinary row. The panel saves what is on the form, and the form starts
    empty.

    PUT REPLACES RATHER THAN MERGES, the same rule as `/api/diary/today/`, the
    supplement form and the meal form: the panel submits its whole state, so a
    field left out is an answer taken back rather than one left unchanged. A
    merge would make clearing an hour impossible from the only form that writes
    it.

    `wake_feeling` and `quality` are constrained rather than free, which is
    `0009`'s lesson: a plain `Serializer` drops an undeclared key *without an
    error*, and a value outside the vocabulary would be stored and then fail to
    render. Both are a 400 here.

    THE NIGHT IS NEVER AN INPUT. `entry_date` comes from the server's clock, so
    a date in the body reaches nothing — §09's rule is that a night whose
    morning has passed cannot be rewritten, and no URL names an older one.

    **`woke_up_at` earlier than `fell_asleep_at` is the ordinary case and is not
    refused**: the night crosses midnight. The one pair the frontend refuses is
    two identical hours (`sleepHoursCollide`), which measure a full turn of the
    clock and are a slip of the finger — and it refuses them by declining to
    print a length, not by blocking the save, because §05 says no field blocks
    one. So nothing here rejects a pair of hours either; the two ends agree.
    """

    fell_asleep_at = serializers.TimeField(required=False, allow_null=True)
    woke_up_at = serializers.TimeField(required=False, allow_null=True)
    quality = serializers.ChoiceField(
        choices=SLEEP_QUALITY_VALUES, required=False, allow_null=True,
    )
    awakenings = serializers.IntegerField(
        min_value=0, max_value=MAX_AWAKENINGS, required=False, default=0,
    )
    wake_feeling = serializers.ChoiceField(
        choices=WAKE_FEELINGS, required=False, allow_null=True, allow_blank=True,
    )

    def save_night(self, id_medical, day):
        """Write this night, replacing whatever was there.

        `update_or_create` against the `(id_medical, entry_date)` unique
        constraint, so a second save is an edit and not a second night — the
        same shape `activity.set_steps` gives a step count, and the same reason.
        """
        data = self.validated_data
        night, _ = DietSleep.objects.update_or_create(
            id_medical=id_medical, entry_date=day,
            defaults={
                'fell_asleep_at': data.get('fell_asleep_at'),
                'woke_up_at': data.get('woke_up_at'),
                'quality': data.get('quality'),
                'awakenings': data.get('awakenings') or 0,
                'wake_feeling': data.get('wake_feeling') or None,
            },
        )
        return night


def serialize_night(night, day):
    """One night, as `frontend/src/types/diet.ts`'s `DietSleepNight` reads it.

    `night` may be None, which is a morning nobody has answered for: the panel
    starts from exactly this shape, so an untouched night and a night saved with
    every field blank are one thing on the wire. They are also one thing in
    truth — `hasSleep` reads both as "not described" — which is why there is no
    attempt to tell them apart.

    The two hours travel as 'HH:MM', not as moments: nobody types seconds, and a
    precision nobody entered has no place in a clinical record.
    """
    if night is None:
        return {
            'date': day.isoformat(),
            'fell_asleep_at': None,
            'woke_up_at': None,
            'quality': None,
            'awakenings': 0,
            'wake_feeling': None,
        }

    return {
        'date': night.entry_date.isoformat(),
        'fell_asleep_at': (
            night.fell_asleep_at.strftime('%H:%M') if night.fell_asleep_at else None
        ),
        'woke_up_at': night.woke_up_at.strftime('%H:%M') if night.woke_up_at else None,
        'quality': night.quality,
        'awakenings': night.awakenings,
        'wake_feeling': night.wake_feeling or None,
    }


def load_night(id_medical, day):
    """One morning's night, or None when nobody has answered for it."""
    return DietSleep.objects.filter(id_medical=id_medical, entry_date=day).first()


def build_sleep_night(id_medical, day):
    """What §09's sleep panel draws — the night, or an empty shape for it."""
    return serialize_night(load_night(id_medical, day), day)


def load_history(id_medical, start, end):
    """Every night in a range, keyed by the morning it ended on.

    A morning nobody answered for is simply absent rather than an empty night:
    the report decides what an absent night means, and that is the one place the
    decision belongs. Bounded by the range, like `activity.load_history`.
    """
    rows = DietSleep.objects.filter(
        id_medical=id_medical, entry_date__gte=start, entry_date__lte=end,
    )
    return {
        row.entry_date.isoformat(): serialize_night(row, row.entry_date)
        for row in rows
    }


def first_entry_date(id_medical):
    """The earliest morning this patient answered for.

    An exact `MIN` rather than a scan of a capped history, for the reason
    `core/diet_reports.py` gives where it latches the week anchor.

    **A row whose every answer is blank does not count**, which is the one place
    this differs from the two diaries beside it: `build_sleep_night` answers
    with a full shape for a morning nobody has touched, so a panel that was
    merely opened and saved would otherwise anchor a patient's weeks on a night
    they never described. `has_night` is the same reading applied here.
    """
    rows = DietSleep.objects.filter(id_medical=id_medical).order_by('entry_date')
    for row in rows:
        if has_night(serialize_night(row, row.entry_date)):
            return row.entry_date
    return None


def has_night(night):
    """Whether a night was described at all.

    Mirrors `hasSleep` in `frontend/src/utils/dietReport.ts`, including its one
    subtlety: **`awakenings` counts as an answer only above zero.** Zero is both
    "an unbroken night" and the control's own starting value, and the two cannot
    be told apart, so the quieter reading wins — a night whose only non-default
    field is a zero it was born with is not a night somebody described.
    """
    return (
        night['fell_asleep_at'] is not None
        or night['woke_up_at'] is not None
        or night['quality'] is not None
        or night['wake_feeling'] is not None
        or night['awakenings'] > 0
    )
