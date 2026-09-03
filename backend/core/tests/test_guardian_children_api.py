"""Tests for /api/guardian/children/ — what a guardian may see of a child.

The omissions matter more than the fields here, so most of this file asserts
that something is *absent*. A minor's diary is health data they write about
themselves, and a minor who knows a parent reads it writes a different diary —
so the endpoint reports engagement (how much, how recently, whether a run is
going) and nothing about what any of it says.

Touches both databases: the link and the child's identity are in user_db, the
entry counts behind the summary are in medical_db.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.account import CHILD_SUMMARY_FIELDS
from core.authentication import SESSION_USER_KEY
from core.models import Diary, ParentChild, Patient, User, UserRole

PASSWORD = 'TajneHaslo123'


class ChildrenTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.url = reverse('core:guardian-children')
        self.guardian = self.make_user('rodzic@example.com', role='rodzic')

    def make_user(self, email, role='patient', **fields):
        # Consented, like every account the registration form creates:
        # core/consents.py locks one whose consents are not in force, so a
        # helper that skipped them would build a user no endpoint would serve.
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_child(self, email='dziecko@example.com', name='Ola', surname='Testowa'):
        return Patient.objects.create(
            user=self.make_user(email, name=name, surname=surname), is_child=True,
        )

    def link(self, child, guardian=None, accepted=True):
        return ParentChild.objects.create(
            parent=guardian or self.guardian, child=child.user,
            accepted_at=timezone.now() if accepted else None,
        )

    def entry(self, patient, days_ago=0):
        diary = Diary.objects.create(
            id_medical=patient.id_medical, current_mood='very_bad',
            stress_level=10, risky_behavior_note='Nie spałam całą noc.',
        )
        day = self.today - datetime.timedelta(days=days_ago)
        noon = timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))
        Diary.objects.filter(pk=diary.pk).update(created_at=noon)
        return diary

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def children(self, user=None):
        self.sign_in(user or self.guardian)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return response.data


class AccessTests(ChildrenTestCase):

    def test_a_visitor_is_refused(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_a_guardian_nobody_named_gets_an_empty_list_rather_than_an_error(self):
        self.assertEqual(self.children(), [])

    def test_a_patient_asking_gets_their_own_empty_list(self):
        """No permission class of its own, like the invitations endpoint: the
        filter on `parent=request.user` is what makes it safe, and a patient is
        nobody's guardian so the answer is naturally empty."""
        patient = self.make_child('pacjent@example.com')

        self.assertEqual(self.children(patient.user), [])

    def test_another_guardians_child_is_not_listed(self):
        other = self.make_user('inny.rodzic@example.com', role='rodzic')
        self.link(self.make_child(), guardian=other)

        self.assertEqual(self.children(), [])

    def test_no_write_verb_exists(self):
        self.sign_in(self.guardian)

        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url, {}, format='json')
                self.assertEqual(response.status_code, 405)


class PendingLinkTests(ChildrenTestCase):
    """A request nobody answered is not a link."""

    def test_a_pending_invitation_reports_nothing_about_the_child(self):
        """The gate runs in both directions or it is not a gate: the child stays
        blocked until acceptance, and the adult who was merely *named* learns
        nothing about them in the meantime."""
        child = self.make_child()
        self.entry(child)
        self.link(child, accepted=False)

        self.assertEqual(self.children(), [])

    def test_accepting_is_what_makes_the_child_appear(self):
        child = self.make_child()
        link = self.link(child, accepted=False)
        self.assertEqual(self.children(), [])

        link.accepted_at = timezone.now()
        link.save(update_fields=['accepted_at'])

        self.assertEqual(len(self.children()), 1)


