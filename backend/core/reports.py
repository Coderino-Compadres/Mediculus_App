"""Weekly reports, built from diary entries and nothing else.

A report covers one Monday-to-Sunday week and appears once that week has ended
— the patient neither creates one nor picks a range. Diary entries are the only
source, which is the property that matters most here: nothing a report says can
disagree with the diary it came from, because both read the same rows.

This is a port of `frontend/src/utils/reports.ts`, which derived the same
numbers in the browser while there was no endpoint to ask. The contract it
settled on (`frontend/src/types/report.ts`) is what this module answers with,
snake_cased on the wire like every other payload; `src/api/reports.ts` maps it
back. Two things the browser could not do are fixed by the move:

- the "has this week ended" cutoff is now read in `settings.TIME_ZONE`, the same
  clock that decided which calendar day each entry belongs to. Read from the
  client, a week the backend already considered over still looked current for a
  few hours west of Warsaw, and its report showed up late.
- there is one document, not one per browser. A report a specialist reads has to
  be the same for everyone who opens it.

Kept out of the views, like `core/dashboard.py`, so it can be tested (and fed to
the PDF renderer) without a request.
"""

import datetime
import decimal

from .diary import load_history
from .emotions import EMOTIONS, STRES

DAYS_IN_WEEK = 7

#: The 1-5 mood scale and the 0-10 sliders, as denominators.
MOOD_SCALE_MAX = 5
LEVEL_SCALE_MAX = 10

#: 1-5 position on the mood scale. Keyed the same way as `diary.MOOD_LABELS`,
#: which is what `current_mood` stores and what `serialize_entry` maps back —
#: test_reports.py pins the two key sets together.
MOOD_RANK = {'very_bad': 1, 'bad': 2, 'neutral': 3, 'good': 4, 'very_good': 5}

#: "Trudniejsze dni" — the same threshold as the Dzienniczki list's filter, so a
#: day counted here is a day that screen also calls harder.
HARD_DAY_MAX_RANK = 2

#: The emotion ranking is not capped: the report shows every emotion the week
#: actually rated, and the vocabulary is ten names, so the list is bounded by
#: the form rather than by a limit here. An emotion nobody touched has no row —
#: absence is what "not felt this week" looks like, not a zero.
TOP_TRIGGERS = 4
#: Chips under the narrative summary: the two emotions that moved most.
SUMMARY_CHIP_EMOTIONS = 2

#: Same one-line trim as the Dzienniczki list preview.
PREVIEW_LENGTH = 90

#: Ties in the rankings break on declaration order, so equal counts do not
#: reorder themselves between requests. `test_emotions.py` pins this against the
#: frontend's EMOTION_COLORS, whose key order has to stay the same for the two
#: to rank identically.
EMOTION_ORDER = {emotion: index for index, emotion in enumerate(EMOTIONS)}

#: Genitive, because that is the form a date takes in Polish ("9 sierpnia").
#: Spelled out rather than taken from `locale`, which needs pl_PL generated in
#: the image and silently falls back to English when it is not.
MONTHS_GENITIVE = (
    'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
)

#: Polish letters, as (the letter they follow, how far behind it). A codepoint
#: sort puts them all after 'z'; CLDR's Polish tailoring makes each a letter of
#: its own, immediately after its base — which is what `localeCompare(…, 'pl')`
#: did while the ranking was built in the browser.
_POLISH_ORDER = {
    'ą': ('a', 1), 'ć': ('c', 1), 'ę': ('e', 1), 'ł': ('l', 1), 'ń': ('n', 1),
    'ó': ('o', 1), 'ś': ('s', 1), 'ź': ('z', 1), 'ż': ('z', 2),
}


def _polish_key(text):
    """Sort key that puts 'ą' between 'a' and 'b', and 'ł' between 'l' and 'm'.

    A pair per character rather than a marker appended to the base letter: with
    'ł' rendered as 'l' + a low marker, the marker also sorts below every real
    letter, so "Łódź" would come out before "Lublin" — right about the alphabet
    and wrong about the word. Comparing (base, rank) pairs settles the base
    letter first and only then the diacritic.
    """
    ranked = []
    for character in text.casefold():
        base, rank = _POLISH_ORDER.get(character, (character, 0))
        ranked.append((ord(base), rank))
    return tuple(ranked)


