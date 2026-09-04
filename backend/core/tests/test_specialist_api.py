"""The specialist's panel: /api/specialist/, and the patient's half of it.

The property worth testing here is not that the endpoints work — it is *who they
refuse*. Registration is self-service (a specialist signs up like anybody else),
so being a specialist authorizes nothing at all: the only thing that puts a
patient's weekly reports in front of somebody is that patient accepting an
invitation. Every test below is really about that one sentence.

The other recurring theme is the invitation form's silence: an unknown address,
a guardian's address and a patient who already has a specialist all answer
identically, because otherwise the form is a way to ask who has an account here
and what kind of care they are in.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import Diary, Patient, Specjalist, User, UserRole
from core.reports import DAYS_IN_WEEK, start_of_week, week_report_id
from core.serializers import ACCOUNT_TYPE_SPECIALIST
from core.specialist import PATIENT_SUMMARY_FIELDS

PASSWORD = 'TajneHaslo123'


class SpecialistTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        # A week that has ended, so a report exists for it.
        self.week = start_of_week(self.today) - datetime.timedelta(days=DAYS_IN_WEEK)

    def make_user(self, email, role='patient', **fields):
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_patient(self, email='pacjent@example.com', is_child=False, **fields):
        return Patient.objects.create(
            user=self.make_user(email, role='patient'), is_child=is_child, **fields,
        )

    def make_specialist(self, email='specjalista@example.com', specjalization='DBT'):
        return Specjalist.objects.create(
            user=self.make_user(email, role='specjalista'),
            specjalization=specjalization,
        )

    def entry(self, patient, day=None, **fields):
        diary = Diary.objects.create(
            id_medical=patient.id_medical, current_mood='dobre', **fields,
        )
        noon = timezone.make_aware(
            datetime.datetime.combine(day or self.week, datetime.time(12, 0)))
        Diary.objects.filter(pk=diary.pk).update(created_at=noon)
        return diary

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def invite(self, specjalist, patient):
        patient.specjalist_pending = specjalist
        patient.save(update_fields=['specjalist_pending'])
        return patient

    def assign(self, specjalist, patient):
        patient.specjalist = specjalist
        patient.specjalist_accepted_at = timezone.now()
        patient.save(update_fields=['specjalist', 'specjalist_accepted_at'])
        return patient


class RegistrationTests(SpecialistTestCase):
    """A specialist account comes from the public form, like every other."""

    def setUp(self):
        super().setUp()
        # Roles are seeded by scripts/mock_data.sql rather than by a migration,
        # so the test database has none until something makes them. Registration
        # survives a missing row (role comes back null); these tests are about
        # what it writes when the row is there.
        UserRole.objects.get_or_create(name='specjalista')

    def register(self, **overrides):
        body = {
            'email': 'anna@example.com',
            'password': 'BardzoTajne987',
            'password_confirm': 'BardzoTajne987',
            'name': 'Anna',
            'surname': 'Terapeutka',
            'date_of_birth': '1985-02-01',
            'account_type': ACCOUNT_TYPE_SPECIALIST,
            'specialization': 'psychoterapia poznawczo-behawioralna',
            'data_consent': True,
            'services_consent': True,
        }
        body.update(overrides)
        return self.client.post(reverse('core:register'), body, format='json')

    def test_it_creates_a_specjalist_row_and_no_patient_row(self):
        """The whole shape of the account: a specialist is not a clinical
        subject, so there is no id_medical and nothing in medical_db can ever
        refer to them."""
        response = self.register()

        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email='anna@example.com')
        self.assertEqual(user.user_role.name, 'specjalista')
        self.assertTrue(Specjalist.objects.filter(user=user).exists())
        self.assertFalse(Patient.objects.filter(user=user).exists())
        self.assertEqual(
            Specjalist.objects.get(user=user).specjalization,
            'psychoterapia poznawczo-behawioralna',
        )

    def test_me_reports_is_specialist_so_the_frontend_can_route(self):
        self.register()

        response = self.client.get(reverse('core:me'))

        self.assertTrue(response.data['is_specialist'])
        self.assertFalse(response.data['is_patient'])
        # The question does not apply, so it is null rather than false — a
        # specialist is not a minor waiting for anybody.
        self.assertIsNone(response.data['is_child'])
        self.assertIsNone(response.data['guardian_status'])

    def test_the_specialization_is_required_for_this_type_only(self):
        """The patient reads it when deciding whether to accept them."""
        response = self.register(specialization='')

        self.assertEqual(response.status_code, 400)
        self.assertIn('specialization', response.data)
        self.assertFalse(User.objects.filter(email='anna@example.com').exists())

    def test_a_patient_does_not_have_to_answer_it(self):
        response = self.register(
            account_type='patient', specialization='', email='pacjent2@example.com',
        )

        self.assertEqual(response.status_code, 201, response.data)

    def test_a_minor_cannot_hold_a_specialist_account(self):
        minor = (timezone.localdate() - datetime.timedelta(days=365 * 15)).isoformat()

        response = self.register(date_of_birth=minor)

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_a_new_specialist_sees_an_empty_panel_and_nobody_else_s_data(self):
        """The property the self-service registration rests on: the role grants
        nothing. `patient.id_specjalist` is not self-assignable."""
        other = self.make_patient()
        self.entry(other)
        self.register()

        response = self.client.get(reverse('core:specialist-patients'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'patients': [], 'pending': []})


class InvitationTests(SpecialistTestCase):
    """Asking a patient, and the shared refusal that hides who has an account."""

    def setUp(self):
        super().setUp()
        self.specjalist = self.make_specialist()
        self.sign_in(self.specjalist.user)

    def invite_by_email(self, email):
        return self.client.post(
            reverse('core:specialist-patients'), {'patient_email': email}, format='json',
        )

    def test_inviting_creates_a_request_and_grants_nothing(self):
        patient = self.make_patient()
        self.entry(patient)

        response = self.invite_by_email(patient.user.email)

        self.assertEqual(response.status_code, 201, response.data)
        patient.refresh_from_db()
        self.assertEqual(patient.specjalist_pending_id, self.specjalist.pk)
        self.assertIsNone(patient.specjalist_id)
        # Pending, so still nobody's patient: the reports refuse exactly as they
        # would for a stranger.
        self.assertEqual(
            self.client.get(reverse(
                'core:specialist-patient-reports', args=[patient.user_id],
            )).status_code, 404,
        )

    def test_a_pending_patient_is_reported_with_no_activity_at_all(self):
        patient = self.make_patient()
        self.entry(patient)
        self.invite_by_email(patient.user.email)

        response = self.client.get(reverse('core:specialist-patients'))

        self.assertEqual(response.data['patients'], [])
        pending = response.data['pending'][0]
        self.assertIsNone(pending['activity'])
        self.assertIsNone(pending['accepted_at'])

    def test_case_is_not_part_of_the_address(self):
        patient = self.make_patient(email='pacjent@example.com')

        self.assertEqual(self.invite_by_email('Pacjent@Example.COM').status_code, 201)
        patient.refresh_from_db()
        self.assertEqual(patient.specjalist_pending_id, self.specjalist.pk)

    def test_re_inviting_the_same_patient_is_idempotent(self):
        patient = self.make_patient()
        self.invite_by_email(patient.user.email)

        self.assertEqual(self.invite_by_email(patient.user.email).status_code, 201)
        self.assertEqual(
            Patient.objects.filter(specjalist_pending=self.specjalist).count(), 1)

    def test_every_uninvitable_address_answers_identically(self):
        """The point of the shared message. An address nobody registered, a
        guardian's, another specialist's, a patient who already has a specialist
        and one somebody else is already asking — all the same sentence, so the
        form cannot be used to ask who has an account here."""
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        colleague = self.make_specialist(email='kolega@example.com')
        taken = self.make_patient(email='zajety@example.com')
        self.assign(colleague, taken)
        asked = self.make_patient(email='pytany@example.com')
        self.invite(colleague, asked)

        answers = set()
        for email in (
            'nikt@example.com', guardian.email, colleague.user.email,
            taken.user.email, asked.user.email,
        ):
            with self.subTest(email=email):
                response = self.invite_by_email(email)
                self.assertEqual(response.status_code, 400)
                answers.add(str(response.data['patient_email'][0]))

        self.assertEqual(len(answers), 1, answers)

    def test_a_patient_this_specialist_already_treats_is_refused_too(self):
        """Re-inviting must not quietly reset an accepted link — ending care is
        an action on the panel's own list."""
        patient = self.make_patient()
        self.assign(self.specjalist, patient)

        response = self.invite_by_email(patient.user.email)

        self.assertEqual(response.status_code, 400)
        patient.refresh_from_db()
        self.assertEqual(patient.specjalist_id, self.specjalist.pk)

    def test_your_own_address_gets_an_answer_you_can_act_on(self):
        response = self.invite_by_email(self.specjalist.user.email)

        self.assertEqual(response.status_code, 400)
        self.assertNotIn(
            'Nie znaleziono', str(response.data['patient_email'][0]),
        )

    def test_dropping_a_pending_invitation_leaves_no_trace(self):
        patient = self.make_patient()
        self.invite_by_email(patient.user.email)

        response = self.client.delete(
            reverse('core:specialist-patient', args=[patient.user_id]))

        self.assertEqual(response.status_code, 200)
        patient.refresh_from_db()
        self.assertIsNone(patient.specjalist_pending_id)

    def test_ending_care_clears_the_moment_it_started(self):
        patient = self.make_patient()
        self.assign(self.specjalist, patient)

        self.client.delete(reverse('core:specialist-patient', args=[patient.user_id]))

        patient.refresh_from_db()
        self.assertIsNone(patient.specjalist_id)
        self.assertIsNone(patient.specjalist_accepted_at)

    def test_somebody_else_s_patient_cannot_be_dropped_and_answers_like_a_stranger(self):
        colleague = self.make_specialist(email='kolega@example.com')
        patient = self.make_patient()
        self.assign(colleague, patient)

        response = self.client.delete(
            reverse('core:specialist-patient', args=[patient.user_id]))

        self.assertEqual(response.status_code, 404)
        patient.refresh_from_db()
        self.assertEqual(patient.specjalist_id, colleague.pk)


