"""Domain-model tests spanning both databases.

Uses the real router, so nothing here passes `.using(...)` explicitly — that is
part of what is being verified.
"""

import uuid

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from django.utils import timezone

from core.models import (Diary, MoodScale, ParentChild, Patient, Raport,
                         Specjalist, SpecjalistPatient, Technique, User,
                         UserRole)
from core.modules import MODULE_DIET, MODULE_PSYCHOTHERAPY


class RoutingTests(TestCase):
    databases = {'default', 'medical'}

    def test_objects_are_saved_to_the_routed_database(self):
        user = User.objects.create(email='a@example.com')
        diary = Diary.objects.create(id_medical=uuid.uuid4())
        self.assertEqual(user._state.db, 'default')
        self.assertEqual(diary._state.db, 'medical')

    def test_queries_reach_medical_without_using(self):
        self.assertEqual(Diary.objects.db, 'medical')
        self.assertEqual(Technique.objects.db, 'medical')
        self.assertEqual(User.objects.db, 'default')

    def test_explicit_using_still_works(self):
        """`.using('medical')` is redundant now but must stay harmless."""
        Diary.objects.create(id_medical=uuid.uuid4())
        self.assertEqual(Diary.objects.using('medical').count(), 1)


class PseudonymizationTests(TestCase):
    """id_medical is an application-level join, not a foreign key."""

    databases = {'default', 'medical'}

    def setUp(self):
        self.user = User.objects.create(email='patient@example.com')
        self.patient = Patient.objects.create(user=self.user)

    def test_diary_is_found_through_id_medical(self):
        Diary.objects.create(id_medical=self.patient.id_medical, current_mood='ok')
        Diary.objects.create(id_medical=uuid.uuid4(), current_mood='someone else')
        mine = Diary.objects.filter(id_medical=self.patient.id_medical)
        self.assertEqual([d.current_mood for d in mine], ['ok'])

    def test_medical_rows_accept_an_unknown_id_medical(self):
        """Postgres cannot enforce the cross-database reference."""
        orphan = Diary.objects.create(id_medical=uuid.uuid4())
        self.assertFalse(Patient.objects.filter(id_medical=orphan.id_medical).exists())

    def test_deleting_a_patient_leaves_medical_rows_behind(self):
        """No cascade crosses the databases — cleanup is the app's job."""
        id_medical = self.patient.id_medical
        Diary.objects.create(id_medical=id_medical)
        self.user.delete()
        self.assertFalse(Patient.objects.filter(id_medical=id_medical).exists())
        self.assertEqual(Diary.objects.filter(id_medical=id_medical).count(), 1)

    def test_id_medical_is_unique_per_patient(self):
        other = User.objects.create(email='other@example.com')
        with self.assertRaises(IntegrityError), transaction.atomic():
            Patient.objects.create(user=other, id_medical=self.patient.id_medical)


