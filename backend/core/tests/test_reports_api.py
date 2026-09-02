"""Tests for /api/reports/ — the weekly reports, and what they are derived from.

The aggregation moved out of the browser (frontend/src/utils/reports.ts) so that
one document exists rather than one per browser, and so the "has this week
ended" cutoff is read on the same clock that decided which calendar day each
entry belongs to. These pin both halves: the numbers, and the access rules.

Touches both databases — the session and the `patient` row are in user_db, the
diary entries they aggregate are in medical_db.
"""

import datetime
import json
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.diary import MOOD_LABELS
from core.models import Diary, MoodScale, Patient, User, UserRole

from core.reports import (DAYS_IN_WEEK, MOOD_RANK, SUMMARY_CHIP_EMOTIONS,
                          TOP_TRIGGERS, _polish_key, _round1,
                          _truncate, build_weekly_reports, format_average,
                          format_number, format_week_range, plural_days,
                          plural_entries, start_of_week, week_report_id)


def make_diary(id_medical, day, **fields):
    """A diary entry stamped as written at noon on `day`.

    `created_at` is `auto_now_add`, so an UPDATE is the only way to place an
    entry on a past day — same helper as test_dashboard_api.
    """
    diary = Diary.objects.create(id_medical=id_medical, **fields)
    noon = timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))
    Diary.objects.filter(pk=diary.pk).update(created_at=noon)
    diary.refresh_from_db()
    return diary


class ReportTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        # Monday of the week before this one: the most recent week that has a
        # report at all, whatever day the suite happens to run on.
        self.week = start_of_week(self.today) - datetime.timedelta(days=DAYS_IN_WEEK)
        self.previous_week = self.week - datetime.timedelta(days=DAYS_IN_WEEK)
        self.list_url = reverse('core:report-list')
        self.patient = self.create_patient('pacjent@example.com')

    def create_patient(self, email, role='patient'):
        user = User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0],
            email=email, password_hash=make_password('TajneHaslo123'),
        )
        return Patient.objects.create(user=user, is_child=False)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def day_of(self, week, offset=0):
        return week + datetime.timedelta(days=offset)

    def entry(self, week, offset=0, mood=None, scales=None, patient=None, **fields):
        """One diary entry on a given day of a given week."""
        target = patient or self.patient
        diary = make_diary(
            target.id_medical, self.day_of(week, offset),
            current_mood=MOOD_LABELS[mood] if mood else None, **fields,
        )
        if scales:
            MoodScale.objects.create(diary=diary, **scales)
        return diary

    def reports(self):
        self.sign_in(self.patient.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        return response.data

    def only_report(self):
        reports = self.reports()
        self.assertEqual(len(reports), 1)
        return reports[0]

    def metric(self, report, key):
        return next(metric for metric in report['metrics'] if metric['key'] == key)


class AccessTests(ReportTestCase):
    def test_a_visitor_without_a_session_is_rejected(self):
        self.assertEqual(self.client.get(self.list_url).status_code, 403)

    def test_an_account_without_a_patient_row_is_rejected(self):
        """A guardian is not a clinical subject, so an empty list of reports
        would be a misleading answer rather than a true one."""
        guardian = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='rodzic')[0],
            email='rodzic@example.com',
        )
        self.sign_in(guardian)

        self.assertEqual(self.client.get(self.list_url).status_code, 403)

    def test_only_the_signed_in_patients_entries_are_aggregated(self):
        """There is no id in the URL, and the aggregation only ever sees the
        id_medical the session resolved to."""
        other = self.create_patient('ktos.inny@example.com')
        self.entry(self.week, mood='good', patient=other)
        self.entry(self.week, offset=1, mood='bad')

        report = self.only_report()

        self.assertEqual(report['entry_count'], 1)
        self.assertEqual(self.metric(report, 'hardDays')['value'], f'1 z {DAYS_IN_WEEK}')

    def test_another_patients_week_answers_404_rather_than_403(self):
        """A 403 would confirm the week exists for somebody — the same reason
        /api/diary/<id>/ answers 404."""
        other = self.create_patient('ktos.inny@example.com')
        self.entry(self.week, mood='good', patient=other)
        self.sign_in(self.patient.user)

        response = self.client.get(
            reverse('core:report-detail', args=[week_report_id(self.week)]),
        )

        self.assertEqual(response.status_code, 404)

    def test_no_write_verb_reaches_either_url(self):
        """A report is generated, not written. Read-only structurally rather
        than by permission."""
        self.entry(self.week, mood='good')
        self.sign_in(self.patient.user)
        detail = reverse('core:report-detail', args=[week_report_id(self.week)])

        for url in (self.list_url, detail):
            for verb in (self.client.post, self.client.put, self.client.delete):
                self.assertEqual(verb(url).status_code, 405)


class WhichWeeksGetAReportTests(ReportTestCase):
    def test_the_week_in_progress_has_no_report(self):
        """A report covers a week that has ended; one still running has not been
        generated yet."""
        self.entry(start_of_week(self.today), mood='good')

        self.assertEqual(self.reports(), [])

    def test_a_week_with_no_entries_at_all_has_no_report(self):
        """Diary entries are the only source, so there would be nothing to
        report — an empty week is absent, not a row of zeroes."""
        self.entry(self.previous_week, mood='good')

        reports = self.reports()

        self.assertEqual([report['id'] for report in reports],
                         [week_report_id(self.previous_week)])

    def test_reports_come_newest_first(self):
        self.entry(self.previous_week, mood='good')
        self.entry(self.week, mood='good')

        self.assertEqual(
            [report['id'] for report in self.reports()],
            [week_report_id(self.week), week_report_id(self.previous_week)],
        )

    def test_a_diary_with_nothing_finished_is_an_empty_list_not_an_error(self):
        self.assertEqual(self.reports(), [])

    def test_the_week_is_monday_to_sunday(self):
        self.entry(self.week, offset=0)
        self.entry(self.week, offset=6)

        report = self.only_report()

        self.assertEqual(report['week_start'], self.week.isoformat())
        self.assertEqual(
            report['week_end'],
            (self.week + datetime.timedelta(days=6)).isoformat(),
        )
        self.assertEqual(report['entry_count'], 2)


class MetricTests(ReportTestCase):
    def test_the_mood_average_uses_the_five_point_scale(self):
        self.entry(self.week, offset=0, mood='very_bad')   # 1
        self.entry(self.week, offset=1, mood='good')       # 4

        self.assertEqual(self.metric(self.only_report(), 'mood')['value'], '2,5 / 5')

    def test_a_week_that_rated_nothing_averages_to_a_dash(self):
        """Every field on the entry form is optional, so an entry with no mood
        is a real state — and '0 / 5' would be a lie about it."""
        self.entry(self.week, offset=0)

        self.assertEqual(self.metric(self.only_report(), 'mood')['value'], '— / 5')

    def test_stress_is_read_from_the_diary_row_not_the_scales(self):
        """'Stres' is the one of the ten emotions with no mood_scale column."""
        self.entry(self.week, offset=0, stress_level=8)
        self.entry(self.week, offset=1, stress_level=6)

        self.assertEqual(self.metric(self.only_report(), 'stress')['value'], '7,0 / 10')

    def test_a_slider_left_at_zero_is_an_answer(self):
        """Only NULL means 'not answered'; 0 is a rating and has to be averaged
        in, or a calm week reads as an unrated one."""
        self.entry(self.week, offset=0, energy_level=0)
        self.entry(self.week, offset=1, energy_level=4)

        self.assertEqual(self.metric(self.only_report(), 'energy')['value'], '2,0 / 10')

    def test_harder_days_count_the_two_lowest_moods(self):
        self.entry(self.week, offset=0, mood='very_bad')
        self.entry(self.week, offset=1, mood='bad')
        self.entry(self.week, offset=2, mood='neutral')

        self.assertEqual(
            self.metric(self.only_report(), 'hardDays')['value'], f'2 z {DAYS_IN_WEEK}',
        )

    def test_the_four_cards_are_always_there_and_in_order(self):
        self.entry(self.week, offset=0)

        keys = [metric['key'] for metric in self.only_report()['metrics']]

        self.assertEqual(keys, ['mood', 'stress', 'energy', 'hardDays'])


