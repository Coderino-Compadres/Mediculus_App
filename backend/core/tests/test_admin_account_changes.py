"""Correcting a specialist's account and deleting any account from the
administrator's panel —
`admin_panel.edit_account` / `delete_account`, PATCH/DELETE on
/api/admin/accounts/<id>/.

Deletion is the one place the panel writes to medical_db, so most of what is
pinned here is about what goes and what must stay: a patient takes every row
under their `id_medical`, and nobody else's rows move.
"""

import datetime

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core import account_deletion, admin_panel
from core.models import (AdminAuditLog, Diary, DietMeal, HealthProfile,
                         Hydration, MoodScale, ParentChild, Patient,
                         Specjalist, SpecjalistPatient, Supplement,
                         SupplementHour, Technique, User)
from core.modules import MODULE_DIET, MODULE_PSYCHOTHERAPY
from core.serializers import EMAIL_TAKEN
from core.tests.test_admin_panel import AdminTestCase
from core.views import NOT_EDITABLE_REFUSAL, OWN_ACCOUNT_REFUSAL


def years_ago(years):
    today = timezone.localdate()
    return today.replace(year=today.year - years)


class AccountChangesTestCase(AdminTestCase):

    def setUp(self):
        super().setUp()
        self.sign_in(self.admin)

    def url(self, user):
        return reverse('core:admin-account', args=[user.pk])

    def patch(self, user, body):
        return self.client.patch(self.url(user), body, format='json')


class EditTests(AccountChangesTestCase):
    """Only a specialist's account is edited from the panel."""

    def setUp(self):
        super().setUp()
        self.specialist = self.make_specialist()

    def test_it_corrects_the_name_and_answers_with_the_account(self):
        response = self.patch(self.specialist.user, {'name': '  Anka ', 'surname': 'Nowak'})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['name'], 'Anka')
        user = User.objects.get(pk=self.specialist.user_id)
        self.assertEqual((user.name, user.surname), ('Anka', 'Nowak'))

    def test_it_changes_only_what_was_sent(self):
        self.patch(self.specialist.user, {'surname': 'Nowak'})

        self.assertEqual(User.objects.get(pk=self.specialist.user_id).name, 'Anna')

    def test_a_blank_name_is_refused(self):
        response = self.patch(self.specialist.user, {'name': '   '})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['name'], ['Podaj imię.'])

    def test_it_changes_the_address_lowercased(self):
        response = self.patch(self.specialist.user, {'email': 'Nowy.Adres@Example.com'})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            User.objects.get(pk=self.specialist.user_id).email, 'nowy.adres@example.com')

    def test_an_address_somebody_else_has_is_refused(self):
        self.make_patient('zajety@example.com')

        response = self.patch(self.specialist.user, {'email': 'ZAJETY@example.com'})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['email'], [EMAIL_TAKEN])

    def test_keeping_its_own_address_is_not_a_conflict(self):
        response = self.patch(self.specialist.user, {'email': 'Terapeutka@example.com'})

        self.assertEqual(response.status_code, 200, response.data)

    def test_a_new_address_signs_the_account_out(self):
        """The address is the login: a session opened under the old one should
        not outlive the correction."""
        own = APIClient()
        self.sign_in(self.specialist.user, own)

        self.patch(self.specialist.user, {'email': 'nowy@example.com'})

        self.assertEqual(own.get(reverse('core:me')).status_code, 403)

    def test_a_name_change_leaves_the_sessions_alone(self):
        own = APIClient()
        self.sign_in(self.specialist.user, own)

        self.patch(self.specialist.user, {'name': 'Anka'})

        self.assertEqual(own.get(reverse('core:me')).status_code, 200)

    def test_a_specialist_stays_an_adult(self):
        response = self.patch(self.specialist.user, {'date_of_birth': years_ago(15).isoformat()})

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_a_future_date_is_refused(self):
        tomorrow = timezone.localdate() + datetime.timedelta(days=1)

        response = self.patch(self.specialist.user, {'date_of_birth': tomorrow.isoformat()})

        self.assertEqual(response.status_code, 400)

    def test_it_corrects_a_specialists_details(self):
        response = self.patch(self.specialist.user, {
            'specialization': 'Psychodietetyka',
            'university': 'Uniwersytet Rzeszowski',
            'field_of_study': 'Dietetyka',
            'diploma_number': ' 77/2019 ',
            'module': MODULE_DIET,
        })

        self.assertEqual(response.status_code, 200, response.data)
        row = Specjalist.objects.get(pk=self.specialist.pk)
        self.assertEqual(row.specjalization, 'Psychodietetyka')
        self.assertEqual(row.diploma_number, '77/2019')
        self.assertEqual(row.module, MODULE_DIET)
        self.assertEqual(response.data['specialist']['diploma_number'], '77/2019')

    def test_a_blank_diploma_number_is_refused(self):
        response = self.patch(self.specialist.user, {'diploma_number': ''})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['diploma_number'], ['Podaj numer dyplomu.'])

    def test_no_other_kind_of_account_is_edited(self):
        """A patient's, a guardian's or an administrator's data is theirs to
        change, not the panel's."""
        patient = self.make_patient()
        guardian = self.make_user('rodzic@example.com', role='rodzic', name='Maria')
        other_admin = self.make_admin('drugi.admin@example.com', name='Drugi')

        for target in (patient.user, guardian, other_admin, self.admin):
            with self.subTest(target=target.email):
                before = User.objects.get(pk=target.pk).name

                response = self.patch(target, {'name': 'Zmieniony'})

                self.assertEqual(response.status_code, 403)
                self.assertEqual(str(response.data['detail']), NOT_EDITABLE_REFUSAL)
                self.assertEqual(User.objects.get(pk=target.pk).name, before)
        self.assertFalse(AdminAuditLog.objects.filter(
            action=admin_panel.ACTION_EDIT_ACCOUNT).exists())

    def test_an_unknown_account_is_a_404(self):
        response = self.client.patch(
            reverse('core:admin-account', args=['00000000-0000-0000-0000-000000000000']),
            {'name': 'X'}, format='json',
        )

        self.assertEqual(response.status_code, 404)

    def test_an_edit_is_recorded(self):
        self.patch(self.specialist.user, {'name': 'Anka'})

        entry = AdminAuditLog.objects.get(action=admin_panel.ACTION_EDIT_ACCOUNT)
        self.assertEqual(entry.admin_id, self.admin.pk)
        self.assertEqual(entry.target_id, self.specialist.user_id)

    def test_nobody_but_an_administrator_may_edit(self):
        colleague = self.make_specialist('kolega@example.com')
        self.sign_in(colleague.user)

        response = self.patch(self.specialist.user, {'name': 'Anka'})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.get(pk=self.specialist.user_id).name, 'Anna')