class SummaryTests(ChildrenTestCase):

    def setUp(self):
        super().setUp()
        self.child = self.make_child()
        self.link(self.child)

    def test_it_names_the_child_so_the_guardian_knows_whose_account_this_is(self):
        row = self.children()[0]

        self.assertEqual(row['child_name'], 'Ola')
        self.assertEqual(row['child_surname'], 'Testowa')
        self.assertEqual(row['child_email'], 'dziecko@example.com')

    def test_it_says_when_the_link_started(self):
        """`accepted_at`, not the account's creation — the moment the art. 8
        consent behind the link was actually given."""
        self.assertIsNotNone(self.children()[0]['linked_at'])

    def test_a_child_who_has_written_nothing_is_zeroes_rather_than_absent(self):
        """A linked child with an empty diary is a real state, and the one a
        guardian most needs to see."""
        self.assertEqual(self.children()[0]['activity'],
                         {'entry_count': 0, 'streak_days': 0, 'last_entry_date': None})

    def test_it_counts_the_entries_and_the_streak(self):
        for days_ago in (0, 1, 2, 40):
            self.entry(self.child, days_ago)

        activity = self.children()[0]['activity']

        self.assertEqual(activity['entry_count'], 4)
        self.assertEqual(activity['streak_days'], 3)

    def test_it_dates_the_last_entry_so_a_guardian_can_notice_a_gap(self):
        self.entry(self.child, days_ago=9)

        self.assertEqual(self.children()[0]['activity']['last_entry_date'],
                         (self.today - datetime.timedelta(days=9)).isoformat())

    def test_the_figures_are_the_same_ones_the_child_sees(self):
        """One definition per number (core/diary.py, core/dashboard.py), so a
        parent and a child cannot be told different things about one diary."""
        for days_ago in (0, 1):
            self.entry(self.child, days_ago)
        parent_view = self.children()[0]['activity']

        self.client = APIClient()
        self.sign_in(self.child.user)
        own = self.client.get(reverse('core:account-profile')).data['activity']

        self.assertEqual(parent_view['entry_count'], own['entry_count'])
        self.assertEqual(parent_view['streak_days'], own['streak_days'])

    def test_two_children_are_both_listed(self):
        second = self.make_child('drugie@example.com', name='Antoni', surname='Testowy')
        self.link(second)

        names = [row['child_name'] for row in self.children()]

        self.assertEqual(sorted(names), ['Antoni', 'Ola'])

    def test_a_linked_account_with_no_patient_row_reports_null_activity(self):
        """Shouldn't happen — a minor registers as a patient — but `parent_child`
        will hold a link to any user, and zeroes would be a claim about a diary
        that does not exist rather than one that is empty."""
        stray = self.make_user('bez-pacjenta@example.com')
        ParentChild.objects.create(
            parent=self.guardian, child=stray, accepted_at=timezone.now())

        row = next(r for r in self.children() if r['child_email'] == stray.email)

        self.assertIsNone(row['activity'])


class NothingClinicalTests(ChildrenTestCase):
    """The omissions, which are the point of the endpoint.

    Written as a sweep of the whole payload rather than field by field, because
    the failure mode is somebody *adding* something here and it looking like an
    improvement.
    """

    def setUp(self):
        super().setUp()
        self.child = self.make_child()
        self.link(self.child)
        # An entry loud enough that anything leaking would be obvious: worst
        # mood, maximum stress, a risky-behaviour note.
        self.entry(self.child)

    def test_the_activity_carries_exactly_the_declared_fields(self):
        self.assertEqual(set(self.children()[0]['activity']), set(CHILD_SUMMARY_FIELDS))

    def test_the_row_carries_nothing_beyond_identity_link_and_activity(self):
        self.assertEqual(
            set(self.children()[0]),
            {'id', 'child_name', 'child_surname', 'child_email', 'linked_at', 'activity'},
        )

    def test_no_clinical_word_appears_anywhere_in_the_payload(self):
        body = str(self.children())

        for leaked in ('very_bad', 'stress', 'mood', 'emotion', 'risky',
                       'Nie spałam', 'id_medical'):
            with self.subTest(leaked=leaked):
                self.assertNotIn(leaked, body)

    def test_the_childs_id_medical_never_travels(self):
        """The pseudonymized join is the one identifier that would let a caller
        line this up against medical_db."""
        self.assertNotIn(str(self.child.id_medical), str(self.children()))

    def test_the_guardian_still_cannot_reach_the_childs_own_endpoints(self):
        """This endpoint is the whole of a guardian's read access; it does not
        open the clinical ones behind it."""
        self.sign_in(self.guardian)

        for name in ('core:diary-history', 'core:home-dashboard',
                     'core:report-list', 'core:account-profile'):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, 403)