class PatientDecisionTests(SpecialistTestCase):
    """The patient's half: the only consent in this feature."""

    def setUp(self):
        super().setUp()
        self.specjalist = self.make_specialist()
        self.patient = self.make_patient()
        self.entry(self.patient)

    def test_the_card_names_the_person_asking(self):
        """Agreeing to be treated is a decision about a person; an address alone
        is not one."""
        self.invite(self.specjalist, self.patient)
        self.sign_in(self.patient.user)

        response = self.client.get(reverse('core:specialist-invitation'))

        # `make_user` leaves name/surname NULL, which is the state of every row
        # mock_data.sql seeds — so this also covers the fallback: an assigned
        # specialist with no name is still reported, with the address, rather
        # than as a blank line.
        self.assertEqual(response.data['invitation'], {
            'specialist': self.specjalist.user.email,
            'email': self.specjalist.user.email,
            'approach': 'DBT',
        })

    def test_a_named_specialist_is_named(self):
        self.specjalist.user.name = 'Anna'
        self.specjalist.user.surname = 'Terapeutka'
        self.specjalist.user.save(update_fields=['name', 'surname'])
        self.invite(self.specjalist, self.patient)
        self.sign_in(self.patient.user)

        response = self.client.get(reverse('core:specialist-invitation'))

        self.assertEqual(response.data['invitation']['specialist'], 'Anna Terapeutka')

    def test_no_invitation_is_null_rather_than_an_error(self):
        self.sign_in(self.patient.user)

        response = self.client.get(reverse('core:specialist-invitation'))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['invitation'])

    def test_accepting_is_what_opens_the_reports(self):
        self.invite(self.specjalist, self.patient)
        self.sign_in(self.patient.user)

        response = self.client.post(reverse('core:specialist-invitation-accept'))

        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.specjalist_id, self.specjalist.pk)
        self.assertIsNotNone(self.patient.specjalist_accepted_at)
        # And the pending column is emptied rather than left as a second copy:
        # "asked" and "treating" are phases, not parallel facts.
        self.assertIsNone(self.patient.specjalist_pending_id)

        self.sign_in(self.specjalist.user)
        self.assertEqual(
            self.client.get(reverse(
                'core:specialist-patient-reports', args=[self.patient.user_id],
            )).status_code, 200,
        )

    def test_refusing_records_nothing_and_lets_the_specialist_ask_again(self):
        self.invite(self.specjalist, self.patient)
        self.sign_in(self.patient.user)

        self.client.post(reverse('core:specialist-invitation-reject'))

        self.patient.refresh_from_db()
        self.assertIsNone(self.patient.specjalist_pending_id)
        self.assertIsNone(self.patient.specjalist_id)

        self.sign_in(self.specjalist.user)
        self.assertEqual(
            self.client.post(
                reverse('core:specialist-patients'),
                {'patient_email': self.patient.user.email}, format='json',
            ).status_code, 201,
        )

    def test_nothing_to_answer_is_a_404_rather_than_a_silent_success(self):
        self.sign_in(self.patient.user)

        self.assertEqual(
            self.client.post(reverse('core:specialist-invitation-accept')).status_code, 404)
        self.assertEqual(
            self.client.post(reverse('core:specialist-invitation-reject')).status_code, 404)

    def test_the_patient_cannot_end_an_accepted_link(self):
        """The client's rule: dropping a link is the specialist's action. With
        eating disorders the tendency to hide information rises, so a
        patient-side switch would disable the reports exactly in the cases they
        exist for."""
        self.assign(self.specjalist, self.patient)
        self.sign_in(self.patient.user)

        response = self.client.post(reverse('core:specialist-invitation-reject'))

        self.assertEqual(response.status_code, 404)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.specjalist_id, self.specjalist.pk)

    def test_a_specialist_cannot_answer_on_the_patient_s_behalf(self):
        self.invite(self.specjalist, self.patient)
        self.sign_in(self.specjalist.user)

        response = self.client.post(reverse('core:specialist-invitation-accept'))

        # No `patient` row, so the endpoint refuses them outright.
        self.assertEqual(response.status_code, 403)
        self.patient.refresh_from_db()
        self.assertIsNone(self.patient.specjalist_id)


