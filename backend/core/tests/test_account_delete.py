"""POST /api/account/delete/ — the owner closes their own account, for good.

The deletion itself is shared with the admin panel (core/account_deletion.py)
and its scope is pinned in test_admin_account_changes.py; what is pinned here is
the door: the password is checked on the server, the gates that stop an account
using the app do not stop it leaving, and an administrator cannot use it.
"""

import datetime

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core import account_deletion
from core.models import (Diary, DietMeal, MoodScale, ParentChild, Patient,
                         Specjalist, SpecjalistPatient, Supplement,
                         SupplementHour, Technique, User)
from core.modules import MODULE_PSYCHOTHERAPY
from core.tests.test_admin_panel import PASSWORD, AdminTestCase
from core.views import ADMIN_SELF_DELETE_REFUSAL


class AccountDeleteTestCase(AdminTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def delete_own(self, password=PASSWORD, client=None):
        return (client or self.client).post(
            reverse('core:account-delete'), {'password': password}, format='json',
        )

    def fill_records(self, patient):
        diary = Diary.objects.create(id_medical=patient.id_medical, current_mood='dobre')
        MoodScale.objects.create(diary=diary)
        DietMeal.objects.create(id_medical=patient.id_medical, entry_date=timezone.localdate())
        supplement = Supplement.objects.create(id_medical=patient.id_medical, name='Wit. D')
        SupplementHour.objects.create(supplement=supplement, hour=datetime.time(8, 0))


class PatientDeletesTests(AccountDeleteTestCase):
    def test_a_patient_takes_every_medical_record_with_them(self):
        patient = self.make_patient()
        self.fill_records(patient)
        self.sign_in(patient.user)

        response = self.delete_own()

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=patient.user_id).exists())
        self.assertFalse(Patient.objects.filter(pk=patient.pk).exists())
        for model in account_deletion.medical_models():
            with self.subTest(table=model._meta.db_table):
                self.assertFalse(
                    model.objects.filter(id_medical=patient.id_medical).exists())
        self.assertEqual(MoodScale.objects.count(), 0)
        self.assertEqual(SupplementHour.objects.count(), 0)

    def test_nobody_elses_records_move(self):
        doomed = self.make_patient()
        kept = self.make_patient('zostaje@example.com')
        self.fill_records(doomed)
        self.fill_records(kept)
        self.sign_in(doomed.user)

        self.delete_own()

        self.assertEqual(Diary.objects.filter(id_medical=kept.id_medical).count(), 1)
        self.assertTrue(User.objects.filter(pk=kept.user_id).exists())

    def test_the_session_is_gone_everywhere(self):
        patient = self.make_patient()
        other_device = APIClient()
        self.sign_in(patient.user)
        self.sign_in(patient.user, client=other_device)

        self.delete_own()

        self.assertEqual(self.client.get(reverse('core:me')).status_code, 403)
        self.assertEqual(other_device.get(reverse('core:me')).status_code, 403)
        self.assertFalse(Session.objects.exists())

    def test_care_and_guardian_links_go_with_the_account(self):
        child = self.make_patient('dziecko@example.com', is_child=True)
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        specialist = self.make_specialist()
        ParentChild.objects.create(parent=guardian, child=child.user, accepted_at=timezone.now())
        SpecjalistPatient.objects.create(
            specjalist=specialist, patient=child, module=MODULE_PSYCHOTHERAPY,
            accepted_at=timezone.now(),
        )
        self.sign_in(child.user)

        self.delete_own()

        self.assertFalse(ParentChild.objects.exists())
        self.assertFalse(SpecjalistPatient.objects.exists())
        self.assertTrue(User.objects.filter(pk=guardian.pk).exists())
        self.assertTrue(Specjalist.objects.filter(pk=specialist.pk).exists())


class PasswordTests(AccountDeleteTestCase):
    def test_a_wrong_password_deletes_nothing(self):
        patient = self.make_patient()
        self.fill_records(patient)
        self.sign_in(patient.user)

        response = self.delete_own(password='zle-haslo')

        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)
        self.assertTrue(User.objects.filter(pk=patient.user_id).exists())
        self.assertEqual(Diary.objects.filter(id_medical=patient.id_medical).count(), 1)

    def test_no_password_deletes_nothing(self):
        patient = self.make_patient()
        self.sign_in(patient.user)

        response = self.client.post(reverse('core:account-delete'), {}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(pk=patient.user_id).exists())

    def test_a_visitor_cannot_call_it(self):
        self.assertEqual(self.delete_own().status_code, 403)


class GateTests(AccountDeleteTestCase):
    """Erasure is a right of exactly the accounts the gates stop."""

    def test_an_account_that_withdrew_its_consents_can_still_leave(self):
        patient = self.make_patient()
        User.objects.filter(pk=patient.user_id).update(
            data_consent_withdrawn_at=timezone.now())
        self.sign_in(patient.user)

        self.assertEqual(self.delete_own().status_code, 204)
        self.assertFalse(User.objects.filter(pk=patient.user_id).exists())

    def test_a_minor_still_waiting_for_a_guardian_can_leave(self):
        child = self.make_patient('dziecko@example.com', is_child=True)
        self.sign_in(child.user)

        self.assertEqual(self.delete_own().status_code, 204)

    def test_an_account_that_must_change_its_password_can_leave(self):
        specialist = self.make_specialist()
        User.objects.filter(pk=specialist.user_id).update(must_change_password=True)
        self.sign_in(specialist.user)

        self.assertEqual(self.delete_own().status_code, 204)


class OtherKindsTests(AccountDeleteTestCase):
    def test_a_specialist_s_techniques_stay_published_without_an_author(self):
        specialist = self.make_specialist()
        technique = Technique.objects.create(
            slug='id-cos', name='Coś', author_id_specjalist=specialist.user_id,
            description_ready=True,
        )
        self.sign_in(specialist.user)

        self.assertEqual(self.delete_own().status_code, 204)

        technique.refresh_from_db()
        self.assertIsNone(technique.author_id_specjalist)

    def test_a_guardian_can_leave(self):
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        self.sign_in(guardian)

        self.assertEqual(self.delete_own().status_code, 204)
        self.assertFalse(User.objects.filter(pk=guardian.pk).exists())

    def test_an_administrator_cannot_delete_their_own_account_here(self):
        admin = self.make_admin('drugi.admin@example.com')
        self.sign_in(admin)

        response = self.delete_own()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['detail'], ADMIN_SELF_DELETE_REFUSAL)
        self.assertTrue(User.objects.filter(pk=admin.pk).exists())

    def test_the_session_key_is_what_the_login_wrote(self):
        """Guard for the helper above: sign_in must write the key the API reads."""
        patient = self.make_patient()
        self.sign_in(patient.user)
        self.assertIn(settings.SESSION_COOKIE_NAME, self.client.cookies)
