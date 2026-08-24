"""Turns a patient's diary into the numbers the home screen shows.

Everything here reads medical_db through `patient.id_medical` — the
pseudonymized, application-level join described in CLAUDE.md — so the caller
resolves the `Patient` row in user_db first and passes only that UUID in.
Nothing in this module ever sees a name or an e-mail address.

Days are calendar days in the server's configured timezone (`settings.TIME_ZONE`,
Europe/Warsaw), not UTC ones: the diary "resets at midnight" for the person
writing it, and an entry made at 00:30 belongs to the day they think it does.
"""

import datetime

from django.utils import timezone

from .emotions import MOOD_SCALE_EMOTIONS, STRES, normalize_emotion
from .models import Diary, Raport

#: Days in the mood chart, ending today.
WEEK_LENGTH = 7

#: How many emotions the "today" widget lists, strongest first.
MAX_TODAY_EMOTIONS = 3

#: Upper bound on the streak query, so it stays one indexed range scan.
STREAK_LOOKBACK_DAYS = 366


def _day_bounds(first_day, last_day):
    """Aware datetimes covering [first_day 00:00, day after last_day 00:00)."""
    start = timezone.make_aware(datetime.datetime.combine(first_day, datetime.time.min))
    end = timezone.make_aware(
        datetime.datetime.combine(last_day + datetime.timedelta(days=1), datetime.time.min)
    )
    return start, end


def _local_date(moment):
    return timezone.localtime(moment).date()


def _entries_by_day(diaries):
    """The one entry that counts per calendar day — the most recent one.

    One entry per day is the product rule, but nothing in the schema enforces it,
    so a second row must not silently double a day's weight in the averages.
    """
    by_day = {}
    for diary in diaries:
        by_day[_local_date(diary.created_at)] = diary
    return by_day


def _ratings(diary):
    """Every emotion this entry put a number on, strongest first.

    Stress joins the seven `mood_scale` columns because it is rated the same way
    (0-10) and is one of the ten emotions the app tracks — it just lives on the
    diary row rather than in the scale table.
    """
    scale = next(iter(diary.mood_scales.all()), None)
    rated = []
    if scale is not None:
        for field, emotion in MOOD_SCALE_EMOTIONS:
            value = getattr(scale, field)
            if value is not None:
                rated.append((emotion, value))
    if diary.stress_level is not None:
        rated.append((STRES, diary.stress_level))
    # sorted() is stable, so equal ratings keep MOOD_SCALE_EMOTIONS' order.
    return sorted(rated, key=lambda pair: pair[1], reverse=True)


def _dominant_emotion(diary, ratings):
    """What the day's bar is coloured by, and how tall it stands.

    `current_strongest_emotion` wins when we can read it: the column is the
    patient's own answer to "what did you feel most strongly", which beats
    inferring it from the sliders. Its intensity still comes from the matching
    slider, so the bar height and the colour describe the same feeling.
    """
    named = normalize_emotion(diary.current_strongest_emotion)
    by_emotion = dict(ratings)
    if named is not None:
        return named, by_emotion.get(named)
    if ratings:
        return ratings[0]
    return None, None


def _average(values):
    known = [value for value in values if value is not None]
    if not known:
        return None
    return round(sum(known) / len(known), 1)


def _streak_days(id_medical, today):
    """Consecutive days with an entry, ending today or yesterday.

    Yesterday counts as the end of the streak too: a run of six days should not
    read as broken from midnight until whenever the person writes today's entry.
    """
    since, _ = _day_bounds(today - datetime.timedelta(days=STREAK_LOOKBACK_DAYS), today)
    written = {
        _local_date(moment)
        for moment in Diary.objects.filter(
            id_medical=id_medical, created_at__gte=since
        ).values_list('created_at', flat=True)
    }

    day = today if today in written else today - datetime.timedelta(days=1)
    streak = 0
    while day in written:
        streak += 1
        day -= datetime.timedelta(days=1)
    return streak


def _technique_suggestion(id_medical):
    """The technique this patient's latest report recommends, if there is one.

    Deliberately read from `raport` rather than matched here: whatever produces
    the reports is where that judgement belongs, and a suggestion invented on the
    dashboard would be a second, quietly disagreeing opinion. No report yet means
    no suggestion — the card is left out rather than filled with a default.
    """
    raport = (
        Raport.objects.filter(id_medical=id_medical, technique__isnull=False)
        .select_related('technique')
        .order_by('-id_raport')
        .first()
    )
    if raport is None or not raport.technique.name:
        return None

    emotion = normalize_emotion(raport.most_frequent_emotion)
    if emotion is not None:
        reason = f'Dopasowane do Twoich ostatnich wpisów — dominuje {emotion.lower()}.'
    else:
        reason = 'Dopasowane do Twojego ostatniego raportu.'
    return {'name': raport.technique.name, 'match_reason': reason}


def build_home_dashboard(id_medical, today=None):
    """The whole home screen for one patient, as JSON-ready primitives."""
    today = today or timezone.localdate()
    first_day = today - datetime.timedelta(days=WEEK_LENGTH - 1)
    start, end = _day_bounds(first_day, today)

    diaries = (
        Diary.objects.filter(id_medical=id_medical, created_at__gte=start, created_at__lt=end)
        .prefetch_related('mood_scales')
        .order_by('created_at')
    )
    by_day = _entries_by_day(diaries)

    week = []
    for offset in range(WEEK_LENGTH):
        day = first_day + datetime.timedelta(days=offset)
        diary = by_day.get(day)
        emotion, intensity = _dominant_emotion(diary, _ratings(diary)) if diary else (None, None)
        week.append({
            'date': day.isoformat(),
            'has_entry': diary is not None,
            'dominant_emotion': emotion,
            'intensity': intensity,
        })

    today_diary = by_day.get(today)
    today_entry = None
    if today_diary is not None:
        mood = (today_diary.current_mood or '').strip()
        today_entry = {
            'mood_label': mood.capitalize() or None,
            'emotions': [
                {'emotion': emotion, 'intensity': intensity}
                for emotion, intensity in _ratings(today_diary)[:MAX_TODAY_EMOTIONS]
                if intensity > 0
            ],
        }

    return {
        'streak_days': _streak_days(id_medical, today),
        'today_entry': today_entry,
        'week': week,
        'average_stress': _average([diary.stress_level for diary in by_day.values()]),
        'average_energy': _average([diary.energy_level for diary in by_day.values()]),
        'technique': _technique_suggestion(id_medical),
    }
