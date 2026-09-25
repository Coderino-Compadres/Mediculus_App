"""The administrator's panel — core/admin_panel.py.

Three things are under test, and each has its own class:

* who may open the panel (an `administrator` row, behind the usual gates);
* the specialist account's third gate — waiting for an administrator — and the
  two decisions that end the wait: approval opens the panel, rejection deletes
  the account;
* the read-only view of the data, which must carry identity and counts and
  never a single record's content, and the audit log that records every look.
"""

import datetime
import io
import json

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core import admin_panel
from core.authentication import SESSION_USER_KEY
from core.colleagues import SPECIALIST_ROLE, create_account
from core.models import (Administrator, AdminAuditLog, Diary, DietMeal,
                         ParentChild, Patient, Specjalist, SpecjalistPatient,
                         User, UserRole)
from core.modules import MODULE_DIET, MODULE_PSYCHOTHERAPY
from core.views import ADMIN_REFUSAL, SPECIALIST_PENDING_REFUSAL

PASSWORD = 'TajneHaslo123'

#: A diary note that must never reach the administrator — searched for in every
#: payload the panel returns about the patient who wrote it.
SECRET_NOTE = 'notatka-ktorej-administrator-nie-moze-zobaczyc'


class AdminTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.admin = self.make_admin()

    def make_user(self, email, role=None, **fields):
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_admin(self, email='admin@example.com', **fields):
        user = self.make_user(email, role=admin_panel.ADMIN_ROLE, **fields)
        Administrator.objects.create(user=user)
        return user

    def make_patient(self, email='pacjent@example.com', is_child=False):
        return Patient.objects.create(
            user=self.make_user(email, role='patient', name='Jan', surname='Pacjent'),
            is_child=is_child,
        )

    def make_specialist(self, email='terapeutka@example.com', approved=True, **fields):
        return Specjalist.objects.create(
            user=self.make_user(email, role=SPECIALIST_ROLE, name='Anna', surname='Terapeutka'),
            specjalization='DBT', module=MODULE_PSYCHOTHERAPY,
            approved_at=timezone.now() if approved else None, **fields,
        )

    def sign_in(self, user, client=None):
        client = client or self.client
        session = client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def admin_urls(self, some_id):
        return [
            ('get', reverse('core:admin-pending-specialists')),
            ('post', reverse('core:admin-specialist-approve', args=[some_id])),
            ('post', reverse('core:admin-specialist-reject', args=[some_id])),
            ('get', reverse('core:admin-overview')),
            ('get', reverse('core:admin-accounts')),
            ('get', reverse('core:admin-account', args=[some_id])),
            ('get', reverse('core:admin-audit-log')),
        ]


class AccessTests(AdminTestCase):
    """The row is what opens the panel — nothing else does."""

    def test_a_patient_a_specialist_and_a_guardian_are_refused_everything(self):
        pending = self.make_specialist('czeka@example.com', approved=False)
        accounts = [
            self.make_patient().user,
            self.make_specialist().user,
            self.make_user('rodzic@example.com', role='rodzic'),
        ]
        for account in accounts:
            self.sign_in(account)
            for method, url in self.admin_urls(pending.user_id):
                with self.subTest(account=account.email, url=url):
                    response = getattr(self.client, method)(url)
                    self.assertEqual(response.status_code, 403)
                    self.assertEqual(str(response.data['detail']), ADMIN_REFUSAL)
        # And nothing was decided on the way.
        self.assertIsNone(Specjalist.objects.get(pk=pending.pk).approved_at)

    def test_the_role_name_alone_opens_nothing(self):
        """`user_role` is for display — the `administrator` row authorizes."""
        impostor = self.make_user('udaje@example.com', role=admin_panel.ADMIN_ROLE)
        self.sign_in(impostor)

        response = self.client.get(reverse('core:admin-overview'))

        self.assertEqual(response.status_code, 403)

    def test_a_visitor_is_refused(self):
        response = self.client.get(reverse('core:admin-overview'))

        self.assertEqual(response.status_code, 403)

    def test_an_administrator_without_consents_meets_the_consent_gate(self):
        """Behind the default gates like everything else."""
        locked = self.make_admin('bez.zgod@example.com', data_consent_at=None)
        self.sign_in(locked)

        response = self.client.get(reverse('core:admin-overview'))

        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(str(response.data['detail']), ADMIN_REFUSAL)

    def test_me_says_which_panel_the_account_belongs_on(self):
        self.sign_in(self.admin)

        me = self.client.get(reverse('core:me')).data

        self.assertIs(me['is_admin'], True)
        self.assertIs(me['is_specialist'], False)
        self.assertIsNone(me['specialist_approved'])


