"""GET/PUT /api/safety-plan/ — the patient's own safety plan (core/safety_plan.py).

What is pinned: the patient writes and reads their own plan and nobody else can;
a PUT replaces the plan; blank lines are dropped; the limits and the phone rule
hold; a plan nobody wrote answers null; the plan goes with the account.
"""

from django.urls import reverse
from django.utils import timezone

from core import account_deletion
from core.models import ParentChild, SafetyPlan, SpecjalistPatient
from core.modules import MODULE_PSYCHOTHERAPY
from core.safety_plan import MAX_LINES, PHONE_INVALID
from core.tests.test_admin_panel import AdminTestCase

FULL_PLAN = {
    'warning_signs': ['Nie śpię dwie noce z rzędu', '  ', 'Odwołuję spotkania'],
    'coping_strategies': ['Spacer', 'Oddech 4-6'],
    'trusted_people': [
        {'name': 'Ania', 'relation': 'siostra', 'phone': '600 700 800'},
        {'name': 'Kasia', 'relation': '', 'phone': ''},
    ],
    'professional_contact': {'name': 'dr Nowak', 'role': 'psychiatra', 'phone': '+48 12 345 67 89'},
    'notes': 'W nocy dzwonię na 800 70 2222.',
}


class SafetyPlanTestCase(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.patient = self.make_patient()
        self.sign_in(self.patient.user)

    def get(self):
        return self.client.get(reverse('core:safety-plan'))

    def put(self, body):
        return self.client.put(reverse('core:safety-plan'), body, format='json')


class OwnPlanTests(SafetyPlanTestCase):
    def test_a_plan_nobody_wrote_answers_null(self):
        response = self.get()

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data)

    def test_the_patient_writes_and_reads_their_own_plan(self):
        saved = self.put(FULL_PLAN)

        self.assertEqual(saved.status_code, 200, saved.data)
        read = self.get().data
        self.assertEqual(read['warning_signs'], ['Nie śpię dwie noce z rzędu', 'Odwołuję spotkania'])
        self.assertEqual(read['trusted_people'][0],
                         {'name': 'Ania', 'relation': 'siostra', 'phone': '600 700 800'})
        self.assertEqual(read['trusted_people'][1],
                         {'name': 'Kasia', 'relation': None, 'phone': None})
        self.assertEqual(read['professional_contact']['role'], 'psychiatra')
        self.assertEqual(read['notes'], 'W nocy dzwonię na 800 70 2222.')
        self.assertIsNotNone(read['updated_at'])

    def test_a_put_replaces_rather_than_merges_and_keeps_one_row(self):
        self.put(FULL_PLAN)

        self.put({'coping_strategies': ['Tylko to']})

        read = self.get().data
        self.assertEqual(read['warning_signs'], [])
        self.assertEqual(read['trusted_people'], [])
        self.assertIsNone(read['professional_contact'])
        self.assertIsNone(read['notes'])
        self.assertEqual(SafetyPlan.objects.count(), 1)

    def test_an_empty_plan_is_a_valid_save(self):
        response = self.put({})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['warning_signs'], [])


class ValidationTests(SafetyPlanTestCase):
    def test_a_phone_that_is_not_a_phone_is_refused(self):
        for phone in ('abc', '12', 'zadzwoń do mnie'):
            with self.subTest(phone=phone):
                response = self.put({'trusted_people': [{'name': 'Ania', 'phone': phone}]})
                self.assertEqual(response.status_code, 400)
                self.assertIn(PHONE_INVALID, str(response.data))

    def test_a_person_needs_a_name(self):
        response = self.put({'trusted_people': [{'name': '', 'phone': '600700800'}]})

        self.assertEqual(response.status_code, 400)

    def test_the_lists_are_bounded(self):
        response = self.put({'warning_signs': ['x'] * (MAX_LINES + 1)})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(SafetyPlan.objects.exists())

    def test_a_refused_save_leaves_the_stored_plan_alone(self):
        self.put(FULL_PLAN)

        self.put({'trusted_people': [{'name': 'Ania', 'phone': 'abc'}]})

        self.assertEqual(len(self.get().data['trusted_people']), 2)


class WhoTests(SafetyPlanTestCase):
    def test_another_patient_sees_only_their_own(self):
        self.put(FULL_PLAN)
        other = self.make_patient('inny@example.com')
        self.sign_in(other.user)

        self.assertIsNone(self.get().data)

    def test_a_specialist_treating_the_patient_is_refused(self):
        self.put(FULL_PLAN)
        specialist = self.make_specialist()
        SpecjalistPatient.objects.create(
            specjalist=specialist, patient=self.patient, module=MODULE_PSYCHOTHERAPY,
            accepted_at=timezone.now(),
        )
        self.sign_in(specialist.user)

        self.assertEqual(self.get().status_code, 403)
        self.assertEqual(self.put({}).status_code, 403)

    def test_a_guardian_is_refused(self):
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        self.sign_in(guardian)

        self.assertEqual(self.get().status_code, 403)

    def test_a_minor_waiting_for_a_guardian_is_refused(self):
        child = self.make_patient('dziecko@example.com', is_child=True)
        self.sign_in(child.user)

        self.assertEqual(self.get().status_code, 403)

    def test_a_minor_with_an_accepted_guardian_has_a_plan(self):
        child = self.make_patient('dziecko@example.com', is_child=True)
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        ParentChild.objects.create(parent=guardian, child=child.user, accepted_at=timezone.now())
        self.sign_in(child.user)

        self.assertEqual(self.put({'coping_strategies': ['Muzyka']}).status_code, 200)

    def test_a_visitor_is_refused(self):
        self.client.logout()
        self.client.cookies.clear()

        self.assertEqual(self.get().status_code, 403)


class DeletionTests(SafetyPlanTestCase):
    def test_the_plan_goes_with_the_account(self):
        self.put(FULL_PLAN)

        account_deletion.delete_account(self.patient.user)

        self.assertFalse(SafetyPlan.objects.exists())