class DeltaTests(ReportTestCase):
    def latest(self):
        return self.reports()[0]

    def test_a_metric_is_compared_with_the_week_before(self):
        self.entry(self.previous_week, mood='neutral')     # 3
        self.entry(self.week, mood='very_good')            # 5

        delta = self.metric(self.latest(), 'mood')['delta']

        self.assertEqual(delta['value'], 2.0)
        self.assertIsNone(delta['gap'])

    def test_the_first_week_says_so_rather_than_showing_a_drop_to_zero(self):
        self.entry(self.week, mood='good')

        delta = self.metric(self.only_report(), 'mood')['delta']

        self.assertIsNone(delta['value'])
        self.assertEqual(delta['gap'], 'no-previous-week')

    def test_a_week_that_exists_but_left_the_metric_unrated_is_a_different_gap(self):
        """Saying 'there is no previous week' about a week that has entries
        would be a false statement in a document a therapist reads."""
        self.entry(self.previous_week)                     # an entry, no mood
        self.entry(self.week, mood='good')

        delta = self.metric(self.latest(), 'mood')['delta']

        self.assertIsNone(delta['value'])
        self.assertEqual(delta['gap'], 'unrated')

    def test_a_rise_in_mood_reads_as_reassuring_and_a_rise_in_stress_does_not(self):
        self.entry(self.previous_week, mood='bad', stress_level=2)
        self.entry(self.week, mood='good', stress_level=8)

        latest = self.latest()

        self.assertEqual(self.metric(latest, 'mood')['delta']['tone'], 'good')
        self.assertEqual(self.metric(latest, 'stress')['delta']['tone'], 'watch')

    def test_no_change_is_toned_neutral_rather_than_good(self):
        self.entry(self.previous_week, mood='good')
        self.entry(self.week, mood='good')

        delta = self.metric(self.latest(), 'mood')['delta']

        self.assertEqual(delta['value'], 0)
        self.assertEqual(delta['tone'], 'neutral')

    def test_an_emotions_change_is_never_coloured(self):
        """Whether more days of 'Lęk' is bad is a clinical judgement, not one a
        generated document is entitled to make."""
        self.entry(self.previous_week, mood='good', scales={'anxiety_scale': 3})
        self.entry(self.week, mood='good', scales={'anxiety_scale': 5})
        self.entry(self.week, offset=1, mood='good', scales={'anxiety_scale': 4})

        chips = self.latest()['changes']
        anxiety = next(chip for chip in chips if chip['label'] == 'Lęk')

        self.assertEqual(anxiety['delta']['tone'], 'neutral')
        self.assertEqual(anxiety['delta']['unit'], 'dzień')

    def test_a_week_after_an_empty_one_has_nothing_to_compare_against(self):
        """An empty week is not a week of zeroes, and the week after it is still
        the first week with anything in it."""
        self.entry(self.week, mood='good')

        self.assertEqual(self.only_report()['changes'], [])


class RankingTests(ReportTestCase):
    def test_emotions_are_ranked_by_the_days_they_were_rated_on(self):
        self.entry(self.week, offset=0, scales={'anxiety_scale': 5, 'sadness_scale': 2})
        self.entry(self.week, offset=1, scales={'anxiety_scale': 3})

        emotions = self.only_report()['emotions']

        self.assertEqual([(row['emotion'], row['days']) for row in emotions],
                         [('Lęk', 2), ('Smutek', 1)])

    def test_equal_counts_break_on_declaration_order_not_dict_iteration(self):
        """Otherwise the same week ranks differently between two requests."""
        self.entry(self.week, offset=0, scales={'sadness_scale': 1, 'anxiety_scale': 1})

        emotions = [row['emotion'] for row in self.only_report()['emotions']]

        # core.emotions.EMOTIONS declares Smutek before Lęk.
        self.assertEqual(emotions, ['Smutek', 'Lęk'])

    def test_triggers_come_from_situation_place_whichever_half_filled_it(self):
        """The chip and the 'Inne' free text are two inputs but one column, so
        there is nothing to unpack here."""
        self.entry(self.week, offset=0, situation_place='Dom')
        self.entry(self.week, offset=1, situation_place='Dom')
        self.entry(self.week, offset=2, situation_place='U babci')

        triggers = self.only_report()['triggers']

        self.assertEqual(triggers[0], {'trigger': 'Dom', 'days': 2})
        self.assertEqual(triggers[1], {'trigger': 'U babci', 'days': 1})

    def test_equal_trigger_counts_break_in_polish_alphabetical_order(self):
        for offset, place in enumerate(['Zabrze', 'Łódź', 'Lublin']):
            self.entry(self.week, offset=offset, situation_place=place)

        triggers = [row['trigger'] for row in self.only_report()['triggers']]

        # A codepoint sort would put 'Łódź' last; Polish puts it between the two.
        self.assertEqual(triggers, ['Lublin', 'Łódź', 'Zabrze'])

    def test_a_count_still_outranks_the_alphabet(self):
        self.entry(self.week, offset=0, situation_place='Zabrze')
        self.entry(self.week, offset=1, situation_place='Zabrze')
        self.entry(self.week, offset=2, situation_place='Dom')

        self.assertEqual([row['trigger'] for row in self.only_report()['triggers']],
                         ['Zabrze', 'Dom'])

    def test_an_unanswered_place_is_not_a_trigger(self):
        self.entry(self.week, offset=0)
        self.entry(self.week, offset=1, situation_place='')

        self.assertEqual(self.only_report()['triggers'], [])


class RiskyDayTests(ReportTestCase):
    def test_flagged_days_are_listed_oldest_first_with_a_link_to_the_entry(self):
        second = self.entry(self.week, offset=3, risky_behavior_note='druga')
        first = self.entry(self.week, offset=1, risky_behavior_note='pierwsza')

        risky = self.only_report()['risky_days']

        self.assertEqual([day['entry_id'] for day in risky],
                         [str(first.id_diary), str(second.id_diary)])

    def test_a_long_note_is_trimmed_to_a_preview(self):
        """The report links to the entry rather than reproducing it."""
        self.entry(self.week, risky_behavior_note='x' * 200)

        preview = self.only_report()['risky_days'][0]['note_preview']

        self.assertTrue(preview.endswith('…'))
        self.assertLess(len(preview), 200)

    def test_a_day_flagged_with_no_description_still_appears(self):
        self.entry(self.week, risky_behavior_note='')

        risky = self.only_report()['risky_days']

        self.assertEqual(len(risky), 1)
        self.assertEqual(risky[0]['note_preview'], '')

    def test_a_calm_week_is_an_empty_list_not_a_missing_key(self):
        self.entry(self.week, mood='good')

        self.assertEqual(self.only_report()['risky_days'], [])