# ---- Formatting ----------------------------------------------------------------


def format_number(value, decimals):
    """Polish decimal comma, so '3.1' never reaches the screen."""
    return f'{value:.{decimals}f}'.replace('.', ',')


def format_average(value, maximum):
    """'3,1 / 5', or '— / 5' when the week rated nothing to average."""
    rendered = '—' if value is None else format_number(value, 1)
    return f'{rendered} / {maximum}'


def plural_days(count):
    """1 dzień, 3 dni, 7 dni."""
    return 'dzień' if count == 1 else 'dni'


def plural_entries(count):
    """1 wpis, 3 wpisy, 5 wpisów."""
    if count == 1:
        return 'wpis'
    return 'wpisy' if 2 <= count <= 4 else 'wpisów'


def format_week_range(week_start, week_end):
    """'3 – 9 sierpnia 2026', dropping whatever the two ends share."""
    same_year = week_start.year == week_end.year
    same_month = same_year and week_start.month == week_end.month

    if same_month:
        start_label = str(week_start.day)
    elif same_year:
        start_label = f'{week_start.day} {MONTHS_GENITIVE[week_start.month - 1]}'
    else:
        start_label = (
            f'{week_start.day} {MONTHS_GENITIVE[week_start.month - 1]} {week_start.year}'
        )

    end_label = f'{week_end.day} {MONTHS_GENITIVE[week_end.month - 1]} {week_end.year}'
    return f'{start_label} – {end_label}'


def _truncate(text):
    """One line of a longer note, for a preview that links to the whole thing."""
    trimmed = (text or '').strip()
    if len(trimmed) <= PREVIEW_LENGTH:
        return trimmed
    return f'{trimmed[:PREVIEW_LENGTH].rstrip()}…'


# ---- Per-week aggregation ------------------------------------------------------


def _round1(value):
    """One decimal, rounding halves away from zero.

    Keeps 5.699999999999999 out of both the screen and the deltas — and does it
    with Decimal rather than `round()`, whose banker's rounding sends 0.25 to
    0.2 while sending 3.35 to 3.4, because whether the float is a hair under or
    over the half decides it. Unpredictable at the boundary is a poor property
    for a number somebody reads clinically; "halves go up" is at least a rule
    that can be stated.
    """
    quantized = decimal.Decimal(value).quantize(
        decimal.Decimal('0.1'), rounding=decimal.ROUND_HALF_UP,
    )
    return float(quantized)


def _average(values):
    rated = [value for value in values if value is not None]
    if not rated:
        return None
    return _round1(sum(rated) / len(rated))


def _mood_rank(entry):
    mood = entry['mood']
    return None if mood is None else MOOD_RANK[mood]


def _intensity_of(entry, emotion):
    """The rating this entry gave one emotion, or None if it never named it."""
    for rating in entry['emotions']:
        if rating['emotion'] == emotion:
            return rating['intensity']
    return None


def _is_hard_day(entry):
    rank = _mood_rank(entry)
    return rank is not None and rank <= HARD_DAY_MAX_RANK


def _emotion_ratings(entries):
    """Every intensity each emotion was given this week, keyed by emotion.

    The list rather than a count, because the ranking now reports both: how many
    days an emotion was rated on, and how strongly on average. A day it was not
    rated on contributes nothing rather than a zero — 0 is a rating the patient
    gave, "not rated" is the chip they never touched, and averaging the second
    into the first would drag every emotion towards zero in proportion to how
    often the patient skipped it.
    """
    ratings = {}
    for entry in entries:
        for rating in entry['emotions']:
            ratings.setdefault(rating['emotion'], []).append(rating['intensity'])
    return ratings


