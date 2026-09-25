"""Two modules, two relationships: what migration 0022 made expressible.

`patient.id_specjalist` was a single foreign key, so a patient had one
specialist. The app has two modules, the client's visibility rule speaks of
"the specialists treating the patient" in the plural, and §13 of the diet
mockups draws two cards told apart by a coloured dot. Worse than missing, the
old shape was **lossy**: accepting a psychodietitian's invitation wrote over the
column and the psychotherapist lost their patient's reports without either of
them being asked. `test_the_second_specialist_does_not_displace_the_first` is
that bug, pinned.

The other half of this file is the wall. A module is not a label: a
psychodietitian reads diet reports and gets the same 404 as a stranger on the
psychotherapy ones, which carry moods, risky-behaviour notes and the safety plan
— data the patient agreed to share with somebody else, in a different room.

Touches both databases: the relationships and identities are user_db, the meals
and diary entries the reports are built from are medical_db.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import (Diary, DietMeal, Patient, Specjalist,
                         SpecjalistPatient, User, UserRole)
from core.modules import MODULE_DIET, MODULE_PSYCHOTHERAPY
from core.reports import DAYS_IN_WEEK, start_of_week, week_report_id

PASSWORD = 'TajneHaslo123'


class ModuleTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.week = start_of_week(self.today) - datetime.timedelta(days=DAYS_IN_WEEK)
        self.therapist = self.make_specialist('terapeutka@example.com', 'DBT')
        self.dietitian = self.make_specialist('dietetyczka@example.com', 'Dietetyka')
        self.patient = self.make_patient()

    def make_user(self, email, role='patient', **fields):
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0],
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_patient(self, email='pacjent@example.com', is_child=False):
        return Patient.objects.create(
            user=self.make_user(email), is_child=is_child,
        )

    def make_specialist(self, email, specjalization):
        return Specjalist.objects.create(
            approved_at=timezone.now(),
            user=self.make_user(email, role='specjalista'),
            specjalization=specjalization,
        )

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def treat(self, specjalist, module, patient=None, accepted=True):
        return SpecjalistPatient.objects.create(
            specjalist=specjalist, patient=patient or self.patient, module=module,
            accepted_at=timezone.now() if accepted else None,
        )

    def diary_entry(self, patient=None, day=None):
        """One psychotherapy entry inside a week that has ended."""
        patient = patient or self.patient
        diary = Diary.objects.create(
            id_medical=patient.id_medical, current_mood='dobre',
        )
        noon = timezone.make_aware(
            datetime.datetime.combine(day or self.week, datetime.time(12, 0)))
        Diary.objects.filter(pk=diary.pk).update(created_at=noon)
        return diary

    def meals(self, patient=None, days=14):
        """A fortnight of meals, so at least one diet week has ended.

        A diet week runs seven days from the patient's *first* entry rather than
        from a Monday (`core/diet_reports.py`), which is why this seeds a span
        rather than one day: a single meal yields no completed week and
        therefore no report at all.
        """
        patient = patient or self.patient
        for offset in range(days):
            DietMeal.objects.create(
                id_medical=patient.id_medical,
                entry_date=self.today - datetime.timedelta(days=offset),
                kind='Obiad', description='Zupa.',
            )

    def caseload(self):
        response = self.client.get(reverse('core:specialist-patients'))
        self.assertEqual(response.status_code, 200)
        return response.data


class TwoSpecialistsTests(ModuleTestCase):
    """One patient, a psychotherapist and a psychodietitian at the same time."""

    def test_the_second_specialist_does_not_displace_the_first(self):
        """THE BUG THE TABLE EXISTS FOR, end to end through the API.

        With one `id_specjalist` column, the patient accepting the dietitian
        overwrote the therapist's link and nobody was told. Here the two are
        separate rows and both survive.
        """
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        invitation = self.treat(self.dietitian, MODULE_DIET, accepted=False)
        self.diary_entry()

        self.sign_in(self.patient.user)
        accepted = self.client.post(
            reverse('core:specialist-invitation-accept', args=[invitation.pk]))
        self.assertEqual(accepted.status_code, 200)

        # The therapist still reads their own module's reports.
        self.sign_in(self.therapist.user)
        response = self.client.get(reverse(
            'core:specialist-patient-reports', args=[self.patient.user_id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_accepting_replaces_only_within_one_module(self):
        """"Kto mnie prowadzi" has one answer per module — and exactly one.

        A second psychotherapist taking over drops the first one's link, which
        is what the old single FK did by accident and the one part of it worth
        keeping. The diet relationship is untouched.
        """
        old_therapist = self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        diet = self.treat(self.dietitian, MODULE_DIET)
        newcomer = self.make_specialist('nowy@example.com', 'CBT')
        invitation = self.treat(newcomer, MODULE_PSYCHOTHERAPY, accepted=False)

        self.sign_in(self.patient.user)
        self.client.post(
            reverse('core:specialist-invitation-accept', args=[invitation.pk]))

        self.assertFalse(
            SpecjalistPatient.objects.filter(pk=old_therapist.pk).exists())
        self.assertTrue(SpecjalistPatient.objects.filter(pk=diet.pk).exists())
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.accepted_at)

    def test_a_patient_can_hold_one_invitation_per_module_at_once(self):
        """Two cards on one screen, each naming its own module — the payload
        that used to be a single row."""
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY, accepted=False)
        self.treat(self.dietitian, MODULE_DIET, accepted=False)
        self.sign_in(self.patient.user)

        response = self.client.get(reverse('core:specialist-invitation'))

        modules = sorted(row['module'] for row in response.data['invitations'])
        self.assertEqual(modules, [MODULE_DIET, MODULE_PSYCHOTHERAPY])
        labels = {row['module']: row['module_label'] for row in response.data['invitations']}
        self.assertEqual(labels[MODULE_DIET], 'Dietetyka i psychodietetyka')

    def test_dropping_one_relationship_leaves_the_other(self):
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.treat(self.dietitian, MODULE_DIET)

        self.sign_in(self.dietitian.user)
        response = self.client.delete(reverse(
            'core:specialist-patient', args=[self.patient.user_id, MODULE_DIET]))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(SpecjalistPatient.objects.filter(
            specjalist=self.dietitian, patient=self.patient).exists())
        self.assertTrue(SpecjalistPatient.objects.filter(
            specjalist=self.therapist, patient=self.patient).exists())

    def test_a_specialist_cannot_drop_a_relationship_in_a_module_that_is_not_theirs(self):
        """404, exactly like a stranger's patient: the therapist's link is not
        the dietitian's to end, however genuinely they treat this patient."""
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.treat(self.dietitian, MODULE_DIET)

        self.sign_in(self.dietitian.user)
        response = self.client.delete(reverse(
            'core:specialist-patient',
            args=[self.patient.user_id, MODULE_PSYCHOTHERAPY],
        ))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(SpecjalistPatient.objects.filter(
            specjalist=self.therapist, patient=self.patient).exists())