class SummaryTests(ReportTestCase):
    def test_it_counts_the_entries_and_names_the_top_emotion(self):
        self.entry(self.week, offset=0, scales={'anxiety_scale': 4})
        self.entry(self.week, offset=1, scales={'anxiety_scale': 2})

        summary = self.only_report()['summary']

        self.assertIn(f'2 wpisy z {DAYS_IN_WEEK} dni', summary)
        # The sentence names emotions[0], which is the strongest now rather than
        # the most frequent — so it says "Najsilniej" and leads with the average.
        # Calling it "najczęściej" over an intensity-ordered list would put a
        # frequency claim on a row that is first for another reason.
        self.assertIn('Najsilniej odczuwana emocja: Lęk (śr. 3,0 / 10, 2 dni)', summary)

    def test_the_first_week_says_there_is_nothing_to_compare_with(self):
        self.entry(self.week, mood='good')

        self.assertIn('Nie ma jeszcze poprzedniego tygodnia', self.only_report()['summary'])

    def test_an_unrated_mood_is_not_reported_as_a_missing_week(self):
        self.entry(self.previous_week)
        self.entry(self.week, mood='good')

        summary = self.reports()[0]['summary']

        self.assertIn('nastrój nie został oceniony', summary)
        self.assertNotIn('Nie ma jeszcze poprzedniego tygodnia', summary)

    def test_risky_days_are_mentioned_only_when_there_are_any(self):
        self.entry(self.week, offset=0, mood='good')
        calm = self.only_report()['summary']

        self.entry(self.week, offset=1, risky_behavior_note='opis')
        flagged = self.only_report()['summary']

        self.assertNotIn('ryzykownym', calm)
        self.assertIn('Dni z oznaczonym zachowaniem ryzykownym: 1', flagged)


class DetailEndpointTests(ReportTestCase):
    def detail(self, report_id):
        self.sign_in(self.patient.user)
        return self.client.get(reverse('core:report-detail', args=[report_id]))

    def test_it_answers_with_the_same_report_the_list_carries(self):
        self.entry(self.week, mood='good', scales={'anxiety_scale': 4})

        response = self.detail(week_report_id(self.week))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.only_report())

    def test_a_week_with_no_entries_is_404(self):
        self.entry(self.week, mood='good')

        self.assertEqual(self.detail(week_report_id(self.previous_week)).status_code, 404)

    def test_an_id_that_is_not_a_week_at_all_is_404_rather_than_a_crash(self):
        self.entry(self.week, mood='good')

        self.assertEqual(self.detail('zupelnie-nie-tydzien').status_code, 404)

    def test_the_week_in_progress_is_404_even_when_it_has_entries(self):
        """It has no report yet, and the id names it perfectly well — so this is
        the one case where 404 means 'not generated' rather than 'not yours'."""
        self.entry(start_of_week(self.today), mood='good')

        self.assertEqual(self.detail(week_report_id(start_of_week(self.today))).status_code, 404)


class PureHelperTests(SimpleTestCase):
    """The formatting the payload carries pre-rendered. No database."""

    def test_the_mood_ranks_cover_exactly_the_stored_labels(self):
        """MOOD_RANK is keyed on what `serialize_entry` maps `current_mood` back
        to; a label added to one and not the other is a KeyError at request
        time."""
        self.assertEqual(set(MOOD_RANK), set(MOOD_LABELS))

    def test_a_range_inside_one_month_names_it_once(self):
        self.assertEqual(
            format_week_range(datetime.date(2026, 8, 3), datetime.date(2026, 8, 9)),
            '3 – 9 sierpnia 2026',
        )

    def test_a_range_across_two_months_names_both(self):
        self.assertEqual(
            format_week_range(datetime.date(2026, 7, 27), datetime.date(2026, 8, 2)),
            '27 lipca – 2 sierpnia 2026',
        )

    def test_a_range_across_new_year_names_both_years(self):
        self.assertEqual(
            format_week_range(datetime.date(2025, 12, 29), datetime.date(2026, 1, 4)),
            '29 grudnia 2025 – 4 stycznia 2026',
        )

    def test_polish_plurals(self):
        self.assertEqual(plural_days(1), 'dzień')
        self.assertEqual(plural_days(3), 'dni')
        self.assertEqual(plural_entries(1), 'wpis')
        self.assertEqual(plural_entries(3), 'wpisy')
        self.assertEqual(plural_entries(5), 'wpisów')

    def test_the_week_starts_on_monday(self):
        sunday = datetime.date(2026, 8, 9)
        monday = datetime.date(2026, 8, 3)

        self.assertEqual(start_of_week(sunday), monday)
        self.assertEqual(start_of_week(monday), monday)


class WeekBoundaryTests(ReportTestCase):
    """Which week an entry lands in, decided on the clock the diary uses.

    `local_date` reads Europe/Warsaw, not UTC — under UTC an entry written just
    after midnight would count towards the previous day, and in the small hours
    of a Monday towards the previous *week*, i.e. into a report that has already
    been generated.
    """

    def at(self, day, hour, minute=0):
        """An entry stamped at a wall-clock time in settings.TIME_ZONE."""
        diary = Diary.objects.create(id_medical=self.patient.id_medical)
        moment = timezone.make_aware(
            datetime.datetime.combine(day, datetime.time(hour, minute)),
        )
        Diary.objects.filter(pk=diary.pk).update(created_at=moment)
        return diary

    def test_just_before_midnight_on_sunday_belongs_to_the_week_ending(self):
        self.at(self.day_of(self.week, 6), 23, 59)

        self.assertEqual([report['id'] for report in self.reports()],
                         [week_report_id(self.week)])

    def test_just_after_midnight_on_monday_belongs_to_the_week_starting(self):
        """00:30 is the case the UTC boundary would get wrong: two hours earlier
        in UTC is still Sunday, i.e. the week before — one whose report has
        already been generated."""
        self.at(self.week, 0, 30)

        ids = [report['id'] for report in self.reports()]

        self.assertEqual(ids, [week_report_id(self.week)])
        self.assertNotIn(week_report_id(self.previous_week), ids)

    def test_the_two_sides_of_one_midnight_fall_into_different_reports(self):
        self.at(self.day_of(self.previous_week, 6), 23, 59)
        self.at(self.week, 0, 30)

        self.assertEqual([report['id'] for report in self.reports()],
                         [week_report_id(self.week), week_report_id(self.previous_week)])

    def test_a_week_containing_the_dst_change_still_has_seven_days(self):
        """Poland moves the clocks on the last Sunday of March and October. A
        23-hour day must not shorten the week or shift its Monday."""
        spring_forward = datetime.date(2026, 3, 29)  # last Sunday of March 2026
        week = start_of_week(spring_forward)

        self.assertEqual(week, datetime.date(2026, 3, 23))
        self.assertEqual(week + datetime.timedelta(days=DAYS_IN_WEEK - 1), spring_forward)

    def test_the_first_and_last_day_of_a_week_land_in_the_same_report(self):
        self.entry(self.week, offset=0)
        self.entry(self.week, offset=6)

        self.assertEqual(len(self.reports()), 1)
        self.assertEqual(self.only_report()['entry_count'], 2)