class WeekStats:
    """One week's averages and counts. Attributes rather than a dict so a typo
    raises instead of quietly reading None."""

    __slots__ = ('mood', 'stress', 'energy', 'tension', 'hard_days',
                 'emotion_ratings', 'emotion_days')

    def __init__(self, entries):
        self.mood = _average([_mood_rank(entry) for entry in entries])
        # Stress is one of the ten emotions, rated on the entry form's chip.
        self.stress = _average([_intensity_of(entry, STRES) for entry in entries])
        self.energy = _average([entry['energy_level'] for entry in entries])
        self.tension = _average([entry['tension_level'] for entry in entries])
        self.hard_days = sum(1 for entry in entries if _is_hard_day(entry))
        self.emotion_ratings = _emotion_ratings(entries)
        # Kept alongside: the summary chips compare how *often* an emotion was
        # rated, which is a different question from how strongly.
        self.emotion_days = {
            emotion: len(intensities)
            for emotion, intensities in self.emotion_ratings.items()
        }


# ---- Changes against the previous week ----------------------------------------

#: Which way a metric would have to move for the change to be the reassuring one.
HIGHER = 'higher'
LOWER = 'lower'


def _tone(value, favourable):
    """Only metrics whose direction the app already asserts elsewhere get a tone.

    Mood is an ordered scale, "trudniejsze dni" says so in its name, and the
    energy/tension sliders are labelled 'wyczerpanie ↔ pełnia energii' and
    'rozluźnienie ↔ skrajne napięcie' on the entry form. Emotions are deliberately
    not on that list: whether more days of 'Lęk' is bad is a clinical judgement,
    not something a generated document is entitled to colour in.
    """
    if value is None or value == 0:
        return 'neutral'
    return 'good' if (value > 0) == (favourable == HIGHER) else 'watch'


def _average_delta(current, previous, has_previous, favourable):
    """One average against the week before it.

    `has_previous` is passed separately rather than inferred from `previous`: a
    previous week that exists but left this metric unrated is a different answer
    from no previous week at all, and only the caller knows which it is.
    """
    value = None if current is None or previous is None else _round1(current - previous)
    if value is not None:
        gap = None
    else:
        gap = 'unrated' if has_previous else 'no-previous-week'
    return {'value': value, 'gap': gap, 'decimals': 1, 'unit': '', 'tone': _tone(value, favourable)}


def _count_delta(value, favourable, unit):
    """A day count is answered by every week that exists, so 'unrated' cannot
    arise here."""
    return {
        'value': value,
        'gap': 'no-previous-week' if value is None else None,
        'decimals': 0,
        'unit': unit,
        'tone': _tone(value, favourable),
    }


def _emotion_changes(current, previous):
    """Emotions that changed how often they were rated, biggest move first."""
    emotions = set(current.emotion_days) | set(previous.emotion_days)
    moved = [
        (emotion, current.emotion_days.get(emotion, 0) - previous.emotion_days.get(emotion, 0))
        for emotion in emotions
    ]
    moved = [pair for pair in moved if pair[1] != 0]
    moved.sort(key=lambda pair: (-abs(pair[1]), EMOTION_ORDER[pair[0]]))

    return [
        {
            'label': emotion,
            # No favourable direction for an emotion, so no colour — see _tone.
            # The unit declines with the number: '−1 dzień', not '−1 dni'.
            'delta': {
                'value': change,
                'gap': None,
                'decimals': 0,
                'unit': plural_days(abs(change)),
                'tone': 'neutral',
            },
        }
        for emotion, change in moved[:SUMMARY_CHIP_EMOTIONS]
    ]


# ---- Narrative summary ---------------------------------------------------------


