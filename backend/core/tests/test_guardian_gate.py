"""The guardian gate, on the API rather than only in the browser.

RODO art. 8 makes a minor's consent the guardian's to give, and until now the
only thing enforcing that was `RequireAuth` in App.tsx: a hand-made request from
an unlinked minor's session reached the diary, the dashboard and the reports.
`test_reports_api.SessionEdgeTests` used to document exactly that.

What the gate has to get right is a shape, not a single endpoint — every
clinical URL closed, and the one URL that opens the gate left reachable from
behind it. So this file sweeps all of them from one place: a rule enforced on
`/api/diary/` and forgotten on `/api/reports/` is not a rule.

Touches both databases: the session and the `patient` row are in user_db, the
diary rows the endpoints aggregate are in medical_db.
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
from core.models import Diary, ParentChild, Patient, User, UserRole
from core.reports import DAYS_IN_WEEK, start_of_week, week_report_id
from core.views import GUARDIAN_GATE_REFUSAL


class GateTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.week = start_of_week(self.today) - datetime.timedelta(days=DAYS_IN_WEEK)

    def make_user(self, email, role='patient'):
        return User.objects.create(
            user_role=(
                UserRole.objects.get_or_create(name=role)[0] if role else None
            ),
            email=email, password_hash=make_password('TajneHaslo123'),
            data_consent_at=timezone.now(),
            services_consent_at=timezone.now(),
        )

    def make_patient(self, email='dziecko@example.com', is_child=True):
        return Patient.objects.create(user=self.make_user(email), is_child=is_child)

    def make_guardian(self, email='rodzic@example.com'):
        return self.make_user(email, role='rodzic')

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def entry(self, patient, day=None):
        """One diary entry, so a refusal cannot be mistaken for an empty diary.

        That is the whole reason these tests write data: a gate that answers 403
        and a gate that lets an empty account through look identical from the
        outside when there is nothing to return.
        """
        diary = Diary.objects.create(id_medical=patient.id_medical, current_mood='dobre')
        noon = timezone.make_aware(
            datetime.datetime.combine(day or self.week, datetime.time(12, 0)))
        Diary.objects.filter(pk=diary.pk).update(created_at=noon)
        return diary

    def invite(self, child, guardian, accepted=False):
        return ParentChild.objects.create(
            parent=guardian, child=child.user,
            accepted_at=timezone.now() if accepted else None,
        )


def clinical_urls(diary_id, report_id):
    """Every URL that reads or writes clinical data, with the verbs it accepts.

    Built as a list rather than checked endpoint by endpoint so that adding a
    URL to `core/urls.py` and forgetting the gate shows up here as a missing
    entry, not as a passing suite.
    """
    return [
        ('get', reverse('core:home-dashboard')),
        ('get', reverse('core:account-profile')),
        ('get', reverse('core:analysis-frequency')),
        ('get', reverse('core:diary-today')),
        ('put', reverse('core:diary-today')),
        ('get', reverse('core:diary-history')),
        ('get', reverse('core:diary-entry', args=[diary_id])),
        ('get', reverse('core:report-list')),
        ('get', reverse('core:report-detail', args=[report_id])),
        ('get', reverse('core:report-pdf', args=[report_id])),
    ]


class UnlinkedMinorTests(GateTestCase):
    """A minor nobody has vouched for reaches no clinical endpoint."""

    def setUp(self):
        super().setUp()
        self.child = self.make_patient()
        self.diary = self.entry(self.child)
        self.urls = clinical_urls(self.diary.pk, week_report_id(self.week))

    def request(self, method, url):
        return getattr(self.client, method)(url, {}, format='json')

    def test_a_minor_with_no_guardian_named_is_refused_everywhere(self):
        self.sign_in(self.child.user)

        for method, url in self.urls:
            with self.subTest(method=method, url=url):
                self.assertEqual(self.request(method, url).status_code, 403)

    def test_a_minor_whose_invitation_is_unanswered_is_refused_everywhere(self):
        """Being named is not consenting — the whole point of the two halves."""
        self.invite(self.child, self.make_guardian())
        self.sign_in(self.child.user)

        for method, url in self.urls:
            with self.subTest(method=method, url=url):
                self.assertEqual(self.request(method, url).status_code, 403)

    def test_the_refusal_says_what_the_account_is_waiting_for(self):
        """'Tylko dla konta pacjenta' would be false here and unactionable: the
        account *is* a patient's, it is waiting on somebody else."""
        self.sign_in(self.child.user)

        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(str(response.data['detail']), GUARDIAN_GATE_REFUSAL)

    def test_the_refusal_is_403_rather_than_404(self):
        """404 is this API's answer for "not yours" (see /api/diary/<id>/). Here
        the data is the caller's own and the account is what is blocked, so the
        honest answer is 403 — and it is what the frontend's route guard reads
        as "re-check the session" rather than as "this entry is gone"."""
        self.sign_in(self.child.user)

        self.assertEqual(self.client.get(reverse('core:report-list')).status_code, 403)

    def test_no_clinical_data_travels_with_the_refusal(self):
        self.sign_in(self.child.user)

        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(set(response.data), {'detail'})

    def test_a_writable_endpoint_writes_nothing(self):
        """A refusal on PUT that still saved would be the worst of both."""
        self.sign_in(self.child.user)
        before = Diary.objects.filter(id_medical=self.child.id_medical).count()

        response = self.client.put(
            reverse('core:diary-today'), {'notes': 'nowy wpis'}, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            Diary.objects.filter(id_medical=self.child.id_medical).count(), before)