class GapsBetweenWeeksTests(ReportTestCase):
    def test_a_gap_of_one_empty_week_leaves_the_later_week_uncomparable(self):
        """"Previous" means the calendar week immediately before, not "the last
        week that had entries" — a comparison across a gap would be presented as
        week-on-week when it is not."""
        two_back = self.week - datetime.timedelta(days=2 * DAYS_IN_WEEK)
        self.entry(two_back, mood='very_bad')
        self.entry(self.week, mood='very_good')

        latest = self.reports()[0]

        self.assertEqual(latest['id'], week_report_id(self.week))
        self.assertEqual(self.metric(latest, 'mood')['delta']['gap'], 'no-previous-week')

    def test_a_long_gap_still_produces_both_reports(self):
        old_week = self.week - datetime.timedelta(days=40 * DAYS_IN_WEEK)
        self.entry(old_week, mood='good')
        self.entry(self.week, mood='good')

        self.assertEqual([report['id'] for report in self.reports()],
                         [week_report_id(self.week), week_report_id(old_week)])

    def test_weeks_are_ordered_across_a_year_boundary(self):
        """ISO dates sort lexicographically, which is the only reason the plain
        reverse sort is chronological. Worth pinning where it would break."""
        december = datetime.date(2025, 12, 29)
        january = datetime.date(2026, 1, 5)

        self.assertGreater(january.isoformat(), december.isoformat())
        self.assertEqual(sorted([december, january], reverse=True), [january, december])


class TwoEntriesInOneDayTests(ReportTestCase):
    """The app allows one entry per calendar day, but nothing in the schema does
    — `mock_data.sql` and a hand-written INSERT both can. The report must not
    crash on it, and what it counts should be legible."""

    def test_both_entries_are_counted(self):
        self.entry(self.week, offset=0, mood='very_bad')
        self.entry(self.week, offset=0, mood='very_good')

        report = self.only_report()

        self.assertEqual(report['entry_count'], 2)
        self.assertEqual(self.metric(report, 'mood')['value'], '3,0 / 5')

    def test_an_emotion_rated_twice_in_a_day_counts_twice(self):
        """A known consequence of counting rows rather than distinct dates: the
        ranking is 'times rated', which equals 'days' only while the one-entry-
        per-day rule holds. Documented rather than worked around, because the
        rule is enforced where entries are written."""
        self.entry(self.week, offset=0, scales={'anxiety_scale': 3})
        self.entry(self.week, offset=0, scales={'anxiety_scale': 5})

        row = self.only_report()['emotions'][0]

        self.assertEqual((row['emotion'], row['days']), ('Lęk', 2))


class MultipleScaleRowsTests(ReportTestCase):
    """`mood_scale` has no unique constraint on `id_diary`, so an entry can carry
    more than one row. Reads and writes have to agree on which one counts."""

    def test_the_lowest_id_wins_the_same_way_saving_picks_it(self):
        diary = self.entry(self.week, scales={'anxiety_scale': 2})
        MoodScale.objects.create(diary=diary, anxiety_scale=9)

        emotions = self.only_report()['emotions']

        self.assertEqual([(row['emotion'], row['days']) for row in emotions],
                         [('Lęk', 1)])
        # The lower id_scale carried 2, the later row 9.
        self.assertEqual(emotions[0]['avg_intensity'], 2.0)

    def test_the_intensity_read_is_the_one_from_that_row(self):
        diary = self.entry(self.week, stress_level=None)
        MoodScale.objects.create(diary=diary, anxiety_scale=1)
        MoodScale.objects.filter(diary=diary).update(anxiety_scale=1)

        self.assertEqual(self.only_report()['emotions'][0]['days'], 1)


class LimitTests(ReportTestCase):
    def test_the_emotion_ranking_is_not_capped(self):
        """Every emotion the week rated gets a row. A cut list would read as
        emotions that were not felt rather than as ones that did not fit."""
        self.entry(self.week, scales={
            'anxiety_scale': 1, 'sadness_scale': 2, 'anger_scale': 3,
            'frustration_scale': 4, 'helplessness_scale': 5, 'guilt_scale': 6,
            'shame_scale': 7, 'happiness_scale': 8, 'calm_scale': 9,
        }, stress_level=10)

        emotions = self.only_report()['emotions']

        self.assertEqual(len(emotions), 10)
        # Ten distinct intensities on one day, so the order is purely the
        # average, strongest first — 10 for 'Stres' down to 1 for 'Lęk'.
        self.assertEqual([row['emotion'] for row in emotions], [
            'Stres', 'Spokój', 'Radość', 'Wstyd', 'Poczucie winy',
            'Bezradność', 'Frustracja', 'Złość', 'Smutek', 'Lęk',
        ])

    def test_an_emotion_the_week_never_rated_has_no_row(self):
        """The other half of "all of them": absence is what "not felt this
        week" looks like, not a row of zeroes."""
        self.entry(self.week, scales={'anxiety_scale': 4})

        emotions = [row['emotion'] for row in self.only_report()['emotions']]

        self.assertEqual(emotions, ['Lęk'])
        self.assertNotIn('Smutek', emotions)

    def test_every_row_carries_its_own_average_however_many_there_are(self):
        self.entry(self.week, scales={
            'anxiety_scale': 2, 'sadness_scale': 4, 'anger_scale': 6,
            'frustration_scale': 8, 'helplessness_scale': 10, 'guilt_scale': 1,
        })

        averages = {row['emotion']: row['avg_intensity']
                    for row in self.only_report()['emotions']}

        self.assertEqual(averages['Lęk'], 2.0)
        self.assertEqual(averages['Bezradność'], 10.0)
        self.assertEqual(len(averages), 6)

    def test_the_trigger_ranking_stops_at_four(self):
        for offset, place in enumerate(['Dom', 'Praca', 'Szkoła', 'Transport', 'Uczelnia']):
            self.entry(self.week, offset=offset, situation_place=place)

        self.assertEqual(len(self.only_report()['triggers']), TOP_TRIGGERS)

    def test_the_summary_chips_stop_at_two_emotions(self):
        self.entry(self.previous_week, scales={
            'anxiety_scale': 1, 'sadness_scale': 1, 'anger_scale': 1,
        })
        for offset in range(3):
            self.entry(self.week, offset=offset, scales={
                'anxiety_scale': 1, 'sadness_scale': 1, 'anger_scale': 1,
            })

        emotion_chips = [
            chip for chip in self.reports()[0]['changes']
            if chip['label'] not in ('Nastrój', 'Napięcie')
        ]

        self.assertEqual(len(emotion_chips), SUMMARY_CHIP_EMOTIONS)

    def test_the_history_cap_is_inherited_and_drops_the_oldest_weeks(self):
        """`load_history` takes MAX_HISTORY_ENTRIES newest rows, so a diary
        longer than that loses its oldest reports rather than erroring. Patched
        down instead of writing a thousand rows."""
        from unittest.mock import patch

        old_week = self.week - datetime.timedelta(days=DAYS_IN_WEEK)
        self.entry(old_week, mood='good')
        self.entry(self.week, mood='good')

        with patch('core.diary.MAX_HISTORY_ENTRIES', 1):
            ids = [report['id'] for report in self.reports()]

        self.assertEqual(ids, [week_report_id(self.week)])