class OnDeleteTests(TestCase):
    """The on_delete choices deliberately differ from the raw SQL (NO ACTION)."""

    databases = {'default', 'medical'}

    def test_user_role_in_use_is_protected(self):
        role = UserRole.objects.create(name='patient')
        User.objects.create(email='u@example.com', user_role=role)
        with self.assertRaises(ProtectedError):
            role.delete()

    def test_deleting_a_specjalist_drops_the_relationship_and_keeps_the_patient(self):
        """CASCADE on the link, never on the person.

        The relationship is a row of its own since 0022 and deleting the
        specialist deletes it — there is no "assigned to nobody" state to leave
        behind, which is what `SET_NULL` used to produce on `patient`. The
        patient's own account and diaries are untouched: they are not the
        specialist's to remove.
        """
        spec_user = User.objects.create(email='spec@example.com')
        spec = Specjalist.objects.create(user=spec_user, specjalization='CBT')
        patient = Patient.objects.create(user=User.objects.create(email='p@example.com'))
        SpecjalistPatient.objects.create(
            specjalist=spec, patient=patient, module=MODULE_PSYCHOTHERAPY,
            accepted_at=timezone.now(),
        )

        spec.delete()

        self.assertFalse(SpecjalistPatient.objects.exists())
        self.assertTrue(Patient.objects.filter(pk=patient.pk).exists())

    def test_deleting_a_patient_drops_their_relationships(self):
        """The other side of the same CASCADE: no row may outlive either end."""
        spec = Specjalist.objects.create(
            user=User.objects.create(email='spec2@example.com'), specjalization='CBT',
        )
        patient = Patient.objects.create(user=User.objects.create(email='p2@example.com'))
        SpecjalistPatient.objects.create(
            specjalist=spec, patient=patient, module=MODULE_DIET,
        )

        patient.delete()

        self.assertFalse(SpecjalistPatient.objects.exists())
        self.assertTrue(Specjalist.objects.filter(pk=spec.pk).exists())

    def test_one_accepted_specialist_per_module_and_two_across_them(self):
        """The constraint that replaced the old single FK, in both directions.

        One accepted relationship per module — "kto mnie prowadzi" has one
        answer — and one patient may still hold two, one per module, which is
        the whole reason the table exists.
        """
        first = Specjalist.objects.create(
            user=User.objects.create(email='a@example.com'), specjalization='CBT',
        )
        second = Specjalist.objects.create(
            user=User.objects.create(email='b@example.com'), specjalization='Dietetyka',
        )
        patient = Patient.objects.create(user=User.objects.create(email='p3@example.com'))

        SpecjalistPatient.objects.create(
            specjalist=first, patient=patient, module=MODULE_PSYCHOTHERAPY,
            accepted_at=timezone.now(),
        )
        # A different module is a different relationship, and allowed.
        SpecjalistPatient.objects.create(
            specjalist=second, patient=patient, module=MODULE_DIET,
            accepted_at=timezone.now(),
        )

        with self.assertRaises(IntegrityError):
            SpecjalistPatient.objects.create(
                specjalist=second, patient=patient, module=MODULE_PSYCHOTHERAPY,
                accepted_at=timezone.now(),
            )

    def test_two_pending_invitations_in_one_module_are_allowed(self):
        """The unique index is partial on purpose: being *asked* by two
        specialists is a choice the patient gets to make."""
        first = Specjalist.objects.create(
            user=User.objects.create(email='c@example.com'), specjalization='CBT',
        )
        second = Specjalist.objects.create(
            user=User.objects.create(email='d@example.com'), specjalization='DBT',
        )
        patient = Patient.objects.create(user=User.objects.create(email='p4@example.com'))

        SpecjalistPatient.objects.create(
            specjalist=first, patient=patient, module=MODULE_PSYCHOTHERAPY,
        )
        SpecjalistPatient.objects.create(
            specjalist=second, patient=patient, module=MODULE_PSYCHOTHERAPY,
        )

        self.assertEqual(SpecjalistPatient.objects.count(), 2)

    def test_an_unknown_module_is_refused_by_the_database(self):
        spec = Specjalist.objects.create(
            user=User.objects.create(email='e@example.com'), specjalization='CBT',
        )
        patient = Patient.objects.create(user=User.objects.create(email='p5@example.com'))

        with self.assertRaises(IntegrityError):
            SpecjalistPatient.objects.create(
                specjalist=spec, patient=patient, module='astrologia',
            )

    def test_deleting_a_technique_nulls_the_raport_link(self):
        technique = Technique.objects.create(name='mindfulness')
        raport = Raport.objects.create(id_medical=uuid.uuid4(), technique=technique)
        technique.delete()
        raport.refresh_from_db()
        self.assertIsNone(raport.technique_id)

    def test_deleting_a_user_cascades_its_profiles_and_links(self):
        parent = User.objects.create(email='parent@example.com')
        child = User.objects.create(email='child@example.com')
        Patient.objects.create(user=child, is_child=True)
        ParentChild.objects.create(parent=parent, child=child)
        child.delete()
        self.assertFalse(Patient.objects.filter(user_id=child.pk).exists())
        self.assertFalse(ParentChild.objects.exists())
        self.assertTrue(User.objects.filter(pk=parent.pk).exists())

    def test_deleting_a_diary_cascades_its_mood_scale(self):
        diary = Diary.objects.create(id_medical=uuid.uuid4())
        MoodScale.objects.create(diary=diary, sadness_scale=3)
        diary.delete()
        self.assertFalse(MoodScale.objects.exists())


class ConstraintTests(TestCase):
    databases = {'default'}

    def test_email_is_unique(self):
        User.objects.create(email='dup@example.com')
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create(email='dup@example.com')

    def test_parent_child_pair_cannot_repeat(self):
        parent = User.objects.create(email='p2@example.com')
        child = User.objects.create(email='c2@example.com')
        ParentChild.objects.create(parent=parent, child=child)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ParentChild.objects.create(parent=parent, child=child)

    def test_a_user_cannot_be_their_own_parent(self):
        user = User.objects.create(email='self@example.com')
        with self.assertRaises(IntegrityError), transaction.atomic():
            ParentChild.objects.create(parent=user, child=user)


class TimestampTests(TestCase):
    """created_at/updated_at come from Django (auto_now*), not from DB defaults.

    That is why mock_data.sql, whose INSERTs omit both columns, only works on the
    schema built by database_setup.sql.
    """

    databases = {'default', 'medical'}

    def test_user_timestamps_are_filled_in(self):
        user = User.objects.create(email='ts@example.com')
        self.assertIsNotNone(user.created_at)
        self.assertIsNotNone(user.updated_at)

    def test_diary_timestamps_are_filled_in(self):
        diary = Diary.objects.create(id_medical=uuid.uuid4())
        self.assertIsNotNone(diary.created_at)
        self.assertIsNotNone(diary.updated_at)

    def test_updated_at_advances_on_save(self):
        user = User.objects.create(email='ts2@example.com')
        first = user.updated_at
        user.name = 'changed'
        user.save()
        self.assertGreater(user.updated_at, first)
        self.assertEqual(user.created_at, User.objects.get(pk=user.pk).created_at)