def _build_summary(entries, stats, previous, emotions, risky_days):
    """A plain-language recap of the same numbers the cards show.

    Deliberately a factual composition rather than prose: it states what happened
    and by how much, and never how the patient did. It is generated here, with
    the report, so the sentence a specialist reads and the cards above it cannot
    come from two different opinions.
    """
    sentences = [
        f'W tym tygodniu masz {len(entries)} {plural_entries(len(entries))} z {DAYS_IN_WEEK} dni.'
    ]

    if emotions:
        # emotions[0] is the *strongest* now, not the most frequent — the
        # sentence has to say which, or it would put a frequency claim on a row
        # that is first for a different reason. See _rank_emotions.
        top = emotions[0]
        sentences.append(
            f"Najsilniej odczuwana emocja: {top['emotion']} "
            f"(śr. {format_number(top['avg_intensity'], 1)} / {LEVEL_SCALE_MAX}, "
            f"{top['days']} {plural_days(top['days'])})."
        )

    if previous is None:
        sentences.append(
            'Nie ma jeszcze poprzedniego tygodnia z wpisami, więc nie ma z czym '
            'porównać tych liczb.'
        )
    elif previous.mood is None or stats.mood is None:
        # The week before exists — saying otherwise would be untrue. What is
        # missing is the mood answer, in one of the two weeks.
        sentences.append(
            'W jednym z tych tygodni nastrój nie został oceniony, więc średnich '
            'nie da się porównać.'
        )
    else:
        sentences.append(
            f'Średni nastrój zmienił się z {format_number(previous.mood, 1)} '
            f'na {format_number(stats.mood, 1)}.'
        )

    if risky_days:
        sentences.append(
            f'Dni z oznaczonym zachowaniem ryzykownym: {len(risky_days)} z {DAYS_IN_WEEK}.'
        )

    return ' '.join(sentences)


# ---- Building the reports ------------------------------------------------------


def week_report_id(week_start):
    """The route param and the map key for one week: 'week-2026-08-03'."""
    return f'week-{week_start.isoformat()}'


def start_of_week(day):
    """The Monday of `day`'s week. `weekday()` is already Monday-first."""
    return day - datetime.timedelta(days=day.weekday())


def _rank_emotions(ratings):
    """The emotions rated this week: how strongly on average, and how often.

    All of them, not a top few: the week's emotions are the point of the
    section, and an emotion left out would read as one that was not felt rather
    than as one that did not fit. The ten-name vocabulary is the only bound
    there is, and an emotion nobody rated has no entry to rank.

    ORDERED BY INTENSITY, NOT BY FREQUENCY, and that is a reversal. It used to
    rank by the day count, on the reasoning that a single very bad day should
    not outrank a feeling that ran through the whole week — which is a fair
    argument about *ordering* and was the wrong one to let decide the *bar*.
    Week 2026-08-24 is the case that settled it: 'Smutek' was rated on five days
    at an average of 0.8/10 and drew a bar 83% as long as the week's strongest
    feeling, while 'Spokój' at 6.3 drew the same bar as 'Lęk' at 2.5. A
    specialist reading those bars sees a sad week; the diary does not describe
    one. Frequency is still on the row, as the second number, and the summary
    chips still compare it week to week — how *often* an emotion appears is a
    real question, it is just not the one a length can answer here.

    Ties break on the day count and then on declaration order, so two emotions
    at the same average land in a stable, explainable order rather than
    whichever the sort happened to see first.

    `avg_intensity` is never null: a row exists only because the emotion was
    rated at least once, and every rating carries an intensity.
    """
    averages = {
        emotion: _average(intensities) for emotion, intensities in ratings.items()
    }
    ranked = sorted(
        ratings.items(),
        key=lambda pair: (-averages[pair[0]], -len(pair[1]), EMOTION_ORDER[pair[0]]),
    )
    return [
        {
            'emotion': emotion,
            'days': len(intensities),
            'avg_intensity': averages[emotion],
        }
        for emotion, intensities in ranked
    ]


def _rank_triggers(entries):
    """`situation_place` is already the whole answer: the form's chip and its
    'Inne' free text collapse into that one column (see src/api/diary.ts), so
    there is nothing to unpack here the way the browser had to."""
    counts = {}
    for entry in entries:
        place = (entry['situation_place'] or '').strip()
        if not place:
            continue
        counts[place] = counts.get(place, 0) + 1
    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], _polish_key(pair[0])))
    return [{'trigger': trigger, 'days': days} for trigger, days in ranked[:TOP_TRIGGERS]]


def _risky_days(entries):
    """Oldest first, so the list reads as the week did."""
    flagged = [entry for entry in entries if entry['risky_behavior_note'] is not None]
    flagged.sort(key=lambda entry: entry['date'])
    return [
        {
            'entry_id': entry['id'],
            'date': entry['date'],
            'note_preview': _truncate(entry['risky_behavior_note']),
        }
        for entry in flagged
    ]