class ReportAccessTests(SpecialistTestCase):
    """What an accepted link actually opens, and what it does not."""

    def setUp(self):
        super().setUp()
        self.specjalist = self.make_specialist()
        self.patient = self.make_patient()
        self.diary = self.entry(self.patient)
        self.assign(self.specjalist, self.patient)
        self.report_id = week_report_id(self.week)
        self.sign_in(self.specjalist.user)

    def test_the_list_is_the_same_document_the_patient_sees(self):
        specialist_view = self.client.get(reverse(
            'core:specialist-patient-reports', args=[self.patient.user_id]))

        self.sign_in(self.patient.user)
        own_view = self.client.get(reverse('core:report-list'))

        self.assertEqual(specialist_view.status_code, 200)
        self.assertEqual(specialist_view.data, own_view.data)

    def test_one_report_by_its_week(self):
        response = self.client.get(reverse(
            'core:specialist-patient-report', args=[self.patient.user_id, self.report_id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], self.report_id)

    def test_a_week_with_no_entries_is_a_404(self):
        response = self.client.get(reverse(
            'core:specialist-patient-report',
            args=[self.patient.user_id, 'week-2000-01-03'],
        ))

        self.assertEqual(response.status_code, 404)

    def test_another_specialist_s_patient_answers_like_a_stranger(self):
        """404, not 403: a 403 would confirm the account exists and is a
        patient — the thing the invitation form takes care not to answer."""
        colleague = self.make_specialist(email='kolega@example.com')
        theirs = self.make_patient(email='ich@example.com')
        self.entry(theirs)
        self.assign(colleague, theirs)

        for name in (
            'core:specialist-patient-reports',
        ):
            with self.subTest(url=name):
                self.assertEqual(
                    self.client.get(reverse(name, args=[theirs.user_id])).status_code, 404)

        self.assertEqual(
            self.client.get(reverse(
                'core:specialist-patient-report', args=[theirs.user_id, self.report_id],
            )).status_code, 404,
        )

    def test_a_patient_who_only_has_a_pending_invitation_is_not_readable(self):
        asked = self.make_patient(email='pytany@example.com')
        self.entry(asked)
        self.invite(self.specjalist, asked)

        self.assertEqual(
            self.client.get(reverse(
                'core:specialist-patient-reports', args=[asked.user_id],
            )).status_code, 404,
        )

    def test_the_pdf_carries_the_patient_s_address_not_the_reader_s(self):
        """A printout that leaves the app has to say whose week it is."""
        response = self.client.get(reverse(
            'core:specialist-patient-report-pdf',
            args=[self.patient.user_id, self.report_id],
        ), HTTP_ACCEPT='application/pdf')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment;', response['Content-Disposition'])
        self.assertEqual(response['Cache-Control'], 'no-store')

        # The bytes are compared against the patient's own copy, which is
        # rendered with the same address — the fonts are subset, so searching the
        # document for a string proves nothing (see test_report_pdf.py).
        self.sign_in(self.patient.user)
        own = self.client.get(
            reverse('core:report-pdf', args=[self.report_id]),
            HTTP_ACCEPT='application/pdf',
        )
        self.assertEqual(len(response.content), len(own.content))

    def test_a_refusal_is_json_even_when_a_pdf_was_asked_for(self):
        response = self.client.get(reverse(
            'core:specialist-patient-report-pdf',
            args=[self.patient.user_id, 'week-2000-01-03'],
        ), HTTP_ACCEPT='application/pdf')

        self.assertEqual(response.status_code, 404)
        self.assertIn('application/json', response['Content-Type'])

    def test_no_write_verb_exists_on_a_patient_s_reports(self):
        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    reverse('core:specialist-patient-reports', args=[self.patient.user_id]),
                    {}, format='json',
                )
                self.assertEqual(response.status_code, 405)