class ModuleWallTests(ModuleTestCase):
    """A module decides which reports a specialist may open. Both directions."""

    def setUp(self):
        super().setUp()
        self.diary_entry()
        self.meals()
        self.report_id = week_report_id(self.week)

    def diet_report_id(self):
        self.sign_in(self.patient.user)
        response = self.client.get(reverse('core:diet-report-list'))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data, 'the fixture should yield a diet report')
        return response.data[0]['id']

    def test_a_dietitian_cannot_open_the_psychotherapy_reports(self):
        report_id = self.report_id
        self.treat(self.dietitian, MODULE_DIET)
        self.sign_in(self.dietitian.user)

        for url in (
            reverse('core:specialist-patient-reports', args=[self.patient.user_id]),
            reverse('core:specialist-patient-report',
                    args=[self.patient.user_id, report_id]),
            reverse('core:specialist-patient-report-pdf',
                    args=[self.patient.user_id, report_id]),
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_a_psychotherapist_cannot_open_the_diet_reports(self):
        diet_report_id = self.diet_report_id()
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.sign_in(self.therapist.user)

        for url in (
            reverse('core:specialist-patient-diet-reports', args=[self.patient.user_id]),
            reverse('core:specialist-patient-diet-report',
                    args=[self.patient.user_id, diet_report_id]),
            reverse('core:specialist-patient-diet-report-pdf',
                    args=[self.patient.user_id, diet_report_id]),
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_a_dietitian_reads_the_diet_reports_of_their_own_patient(self):
        diet_report_id = self.diet_report_id()
        self.treat(self.dietitian, MODULE_DIET)
        self.sign_in(self.dietitian.user)

        listed = self.client.get(reverse(
            'core:specialist-patient-diet-reports', args=[self.patient.user_id]))
        detail = self.client.get(reverse(
            'core:specialist-patient-diet-report',
            args=[self.patient.user_id, diet_report_id]))

        self.assertEqual(listed.status_code, 200)
        self.assertTrue(listed.data)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['id'], diet_report_id)

    def test_it_is_the_same_document_the_patient_sees(self):
        """Two people in a consulting room cannot hold different papers — the
        same rule the psychotherapy report follows, and the reason the
        aggregation lives on the server."""
        diet_report_id = self.diet_report_id()
        own = self.client.get(reverse(
            'core:diet-report-detail', args=[diet_report_id])).data

        self.treat(self.dietitian, MODULE_DIET)
        self.sign_in(self.dietitian.user)
        theirs = self.client.get(reverse(
            'core:specialist-patient-diet-report',
            args=[self.patient.user_id, diet_report_id])).data

        self.assertEqual(own, theirs)

    def test_a_pending_dietitian_reads_nothing(self):
        """Being asked is not consenting, and a report is what the consent is
        about."""
        self.diet_report_id()
        self.treat(self.dietitian, MODULE_DIET, accepted=False)
        self.sign_in(self.dietitian.user)

        response = self.client.get(reverse(
            'core:specialist-patient-diet-reports', args=[self.patient.user_id]))

        self.assertEqual(response.status_code, 404)

    def test_a_locked_patient_is_refused_with_a_reason(self):
        """Withdrawal stops the processing for the second reader too — and the
        specialist is told why, because silence reads as "stopped writing"."""
        from core.consents import withdraw
        self.diet_report_id()
        self.treat(self.dietitian, MODULE_DIET)
        withdraw(self.patient.user, 'all')
        self.sign_in(self.dietitian.user)

        response = self.client.get(reverse(
            'core:specialist-patient-diet-reports', args=[self.patient.user_id]))

        self.assertEqual(response.status_code, 403)


class DietReportPdfTests(ModuleTestCase):
    """§10's report as a file, on both sides of the room."""

    def setUp(self):
        super().setUp()
        self.meals()
        self.sign_in(self.patient.user)
        self.report_id = self.client.get(reverse('core:diet-report-list')).data[0]['id']

    def assert_is_a_pdf(self, response):
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment;', response['Content-Disposition'])
        # Health data leaving the app as a file must not sit in a cache.
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertTrue(b''.join(response.streaming_content
                                 if response.streaming else [response.content])
                        .startswith(b'%PDF-'))

    def test_the_patient_can_download_their_own(self):
        response = self.client.get(reverse('core:diet-report-pdf', args=[self.report_id]))

        self.assert_is_a_pdf(response)

    def test_the_dietitian_can_download_the_same_week(self):
        self.treat(self.dietitian, MODULE_DIET)
        self.sign_in(self.dietitian.user)

        response = self.client.get(reverse(
            'core:specialist-patient-diet-report-pdf',
            args=[self.patient.user_id, self.report_id]))

        self.assert_is_a_pdf(response)

    def test_the_file_is_named_apart_from_the_psychotherapy_one(self):
        """A specialist downloading both for one patient must not end up with
        two files whose names collide."""
        response = self.client.get(reverse('core:diet-report-pdf', args=[self.report_id]))

        self.assertIn('raport-zywieniowy-', response['Content-Disposition'])

    def test_a_week_nobody_wrote_in_is_a_404_in_json(self):
        response = self.client.get(
            reverse('core:diet-report-pdf', args=['week-2019-01-07']))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response['Content-Type'], 'application/json')


