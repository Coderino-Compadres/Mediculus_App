"""Reading and writing the one diary entry a patient may have per day.

The product rule the entry form implements is: one entry per calendar day,
editable only on the day it was written, everything older read-only. That rule
is enforced here by construction rather than by a permission check — the only
row these functions will ever touch is *today's*, because today is the only day
they can address. There is no entry id on the wire, so a request cannot name
somebody else's row, or yesterday's.

Which day "today" is comes from `days.py`, i.e. Europe/Warsaw rather than UTC —
the same boundary the dashboard counts streaks by.

An entry is spread over two tables. `diary` holds the mood, the levels, the
CBT/ABC breakdown and the notes; the intensity of each named emotion goes to
`mood_scale`, except 'Stres', which has always lived on `diary.stress_level`
and stays there.
"""

from django.db import transaction
from rest_framework import serializers

from .days import day_bounds, local_date
from .emotions import EMOTIONS, MOOD_SCALE_EMOTIONS, STRES
from .models import Diary, MoodScale

#: Sliders and emotion intensities are all rated on the same 0-10 scale.
MIN_LEVEL = 0
MAX_LEVEL = 10

#: Caps on the free-text answers. The columns are unbounded TEXT and should stay
#: that way (a therapist's note is not our business to truncate), but an API that
#: accepts unbounded input is an easy way to fill a disk.
MAX_SHORT_TEXT = 200
MAX_LONG_TEXT = 2000

#: `diary.current_mood` stores the label the patient saw, not the enum value the
#: form uses internally: the dashboard renders that column straight into "Twój
#: nastrój dziś", so a row reading 'very_good' would surface as "Very_good".
MOOD_LABELS = {
    'very_bad': 'Bardzo źle',
    'bad': 'Źle',
    'neutral': 'Neutralnie',
    'good': 'Dobrze',
    'very_good': 'Bardzo dobrze',
}
MOOD_VALUES = {label.casefold(): value for value, label in MOOD_LABELS.items()}

#: emotion -> `mood_scale` column, the reverse of MOOD_SCALE_EMOTIONS.
SCALE_COLUMNS = {emotion: column for column, emotion in MOOD_SCALE_EMOTIONS}

#: The order ties are broken in when picking the strongest emotion. It matches
#: `dashboard._ratings` exactly — the scale columns in their declared order,
#: then 'Stres', which lives on the diary row — so the emotion we store and the
#: one the chart would have inferred can never disagree.
RATING_ORDER = tuple(emotion for _, emotion in MOOD_SCALE_EMOTIONS) + (STRES,)


class EmotionRatingSerializer(serializers.Serializer):
    emotion = serializers.ChoiceField(choices=EMOTIONS)
    intensity = serializers.IntegerField(min_value=MIN_LEVEL, max_value=MAX_LEVEL)