class PanelRefusalTests(SpecialistTestCase):
    """Everybody who is not a specialist, on every panel URL."""

    def setUp(self):
        super().setUp()
        self.patient = self.make_patient()
        self.guardian = self.make_user('rodzic@example.com', role='rodzic')

    def panel_urls(self):
        return [
            ('get', reverse('core:specialist-patients')),
            ('post', reverse('core:specialist-patients')),
            ('delete', reverse('core:specialist-patient', args=[self.patient.user_id])),
            ('get', reverse(
                'core:specialist-patient-reports', args=[self.patient.user_id])),
            ('get', reverse(
                'core:specialist-patient-report',
                args=[self.patient.user_id, week_report_id(self.week)])),
            ('get', reverse('core:specialist-parent-invitations')),
            ('post', reverse('core:specialist-parent-invitations')),
            ('get', reverse('core:specialist-techniques')),
            ('post', reverse('core:specialist-techniques')),
        ]

    def test_a_patient_is_refused_on_every_panel_url(self):
        self.sign_in(self.patient.user)

        for method, url in self.panel_urls():
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 403)

    def test_a_guardian_is_refused_on_every_panel_url(self):
        self.sign_in(self.guardian)

        for method, url in self.panel_urls():
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 403)

    def test_a_visitor_is_refused_on_every_panel_url(self):
        for method, url in self.panel_urls():
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 403)

    def test_a_role_of_specjalista_with_no_row_behind_it_grants_nothing(self):
        """What authorizes is the `specjalist` row, not the role name — the role
        is a nullable text column looked up by name from seeded data."""
        pretender = self.make_user('udaje@example.com', role='specjalista')
        self.sign_in(pretender)

        response = self.client.get(reverse('core:specialist-patients'))

        self.assertEqual(response.status_code, 403)


