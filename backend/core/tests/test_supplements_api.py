"""`/api/diet/supplements/` — "Suplementy i leki", the other half of §08.

THREE PROPERTIES ARE THE FEATURE and each one is a rule rather than a default:

* **A tick is a row for a day, and unticking deletes it.** Which means there is
  no stored record that somebody did *not* take a medicine — an absent row is a
  question nobody answered, not a missed dose. `IntakeTests` pins that, and
  `NothingIsAVerdictTests` pins that no payload carries an adherence figure. A
  "took 3 of 5" on a screen a patient with an eating disorder opens every
  morning is exactly what this module is built not to have.
* **Only today is tickable.** The diary's rule applied to a third kind of row:
  whether a medicine was taken on Tuesday is a fact about Tuesday. The day comes
  from the server's clock, so a date in the body cannot reach a past day.
* **Only `name` is required.** Somebody who knows they take magnesium and not
  the dose has to be able to write it down (§05's "żadne pole nie blokuje
  zapisu", applied to this form).

Plus the ordinary shape: the session is the only identity input, another
patient's row answers 404 rather than 403, and a non-patient is refused rather
than handed an empty list.
"""

import datetime
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import (Patient, Specjalist, Supplement, SupplementIntake,
                         User, UserRole)
from core.supplements import (END_BEFORE_START, LIST_IS_FULL, MAX_SUPPLEMENTS)

PASSWORD = 'TajneHaslo123'


class SupplementTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.patient = self.make_patient()
        self.sign_in(self.patient.user)

    def make_user(self, email='pacjent@example.com', role='patient'):
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD),
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        )

    def make_patient(self, email='pacjent@example.com', is_child=False):
        return Patient.objects.create(user=self.make_user(email), is_child=is_child)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def url(self):
        return reverse('core:diet-supplements')

    def item_url(self, id_supplement):
        return reverse('core:diet-supplement', args=[id_supplement])

    def intake_url(self, id_supplement):
        return reverse('core:diet-supplement-intake', args=[id_supplement])

    def add(self, **body):
        body.setdefault('name', 'Witamina D3')
        return self.client.post(self.url(), body, format='json')

    def row(self, patient=None, name='Magnez', hour='21:00', **fields):
        return Supplement.objects.create(
            id_medical=(patient or self.patient).id_medical,
            name=name,
            hour=datetime.time.fromisoformat(hour) if hour else None,
            **fields,
        )


class ListTests(SupplementTestCase):
    """What the screen reads."""

    def test_an_empty_list_is_an_empty_list_rather_than_an_error(self):
        self.assertEqual(self.client.get(self.url()).json(), [])

    def test_the_payload_is_the_documented_shape(self):
        self.row(dose='200 mg', frequency='raz dziennie',
                 start_date=self.today, end_date=None)

        row = self.client.get(self.url()).json()[0]

        self.assertEqual(sorted(row), [
            'dose', 'end_date', 'frequency', 'hour', 'id', 'name',
            'reminder_enabled', 'start_date', 'taken_today',
        ])

    def test_it_is_ordered_by_hour(self):
        self.row(name='Wieczorny', hour='21:00')
        self.row(name='Poranny', hour='08:00')

        names = [row['name'] for row in self.client.get(self.url()).json()]

        self.assertEqual(names, ['Poranny', 'Wieczorny'])

    def test_a_preparation_with_no_hour_does_not_open_the_list(self):
        """`nulls_last`: the list's whole shape is "what to take, and when"."""
        self.row(name='Bez godziny', hour=None)
        self.row(name='O ósmej', hour='08:00')

        names = [row['name'] for row in self.client.get(self.url()).json()]

        self.assertEqual(names, ['O ósmej', 'Bez godziny'])

    def test_only_the_signed_in_patient_s_rows_are_listed(self):
        other = self.make_patient('inny@example.com')
        self.row(patient=other, name='Cudzy')
        self.row(name='Mój')

        names = [row['name'] for row in self.client.get(self.url()).json()]

        self.assertEqual(names, ['Mój'])

    def test_nothing_identifying_travels(self):
        self.row()

        blob = repr(self.client.get(self.url()).json())

        self.assertNotIn(str(self.patient.id_medical), blob)
        self.assertNotIn(self.patient.user.email, blob)


