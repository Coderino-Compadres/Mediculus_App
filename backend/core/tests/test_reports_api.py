"""Tests for /api/reports/ — the weekly reports, and what they are derived from.

The aggregation moved out of the browser (frontend/src/utils/reports.ts) so that
one document exists rather than one per browser, and so the "has this week
ended" cutoff is read on the same clock that decided which calendar day each
entry belongs to. These pin both halves: the numbers, and the access rules.

Touches both databases — the session and the `patient` row are in user_db, the
diary entries they aggregate are in medical_db.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.diary import MOOD_LABELS
from core.models import Diary, MoodScale, Patient, User, UserRole
from core.reports import (DAYS_IN_WEEK, MOOD_RANK, build_weekly_reports,
                          format_week_range, plural_days, plural_entries,
                          start_of_week, week_report_id)


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

        self.assertEqual(emotions[0], {'emotion': 'Lęk', 'days': 2})
        self.assertEqual(emotions[1], {'emotion': 'Smutek', 'days': 1})

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
        self.assertIn('Lęk (2 dni)', summary)

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
