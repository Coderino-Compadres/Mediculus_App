"""Unit tests for `core/guardian.py`, called directly rather than over HTTP.

CLAUDE.md gives the reason the module exists at all: "the rules live in
core/guardian.py, out of the views so they can be tested without a request".
test_guardian_api.py covers the same flow through the endpoints; what is here
instead are the states a request cannot easily produce — a link accepted at a
known instant, a guardian with several children, a row written by hand the way
a future parent panel (or scripts/mock_data.sql) might write one.

`default` only: parent_child lives in user_db alongside both accounts it points
at.
"""

import datetime
import uuid

from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.utils import timezone

from core.guardian import (STATUS_ACCEPTED, STATUS_NONE, STATUS_PENDING,
                           accept_invitation, cancel_invitation,
                           guardian_status, pending_invitations,
                           reject_invitation, serialize_invitation)
from core.models import ParentChild, Patient, User, UserRole


def create_user(email, role='rodzic', **fields):
    return User.objects.create(
        user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
        email=email, password_hash=make_password('TajneHaslo123'), **fields,
    )


def create_minor(email='dziecko@example.com', **fields):
    user = create_user(email, 'patient', **fields)
    Patient.objects.create(user=user, is_child=True)
    return user


class GuardianUnitTestCase(TestCase):
    databases = {'default'}

    def setUp(self):
        self.child = create_minor(name='Ola', surname='Testowa')
        self.guardian = create_user('rodzic@example.com')

    def invite(self, child=None, guardian=None):
        return ParentChild.objects.create(
            parent=guardian or self.guardian, child=child or self.child,
        )

    def accepted(self, child=None, guardian=None, at=None):
        link = self.invite(child, guardian)
        link.accepted_at = at or timezone.now()
        link.save(update_fields=['accepted_at'])
        return link


class GuardianStatusTests(GuardianUnitTestCase):
    def test_a_child_nobody_is_linked_to_reads_as_none(self):
        self.assertEqual(guardian_status(self.child), STATUS_NONE)

    def test_an_unanswered_invitation_reads_as_pending(self):
        self.invite()

        self.assertEqual(guardian_status(self.child), STATUS_PENDING)

    def test_an_answered_invitation_reads_as_accepted(self):
        self.accepted()

        self.assertEqual(guardian_status(self.child), STATUS_ACCEPTED)

    def test_an_accepted_link_outranks_a_pending_one_whatever_the_row_order(self):
        """Two rows is a state the invitation rules forbid but the schema allows.

        Reading the database as the authority means a row written by hand — or
        by the parent panel, once it exists — cannot lock out a child who does
        have a guardian.
        """
        self.invite(guardian=create_user('drugi@example.com'))
        self.accepted()

        self.assertEqual(guardian_status(self.child), STATUS_ACCEPTED)

    def test_another_child_s_link_is_not_borrowed(self):
        other = create_minor('inne@example.com')
        self.accepted(child=other)

        self.assertEqual(guardian_status(self.child), STATUS_NONE)


class AcceptTests(GuardianUnitTestCase):
    def test_accepting_stamps_the_moment_of_the_decision(self):
        link = self.invite()

        self.assertTrue(accept_invitation(self.guardian, link.pk))

        link.refresh_from_db()
        self.assertIsNotNone(link.accepted_at)

    def test_accepting_again_does_not_move_the_timestamp(self):
        """The date is the proof of consent (RODO art. 7(1)).

        A double-clicked button must not rewrite when the guardian agreed —
        which is why guardian.accept_invitation checks for NULL before writing
        rather than assigning unconditionally.
        """
        original = timezone.now() - datetime.timedelta(days=3)
        link = self.accepted(at=original)

        self.assertTrue(accept_invitation(self.guardian, link.pk))

        link.refresh_from_db()
        self.assertEqual(link.accepted_at, original)

    def test_another_guardian_s_invitation_cannot_be_accepted(self):
        link = self.invite(guardian=create_user('ktos.inny@example.com'))

        self.assertFalse(accept_invitation(self.guardian, link.pk))

        link.refresh_from_db()
        self.assertIsNone(link.accepted_at)

    def test_an_id_that_does_not_exist_is_refused_rather_than_raising(self):
        self.assertFalse(accept_invitation(self.guardian, uuid.uuid4()))

    def test_accepting_leaves_a_second_child_s_invitation_alone(self):
        mine = self.invite()
        other = self.invite(child=create_minor('inne@example.com'))

        accept_invitation(self.guardian, mine.pk)

        other.refresh_from_db()
        self.assertIsNone(other.accepted_at)


class RejectTests(GuardianUnitTestCase):
    def test_refusing_drops_the_row_rather_than_marking_it(self):
        """"No" is recorded as the absence of a link, so the child can ask again."""
        link = self.invite()

        self.assertTrue(reject_invitation(self.guardian, link.pk))

        self.assertFalse(ParentChild.objects.filter(pk=link.pk).exists())
        self.assertEqual(guardian_status(self.child), STATUS_NONE)

    def test_an_accepted_link_is_not_refusable_here(self):
        """Withdrawing an accepted link has a live account behind it and belongs
        to the parent panel, not to this button."""
        link = self.accepted()

        self.assertFalse(reject_invitation(self.guardian, link.pk))

        self.assertTrue(ParentChild.objects.filter(pk=link.pk).exists())

    def test_another_guardian_s_invitation_cannot_be_refused(self):
        link = self.invite(guardian=create_user('ktos.inny@example.com'))

        self.assertFalse(reject_invitation(self.guardian, link.pk))

        self.assertTrue(ParentChild.objects.filter(pk=link.pk).exists())

    def test_an_id_that_does_not_exist_is_refused_rather_than_raising(self):
        self.assertFalse(reject_invitation(self.guardian, uuid.uuid4()))

    def test_refusing_one_invitation_leaves_the_others_standing(self):
        mine = self.invite()
        other = self.invite(child=create_minor('inne@example.com'))

        reject_invitation(self.guardian, mine.pk)

        self.assertTrue(ParentChild.objects.filter(pk=other.pk).exists())