class DeleteTests(AccountChangesTestCase):

    def delete(self, user):
        return self.client.delete(self.url(user))

    def fill_records(self, patient):
        diary = Diary.objects.create(id_medical=patient.id_medical, current_mood='dobre')
        MoodScale.objects.create(diary=diary)
        DietMeal.objects.create(id_medical=patient.id_medical, entry_date=timezone.localdate())
        Hydration.objects.create(id_medical=patient.id_medical, entry_date=timezone.localdate())
        supplement = Supplement.objects.create(id_medical=patient.id_medical, name='Wit. D')
        SupplementHour.objects.create(supplement=supplement, hour=datetime.time(8, 0))
        HealthProfile.objects.create(id_medical=patient.id_medical)

    def test_a_patient_takes_every_medical_record_with_them(self):
        patient = self.make_patient()
        self.fill_records(patient)
        id_medical = patient.id_medical

        response = self.delete(patient.user)

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=patient.user_id).exists())
        self.assertFalse(Patient.objects.filter(pk=patient.pk).exists())
        # Every table that files rows under id_medical, found the way the
        # deletion finds them — a table added later is covered too.
        for model in account_deletion.medical_models():
            with self.subTest(table=model._meta.db_table):
                self.assertFalse(model.objects.filter(id_medical=id_medical).exists())
        # And the rows hanging off them, which carry no id_medical of their own.
        self.assertEqual(MoodScale.objects.count(), 0)
        self.assertEqual(SupplementHour.objects.count(), 0)

    def test_nobody_elses_records_move(self):
        doomed = self.make_patient()
        kept = self.make_patient('zostaje@example.com')
        self.fill_records(doomed)
        self.fill_records(kept)

        self.delete(doomed.user)

        self.assertEqual(Diary.objects.filter(id_medical=kept.id_medical).count(), 1)
        self.assertEqual(DietMeal.objects.filter(id_medical=kept.id_medical).count(), 1)
        self.assertEqual(MoodScale.objects.count(), 1)

    def test_a_patient_leaves_their_care_and_guardian_links(self):
        child = self.make_patient('dziecko@example.com', is_child=True)
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        specialist = self.make_specialist()
        ParentChild.objects.create(parent=guardian, child=child.user, accepted_at=timezone.now())
        SpecjalistPatient.objects.create(
            specjalist=specialist, patient=child, module=MODULE_PSYCHOTHERAPY,
            accepted_at=timezone.now(),
        )

        self.delete(child.user)

        self.assertFalse(ParentChild.objects.exists())
        self.assertFalse(SpecjalistPatient.objects.exists())
        # The people on the other end keep their accounts.
        self.assertTrue(User.objects.filter(pk=guardian.pk).exists())
        self.assertTrue(Specjalist.objects.filter(pk=specialist.pk).exists())

    def test_a_specialist_leaves_their_patients_records_alone(self):
        specialist = self.make_specialist()
        patient = self.make_patient()
        self.fill_records(patient)
        SpecjalistPatient.objects.create(
            specjalist=specialist, patient=patient, module=MODULE_PSYCHOTHERAPY,
            accepted_at=timezone.now(),
        )

        response = self.delete(specialist.user)

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Specjalist.objects.filter(pk=specialist.pk).exists())
        self.assertFalse(SpecjalistPatient.objects.exists())
        self.assertTrue(Patient.objects.filter(pk=patient.pk).exists())
        self.assertEqual(Diary.objects.filter(id_medical=patient.id_medical).count(), 1)

    def test_a_specialists_techniques_stay_published_without_an_author(self):
        """Patients may be in the middle of one."""
        specialist = self.make_specialist()
        technique = Technique.objects.create(
            name='Oddech', type='DBT', author_id_specjalist=specialist.user_id,
        )

        self.delete(specialist.user)

        technique.refresh_from_db()
        self.assertIsNone(technique.author_id_specjalist)

    def test_a_specialist_who_vouched_for_a_colleague_leaves_the_colleague(self):
        creator = self.make_specialist()
        vouched = self.make_specialist('kolega@example.com', created_by=creator.user)

        self.delete(creator.user)

        vouched.refresh_from_db()
        self.assertIsNone(vouched.created_by_id)

    def test_deleting_a_guardian_locks_the_child_again(self):
        """RODO art. 8: the child's account opens only on an accepted guardian."""
        child = self.make_patient('dziecko@example.com', is_child=True)
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        ParentChild.objects.create(parent=guardian, child=child.user, accepted_at=timezone.now())

        response = self.delete(guardian)

        self.assertEqual(response.status_code, 204)
        self.assertTrue(User.objects.filter(pk=child.user_id).exists())
        own = APIClient()
        self.sign_in(child.user, own)
        self.assertEqual(own.get(reverse('core:me')).data['guardian_status'], 'none')

    def test_the_account_is_signed_out(self):
        patient = self.make_patient()
        own = APIClient()
        self.sign_in(patient.user, own)

        self.delete(patient.user)

        self.assertEqual(own.get(reverse('core:me')).status_code, 403)

    def test_the_deletion_is_recorded_with_whose_account_it_was(self):
        patient = self.make_patient()

        self.delete(patient.user)

        entry = AdminAuditLog.objects.get(action=admin_panel.ACTION_DELETE_ACCOUNT)
        self.assertEqual(entry.target_id, patient.user_id)
        self.assertIn('pacjent@example.com', entry.target_label)

    def test_another_administrators_account_can_be_deleted(self):
        other = self.make_admin('drugi.admin@example.com')
        own = APIClient()
        self.sign_in(other, own)

        response = self.delete(other)

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=other.pk).exists())
        self.assertFalse(admin_panel.is_admin(other))
        self.assertEqual(own.get(reverse('core:me')).status_code, 403)

    def test_an_administrator_cannot_delete_their_own_account(self):
        """It would end the session making the request, and the last
        administrator would leave nobody to open the panel."""
        response = self.delete(self.admin)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(str(response.data['detail']), OWN_ACCOUNT_REFUSAL)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())
        self.assertTrue(admin_panel.is_admin(self.admin))

    def test_a_deleted_administrators_audit_entries_stay(self):
        other = self.make_admin('drugi.admin@example.com')
        admin_panel.record(other, admin_panel.ACTION_VIEW_OVERVIEW)

        self.delete(other)

        entry = AdminAuditLog.objects.get(action=admin_panel.ACTION_VIEW_OVERVIEW)
        self.assertIsNone(entry.admin_id)
        self.assertEqual(entry.admin_email, 'drugi.admin@example.com')

    def test_a_second_delete_is_a_404(self):
        patient = self.make_patient()
        self.delete(patient.user)

        self.assertEqual(self.delete(patient.user).status_code, 404)

    def test_nobody_but_an_administrator_may_delete(self):
        patient = self.make_patient()
        specialist = self.make_specialist()
        self.sign_in(specialist.user)

        response = self.delete(patient.user)

        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=patient.user_id).exists())