class CaseloadTests(ModuleTestCase):
    """The panel's list: a row is a relationship, and it says which module."""

    def test_one_patient_treated_in_both_modules_is_two_rows(self):
        solo = self.make_specialist('oba@example.com', 'Psychoterapia i dietetyka')
        self.treat(solo, MODULE_PSYCHOTHERAPY)
        self.treat(solo, MODULE_DIET)
        self.sign_in(solo.user)

        rows = self.caseload()['patients']

        self.assertEqual(len(rows), 2)
        self.assertEqual(
            sorted(row['module'] for row in rows), [MODULE_DIET, MODULE_PSYCHOTHERAPY])
        self.assertEqual({row['id'] for row in rows}, {str(self.patient.user_id)})

    def test_the_figures_follow_the_module(self):
        """A psychodietitian reading "12 wpisów" about a diary they cannot open
        would be told something they have no way to act on. The counters are the
        ones belonging to the relationship."""
        self.diary_entry()
        self.diary_entry(day=self.today)
        self.meals(days=3)
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.treat(self.dietitian, MODULE_DIET)

        self.sign_in(self.therapist.user)
        psychotherapy = self.caseload()['patients'][0]['activity']
        self.sign_in(self.dietitian.user)
        diet = self.caseload()['patients'][0]['activity']

        self.assertEqual(psychotherapy['entry_count'], 2)
        self.assertEqual(diet['entry_count'], 3)

    def test_a_specialist_sees_nothing_of_a_module_they_do_not_treat_in(self):
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.sign_in(self.dietitian.user)

        self.assertEqual(self.caseload(), {'patients': [], 'pending': []})