class CreateTests(SupplementTestCase):
    """"+ Dodaj suplement lub lek"."""

    def test_only_the_name_is_required(self):
        response = self.add(name='Magnez')

        self.assertEqual(response.status_code, 201)
        row = Supplement.objects.get()
        self.assertEqual(row.name, 'Magnez')
        self.assertIsNone(row.dose)
        self.assertIsNone(row.frequency)
        self.assertIsNone(row.hour)
        self.assertIsNone(row.start_date)
        self.assertIsNone(row.end_date)

    def test_a_missing_name_is_refused_and_writes_nothing(self):
        response = self.client.post(self.url(), {'dose': '200 mg'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('name', response.json())
        self.assertFalse(Supplement.objects.exists())

    def test_a_blank_answer_is_stored_as_null_rather_than_as_an_empty_string(self):
        """One representation of "not answered", so no screen tells two apart."""
        self.add(dose='', frequency='   ')

        row = Supplement.objects.get()
        self.assertIsNone(row.dose)
        self.assertIsNone(row.frequency)

    def test_the_whole_form_is_stored(self):
        self.add(
            name='Sertralina', dose='50 mg', frequency='raz dziennie',
            hour='08:00', start_date='2026-03-03', end_date='2026-09-02',
            reminder_enabled=False,
        )

        row = Supplement.objects.get()
        self.assertEqual(row.dose, '50 mg')
        self.assertEqual(row.frequency, 'raz dziennie')
        self.assertEqual(row.hour, datetime.time(8, 0))
        self.assertEqual(row.start_date, datetime.date(2026, 3, 3))
        self.assertEqual(row.end_date, datetime.date(2026, 9, 2))
        self.assertFalse(row.reminder_enabled)

    def test_no_end_date_is_bezterminowo_rather_than_an_incomplete_row(self):
        self.add(start_date='2026-03-12')

        self.assertEqual(self.client.get(self.url()).json()[0]['end_date'], None)

    def test_an_end_before_the_start_is_refused_under_the_input_that_gave_it(self):
        response = self.add(start_date='2026-06-02', end_date='2026-06-01')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['end_date'], [END_BEFORE_START])
        self.assertFalse(Supplement.objects.exists())

    def test_either_date_alone_is_fine(self):
        """A regimen that started before the app existed, or one with no end."""
        self.assertEqual(self.add(start_date='2026-03-12').status_code, 201)
        self.assertEqual(self.add(name='Inny', end_date='2026-12-01').status_code, 201)

    def test_reminders_default_to_on(self):
        """The patient's answer is kept even though nothing sends one yet."""
        self.add()

        self.assertTrue(Supplement.objects.get().reminder_enabled)

    def test_the_answer_carries_the_whole_rebuilt_list(self):
        """Not the row that was written: the list is ordered by hour."""
        self.row(name='Wieczorny', hour='21:00')

        body = self.add(name='Poranny', hour='07:00').json()

        self.assertEqual([row['name'] for row in body], ['Poranny', 'Wieczorny'])

    def test_the_list_has_a_backstop_and_it_refuses_rather_than_grows(self):
        Supplement.objects.bulk_create([
            Supplement(id_medical=self.patient.id_medical, name=f'Preparat {n}')
            for n in range(MAX_SUPPLEMENTS)
        ])

        response = self.add(name='Jeszcze jeden')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['detail'], [LIST_IS_FULL])
        self.assertEqual(Supplement.objects.count(), MAX_SUPPLEMENTS)

    def test_the_backstop_counts_only_this_patient_s_rows(self):
        other = self.make_patient('inny@example.com')
        Supplement.objects.bulk_create([
            Supplement(id_medical=other.id_medical, name=f'Preparat {n}')
            for n in range(MAX_SUPPLEMENTS)
        ])

        self.assertEqual(self.add().status_code, 201)