class CancelTests(GuardianUnitTestCase):
    def test_a_child_can_withdraw_their_own_pending_invitation(self):
        self.invite()

        self.assertTrue(cancel_invitation(self.child))

        self.assertEqual(guardian_status(self.child), STATUS_NONE)

    def test_an_accepted_link_is_not_the_child_s_to_undo(self):
        """Otherwise the guardian's oversight lasts exactly as long as the child
        allows it."""
        self.accepted()

        self.assertFalse(cancel_invitation(self.child))

        self.assertEqual(guardian_status(self.child), STATUS_ACCEPTED)

    def test_withdrawing_nothing_answers_false_rather_than_raising(self):
        self.assertFalse(cancel_invitation(self.child))

    def test_only_this_child_s_invitation_is_withdrawn(self):
        other = create_minor('inne@example.com')
        theirs = self.invite(child=other)
        self.invite()

        cancel_invitation(self.child)

        self.assertTrue(ParentChild.objects.filter(pk=theirs.pk).exists())

    def test_a_pending_row_is_dropped_even_when_an_accepted_one_exists(self):
        """The schema allows the pair; the pending half is still the child's."""
        self.accepted()
        pending = self.invite(guardian=create_user('drugi@example.com'))

        self.assertTrue(cancel_invitation(self.child))

        self.assertFalse(ParentChild.objects.filter(pk=pending.pk).exists())


class PendingInvitationsTests(GuardianUnitTestCase):
    def test_the_list_is_ordered_by_the_child_not_by_insertion(self):
        """`parent_child` has no created_at, so ordering by the child is what
        keeps the list stable between requests — a card must not move under the
        guardian's finger between one render and the next."""
        self.invite(child=create_minor('c@example.com', name='Zofia', surname='A'))
        self.invite(child=create_minor('a@example.com', name='Ala', surname='B'))
        self.invite(child=create_minor('b@example.com', name='Marek', surname='C'))

        names = [item['child_name'] for item in pending_invitations(self.guardian)]

        self.assertEqual(names, ['Ala', 'Marek', 'Zofia'])

    def test_children_sharing_a_name_are_ordered_by_surname_then_address(self):
        self.child.delete()
        self.invite(child=create_minor('druga@example.com', name='Ala', surname='Kowalska'))
        self.invite(child=create_minor('pierwsza@example.com', name='Ala', surname='Kowalska'))
        self.invite(child=create_minor('trzecia@example.com', name='Ala', surname='Abacka'))

        emails = [item['child_email'] for item in pending_invitations(self.guardian)]

        self.assertEqual(
            emails, ['trzecia@example.com', 'druga@example.com', 'pierwsza@example.com'],
        )

    def test_an_accepted_link_is_no_longer_waiting_for_an_answer(self):
        self.accepted()

        self.assertEqual(pending_invitations(self.guardian), [])

    def test_another_guardian_s_invitations_are_invisible(self):
        self.invite(guardian=create_user('ktos.inny@example.com'))

        self.assertEqual(pending_invitations(create_user('trzeci@example.com')), [])

    def test_a_guardian_nobody_named_gets_an_empty_list(self):
        self.assertEqual(pending_invitations(self.guardian), [])

    def test_each_entry_carries_the_person_and_nothing_clinical(self):
        self.invite()

        [invitation] = pending_invitations(self.guardian)

        self.assertEqual(
            sorted(invitation), ['child_email', 'child_name', 'child_surname', 'id'],
        )

    def test_one_query_covers_the_children_it_names(self):
        """select_related on the child: without it the list costs a query per
        card, which is the difference between one round trip and twenty."""
        for index in range(5):
            self.invite(child=create_minor(f'dziecko{index}@example.com', name=f'D{index}'))

        with self.assertNumQueries(1):
            pending_invitations(self.guardian)


class SerializeInvitationTests(GuardianUnitTestCase):
    def test_the_id_travels_as_text_so_it_survives_json(self):
        link = self.invite()

        self.assertEqual(serialize_invitation(link)['id'], str(link.pk))

    def test_a_child_row_with_no_name_still_serializes(self):
        """Every one of these columns is nullable, and scripts/mock_data.sql
        writes rows the registration form never would. The guardian's card falls
        back to the address (see GuardianInvitations.tsx); it must be handed a
        payload to fall back *with* rather than a 500."""
        nameless = create_minor('bez.imienia@example.com')
        link = self.invite(child=nameless)

        payload = serialize_invitation(link)

        self.assertIsNone(payload['child_name'])
        self.assertIsNone(payload['child_surname'])
        self.assertEqual(payload['child_email'], 'bez.imienia@example.com')
