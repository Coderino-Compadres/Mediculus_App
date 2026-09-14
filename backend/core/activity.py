"""Aktywność fizyczna — §09's first half, and the rules behind it.

Out of the views like `core/hydration.py` and `core/meals.py`, and like them
this module sees nothing but an `id_medical`: no name, no e-mail, no user id.

WHAT §09 DECIDES, and what is therefore not open here:

* **Three questions and no more.** "Co to było, ile trwało, jak się czułaś lub
  czułeś po" — the artboard's own three, and the type that mirrors them
  (`frontend/src/types/diet.ts`) says at length what is missing on purpose:
  calories burnt, intensity, pace, heart rate, a target and a streak. The
  module records what somebody chose to write down, not what a device measured,
  and synchronising with a watch is outside the project's scope. This is the
  file somebody would add a "spalone kcal" column from; they must not.
* **Nothing is scored and nothing is compared.** No weekly total of minutes, no
  average, no "więcej niż w zeszłym tygodniu". That is §08's rule about the
  water counter ("nie ma gratulacji, serii ani komunikatu o niedoborze") and it
  is inherited here without exception — among these patients are people with
  eating disorders, and a screen that praised movement would be a screen that
  can shame its absence.
* **No field blocks a save** (§05). Everything but the hour is nullable, and
  the hour is not typed at all.

TWO SPLITS ARE WORTH KNOWING BEFORE CHANGING A NAME HERE.

`ACTIVITY_KINDS` are Polish names and the Polish name *is* the stored value —
the arrangement `core/meals.py` and `core/drinks.py` use, because a chip label
that is short and stable is not worth a translation table. `FEELING_AFTER`
goes the other way: technical keys here, Polish labels in
`frontend/src/utils/activity.ts`, because those three are a copy decision that
has already moved once (the mockup says "Dobre", the app says "Lepsze") and a
copy decision must not be a schema change. That is the same split
`core/time_of_day.py` documents.

Both lists are mirrored in `frontend/src/utils/activity.ts` and
`core/tests/test_activity.py` compares them — names *and* order, in both
directions — the same cross-language guard `test_meals.py` puts on the meal
kinds.
"""

from django.db import transaction
from django.db.models import F
from rest_framework import serializers

from .models import DietActivity, DietActivityDay

#: The activity chips, in the order §09 draws them. The Polish name is the
#: stored value; see the module docstring.
ACTIVITY_KINDS = ('Spacer', 'Rower', 'Joga', 'Basen', 'Siłownia', 'Taniec')

#: The chip that reveals the free-text field, mirroring the diary's "Inne"
#: trigger. Stored in `kind` like any other chip, with what was typed under it
#: in `kind_other` — two columns and one answer, read together by `kind_label`.
ACTIVITY_KIND_OTHER = 'Inne'

#: Everything `kind` may hold. The free-text chip is one of the values, not a
#: value outside the vocabulary: the patient chose it.
ACTIVITY_KIND_CHOICES = ACTIVITY_KINDS + (ACTIVITY_KIND_OTHER,)

#: How somebody felt *after* the activity — not how hard it was. Technical
#: keys, ordered as the screen draws them: the scale starts at "worse" rather
#: than at a neutral middle, because for part of this module's patients movement
#: can be a burden and that answer has to be exactly as easy to give as the
#: positive one.
FEELING_WORSE = 'worse'
FEELING_NEUTRAL = 'neutral'
FEELING_BETTER = 'better'

FEELING_AFTER = (FEELING_WORSE, FEELING_NEUTRAL, FEELING_BETTER)

#: How long the free text under "Inne" may be. A name, not a note — the row
#: renders it as "Nordic walking · 40 min", so a sentence belongs nowhere here.
MAX_KIND_OTHER = 60

#: The longest activity one row may record: a whole day.
#:
#: Not a judgement about how long anybody may move — it is what an entry filed
#: under one day can hold, the same reasoning that bounds a night at 23 h 59.
#: Without it a stuck finger on "+" records forty hours of yoga, and the figure
#: goes into a document a specialist reads.
MAX_DURATION_MINUTES = 24 * 60

#: The largest step count a day may carry. Seven digits, which is what the
#: input already caps itself at: nobody walks a million steps, and the point is
#: that a held key cannot write a number the screen then has to render.
MAX_STEPS = 9_999_999

#: A backstop on rows per day, in the spirit of `hydration.MAX_ENTRIES_PER_DAY`
#: and `meals.MAX_MEALS_PER_DAY`. Comfortably above any real day — nobody
#: records thirty separate activities — so nobody meets it by using the app.
MAX_ACTIVITIES_PER_DAY = 30

#: Refusals the screen renders verbatim. Worded as a limit on the *list* and
#: never as an opinion about how much somebody moves, the same care
#: `meals.DAY_IS_FULL` takes about how much somebody eats.
DAY_IS_FULL = (
    'Na dzisiaj jest już zapisanych bardzo dużo aktywności. '
    'Usuń którąś, żeby dodać kolejną.'
)