def _build_metrics(stats, previous):
    has_previous = previous is not None
    return [
        {
            'key': 'mood',
            'label': 'Średni nastrój',
            'value': format_average(stats.mood, MOOD_SCALE_MAX),
            'delta': _average_delta(
                stats.mood, previous.mood if previous else None, has_previous, HIGHER,
            ),
        },
        {
            'key': 'stress',
            'label': 'Średni poziom stresu',
            'value': format_average(stats.stress, LEVEL_SCALE_MAX),
            'delta': _average_delta(
                stats.stress, previous.stress if previous else None, has_previous, LOWER,
            ),
        },
        {
            'key': 'energy',
            'label': 'Średni poziom energii',
            'value': format_average(stats.energy, LEVEL_SCALE_MAX),
            'delta': _average_delta(
                stats.energy, previous.energy if previous else None, has_previous, HIGHER,
            ),
        },
        {
            'key': 'hardDays',
            'label': 'Trudniejsze dni',
            'value': f'{stats.hard_days} z {DAYS_IN_WEEK}',
            # A week with no entries at all is not "zero harder days", so it has
            # no previous value to subtract from.
            'delta': _count_delta(
                None if previous is None else stats.hard_days - previous.hard_days, LOWER, '',
            ),
        },
    ]


def _build_changes(stats, previous):
    if previous is None:
        return []
    chips = [
        {'label': 'Nastrój', 'delta': _average_delta(stats.mood, previous.mood, True, HIGHER)},
        *_emotion_changes(stats, previous),
        {'label': 'Napięcie', 'delta': _average_delta(stats.tension, previous.tension, True, LOWER)},
    ]
    return [chip for chip in chips if chip['delta']['value'] not in (None, 0)]


def build_report(week_start, entries, previous_entries):
    """One week's report. `entries` are that week's, `previous_entries` the
    week before's — empty means there is nothing to compare against, which is
    not the same as comparing against zeroes."""
    week_end = week_start + datetime.timedelta(days=DAYS_IN_WEEK - 1)
    stats = WeekStats(entries)
    previous = WeekStats(previous_entries) if previous_entries else None
    emotions = _rank_emotions(stats.emotion_ratings)
    risky_days = _risky_days(entries)

    return {
        'id': week_report_id(week_start),
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'range_label': format_week_range(week_start, week_end),
        'entry_count': len(entries),
        'metrics': _build_metrics(stats, previous),
        'emotions': emotions,
        'triggers': _rank_triggers(entries),
        'risky_days': risky_days,
        'changes': _build_changes(stats, previous),
        'summary': _build_summary(entries, stats, previous, emotions, risky_days),
    }


def build_weekly_reports(id_medical, today):
    """Every weekly report this patient's diary supports, newest first.

    Two kinds of week are deliberately absent: the one in progress (a report
    covers a week that has ended, not one still running) and any week with no
    entries at all (diaries are the only source, so there would be nothing to
    report). A week with no entries still counts as "no previous week" for the
    week after it, which is why the deltas there read as "brak poprzedniego
    tygodnia" rather than as a drop to zero.

    Built from `load_history`, the same rows `/api/diary/` answers with, so a
    report and the archive can never disagree about a day. That also inherits
    its MAX_HISTORY_ENTRIES cap.
    """
    by_week = {}
    for entry in load_history(id_medical):
        week_start = start_of_week(datetime.date.fromisoformat(entry['date']))
        by_week.setdefault(week_start, []).append(entry)

    current_week_start = start_of_week(today)
    ended = sorted((week for week in by_week if week < current_week_start), reverse=True)

    return [
        build_report(
            week_start,
            by_week[week_start],
            by_week.get(week_start - datetime.timedelta(days=DAYS_IN_WEEK), []),
        )
        for week_start in ended
    ]


def find_report(reports, report_id):
    """One report by its route id, or None when the id names no week with entries."""
    for report in reports:
        if report['id'] == report_id:
            return report
    return None