class DiaryEntrySerializer(serializers.Serializer):
    """What the "Dodaj wpis" form may send.

    Every field is optional: the form asks two questions on screen and hides the
    rest behind "Więcej szczegółów", so a perfectly valid entry can be a mood and
    nothing else. Absent and null both mean "not answered" and are stored as
    NULL — which is not the same as a slider deliberately left at 0, and the
    dashboard treats them differently.
    """

    mood = serializers.ChoiceField(choices=sorted(MOOD_LABELS), required=False, allow_null=True)
    emotions = EmotionRatingSerializer(many=True, required=False)
    energy_level = serializers.IntegerField(
        min_value=MIN_LEVEL, max_value=MAX_LEVEL, required=False, allow_null=True,
    )
    tension_level = serializers.IntegerField(
        min_value=MIN_LEVEL, max_value=MAX_LEVEL, required=False, allow_null=True,
    )
    situation_place = serializers.CharField(
        max_length=MAX_SHORT_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    situation = serializers.CharField(
        max_length=MAX_LONG_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    emotion_note = serializers.CharField(
        max_length=MAX_LONG_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    thought = serializers.CharField(
        max_length=MAX_LONG_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    how_situation_handled = serializers.CharField(
        max_length=MAX_LONG_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    notes = serializers.CharField(
        max_length=MAX_LONG_TEXT, required=False, allow_null=True, allow_blank=True,
    )
    risky_behavior_note = serializers.CharField(
        max_length=MAX_LONG_TEXT, required=False, allow_null=True, allow_blank=True,
    )

    def validate_emotions(self, value):
        """One rating per emotion — two rows for 'Lęk' would have no meaning."""
        names = [rating['emotion'] for rating in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError('Każda emocja może wystąpić tylko raz.')
        return value


def strongest_emotion(ratings):
    """The highest-rated emotion, or None if the entry rated none.

    A 0 counts as a rating: the patient picked that chip and answered "not at
    all", which is different from never picking it. `max` is stable, so equal
    ratings fall back to RATING_ORDER rather than to whichever key the dict
    happened to yield first.
    """
    rated = [(emotion, ratings[emotion]) for emotion in RATING_ORDER if emotion in ratings]
    if not rated:
        return None
    return max(rated, key=lambda pair: pair[1])[0]


def _blank_to_none(text):
    """'' and '   ' mean the patient left the box empty, which is NULL."""
    if text is None:
        return None
    stripped = text.strip()
    return stripped or None


def _todays_entry(id_medical, today):
    """The row today's answers belong to, or None before the first save.

    Ordered newest-first because nothing in the schema stops a second row from
    existing for one day — the dashboard makes the same choice, so both agree on
    which entry counts.
    """
    start, end = day_bounds(today, today)
    return (
        Diary.objects.filter(id_medical=id_medical, created_at__gte=start, created_at__lt=end)
        .order_by('-created_at')
        .first()
    )


def _read_ratings(diary):
    """The emotions this entry put a number on, as the form's own shape.

    Only rated emotions appear. An emotion the patient never picked is NULL in
    the database and simply absent here, which is what makes the form redraw the
    chips exactly as they were left rather than as ten zeroes.
    """
    ratings = []
    scale = next(iter(diary.mood_scales.all()), None)
    if scale is not None:
        for column, emotion in MOOD_SCALE_EMOTIONS:
            value = getattr(scale, column)
            if value is not None:
                ratings.append({'emotion': emotion, 'intensity': value})
    if diary.stress_level is not None:
        ratings.append({'emotion': STRES, 'intensity': diary.stress_level})
    return ratings


def serialize_entry(diary):
    """One `diary` row (plus its scales) as the entry form's payload.

    `id` and `saved_at` are what the history screens need on top of what the form
    edits: the archive addresses a past entry by id, and shows when it was
    written. `saved_at` is `updated_at`, because an entry edited later the same
    day was saved then, not when it was first opened.
    """
    return {
        'id': str(diary.id_diary),
        'date': local_date(diary.created_at).isoformat(),
        'saved_at': diary.updated_at.isoformat(),
        'mood': MOOD_VALUES.get((diary.current_mood or '').casefold()),
        'emotions': _read_ratings(diary),
        'energy_level': diary.energy_level,
        'tension_level': diary.tension_level,
        'situation_place': diary.situation_place,
        'situation': diary.situation,
        'emotion_note': diary.emotion_note,
        'thought': diary.thought,
        'how_situation_handled': diary.how_situation_handled,
        'notes': diary.notes,
        'risky_behavior_note': diary.risky_behavior_note,
    }


def load_today_entry(id_medical, today):
    """Today's entry as the form's payload, or None if it has not been written."""
    start, end = day_bounds(today, today)
    diary = (
        Diary.objects.filter(id_medical=id_medical, created_at__gte=start, created_at__lt=end)
        .prefetch_related('mood_scales')
        .order_by('-created_at')
        .first()
    )
    return serialize_entry(diary) if diary is not None else None


#: Safety cap on the history list. One entry per day means a year is 365 rows,
#: so this is a backstop against a runaway query rather than a product limit —
#: if it is ever hit, the screen needs real pagination, not a bigger number.
MAX_HISTORY_ENTRIES = 1000


def load_history(id_medical):
    """Every entry this patient has written, newest first.

    Read-only by construction: nothing here can write, and the endpoint that
    does (`save_today_entry`) can only ever address today. Past entries staying
    immutable is what makes a report to a therapist worth anything.
    """
    diaries = (
        Diary.objects.filter(id_medical=id_medical)
        .prefetch_related('mood_scales')
        .order_by('-created_at')[:MAX_HISTORY_ENTRIES]
    )
    return [serialize_entry(diary) for diary in diaries]


def load_entry(id_medical, id_diary):
    """One entry by id, or None when it is not this patient's.

    The id is in the URL, so unlike everywhere else in this module the caller
    can name a row that belongs to somebody else. Filtering on `id_medical`
    alongside the id is what stops that: a wrong owner is indistinguishable from
    a wrong id, and both answer 404.
    """
    diary = (
        Diary.objects.filter(pk=id_diary, id_medical=id_medical)
        .prefetch_related('mood_scales')
        .first()
    )
    return serialize_entry(diary) if diary is not None else None


def save_today_entry(id_medical, data, today):
    """Write today's entry, replacing it if one exists, and return the payload.

    Replacing rather than merging: the form always submits its whole state, so a
    field missing from the request means the patient cleared it, not that they
    said nothing about it. Merging would make an answer impossible to take back.

    Atomic on medical_db, because an entry whose `diary` row saved and whose
    `mood_scale` row did not would read as a day with no emotions rated.
    """
    ratings = {rating['emotion']: rating['intensity'] for rating in data.get('emotions', [])}

    with transaction.atomic(using='medical'):
        diary = _todays_entry(id_medical, today)
        if diary is None:
            diary = Diary(id_medical=id_medical)

        diary.current_mood = MOOD_LABELS.get(data.get('mood'))
        # 'Stres' is the one emotion of the ten rated on the diary row itself.
        diary.stress_level = ratings.get(STRES)
        diary.energy_level = data.get('energy_level')
        diary.tension_level = data.get('tension_level')
        diary.situation_place = _blank_to_none(data.get('situation_place'))
        diary.situation = _blank_to_none(data.get('situation'))
        diary.emotion_note = _blank_to_none(data.get('emotion_note'))
        diary.thought = _blank_to_none(data.get('thought'))
        diary.how_situation_handled = _blank_to_none(data.get('how_situation_handled'))
        diary.notes = _blank_to_none(data.get('notes'))
        diary.risky_behavior_note = _blank_to_none(data.get('risky_behavior_note'))
        # Derived, not declared: the form does not ask "which did you feel most
        # strongly", so this is the highest of the sliders the patient did move.
        # The dashboard would infer the same emotion from the same numbers — the
        # column exists so that a plain SELECT, or a later reports query, does not
        # have to repeat that inference in SQL. If the form ever grows the
        # question, this is the line that should start trusting the answer.
        diary.current_strongest_emotion = strongest_emotion(ratings)
        diary.save(using='medical')

        columns = {column: ratings.get(emotion) for column, emotion in MOOD_SCALE_EMOTIONS}
        scale = diary.mood_scales.order_by('id_scale').first()
        if scale is None:
            MoodScale.objects.create(diary=diary, **columns)
        else:
            for column, value in columns.items():
                setattr(scale, column, value)
            scale.save(using='medical', update_fields=list(columns))
            # A second scale row for the same entry would double-count the day.
            diary.mood_scales.exclude(pk=scale.pk).delete()

    diary = Diary.objects.prefetch_related('mood_scales').get(pk=diary.pk)
    return serialize_entry(diary)