#: Refusal for a write aimed at a day that is over.
#:
#: The psychotherapy diary's rule applied to a fifth kind of row: today is
#: editable and nothing older is. Said as a sentence rather than answered with a
#: 404, for the reason `meals.MEAL_NOT_TODAY` gives — §09's own panel shows only
#: today, but the weekly report shows every day, so an entry from Tuesday is a
#: row the patient can be looking at, and "no such thing" about a row somebody
#: is reading is the worse answer.
#:
#: It names no fault of theirs and says what still works: the day is closed, not
#: the diary.
ENTRY_NOT_TODAY = (
    'Usuwać można tylko dzisiejsze aktywności — wcześniejsze dni są już '
    'zapisane.'
)


def kind_label(kind, kind_other):
    """The kind one entry recorded, as it should be shown — or None.

    The chip and the "Inne" free text are two columns but one answer, so every
    reader has to unpack them the same way. Exactly the shape `placeLabel` in
    `frontend/src/utils/triggers.ts` gives the diary's place chip, and the
    reason this lives here rather than at each caller.

    None means the question went unanswered: no chip at all, or "Inne" with
    nothing typed under it. The row still renders — a walk somebody logged
    without saying what it was is an entry, not an error.
    """
    if kind == ACTIVITY_KIND_OTHER:
        return (kind_other or '').strip() or None
    return kind or None


class ActivitySerializer(serializers.Serializer):
    """What §09's "Zapisz aktywność" sends.

    NOTHING IS REQUIRED, §05's rule taken literally on both sides: an empty body
    is a valid activity. It records that somebody moved, which is itself what
    this diary is for, and the screen renders such a row as "zapisana bez
    szczegółów" rather than as an error.

    `kind` and `feeling_after` are `ChoiceField`s rather than free text, which
    is `0009`'s lesson applied before it can bite: a plain `Serializer` drops a
    key it does not declare *without an error*, and that is how the diary's
    "pora dnia" was accepted, confirmed and silently lost for weeks. A value
    outside either vocabulary is a 400.

    THE DAY AND THE HOUR ARE NEVER INPUTS. `entry_date` and `logged_at` both
    come from the server's clock, so a date or a time in the body reaches
    nothing. §09's own rule is that a day is locked once it is over, and this is
    what makes that structural rather than a permission somebody can forget:
    no URL names an older day and no field can move an entry into one.
    """

    kind = serializers.ChoiceField(
        choices=ACTIVITY_KIND_CHOICES, required=False, allow_null=True,
        allow_blank=True,
    )
    kind_other = serializers.CharField(
        max_length=MAX_KIND_OTHER, required=False, allow_blank=True,
        allow_null=True,
    )
    duration_minutes = serializers.IntegerField(
        min_value=1, max_value=MAX_DURATION_MINUTES, required=False,
        allow_null=True,
    )
    feeling_after = serializers.ChoiceField(
        choices=FEELING_AFTER, required=False, allow_null=True, allow_blank=True,
    )

    def create(self, validated_data):
        id_medical = self.context['id_medical']
        today = self.context['today']
        now = self.context['now']

        kind = validated_data.get('kind') or None
        # The free text belongs to the "Inne" chip and to nothing else, so it is
        # dropped rather than stored beside a chip that does not use it — two
        # answers on one row would be two things to keep in step.
        typed = (validated_data.get('kind_other') or '').strip()
        kind_other = typed or None if kind == ACTIVITY_KIND_OTHER else None

        # Counted inside the transaction, so two submissions racing each other
        # cannot both see 29 rows and both write. Same shape as
        # `hydration.add_entry` and `meals.MealSerializer.create`.
        with transaction.atomic(using='medical'):
            written = DietActivity.objects.filter(
                id_medical=id_medical, entry_date=today,
            ).count()
            if written >= MAX_ACTIVITIES_PER_DAY:
                # A list, so the body has the same shape as every other
                # request-level refusal in this API — `firstMessage` in
                # src/api/client.ts reads a list's first entry.
                raise serializers.ValidationError({'detail': [DAY_IS_FULL]})
            return DietActivity.objects.create(
                id_medical=id_medical,
                entry_date=today,
                logged_at=now,
                kind=kind,
                kind_other=kind_other,
                duration_minutes=validated_data.get('duration_minutes'),
                feeling_after=validated_data.get('feeling_after') or None,
            )


class StepsSerializer(serializers.Serializer):
    """The day's step count, or the taking back of one.

    `steps` is nullable and null is what clears the day — which deletes the row
    rather than storing a NULL, because a row in `diet_activity_day` *means* a
    count was typed (see the model). That keeps "nobody typed one" and "this
    person took no steps" apart, which is the distinction the whole module is
    built on and the one a nullable column would have lost.

    Required, unlike every other field in this module: the request is
    specifically "set the step count", so a body that names nothing is a bug at
    the caller rather than an answer taken back. Sending `null` is how an answer
    is taken back.
    """

    steps = serializers.IntegerField(
        min_value=0, max_value=MAX_STEPS, allow_null=True,
    )