class CaseloadPayloadTests(SpecialistTestCase):
    """Engagement, never content — the same line the parent panel draws."""

    NEVER_IN_THE_LIST = (
        'avg_mood', 'current_mood', 'mood', 'emotions', 'stress_level',
        'energy_level', 'tension_level', 'risky_behavior_note', 'notes',
        'situation', 'thought', 'id_medical', 'summary',
    )

    def setUp(self):
        super().setUp()
        self.specjalist = self.make_specialist()
        self.patient = self.make_patient(is_child=True)
        self.entry(
            self.patient, current_strongest_emotion='Lęk', stress_level=9,
            risky_behavior_note='opis',
        )
        self.assign(self.specjalist, self.patient)
        self.sign_in(self.specjalist.user)

    def test_the_row_carries_exactly_the_documented_fields(self):
        response = self.client.get(reverse('core:specialist-patients'))

        row = response.data['patients'][0]
        self.assertEqual(set(row) - {'id'}, set(PATIENT_SUMMARY_FIELDS))

    def test_nothing_clinical_reaches_the_list(self):
        """The failure mode is somebody adding `avg_mood` here and it looking
        like an improvement — the content belongs in the report, which is a
        document you open deliberately."""
        response = self.client.get(reverse('core:specialist-patients'))
        body = str(response.data)

        for field in self.NEVER_IN_THE_LIST:
            with self.subTest(field=field):
                self.assertNotIn(field, body)

    def test_the_figures_are_the_ones_the_patient_s_own_screens_show(self):
        """A specialist and a patient must not be told different things about
        one diary — the same functions answer both.

        An adult patient, because the minor in the rest of this class has no
        guardian and is therefore behind the art. 8 gate: their own /profile
        would answer 403 and there would be nothing to compare against."""
        adult = self.make_patient(email='dorosly@example.com', is_child=False)
        self.entry(adult)
        self.entry(adult, day=self.today)
        self.assign(self.specjalist, adult)

        specialist_view = self.client.get(reverse('core:specialist-patients'))
        row = next(
            entry for entry in specialist_view.data['patients']
            if entry['email'] == adult.user.email
        )

        self.sign_in(adult.user)
        own = self.client.get(reverse('core:account-profile'))

        self.assertEqual(row['activity']['entry_count'], own.data['activity']['entry_count'])
        self.assertEqual(row['activity']['streak_days'], own.data['activity']['streak_days'])

    def test_the_minor_flag_is_reported_because_it_changes_what_comes_next(self):
        response = self.client.get(reverse('core:specialist-patients'))

        self.assertTrue(response.data['patients'][0]['is_child'])