class OddDataTests(ReportTestCase):
    def test_an_entry_dated_in_the_future_is_left_out(self):
        """Not reachable through the app, but a hand-written row can be there —
        and a report for a week that has not happened is nonsense."""
        self.entry(start_of_week(self.today) + datetime.timedelta(days=DAYS_IN_WEEK), mood='good')
        self.entry(self.week, mood='good')

        self.assertEqual([report['id'] for report in self.reports()],
                         [week_report_id(self.week)])

    def test_an_emotion_rated_zero_is_a_rating_like_any_other(self):
        """0 is an answer; only NULL means the chip was never touched."""
        self.entry(self.week, scales={'anxiety_scale': 0})

        row = self.only_report()['emotions'][0]

        self.assertEqual((row['emotion'], row['days'], row['avg_intensity']), ('Lęk', 1, 0.0))

    def test_stress_at_zero_averages_in_rather_than_being_skipped(self):
        self.entry(self.week, offset=0, stress_level=0)
        self.entry(self.week, offset=1, stress_level=10)

        self.assertEqual(self.metric(self.only_report(), 'stress')['value'], '5,0 / 10')

    def test_a_trigger_of_only_whitespace_is_not_a_trigger(self):
        self.entry(self.week, situation_place='   ')

        self.assertEqual(self.only_report()['triggers'], [])

    def test_a_scale_row_with_every_column_null_rates_nothing(self):
        self.entry(self.week, scales={})

        report = self.only_report()

        self.assertEqual(report['emotions'], [])
        self.assertEqual(report['summary'].count('Najczęściej'), 0)

    def test_an_entry_with_no_answers_at_all_still_counts_as_an_entry(self):
        """Every field on the form is optional; opening it and saving is a real
        thing a patient does, and the week did have an entry."""
        self.entry(self.week)

        report = self.only_report()

        self.assertEqual(report['entry_count'], 1)
        self.assertEqual(self.metric(report, 'mood')['value'], '— / 5')
        self.assertEqual(self.metric(report, 'hardDays')['value'], f'0 z {DAYS_IN_WEEK}')

    def test_a_patient_row_whose_id_medical_has_no_entries_is_an_empty_list(self):
        self.assertEqual(self.reports(), [])


class RoundingTests(SimpleTestCase):
    """One decimal, halves away from zero. No database."""

    def test_it_keeps_float_noise_off_the_screen(self):
        self.assertEqual(_round1(5.699999999999999), 5.7)
        self.assertEqual(_round1(1 / 3), 0.3)

    def test_a_half_goes_up_rather_than_to_the_even_neighbour(self):
        """`round()` would send 0.25 to 0.2 and 3.35 to 3.4 — the direction
        decided by whether the float sits a hair under or over the half. A
        number read clinically should not depend on that."""
        self.assertEqual(_round1(0.25), 0.3)
        self.assertEqual(_round1(2.25), 2.3)
        self.assertEqual(_round1(3.35), 3.4)

    def test_a_negative_half_goes_away_from_zero_too(self):
        """Deltas are signed, so the two directions have to be symmetric or a
        rise of 0.25 and a fall of 0.25 render as different magnitudes."""
        self.assertEqual(_round1(-0.25), -0.3)
        self.assertEqual(_round1(-2.25), -2.3)

    def test_a_whole_number_survives_unchanged(self):
        self.assertEqual(_round1(4), 4.0)
        self.assertEqual(_round1(0), 0.0)


class NumberFormattingTests(SimpleTestCase):
    def test_a_comma_replaces_the_decimal_point(self):
        self.assertEqual(format_number(3.1, 1), '3,1')
        self.assertEqual(format_number(3, 0), '3')

    def test_a_whole_average_still_shows_its_decimal(self):
        """'3 / 5' next to '3,1 / 5' in a column of cards reads as a different
        kind of number."""
        self.assertEqual(format_average(3.0, 5), '3,0 / 5')

    def test_nothing_to_average_is_a_dash_not_a_zero(self):
        self.assertEqual(format_average(None, 5), '— / 5')
        self.assertEqual(format_average(None, 10), '— / 10')

    def test_zero_is_a_value_and_prints_as_one(self):
        self.assertEqual(format_average(0.0, 10), '0,0 / 10')


class PolishSortKeyTests(SimpleTestCase):
    """Trigger names are free text; ties in the ranking break on Polish order,
    where 'ą' follows 'a' rather than 'z'."""

    def test_a_diacritic_sorts_next_to_its_base_letter(self):
        self.assertEqual(sorted(['Zabrze', 'Łódź', 'Lublin'], key=_polish_key),
                         ['Lublin', 'Łódź', 'Zabrze'])

    def test_z_with_a_dot_follows_z_with_an_acute(self):
        self.assertEqual(sorted(['żaba', 'źle', 'zebra'], key=_polish_key),
                         ['zebra', 'źle', 'żaba'])

    def test_case_does_not_decide_the_order(self):
        self.assertEqual(sorted(['dom', 'Praca'], key=_polish_key), ['dom', 'Praca'])

    def test_a_string_with_no_polish_letters_is_left_alone(self):
        self.assertEqual(sorted(['b', 'a', 'c'], key=_polish_key), ['a', 'b', 'c'])


class TruncationTests(SimpleTestCase):
    def test_a_short_note_is_returned_whole(self):
        self.assertEqual(_truncate('Krótka notatka.'), 'Krótka notatka.')

    def test_a_note_exactly_at_the_limit_is_not_marked_as_cut(self):
        self.assertEqual(_truncate('x' * 90), 'x' * 90)

    def test_one_character_over_the_limit_is_cut(self):
        cut = _truncate('x' * 91)

        self.assertTrue(cut.endswith('…'))
        self.assertEqual(len(cut), 91)

    def test_trailing_space_before_the_ellipsis_is_removed(self):
        self.assertEqual(_truncate(('x' * 89) + '   koniec'), ('x' * 89) + '…')

    def test_surrounding_whitespace_is_stripped(self):
        self.assertEqual(_truncate('   notatka   '), 'notatka')

    def test_a_note_of_only_whitespace_becomes_empty(self):
        self.assertEqual(_truncate('    '), '')

    def test_none_is_survivable_rather_than_an_attribute_error(self):
        self.assertEqual(_truncate(None), '')


class WeekRangeEdgeTests(SimpleTestCase):
    def test_january_and_december_are_named_correctly(self):
        self.assertEqual(
            format_week_range(datetime.date(2026, 1, 5), datetime.date(2026, 1, 11)),
            '5 – 11 stycznia 2026',
        )
        self.assertEqual(
            format_week_range(datetime.date(2026, 12, 21), datetime.date(2026, 12, 27)),
            '21 – 27 grudnia 2026',
        )

    def test_a_february_week_in_a_leap_year(self):
        self.assertEqual(
            format_week_range(datetime.date(2028, 2, 28), datetime.date(2028, 3, 5)),
            '28 lutego – 5 marca 2028',
        )

    def test_the_month_is_genitive_rather_than_nominative(self):
        """'9 sierpień 2026' is what a nominative table would produce."""
        rendered = format_week_range(datetime.date(2026, 8, 3), datetime.date(2026, 8, 9))

        self.assertIn('sierpnia', rendered)
        self.assertNotIn('sierpień', rendered)