def serialize_activity(activity):
    """One entry, as `frontend/src/types/diet.ts`'s `DietActivityEntry` reads it.

    `kind` and `kind_other` travel as the two columns they are rather than
    pre-joined by `kind_label`: the form that edits them needs the chip back as
    a chip, and a screen that only displays them has `activityKindLabel` in the
    frontend's own `utils/activity.ts`. Joining here would make the editable
    case impossible without a second shape.

    `kind_other` is '' rather than null on the wire, because the frontend type
    declares it a string — the column keeps NULL, which is the representation
    with a third state to lose.
    """
    return {
        'id': str(activity.id_activity),
        'date': activity.entry_date.isoformat(),
        'time': activity.logged_at.strftime('%H:%M'),
        'kind': activity.kind or None,
        'kind_other': activity.kind_other or '',
        'duration_minutes': activity.duration_minutes,
        'feeling_after': activity.feeling_after or None,
    }


def _entries_for(id_medical, day):
    """One day's activities, newest first — the order every list in this app uses.

    Ordered on the hour rather than on `created_at`, because that is what the
    row is headed with and a list whose visible order disagreed with its own
    labels would read as a fault. `created_at` breaks ties, so two entries
    stamped in the same minute keep the order they were written in.
    """
    return (
        DietActivity.objects
        .filter(id_medical=id_medical, entry_date=day)
        .order_by(F('logged_at').desc(), '-created_at')
    )


def steps_for(id_medical, day):
    """The day's step count, or None when nobody typed one."""
    row = DietActivityDay.objects.filter(
        id_medical=id_medical, entry_date=day,
    ).first()
    return None if row is None else row.steps


def build_activity_day(id_medical, day):
    """Everything §09's activity panel draws, as `DietActivityDay` reads it.

    A day with nothing on it is entries `[]` and steps `None` rather than an
    error: that is the ordinary state of a day nobody has written in yet, and
    the panel renders it as an inviting empty day.
    """
    return {
        'date': day.isoformat(),
        'entries': [serialize_activity(row) for row in _entries_for(id_medical, day)],
        'steps': steps_for(id_medical, day),
    }


def set_steps(id_medical, day, steps):
    """Write the day's step count, or clear it.

    None deletes the row, for the reason the model gives: a row means a count
    was typed. Otherwise `update_or_create`, so a day has one count rather than
    a history of edits to one — the unique constraint says the same thing in the
    schema.
    """
    if steps is None:
        DietActivityDay.objects.filter(
            id_medical=id_medical, entry_date=day,
        ).delete()
        return

    DietActivityDay.objects.update_or_create(
        id_medical=id_medical, entry_date=day, defaults={'steps': steps},
    )


def find(id_medical, id_activity):
    """One of this patient's entries, or None.

    Filtered on `id_medical` alongside the id, so somebody else's activity
    answers exactly like a nonexistent one — the same convention as
    `diary.load_entry`, `meals.find` and `supplements.find`, and the reason the
    view can turn a None into a plain 404 without leaking whether the row
    exists.
    """
    return DietActivity.objects.filter(
        id_medical=id_medical, id_activity=id_activity,
    ).first()


def load_history(id_medical, start, end):
    """Every day in a range that holds an activity or a step count.

    Keyed by ISO date, which is what `core/diet_reports.py` needs: it walks the
    week's seven days and asks for each. A day holding neither is simply absent
    rather than an empty day — the report decides what an absent day means, and
    it is the one place that decision belongs.

    Bounded by the range rather than by a row cap, unlike `meals.load_history`:
    a report asks for one week at a time, so there is no list here to run away.
    """
    days = {}
    rows = (
        DietActivity.objects
        .filter(id_medical=id_medical, entry_date__gte=start, entry_date__lte=end)
        .order_by(F('logged_at').desc(), '-created_at')
    )
    for row in rows:
        key = row.entry_date.isoformat()
        if key not in days:
            days[key] = {'date': key, 'entries': [], 'steps': None}
        days[key]['entries'].append(serialize_activity(row))

    counts = DietActivityDay.objects.filter(
        id_medical=id_medical, entry_date__gte=start, entry_date__lte=end,
    )
    for row in counts:
        key = row.entry_date.isoformat()
        if key not in days:
            days[key] = {'date': key, 'entries': [], 'steps': None}
        days[key]['steps'] = row.steps

    return days


def first_entry_date(id_medical):
    """The earliest day this patient wrote an activity or a step count on.

    An exact `MIN` over both tables rather than a scan of a capped history —
    see `core/diet_reports.py`, which latches the week anchor from it and must
    not have that answer depend on how much history happens to be in hand.
    """
    dates = [
        DietActivity.objects.filter(id_medical=id_medical)
        .order_by('entry_date').values_list('entry_date', flat=True).first(),
        DietActivityDay.objects.filter(id_medical=id_medical)
        .order_by('entry_date').values_list('entry_date', flat=True).first(),
    ]
    found = [date for date in dates if date is not None]
    return min(found) if found else None


def has_activity(day):
    """Whether a day was described at all.

    Mirrors `hasActivity` in `frontend/src/utils/dietReport.ts`: an entry, or a
    step count. A `datetime.date` is never involved — this takes the serialized
    day so the report and the panel agree on one reading.
    """
    return bool(day['entries']) or day['steps'] is not None