class EditTests(SupplementTestCase):
    """PUT replaces, the same rule as /api/diary/today/."""

    def test_a_correction_is_stored(self):
        row = self.row(dose='200 mg')

        response = self.client.put(
            self.item_url(row.pk),
            {'name': 'Magnez', 'dose': '400 mg', 'hour': '21:00'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.dose, '400 mg')

    def test_a_field_left_out_is_an_answer_taken_back(self):
        """A merge would make a cleared dose look like an untouched one."""
        row = self.row(dose='200 mg', frequency='raz dziennie')

        self.client.put(self.item_url(row.pk), {'name': 'Magnez'}, format='json')

        row.refresh_from_db()
        self.assertIsNone(row.dose)
        self.assertIsNone(row.frequency)

    def test_another_patient_s_row_answers_404_rather_than_403(self):
        """A 403 would confirm the row exists — the /api/diary/<id>/ convention."""
        other = self.make_patient('inny@example.com')
        row = self.row(patient=other)

        response = self.client.put(
            self.item_url(row.pk), {'name': 'Podmienione'}, format='json')

        self.assertEqual(response.status_code, 404)
        row.refresh_from_db()
        self.assertEqual(row.name, 'Magnez')

    def test_an_unknown_id_answers_404(self):
        self.assertEqual(
            self.client.put(
                self.item_url(uuid.uuid4()), {'name': 'X'}, format='json',
            ).status_code,
            404,
        )

    def test_a_refused_edit_writes_nothing(self):
        row = self.row(dose='200 mg')

        self.client.put(self.item_url(row.pk), {'name': ''}, format='json')

        row.refresh_from_db()
        self.assertEqual(row.dose, '200 mg')


class DeleteTests(SupplementTestCase):
    def test_it_removes_the_row(self):
        row = self.row()

        response = self.client.delete(self.item_url(row.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Supplement.objects.exists())

    def test_it_takes_the_ticks_with_it(self):
        """CASCADE: a preparation the patient dropped has no history to keep."""
        row = self.row()
        SupplementIntake.objects.create(supplement=row, entry_date=self.today)

        self.client.delete(self.item_url(row.pk))

        self.assertFalse(SupplementIntake.objects.exists())

    def test_another_patient_s_row_answers_404_and_survives(self):
        other = self.make_patient('inny@example.com')
        row = self.row(patient=other)

        self.assertEqual(self.client.delete(self.item_url(row.pk)).status_code, 404)
        self.assertTrue(Supplement.objects.filter(pk=row.pk).exists())


class IntakeTests(SupplementTestCase):
    """"Odhacz, kiedy weźmiesz"."""

    def test_ticking_records_today(self):
        row = self.row()

        body = self.client.post(self.intake_url(row.pk), {}, format='json').json()

        self.assertTrue(body[0]['taken_today'])
        intake = SupplementIntake.objects.get()
        self.assertEqual(intake.entry_date, self.today)
        self.assertEqual(intake.supplement_id, row.pk)

    def test_ticking_twice_is_one_row_and_not_an_error(self):
        """A double-tapped checkbox is one act."""
        row = self.row()

        self.client.post(self.intake_url(row.pk), {}, format='json')
        response = self.client.post(self.intake_url(row.pk), {}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(SupplementIntake.objects.count(), 1)

    def test_unticking_deletes_the_row_rather_than_storing_a_no(self):
        row = self.row()
        self.client.post(self.intake_url(row.pk), {}, format='json')

        body = self.client.delete(self.intake_url(row.pk)).json()

        self.assertFalse(body[0]['taken_today'])
        self.assertFalse(SupplementIntake.objects.exists())

    def test_unticking_something_untouched_is_not_an_error(self):
        row = self.row()

        self.assertEqual(
            self.client.delete(self.intake_url(row.pk)).status_code, 200)

    def test_a_tick_on_a_past_day_is_left_alone(self):
        """Only today is tickable; yesterday's answer stays yesterday's."""
        row = self.row()
        yesterday = self.today - datetime.timedelta(days=1)
        SupplementIntake.objects.create(supplement=row, entry_date=yesterday)

        body = self.client.get(self.url()).json()

        self.assertFalse(body[0]['taken_today'])
        self.assertTrue(
            SupplementIntake.objects.filter(entry_date=yesterday).exists())

    def test_a_date_in_the_body_cannot_reach_a_past_day(self):
        """The day comes from the server's clock, not from the request."""
        row = self.row()

        self.client.post(
            self.intake_url(row.pk), {'entry_date': '2020-01-01'}, format='json')

        self.assertEqual(SupplementIntake.objects.get().entry_date, self.today)

    def test_another_patient_s_row_cannot_be_ticked(self):
        other = self.make_patient('inny@example.com')
        row = self.row(patient=other)

        self.assertEqual(
            self.client.post(self.intake_url(row.pk), {}, format='json').status_code,
            404,
        )
        self.assertFalse(SupplementIntake.objects.exists())

    def test_one_patient_s_tick_does_not_show_on_another_s_list(self):
        other = self.make_patient('inny@example.com')
        mine = self.row(name='Mój')
        theirs = self.row(patient=other, name='Cudzy')
        SupplementIntake.objects.create(supplement=theirs, entry_date=self.today)

        body = self.client.get(self.url()).json()

        self.assertEqual(len(body), 1)
        self.assertFalse(body[0]['taken_today'])
        self.assertEqual(body[0]['id'], str(mine.pk))


class NothingIsAVerdictTests(SupplementTestCase):
    """No adherence figure, and nowhere for one to appear."""

    FORBIDDEN = (
        'adherence', 'missed', 'taken_count', 'streak', 'score', 'compliance',
        'progress', 'target', 'success', 'skipped',
    )

    def test_no_key_counts_or_scores_anything(self):
        row = self.row()
        self.client.post(self.intake_url(row.pk), {}, format='json')

        for key in self.client.get(self.url()).json()[0]:
            self.assertNotIn(key, self.FORBIDDEN)

    def test_the_payload_says_nothing_about_days_that_were_not_ticked(self):
        """There is no stored "not taken", so there is nothing to report."""
        row = self.row()
        SupplementIntake.objects.create(
            supplement=row, entry_date=self.today - datetime.timedelta(days=3))

        body = self.client.get(self.url()).json()[0]

        self.assertEqual(
            sorted(key for key in body if 'taken' in key), ['taken_today'])


class AccessTests(SupplementTestCase):
    """Who may ask."""

    def test_a_visitor_is_refused(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.url()).status_code, 403)

    def test_a_guardian_is_refused_rather_than_handed_an_empty_list(self):
        guardian = self.make_user('opiekun@example.com', role='rodzic')
        self.sign_in(guardian)

        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.add().status_code, 403)

    def test_a_specialist_is_refused_too(self):
        """A specialist reads reports, and this is not one."""
        user = self.make_user('spec@example.com', role='specjalista')
        Specjalist.objects.create(user=user, specjalization='Psychodietetyka')
        self.sign_in(user)

        self.assertEqual(self.client.get(self.url()).status_code, 403)

    def test_the_list_url_takes_no_other_verb(self):
        for method in ('put', 'patch', 'delete'):
            with self.subTest(method=method):
                self.assertEqual(
                    getattr(self.client, method)(self.url(), {}, format='json')
                    .status_code,
                    405,
                )