class AcceptedMinorTests(GateTestCase):
    """Acceptance opens the gate — otherwise the feature is just an outage."""

    def setUp(self):
        super().setUp()
        self.child = self.make_patient()
        self.diary = self.entry(self.child)
        self.invite(self.child, self.make_guardian(), accepted=True)
        self.sign_in(self.child.user)

    def test_every_clinical_endpoint_answers(self):
        for method, url in clinical_urls(self.diary.pk, week_report_id(self.week)):
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 200)

    def test_the_diary_still_holds_the_entry(self):
        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(len(response.data), 1)


class UngatedAccountTests(GateTestCase):
    """Who the question does not apply to, and must not be asked.

    `guardian_status` is null for these accounts (see UserSerializer), so a gate
    keyed on the status rather than on `is_child` would have locked out every
    adult patient in the database.
    """

    def test_an_adult_patient_is_not_gated(self):
        adult = self.make_patient('dorosly@example.com', is_child=False)
        self.entry(adult)
        self.sign_in(adult.user)

        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 200)

    def test_an_adult_patient_with_no_parent_child_row_still_gets_in(self):
        """The common case, and the one a fail-closed reading of a null status
        would have broken: an adult has no row in `parent_child` at all."""
        adult = self.make_patient('dorosly2@example.com', is_child=False)
        self.sign_in(adult.user)

        self.assertFalse(ParentChild.objects.filter(child=adult.user).exists())
        self.assertEqual(self.client.get(reverse('core:report-list')).status_code, 200)

    def test_an_is_child_null_patient_is_not_gated(self):
        """`is_child` is nullable, and the gate reads `is True` rather than a
        truthiness test — a row that never answered the question is not a
        declared minor, and mock_data.sql predates the column being set."""
        patient = self.make_patient('nieznane@example.com', is_child=False)
        Patient.objects.filter(pk=patient.pk).update(is_child=None)
        self.sign_in(patient.user)

        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 200)

    def test_a_guardian_is_still_refused_for_the_old_reason(self):
        """Not the gate: a guardian has no `patient` row, and the message has to
        keep saying so rather than telling them to ask their own guardian."""
        self.sign_in(self.make_guardian())

        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(str(response.data['detail']), GUARDIAN_GATE_REFUSAL)