class PluralEdgeTests(SimpleTestCase):
    def test_zero_takes_the_many_form(self):
        self.assertEqual(plural_days(0), 'dni')
        self.assertEqual(plural_entries(0), 'wpisów')

    def test_the_teens_are_not_the_few_form(self):
        """22 would be 'wpisy' in full Polish grammar, but a week holds at most
        seven entries, so the table only has to be right up to seven."""
        self.assertEqual(plural_entries(5), 'wpisów')
        self.assertEqual(plural_entries(7), 'wpisów')

    def test_the_boundaries_of_the_few_form(self):
        self.assertEqual(plural_entries(2), 'wpisy')
        self.assertEqual(plural_entries(4), 'wpisy')


class DeltaEdgeTests(ReportTestCase):
    def latest(self):
        return self.reports()[0]

    def test_a_metric_rated_now_but_not_before_is_unrated_not_a_rise(self):
        """Both directions of the gap, because only one of them is obvious."""
        self.entry(self.previous_week)
        self.entry(self.week, mood='good')

        self.assertEqual(self.metric(self.latest(), 'mood')['delta']['gap'], 'unrated')

    def test_a_metric_rated_before_but_not_now_is_unrated_too(self):
        self.entry(self.previous_week, mood='good')
        self.entry(self.week)

        self.assertEqual(self.metric(self.latest(), 'mood')['delta']['gap'], 'unrated')

    def test_harder_days_never_report_an_unrated_gap(self):
        """A day count is answered by every week that exists — an entry with no
        mood is simply not a harder day."""
        self.entry(self.previous_week)
        self.entry(self.week)

        delta = self.metric(self.latest(), 'hardDays')['delta']

        self.assertEqual(delta['value'], 0)
        self.assertIsNone(delta['gap'])

    def test_a_gap_carries_no_tone_to_colour(self):
        self.entry(self.week, mood='good')

        for metric in self.only_report()['metrics']:
            self.assertEqual(metric['delta']['tone'], 'neutral')

    def test_a_fall_in_mood_is_watch_and_a_fall_in_stress_is_good(self):
        """The mirror of the rise test — a direction is only meaningful if both
        ways round are asserted."""
        self.entry(self.previous_week, mood='very_good', stress_level=9)
        self.entry(self.week, mood='very_bad', stress_level=1)

        latest = self.latest()

        self.assertEqual(self.metric(latest, 'mood')['delta']['tone'], 'watch')
        self.assertEqual(self.metric(latest, 'stress')['delta']['tone'], 'good')

    def test_fewer_harder_days_is_the_reassuring_direction(self):
        self.entry(self.previous_week, offset=0, mood='very_bad')
        self.entry(self.previous_week, offset=1, mood='bad')
        self.entry(self.week, mood='very_bad')

        delta = self.metric(self.latest(), 'hardDays')['delta']

        self.assertEqual(delta['value'], -1)
        self.assertEqual(delta['tone'], 'good')
        self.assertEqual(delta['decimals'], 0)

    def test_the_energy_delta_is_reassuring_upwards(self):
        self.entry(self.previous_week, energy_level=2)
        self.entry(self.week, energy_level=8)

        self.assertEqual(self.metric(self.latest(), 'energy')['delta']['tone'], 'good')

    def test_an_average_delta_is_rounded_to_one_decimal(self):
        self.entry(self.previous_week, offset=0, energy_level=1)
        self.entry(self.previous_week, offset=1, energy_level=2)
        self.entry(self.week, energy_level=4)

        # 4 - 1.5
        self.assertEqual(self.metric(self.latest(), 'energy')['delta']['value'], 2.5)

    def test_an_emotion_dropped_entirely_shows_as_a_fall(self):
        self.entry(self.previous_week, offset=0, scales={'anxiety_scale': 5})
        self.entry(self.previous_week, offset=1, scales={'anxiety_scale': 5})
        self.entry(self.week, mood='good')

        chips = {chip['label']: chip['delta'] for chip in self.latest()['changes']}

        self.assertEqual(chips['Lęk']['value'], -2)
        self.assertEqual(chips['Lęk']['unit'], 'dni')

    def test_an_emotion_appearing_for_the_first_time_shows_as_a_rise(self):
        self.entry(self.previous_week, mood='good')
        self.entry(self.week, scales={'anxiety_scale': 5})

        chips = {chip['label']: chip['delta'] for chip in self.latest()['changes']}

        self.assertEqual(chips['Lęk']['value'], 1)
        self.assertEqual(chips['Lęk']['unit'], 'dzień')

    def test_an_emotion_rated_equally_often_is_not_a_chip(self):
        self.entry(self.previous_week, scales={'anxiety_scale': 1})
        self.entry(self.week, scales={'anxiety_scale': 9})

        labels = [chip['label'] for chip in self.latest()['changes']]

        # The intensity changed; the number of days it was rated on did not, and
        # that is what the chip counts.
        self.assertNotIn('Lęk', labels)

    def test_the_chips_are_ordered_mood_then_emotions_then_tension(self):
        self.entry(self.previous_week, mood='bad', tension_level=2,
                   scales={'anxiety_scale': 3})
        self.entry(self.week, mood='good', tension_level=8)

        self.assertEqual([chip['label'] for chip in self.latest()['changes']],
                         ['Nastrój', 'Lęk', 'Napięcie'])

    def test_a_week_where_nothing_moved_has_no_chips(self):
        self.entry(self.previous_week, mood='good', tension_level=5)
        self.entry(self.week, mood='good', tension_level=5)

        self.assertEqual(self.latest()['changes'], [])

    def test_the_biggest_emotion_move_comes_first(self):
        self.entry(self.previous_week, mood='good')
        for offset in range(3):
            self.entry(self.week, offset=offset, scales={'anxiety_scale': 1})
        self.entry(self.week, offset=4, scales={'sadness_scale': 1})

        emotion_chips = [
            chip['label'] for chip in self.latest()['changes']
            if chip['label'] not in ('Nastrój', 'Napięcie')
        ]

        self.assertEqual(emotion_chips[0], 'Lęk')


class SummaryEdgeTests(ReportTestCase):
    def test_a_single_entry_is_declined_in_the_singular(self):
        self.entry(self.week, mood='good')

        self.assertIn(f'1 wpis z {DAYS_IN_WEEK} dni', self.only_report()['summary'])

    def test_five_entries_take_the_many_form(self):
        for offset in range(5):
            self.entry(self.week, offset=offset, mood='good')

        self.assertIn(f'5 wpisów z {DAYS_IN_WEEK} dni', self.only_report()['summary'])

    def test_a_single_day_of_an_emotion_is_declined_too(self):
        self.entry(self.week, scales={'anxiety_scale': 4})

        self.assertIn('1 dzień)', self.only_report()['summary'])

    def test_a_week_with_no_emotion_rated_says_nothing_about_one(self):
        self.entry(self.week, mood='good')

        self.assertNotIn('Najsilniej odczuwana emocja', self.only_report()['summary'])

    def test_the_mood_sentence_carries_both_numbers(self):
        self.entry(self.previous_week, mood='bad')
        self.entry(self.week, mood='very_good')

        self.assertIn('z 2,0 na 5,0', self.reports()[0]['summary'])

    def test_it_is_one_paragraph_rather_than_a_list(self):
        self.entry(self.week, mood='good')

        summary = self.only_report()['summary']

        self.assertNotIn('\n', summary)
        self.assertTrue(summary.endswith('.'))