class ThrottleScopeTests(SpecialistTestCase):
    """The cap bounds naming an address, not reading your own lists.

    `SpecialistInviteThrottle` is 60/hour, and the panel reads the caseload on
    every screen it has — the home screen, the guardian-code form and each
    patient's report header. Counting those would lock a specialist out of their
    own list by the middle of a working day, in exchange for bounding a request
    that reveals nothing.
    """

    def setUp(self):
        super().setUp()
        self.specjalist = self.make_specialist()
        self.sign_in(self.specjalist.user)

    def test_reading_the_caseload_is_not_capped(self):
        for _ in range(70):
            response = self.client.get(reverse('core:specialist-patients'))
            self.assertEqual(response.status_code, 200)

    def test_listing_issued_invitations_is_not_capped(self):
        for _ in range(70):
            response = self.client.get(reverse('core:specialist-parent-invitations'))
            self.assertEqual(response.status_code, 200)

    def test_inviting_is_capped(self):
        seen_429 = False
        for index in range(70):
            response = self.client.post(
                reverse('core:specialist-patients'),
                {'patient_email': f'nikt{index}@example.com'}, format='json',
            )
            if response.status_code == 429:
                seen_429 = True
                break

        self.assertTrue(seen_429, 'zaproszenia nie są w ogóle limitowane')