class InviteByModuleTests(ModuleTestCase):
    """The form names a module, and every check is per module."""

    def invite(self, specjalist, module, email=None):
        self.sign_in(specjalist.user)
        return self.client.post(
            reverse('core:specialist-patients'),
            {'patient_email': email or self.patient.user.email, 'module': module},
            format='json',
        )

    def test_the_module_is_required_rather_than_defaulted(self):
        """A default would make the module a thing a specialist can fail to
        think about, and the one it would default to carries the
        risky-behaviour notes."""
        self.sign_in(self.therapist.user)

        response = self.client.post(
            reverse('core:specialist-patients'),
            {'patient_email': self.patient.user.email}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('module', response.data)

    def test_an_unknown_module_is_a_400_rather_than_a_row(self):
        response = self.invite(self.therapist, 'astrologia')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(SpecjalistPatient.objects.exists())

    def test_a_patient_with_a_therapist_is_invitable_by_a_dietitian(self):
        """The refusal that used to fire on any assigned patient, now scoped to
        the module — which is the whole point."""
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)

        response = self.invite(self.dietitian, MODULE_DIET)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(SpecjalistPatient.objects.filter(
            specjalist=self.dietitian, module=MODULE_DIET,
            accepted_at__isnull=True,
        ).exists())

    def test_a_patient_already_treated_in_that_module_is_refused(self):
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        newcomer = self.make_specialist('nowa@example.com', 'CBT')

        response = self.invite(newcomer, MODULE_PSYCHOTHERAPY)

        self.assertEqual(response.status_code, 400)

    def test_re_asking_in_the_same_module_is_idempotent(self):
        self.assertEqual(self.invite(self.dietitian, MODULE_DIET).status_code, 201)
        self.assertEqual(self.invite(self.dietitian, MODULE_DIET).status_code, 201)

        self.assertEqual(SpecjalistPatient.objects.count(), 1)


class DietProfileTests(ModuleTestCase):
    """§13's profile card: the patient's *psychodietitian*, not their therapist."""

    def test_each_profile_names_its_own_module_s_specialist(self):
        self.therapist.user.name, self.therapist.user.surname = 'Anna', 'Terapeutka'
        self.therapist.user.save(update_fields=['name', 'surname'])
        self.dietitian.user.name, self.dietitian.user.surname = 'Ewa', 'Dietetyczka'
        self.dietitian.user.save(update_fields=['name', 'surname'])
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.treat(self.dietitian, MODULE_DIET)
        self.sign_in(self.patient.user)

        psychotherapy = self.client.get(reverse('core:account-profile'))
        diet = self.client.get(reverse('core:diet-profile'))

        self.assertEqual(psychotherapy.data['care']['specialist'], 'Anna Terapeutka')
        self.assertEqual(diet.data['care']['specialist'], 'Ewa Dietetyczka')

    def test_a_patient_with_no_dietitian_gets_null_rather_than_the_therapist(self):
        """The failure this endpoint exists to prevent: one column meant both
        screens named the same person."""
        self.treat(self.therapist, MODULE_PSYCHOTHERAPY)
        self.sign_in(self.patient.user)

        response = self.client.get(reverse('core:diet-profile'))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['care'])

    def test_the_figures_are_the_food_diary_s(self):
        self.diary_entry()
        self.meals(days=2)
        self.sign_in(self.patient.user)

        response = self.client.get(reverse('core:diet-profile'))

        self.assertEqual(response.data['activity']['entry_count'], 2)

    def test_a_specialist_is_refused_like_every_clinical_endpoint(self):
        self.sign_in(self.dietitian.user)

        self.assertEqual(self.client.get(reverse('core:diet-profile')).status_code, 403)