class ReportIdTests(ReportTestCase):
    """The one place a caller names something."""

    def detail_status(self, report_id):
        self.sign_in(self.patient.user)
        return self.client.get(f'/api/reports/{report_id}/').status_code

    def setUp(self):
        super().setUp()
        self.entry(self.week, mood='good')

    def test_the_id_is_the_weeks_monday(self):
        self.assertEqual(self.only_report()['id'], f'week-{self.week.isoformat()}')

    def test_an_id_naming_a_day_that_is_not_a_monday_is_404(self):
        """Nothing parses the id — it is matched against the reports that exist,
        so a Tuesday simply matches none."""
        tuesday = self.week + datetime.timedelta(days=1)

        self.assertEqual(self.detail_status(f'week-{tuesday.isoformat()}'), 404)

    def test_an_id_with_no_prefix_is_404(self):
        self.assertEqual(self.detail_status(self.week.isoformat()), 404)

    def test_an_id_in_the_wrong_case_is_404_rather_than_matched_loosely(self):
        self.assertEqual(self.detail_status(f'WEEK-{self.week.isoformat()}'), 404)

    def test_an_id_with_a_slash_never_reaches_the_view(self):
        """`<slug>` cannot contain one, so Django's resolver answers first."""
        self.sign_in(self.patient.user)

        self.assertEqual(self.client.get('/api/reports/week-2026-08-03/extra/').status_code, 404)

    def test_a_very_long_id_is_refused_without_a_crash(self):
        self.assertEqual(self.detail_status('week-' + 'x' * 500), 404)

    def test_an_empty_id_falls_back_to_the_list_url(self):
        """'/api/reports//' does not resolve; '/api/reports/' is the list."""
        self.sign_in(self.patient.user)

        self.assertEqual(self.client.get('/api/reports/').status_code, 200)
        self.assertEqual(self.client.get('/api/reports//').status_code, 404)


class SessionEdgeTests(ReportTestCase):
    """Who gets an answer at all."""

    def setUp(self):
        super().setUp()
        self.entry(self.week, mood='good')
        self.detail_url = reverse('core:report-detail', args=[week_report_id(self.week)])

    def test_a_cookie_pointing_at_a_deleted_user_is_not_a_session(self):
        user = self.patient.user
        self.sign_in(user)
        Patient.objects.filter(pk=self.patient.pk).delete()
        User.objects.filter(pk=user.pk).delete()

        self.assertEqual(self.client.get(self.list_url).status_code, 403)

    def test_a_specialist_account_has_no_reports_of_its_own(self):
        specialist = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='specjalista')[0],
            email='terapeuta@example.com', password_hash=make_password('TajneHaslo123'),
        )
        self.sign_in(specialist)

        self.assertEqual(self.client.get(self.list_url).status_code, 403)
        self.assertEqual(self.client.get(self.detail_url).status_code, 403)

    def test_a_minor_without_an_accepted_guardian_is_refused(self):
        """The gate is enforced here and not only in App.tsx's route guard, so a
        hand-made request no longer reaches the data. Kept in this file as well
        as in test_guardian_gate.py, which sweeps every clinical endpoint: this
        one is the regression guard for the reports specifically, since a rule
        applied to /api/diary/ and forgotten here would be no rule at all."""
        child = self.create_patient('dziecko@example.com')
        Patient.objects.filter(pk=child.pk).update(is_child=True)
        self.entry(self.week, mood='good', patient=child)
        self.sign_in(child.user)

        self.assertEqual(self.client.get(self.list_url).status_code, 403)

    def test_a_role_less_account_with_a_patient_row_is_still_a_patient(self):
        """`user_role` is nullable, and the endpoint keys on the patient row
        rather than on a role name."""
        roleless = self.create_patient('bezroli@example.com', role=None)
        self.entry(self.week, mood='good', patient=roleless)
        self.sign_in(roleless.user)

        self.assertEqual(len(self.client.get(self.list_url).data), 1)

    def test_a_get_needs_no_csrf_token(self):
        enforcing = APIClient(enforce_csrf_checks=True)
        session = enforcing.session
        session[SESSION_USER_KEY] = str(self.patient.user.pk)
        session.save()
        enforcing.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

        self.assertEqual(enforcing.get(self.list_url).status_code, 200)


class PayloadShapeTests(ReportTestCase):
    """Every key the frontend's `WeeklyReport` maps, present on every report."""

    KEYS = {
        'id', 'week_start', 'week_end', 'range_label', 'entry_count', 'metrics',
        'emotions', 'triggers', 'risky_days', 'changes', 'summary',
    }
    DELTA_KEYS = {'value', 'gap', 'decimals', 'unit', 'tone'}

    def setUp(self):
        super().setUp()
        self.entry(self.week, mood='good', scales={'anxiety_scale': 4},
                   situation_place='Dom', risky_behavior_note='opis')

    def test_the_report_carries_exactly_the_documented_keys(self):
        self.assertEqual(set(self.only_report()), self.KEYS)

    def test_every_delta_is_the_same_shape(self):
        report = self.only_report()
        deltas = [metric['delta'] for metric in report['metrics']]
        deltas += [chip['delta'] for chip in report['changes']]

        for delta in deltas:
            self.assertEqual(set(delta), self.DELTA_KEYS)
            self.assertIn(delta['decimals'], (0, 1))
            self.assertIn(delta['tone'], ('good', 'watch', 'neutral'))
            self.assertIsInstance(delta['unit'], str)

    def test_a_gap_is_set_exactly_when_there_is_no_value(self):
        """The frontend words the two cases differently and reads `gap` to tell
        them apart; a delta with both or neither would render nonsense."""
        for report in self.reports():
            for metric in report['metrics']:
                delta = metric['delta']
                self.assertEqual(delta['value'] is None, delta['gap'] is not None)

    def test_an_emotion_row_carries_both_numbers(self):
        row = self.only_report()['emotions'][0]

        self.assertEqual(set(row), {'emotion', 'days', 'avg_intensity'})

    def test_the_dates_are_iso_strings_not_date_objects(self):
        report = self.only_report()

        self.assertIsInstance(report['week_start'], str)
        self.assertIsInstance(report['risky_days'][0]['date'], str)
        datetime.date.fromisoformat(report['week_start'])

    def test_the_entry_id_is_a_string_the_diary_route_accepts(self):
        entry_id = self.only_report()['risky_days'][0]['entry_id']

        self.assertIsInstance(entry_id, str)
        self.assertEqual(str(uuid.UUID(entry_id)), entry_id)

    def test_the_whole_payload_is_json_serialisable(self):
        """Response.data is rendered later; a stray Decimal or date would only
        blow up at render time, which no other test here reaches."""
        json.dumps(self.reports())

    def test_the_metric_keys_are_the_camelcase_ones_the_frontend_switches_on(self):
        """The only camelCase in an otherwise snake_case payload: `key` is an
        identifier the screens compare against, not a column name."""
        keys = [metric['key'] for metric in self.only_report()['metrics']]

        self.assertEqual(keys, ['mood', 'stress', 'energy', 'hardDays'])