class GateDoesNotTrapTheChildTests(GateTestCase):
    """The way out of the gate stays reachable from inside it.

    Gating `/api/auth/guardian/` too would be a deadlock: the child cannot name
    a guardian without being accepted, and cannot be accepted without naming
    one. This is why `_require_patient` takes an explicit opt-out instead of the
    gate living in a permission class over every view.
    """

    def setUp(self):
        super().setUp()
        self.child = self.make_patient()
        self.guardian = self.make_guardian()
        self.url = reverse('core:guardian-link')
        self.sign_in(self.child.user)

    def test_an_unlinked_minor_can_still_name_a_guardian(self):
        response = self.client.post(
            self.url, {'guardian_email': self.guardian.email}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            ParentChild.objects.filter(child=self.child.user, accepted_at=None).exists())

    def test_an_unlinked_minor_can_still_withdraw_the_invitation(self):
        self.invite(self.child, self.guardian)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(ParentChild.objects.filter(child=self.child.user).exists())

    def test_an_unlinked_minor_can_still_read_their_own_account(self):
        """/api/auth/me/ is what the route guard asks, so gating it would make
        the frontend unable to learn why it was refused."""
        response = self.client.get(reverse('core:me'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['guardian_status'], 'none')

    def test_the_gate_does_not_reach_logout(self):
        self.assertEqual(self.client.post(reverse('core:logout')).status_code, 204)

    def test_an_unlinked_minor_can_still_change_their_password(self):
        """Not a clinical endpoint, and deliberately not gated.

        Everyone has a password, including the accounts that are not clinical
        subjects at all — and a minor waiting on a guardian who has reason to
        change theirs (a shoulder-surfer, a shared device) must not be told to
        come back once somebody else answers a form. `PasswordChangeView` is
        therefore the one write here that does not go through
        `_require_patient`; this pins that it stays that way.
        """
        response = self.client.post(
            reverse('core:account-password'),
            {
                'current_password': 'TajneHaslo123',
                'new_password': 'ZupelnieInne987',
                'new_password_confirm': 'ZupelnieInne987',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 204)


class GuardianSideTests(GateTestCase):
    """The guardian's own endpoints are unaffected by the child's status."""

    def setUp(self):
        super().setUp()
        self.child = self.make_patient()
        self.guardian = self.make_guardian()
        self.link = self.invite(self.child, self.guardian)

    def test_the_guardian_can_list_a_pending_invitation(self):
        self.sign_in(self.guardian)

        response = self.client.get(reverse('core:guardian-invitations'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_accepting_opens_the_gate_for_the_child(self):
        """The two halves, end to end and through the API: refused, accepted,
        served — with no action by the child in between."""
        self.entry(self.child)
        self.sign_in(self.child.user)
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)

        self.sign_in(self.guardian)
        accept = reverse('core:guardian-invitation-accept', args=[self.link.pk])
        self.assertEqual(self.client.post(accept).status_code, 204)

        self.sign_in(self.child.user)
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 200)

    def test_refusing_closes_it_again(self):
        """A refusal deletes the row, which puts the child back to 'none' —
        still blocked, and free to ask somebody else."""
        self.sign_in(self.guardian)
        reject = reverse('core:guardian-invitation-reject', args=[self.link.pk])
        self.assertEqual(self.client.post(reject).status_code, 204)

        self.sign_in(self.child.user)
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)


class GateIsNotAnOracleTests(GateTestCase):
    """The gate must not become a way to read somebody else's rows.

    A minor who is refused and a minor asking for an entry that is not theirs
    have to be distinguishable only by what the caller already knows.
    """

    def test_another_patients_entry_is_still_404_for_a_linked_minor(self):
        """Opening the gate must not widen what the id can reach."""
        child = self.make_patient()
        self.invite(child, self.make_guardian(), accepted=True)
        stranger = self.make_patient('obcy@example.com', is_child=False)
        theirs = self.entry(stranger)
        self.sign_in(child.user)

        response = self.client.get(reverse('core:diary-entry', args=[theirs.pk]))

        self.assertEqual(response.status_code, 404)

    def test_the_gate_is_checked_before_the_entry_is_looked_up(self):
        """An unlinked minor gets 403 for an id that does not exist either, so
        the refusal says nothing about whether the row is there."""
        child = self.make_patient()
        self.sign_in(child.user)

        response = self.client.get(reverse('core:diary-entry', args=[uuid.uuid4()]))

        self.assertEqual(response.status_code, 403)