class PendingSpecialistTests(AdminTestCase):
    """A specialist account an administrator has not confirmed yet."""

    def setUp(self):
        super().setUp()
        self.creator = self.make_specialist('tworzy@example.com')
        UserRole.objects.get_or_create(name=SPECIALIST_ROLE)
        self.pending, _ = create_account(
            email='nowa@example.com', name='Nowa', surname='Terapeutka',
            date_of_birth='1985-02-01', specialization='DBT',
            module=MODULE_PSYCHOTHERAPY, created_by=self.creator.user,
        )
        User.objects.filter(pk=self.pending.user_id).update(
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
            must_change_password=False,
        )

    def test_a_new_account_waits(self):
        self.assertIsNone(Specjalist.objects.get(pk=self.pending.pk).approved_at)

    def test_it_is_refused_the_whole_panel_with_its_own_reason(self):
        self.sign_in(self.pending.user)
        urls = [
            ('get', reverse('core:specialist-patients')),
            ('post', reverse('core:specialist-patients')),
            ('get', reverse('core:specialist-colleagues')),
            ('post', reverse('core:specialist-colleagues')),
            ('get', reverse('core:specialist-parent-invitations')),
            ('post', reverse('core:specialist-parent-invitations')),
            ('get', reverse('core:specialist-techniques')),
            ('post', reverse('core:specialist-techniques')),
        ]
        for method, url in urls:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(str(response.data['detail']), SPECIALIST_PENDING_REFUSAL)

    def test_me_says_it_is_waiting(self):
        self.sign_in(self.pending.user)

        me = self.client.get(reverse('core:me')).data

        self.assertIs(me['is_specialist'], True)
        self.assertIs(me['specialist_approved'], False)

    def test_the_colleague_roster_shows_it_as_waiting(self):
        self.sign_in(self.creator.user)

        roster = self.client.get(reverse('core:specialist-colleagues')).data
        by_email = {row['email']: row for row in roster}

        self.assertIs(by_email['nowa@example.com']['approved'], False)
        self.assertIs(by_email['tworzy@example.com']['approved'], True)

    def test_creating_from_the_panel_records_who_vouched(self):
        self.sign_in(self.creator.user)

        response = self.client.post(reverse('core:specialist-colleagues'), {
            'email': 'trzecia@example.com', 'name': 'Trzecia', 'surname': 'Osoba',
            'date_of_birth': '1980-05-05', 'specialization': 'Dietetyka',
            'module': MODULE_DIET,
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        created = Specjalist.objects.get(user__email='trzecia@example.com')
        self.assertEqual(created.created_by_id, self.creator.user_id)
        self.assertIsNone(created.approved_at)

    def test_the_administrator_sees_it_with_who_created_it(self):
        self.sign_in(self.admin)

        rows = self.client.get(reverse('core:admin-pending-specialists')).data

        self.assertEqual([row['email'] for row in rows], ['nowa@example.com'])
        self.assertEqual(rows[0]['created_by']['email'], 'tworzy@example.com')
        self.assertIs(rows[0]['consents_active'], True)
        self.assertIs(rows[0]['password_set'], True)

    def test_approving_opens_the_panel(self):
        self.sign_in(self.admin)

        response = self.client.post(
            reverse('core:admin-specialist-approve', args=[self.pending.user_id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        self.assertIsNotNone(Specjalist.objects.get(pk=self.pending.pk).approved_at)

        specialist = APIClient()
        self.sign_in(self.pending.user, specialist)
        self.assertEqual(
            specialist.get(reverse('core:specialist-patients')).status_code, 200)

    def test_approving_is_recorded(self):
        self.sign_in(self.admin)

        self.client.post(reverse('core:admin-specialist-approve', args=[self.pending.user_id]))

        entry = AdminAuditLog.objects.get(action=admin_panel.ACTION_APPROVE)
        self.assertEqual(entry.admin_id, self.admin.pk)
        self.assertEqual(entry.target_id, self.pending.user_id)
        self.assertIn('nowa@example.com', entry.target_label)

    def test_a_second_approval_is_a_404_not_a_second_decision(self):
        self.sign_in(self.admin)
        url = reverse('core:admin-specialist-approve', args=[self.pending.user_id])
        self.client.post(url)
        first = Specjalist.objects.get(pk=self.pending.pk).approved_at

        again = self.client.post(url)

        self.assertEqual(again.status_code, 404)
        self.assertEqual(Specjalist.objects.get(pk=self.pending.pk).approved_at, first)
        self.assertEqual(
            AdminAuditLog.objects.filter(action=admin_panel.ACTION_APPROVE).count(), 1)

    def test_rejecting_deletes_the_account_and_keeps_the_record(self):
        self.sign_in(self.admin)

        response = self.client.post(
            reverse('core:admin-specialist-reject', args=[self.pending.user_id]))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(email='nowa@example.com').exists())
        self.assertFalse(Specjalist.objects.filter(pk=self.pending.pk).exists())
        entry = AdminAuditLog.objects.get(action=admin_panel.ACTION_REJECT)
        self.assertIn('nowa@example.com', entry.target_label)
        # The colleague who created it is untouched.
        self.assertTrue(Specjalist.objects.filter(pk=self.creator.pk).exists())

    def test_rejecting_signs_the_account_out(self):
        specialist = APIClient()
        self.sign_in(self.pending.user, specialist)
        self.sign_in(self.admin)

        self.client.post(reverse('core:admin-specialist-reject', args=[self.pending.user_id]))

        self.assertEqual(specialist.get(reverse('core:me')).status_code, 403)

    def test_an_approved_specialist_cannot_be_rejected(self):
        """Their patients' care would go with them — not this panel's call."""
        self.sign_in(self.admin)

        response = self.client.post(
            reverse('core:admin-specialist-reject', args=[self.creator.user_id]))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(User.objects.filter(pk=self.creator.user_id).exists())

    def test_a_patient_cannot_be_rejected_through_it_either(self):
        patient = self.make_patient()
        self.sign_in(self.admin)

        response = self.client.post(
            reverse('core:admin-specialist-reject', args=[patient.user_id]))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(User.objects.filter(pk=patient.user_id).exists())


class DataViewTests(AdminTestCase):
    """Identity from user_db, counts from medical_db, and nothing more."""

    def setUp(self):
        super().setUp()
        self.specialist = self.make_specialist()
        self.patient = self.make_patient('dziecko@example.com', is_child=True)
        self.guardian = self.make_user('rodzic@example.com', role='rodzic', name='Maria')
        ParentChild.objects.create(
            parent=self.guardian, child=self.patient.user, accepted_at=timezone.now(),
        )
        SpecjalistPatient.objects.create(
            specjalist=self.specialist, patient=self.patient,
            module=MODULE_PSYCHOTHERAPY, accepted_at=timezone.now(),
        )
        Diary.objects.create(
            id_medical=self.patient.id_medical, current_mood='dobre',
            notes=SECRET_NOTE,
        )
        DietMeal.objects.create(
            id_medical=self.patient.id_medical, entry_date=datetime.date(2026, 9, 1),
        )
        self.sign_in(self.admin)

    def get(self, name, *args, **params):
        return self.client.get(reverse(f'core:{name}', args=args), params)

    def test_the_overview_counts(self):
        data = self.get('admin-overview').data

        self.assertEqual(data['accounts']['patient'], 1)
        self.assertEqual(data['accounts']['specialist'], 1)
        self.assertEqual(data['accounts']['guardian'], 1)
        self.assertEqual(data['accounts']['admin'], 1)
        self.assertEqual(data['patients']['minors'], 1)
        self.assertEqual(data['records']['diary_entries'], 1)
        self.assertEqual(data['records']['meals'], 1)

    def test_the_account_list_files_each_account_by_kind(self):
        rows = self.get('admin-accounts').data
        kinds = {row['email']: row['kind'] for row in rows}

        self.assertEqual(kinds, {
            'admin@example.com': 'admin',
            'terapeutka@example.com': 'specialist',
            'dziecko@example.com': 'patient',
            'rodzic@example.com': 'guardian',
        })

    def test_the_list_filters_by_kind(self):
        rows = self.get('admin-accounts', kind='patient').data

        self.assertEqual([row['email'] for row in rows], ['dziecko@example.com'])

    def test_an_unknown_kind_is_a_400_not_an_empty_list(self):
        self.assertEqual(self.get('admin-accounts', kind='nikt').status_code, 400)

    def test_a_patient_s_detail_has_links_and_counts(self):
        data = self.get('admin-account', self.patient.user_id).data

        self.assertEqual(data['kind'], 'patient')
        self.assertEqual(data['patient']['guardian_status'], 'accepted')
        self.assertEqual(
            [row['email'] for row in data['patient']['guardians']], ['rodzic@example.com'])
        self.assertEqual(
            [row['email'] for row in data['patient']['specialists']],
            ['terapeutka@example.com'])
        activity = data['patient']['activity']
        self.assertEqual(activity['diary_entries']['count'], 1)
        self.assertEqual(activity['meals'], {'count': 1, 'last': '2026-09-01'})
        self.assertIs(activity['health_profile'], False)

    def test_no_record_s_content_ever_reaches_the_panel(self):
        """The pseudonymisation is the point: counts, never content."""
        responses = [
            self.get('admin-overview'),
            self.get('admin-accounts'),
            self.get('admin-account', self.patient.user_id),
            self.get('admin-account', self.specialist.user_id),
            self.get('admin-account', self.guardian.pk),
        ]
        for response in responses:
            with self.subTest(url=response.wsgi_request.path):
                self.assertEqual(response.status_code, 200)
                payload = json.dumps(response.data, default=str)
                self.assertNotIn(SECRET_NOTE, payload)
                self.assertNotIn(str(self.patient.id_medical), payload)

    def test_a_specialist_s_detail_lists_their_patients(self):
        data = self.get('admin-account', self.specialist.user_id).data

        self.assertEqual(data['specialist']['module'], MODULE_PSYCHOTHERAPY)
        self.assertEqual(
            [row['email'] for row in data['specialist']['patients']],
            ['dziecko@example.com'])

    def test_a_guardian_s_detail_lists_their_children(self):
        data = self.get('admin-account', self.guardian.pk).data

        self.assertEqual(
            [row['email'] for row in data['guardian']['children']],
            ['dziecko@example.com'])

    def test_an_unknown_account_is_a_404(self):
        response = self.get('admin-account', '00000000-0000-0000-0000-000000000000')

        self.assertEqual(response.status_code, 404)

    def test_opening_an_account_is_recorded_with_whose_it_was(self):
        self.get('admin-account', self.patient.user_id)

        entry = AdminAuditLog.objects.get(action=admin_panel.ACTION_VIEW_ACCOUNT)
        self.assertEqual(entry.target_id, self.patient.user_id)
        self.assertEqual(entry.admin_email, 'admin@example.com')

    def test_opening_it_again_straight_away_is_one_entry(self):
        self.get('admin-account', self.patient.user_id)
        self.get('admin-account', self.patient.user_id)

        self.assertEqual(
            AdminAuditLog.objects.filter(action=admin_panel.ACTION_VIEW_ACCOUNT).count(), 1)

    def test_opening_it_later_is_a_second_entry(self):
        self.get('admin-account', self.patient.user_id)
        AdminAuditLog.objects.update(
            created_at=timezone.now() - admin_panel.AUDIT_READ_WINDOW - datetime.timedelta(seconds=1))

        self.get('admin-account', self.patient.user_id)

        self.assertEqual(
            AdminAuditLog.objects.filter(action=admin_panel.ACTION_VIEW_ACCOUNT).count(), 2)

    def test_the_log_is_readable_and_reading_it_is_not_logged(self):
        self.get('admin-account', self.patient.user_id)
        before = AdminAuditLog.objects.count()

        log = self.get('admin-audit-log').data

        self.assertEqual(AdminAuditLog.objects.count(), before)
        self.assertEqual(log[0]['action'], admin_panel.ACTION_VIEW_ACCOUNT)
        self.assertEqual(log[0]['target_id'], str(self.patient.user_id))


class CreateAdminCommandTests(AdminTestCase):
    """`manage.py create_admin` — the only way an administrator is made."""

    def run_command(self, *args):
        out = io.StringIO()
        call_command('create_admin', *args, stdout=out)
        return out.getvalue()

    def test_it_creates_a_new_account(self):
        self.run_command(
            'Nowy.Admin@Example.com', '--name', 'Nowy', '--surname', 'Admin',
            '--password', 'MocneHaslo!2026',
        )

        user = User.objects.get(email='nowy.admin@example.com')
        self.assertTrue(Administrator.objects.filter(user=user).exists())
        self.assertTrue(check_password('MocneHaslo!2026', user.password_hash))
        self.assertFalse(user.must_change_password)
        # Consent is its owner's act — granted at first login, not here.
        self.assertIsNone(user.data_consent_at)

    def test_it_grants_an_existing_account(self):
        user = self.make_user('istnieje@example.com')

        self.run_command('istnieje@example.com')

        self.assertTrue(Administrator.objects.filter(user=user).exists())

    def test_it_refuses_a_weak_password(self):
        with self.assertRaises(CommandError):
            self.run_command('slabe@example.com', '--password', '123')
        self.assertFalse(User.objects.filter(email='slabe@example.com').exists())

    def test_it_refuses_a_patient_a_specialist_and_a_guardian(self):
        accounts = [
            self.make_patient().user,
            self.make_specialist().user,
            self.make_user('rodzic@example.com', role='rodzic'),
        ]
        for account in accounts:
            with self.subTest(account=account.email):
                with self.assertRaises(CommandError):
                    self.run_command(account.email)
                self.assertFalse(Administrator.objects.filter(user=account).exists())