class EmotionIntensityTests(ReportTestCase):
    """How strongly each emotion was felt, next to how often."""

    def emotions(self):
        return {row['emotion']: row for row in self.only_report()['emotions']}

    def test_it_averages_the_intensities_across_the_days_rated(self):
        """The case as the client put it: Monday sadness 2, Thursday 4, so 3."""
        self.entry(self.week, offset=0, scales={'sadness_scale': 2})
        self.entry(self.week, offset=3, scales={'sadness_scale': 4})

        self.assertEqual(self.emotions()['Smutek'],
                         {'emotion': 'Smutek', 'days': 2, 'avg_intensity': 3.0})

    def test_a_day_the_emotion_was_not_rated_is_not_averaged_in_as_zero(self):
        """A chip the patient never touched is not a rating of nought. Counting
        it would drag every emotion down in proportion to how often they skipped
        it, which would say something about the form rather than the week."""
        self.entry(self.week, offset=0, scales={'sadness_scale': 6})
        self.entry(self.week, offset=1, scales={'anxiety_scale': 8})

        emotions = self.emotions()

        self.assertEqual(emotions['Smutek']['avg_intensity'], 6.0)
        self.assertEqual(emotions['Smutek']['days'], 1)

    def test_an_intensity_of_zero_is_a_rating_and_pulls_the_average_down(self):
        self.entry(self.week, offset=0, scales={'sadness_scale': 0})
        self.entry(self.week, offset=1, scales={'sadness_scale': 6})

        self.assertEqual(self.emotions()['Smutek']['avg_intensity'], 3.0)

    def test_a_single_day_averages_to_that_day(self):
        self.entry(self.week, scales={'anxiety_scale': 7})

        self.assertEqual(self.emotions()['Lęk']['avg_intensity'], 7.0)

    def test_the_average_is_rounded_to_one_decimal(self):
        for offset, value in enumerate((1, 2, 2)):
            self.entry(self.week, offset=offset, scales={'anxiety_scale': value})

        # 5/3 = 1.666…
        self.assertEqual(self.emotions()['Lęk']['avg_intensity'], 1.7)

    def test_a_half_rounds_up_the_same_way_every_other_average_does(self):
        for offset, value in enumerate((1, 2, 3, 3)):
            self.entry(self.week, offset=offset, scales={'anxiety_scale': value})

        # 9/4 = 2.25
        self.assertEqual(self.emotions()['Lęk']['avg_intensity'], 2.3)

    def test_stress_gets_an_average_too_although_it_has_no_scale_column(self):
        """'Stres' is rated on diary.stress_level, not on mood_scale — it must
        not fall out of the ranking that now reports intensity."""
        self.entry(self.week, offset=0, stress_level=4)
        self.entry(self.week, offset=1, stress_level=9)

        self.assertEqual(self.emotions()['Stres']['avg_intensity'], 6.5)

    def test_every_ranked_emotion_carries_one(self):
        """Never null: a row exists only because the emotion was rated, and
        every rating carries an intensity."""
        self.entry(self.week, scales={
            'anxiety_scale': 1, 'sadness_scale': 2, 'anger_scale': 3,
        }, stress_level=4)

        for row in self.only_report()['emotions']:
            self.assertIsInstance(row['avg_intensity'], float)

    def test_the_ranking_is_ordered_by_intensity_not_by_days(self):
        """The reversal, and the reason the section is now "Najsilniej".

        Three faint days of 'Smutek' against one overwhelming day of 'Lęk': the
        ranking used to put 'Smutek' first and draw it the longer bar, which is
        a defensible ordering and was an indefensible *length*. Both follow the
        average now.
        """
        for offset in range(3):
            self.entry(self.week, offset=offset, scales={'sadness_scale': 1})
        self.entry(self.week, offset=4, scales={'anxiety_scale': 10})

        self.assertEqual([row['emotion'] for row in self.only_report()['emotions']],
                         ['Lęk', 'Smutek'])

    def test_the_day_count_is_still_on_every_row(self):
        """Frequency did not stop being a reading — it stopped being the bar."""
        for offset in range(3):
            self.entry(self.week, offset=offset, scales={'sadness_scale': 1})
        self.entry(self.week, offset=4, scales={'anxiety_scale': 10})

        self.assertEqual(self.emotions()['Smutek']['days'], 3)
        self.assertEqual(self.emotions()['Lęk']['days'], 1)

    def test_the_real_week_that_prompted_the_change(self):
        """2026-08-24, reduced to the two rows that made the point.

        'Smutek' was rated on five days averaging 0.8 and drew a bar 83% as long
        as the week's strongest feeling; 'Spokój' at 6.3 drew the same bar as
        'Lęk' at 2.5. Whatever the ordering, those lengths described a week the
        diary did not contain.
        """
        for offset in range(5):
            self.entry(self.week, offset=offset, scales={'sadness_scale': 1})
        for offset in range(2):
            self.entry(self.week, offset=offset, scales={'calm_scale': 6})

        ranked = [row['emotion'] for row in self.only_report()['emotions']]

        self.assertEqual(ranked, ['Spokój', 'Smutek'])
        self.assertGreater(self.emotions()['Spokój']['avg_intensity'],
                           self.emotions()['Smutek']['avg_intensity'])
        # …and the frequency the old order was built on is the other way round.
        self.assertGreater(self.emotions()['Smutek']['days'],
                           self.emotions()['Spokój']['days'])

    def test_an_equal_average_breaks_on_the_day_count(self):
        """The first tie-break: same intensity, so the one felt on more days
        goes first. Deterministic beats whichever the sort happened to see."""
        for offset in range(2):
            self.entry(self.week, offset=offset, scales={'anxiety_scale': 5})
        self.entry(self.week, offset=3, scales={'sadness_scale': 5})

        self.assertEqual([row['emotion'] for row in self.only_report()['emotions']],
                         ['Lęk', 'Smutek'])

    def test_an_equal_average_and_day_count_break_on_declaration_order(self):
        """The last tie-break, unchanged: core/emotions.py's own order, which
        test_emotions.py pins against the frontend character for character."""
        self.entry(self.week, scales={'sadness_scale': 5, 'anxiety_scale': 5})

        self.assertEqual([row['emotion'] for row in self.only_report()['emotions']],
                         ['Smutek', 'Lęk'])

    def test_the_summary_chips_still_compare_days_rather_than_intensity(self):
        """Two different questions: the chip says an emotion was rated on more
        days, not that it got stronger."""
        self.entry(self.previous_week, scales={'anxiety_scale': 1})
        self.entry(self.week, scales={'anxiety_scale': 10})

        labels = [chip['label'] for chip in self.reports()[0]['changes']]

        self.assertNotIn('Lęk', labels)

    def test_two_entries_on_one_day_average_both_ratings(self):
        self.entry(self.week, offset=0, scales={'sadness_scale': 2})
        self.entry(self.week, offset=0, scales={'sadness_scale': 8})

        self.assertEqual(self.emotions()['Smutek']['avg_intensity'], 5.0)
