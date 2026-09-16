"""`/api/account/health-profile/` — §13's "Profil zdrowotny".

WHAT THIS CLOSED. The screen shipped on the diet-profile branch with two stubs
that performed no request: `frontend/src/api/healthProfile.ts` said so in as
many words, because there was "no table, no column, no model, no migration and
no serializer for any field on this screen". Somebody could type an allergy,
press Zapisz and be told nothing had been sent. These tests are the other half.

THE PROPERTIES WORTH GUARDING ABOVE THE OTHERS, in order:

1. **Nothing is required and nothing is a verdict.** §05's rule taken
   literally — an empty body is a valid profile — and §13's rule on top of it:
   no BMI, no difference between a weight and a target weight, no judgement on
   any number. `NothingIsAVerdictTests` sweeps the payload for both.
2. **One profile per patient, and no history.** A second save is an edit. There
   is no dated row, so no weight series can accumulate behind a screen whose
   §13 forbids the chart.
3. **The vocabulary agrees with the frontend's**, character for character and
   in the same order — the rule CLAUDE.md states for `emotions.ts`/`emotions.py`
   and the reason the conditions are rows rather than a text column. A key added
   on one side only loses its chip; a key spelled differently loses the
   diagnosis.
4. **The patient is the session.** No id in the URL, so no version of this
   request reads somebody else's body.

Touches both databases: the session and the `patient` row are in user_db, the
profile is in medical_db.
"""

import re
import uuid
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.health_profile import (ACTIVITY_LEVELS, CONDITIONS,
                                 MAX_OWN_CONDITION, MAX_OWN_CONDITIONS,
                                 MAX_TEXT)
from core.models import (HealthCondition, HealthProfile, Patient, Specjalist,
                         User, UserRole)

PASSWORD = 'TajneHaslo123'

HEALTH_PROFILE_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'healthProfile.ts'
)


class FrontendParityTests(SimpleTestCase):
    """The agreement with `utils/healthProfile.ts`, in both directions.

    The same arrangement `test_emotions.FrontendParityTests` has, and CLAUDE.md
    asks for it by name. What makes it worth the parsing: these keys are stored.
    A key renamed on one side alone does not merely lose a colour — it orphans
    every row written under the old spelling, and the chip for a diagnosis
    somebody declared stops being drawn.
    """

    def frontend_conditions(self):
        source = HEALTH_PROFILE_TS.read_text(encoding='utf-8')
        block = re.search(
            r'export const CONDITIONS: ConditionOption\[\] = \[(.*?)\n\]',
            source, re.S,
        )
        self.assertIsNotNone(block, 'CONDITIONS not found — did the file move?')
        return re.findall(r"\{\s*id:\s*'([^']+)'", block.group(1))

    def frontend_activity_levels(self):
        source = HEALTH_PROFILE_TS.read_text(encoding='utf-8')
        block = re.search(
            r'export const ACTIVITY_LEVELS: ActivityLevelOption\[\] = \[(.*?)\n\]',
            source, re.S,
        )
        self.assertIsNotNone(block, 'ACTIVITY_LEVELS not found — did the file move?')
        return re.findall(r"\{\s*value:\s*'([^']+)'", block.group(1))

    def test_the_frontend_file_is_where_we_think_it_is(self):
        self.assertTrue(HEALTH_PROFILE_TS.exists(), f'{HEALTH_PROFILE_TS} is missing')

    def test_both_sides_list_exactly_the_same_conditions(self):
        self.assertEqual(sorted(self.frontend_conditions()), sorted(CONDITIONS))

    def test_both_sides_declare_them_in_the_same_order(self):
        """Not pedantry: `serialize_profile` sorts by this order, so a profile
        read on one side lists its chips the way the other draws them."""
        self.assertEqual(self.frontend_conditions(), list(CONDITIONS))

    def test_there_are_seventeen_distinct_conditions(self):
        self.assertEqual(len(CONDITIONS), 17)
        self.assertEqual(len(set(CONDITIONS)), 17)

    def test_both_sides_offer_the_same_three_activity_levels(self):
        self.assertEqual(self.frontend_activity_levels(), list(ACTIVITY_LEVELS))

    def test_the_type_union_matches_the_condition_list(self):
        """`ConditionId` is what the screen's own state is typed against."""
        union = re.search(
            r'export type ConditionId =(.*?)\n\n',
            (HEALTH_PROFILE_TS.parent.parent / 'types' / 'healthProfile.ts')
            .read_text(encoding='utf-8'),
            re.S,
        )
        self.assertIsNotNone(union, 'ConditionId not found — did the type move?')
        self.assertEqual(sorted(re.findall(r"'([^']+)'", union.group(1))),
                         sorted(CONDITIONS))

    def test_the_psychiatric_diagnoses_are_not_a_separate_section(self):
        """§13: "Rozpoznania psychiatryczne stoją w tej samej liście, co
        somatyczne — bez osobnej sekcji."

        Guarded because the tidy-looking refactor is to group them, and the
        grouping is the thing §13 refuses: it would draw a line around the
        patient's psychiatric history in the one place that outlives a
        redesign.
        """
        for diagnosis in ('eating-disorder', 'depression', 'anxiety', 'adhd', 'autism'):
            with self.subTest(diagnosis=diagnosis):
                self.assertIn(diagnosis, CONDITIONS)


class HealthProfileTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.patient = self.make_patient()
        self.sign_in(self.patient.user)

    def make_user(self, email='pacjent@example.com', role='patient'):
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD),
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        )

    def make_patient(self, email='pacjent@example.com', is_child=False):
        return Patient.objects.create(user=self.make_user(email), is_child=is_child)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def url(self):
        return reverse('core:account-health-profile')

    def save(self, **body):
        return self.client.put(self.url(), body, format='json')


class ReadTests(HealthProfileTestCase):
    def test_a_profile_nobody_filled_in_is_empty_rather_than_an_error(self):
        """A 404 would draw an error box over a screen that has not failed at
        anything: the patient genuinely has nothing on file."""
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'height_cm': None,
            'weight_kg': None,
            'target_weight_kg': None,
            'activity_level': None,
            'allergies': None,
            'intolerances': None,
            'dietary_preferences': None,
            'conditions': [],
            'own_conditions': [],
        })

    def test_an_empty_profile_is_not_written_by_reading_it(self):
        """GET is a read. A row created on first sight would make "has this
        patient filled anything in" unanswerable a moment later."""
        self.client.get(self.url())

        self.assertFalse(HealthProfile.objects.exists())

    def test_only_this_patient_s_profile_is_read(self):
        other = self.make_patient(email='ktos@example.com')
        HealthProfile.objects.create(
            id_medical=other.id_medical, weight_kg=Decimal('62.0'),
        )
        HealthProfile.objects.create(
            id_medical=self.patient.id_medical, weight_kg=Decimal('71.5'),
        )

        self.assertEqual(self.client.get(self.url()).json()['weight_kg'], 71.5)

    def test_the_measurements_come_back_as_numbers_rather_than_strings(self):
        """'71.5' would make the screen parse a parse: the field it goes into
        holds what somebody typed, and the client formats the number into it."""
        HealthProfile.objects.create(
            id_medical=self.patient.id_medical,
            height_cm=Decimal('168.0'), weight_kg=Decimal('71.5'),
        )

        body = self.client.get(self.url()).json()

        self.assertEqual(body['height_cm'], 168)
        self.assertEqual(body['weight_kg'], 71.5)
        self.assertIsInstance(body['weight_kg'], float)

    def test_the_conditions_come_back_in_the_vocabulary_s_order(self):
        """Written in one order, read in §13's — so two screens reading one
        profile draw the chips the same way."""
        profile = HealthProfile.objects.create(id_medical=self.patient.id_medical)
        for condition in ('autism', 'pcos', 'diabetes-1'):
            HealthCondition.objects.create(profile=profile, condition=condition)

        self.assertEqual(
            self.client.get(self.url()).json()['conditions'],
            ['diabetes-1', 'pcos', 'autism'],
        )

    def test_hand_written_conditions_keep_the_order_they_were_typed_in(self):
        """They have no vocabulary to be sorted by, so the order somebody wrote
        them in is the only order there is."""
        self.save(own_conditions=['Migrena', 'Astma', 'Borelioza'])

        self.assertEqual(
            self.client.get(self.url()).json()['own_conditions'],
            ['Migrena', 'Astma', 'Borelioza'],
        )


class WriteTests(HealthProfileTestCase):
    def test_a_full_profile_is_stored_and_read_back_unchanged(self):
        response = self.save(
            height_cm=168, weight_kg=71.5, target_weight_kg=65,
            activity_level='moderate',
            allergies='orzechy, skorupiaki',
            intolerances='laktoza',
            dietary_preferences='bez mięsa czerwonego',
            conditions=['hashimoto', 'pcos'],
            own_conditions=['Migrena'],
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'height_cm': 168,
            'weight_kg': 71.5,
            'target_weight_kg': 65,
            'activity_level': 'moderate',
            'allergies': 'orzechy, skorupiaki',
            'intolerances': 'laktoza',
            'dietary_preferences': 'bez mięsa czerwonego',
            'conditions': ['pcos', 'hashimoto'],
            'own_conditions': ['Migrena'],
        })
        self.assertEqual(self.client.get(self.url()).json(), response.json())

    def test_an_empty_body_is_a_valid_save(self):
        """§05, taken literally: "Żadne pole nie blokuje zapisu". A profile
        filled in halfway is better than one nobody dared start."""
        response = self.save()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['conditions'], [])
        self.assertEqual(HealthProfile.objects.count(), 1)

    def test_a_second_save_edits_the_profile_rather_than_adding_one(self):
        self.save(weight_kg=71.5)
        self.save(weight_kg=70)

        self.assertEqual(HealthProfile.objects.count(), 1)
        self.assertEqual(self.client.get(self.url()).json()['weight_kg'], 70)

    def test_nothing_records_what_a_number_said_before(self):
        """No history, and no row per change: §13 rules the weight chart out by
        name, and a dated row here would be its first half."""
        self.save(weight_kg=71.5)
        self.save(weight_kg=70)

        self.assertEqual(
            list(HealthProfile.objects.values_list('weight_kg', flat=True)),
            [Decimal('70.0')],
        )

    def test_a_field_left_out_of_the_body_is_an_answer_taken_back(self):
        """PUT replaces rather than merges — the rule every form in this app
        follows. A merge would make clearing an allergy impossible from the only
        form that writes it."""
        self.save(allergies='orzechy', weight_kg=71.5)

        body = self.save(weight_kg=71.5).json()

        self.assertIsNone(body['allergies'])

    def test_unpicking_every_condition_leaves_none(self):
        self.save(conditions=['hashimoto', 'pcos'], own_conditions=['Migrena'])

        body = self.save().json()

        self.assertEqual(body['conditions'], [])
        self.assertEqual(body['own_conditions'], [])
        self.assertFalse(HealthCondition.objects.exists())

    def test_rewriting_the_conditions_does_not_accumulate_rows(self):
        self.save(conditions=['hashimoto'])
        self.save(conditions=['hashimoto', 'pcos'])

        self.assertEqual(HealthCondition.objects.count(), 2)

    def test_a_blank_string_is_stored_as_nothing_at_all(self):
        """'' and NULL would be two spellings of "not filled in", and the screen
        reads both as an empty field."""
        self.save(allergies='   ', activity_level='')

        profile = HealthProfile.objects.get()
        self.assertIsNone(profile.allergies)
        self.assertIsNone(profile.activity_level)

    def test_text_is_trimmed(self):
        self.assertEqual(self.save(allergies='  orzechy  ').json()['allergies'],
                         'orzechy')

    def test_a_blank_hand_written_condition_is_dropped(self):
        """It would otherwise draw an empty chip with a remove button on it."""
        self.assertEqual(
            self.save(own_conditions=['Migrena', '   ']).json()['own_conditions'],
            ['Migrena'],
        )

    def test_the_patient_is_the_session_and_never_the_body(self):
        """There is no id in this URL; a body naming one reaches nothing."""
        other = self.make_patient(email='ktos@example.com')

        self.save(id_medical=str(other.id_medical), weight_kg=71.5)

        self.assertFalse(
            HealthProfile.objects.filter(id_medical=other.id_medical).exists())
        self.assertTrue(
            HealthProfile.objects.filter(id_medical=self.patient.id_medical).exists())

    def test_two_patients_keep_separate_profiles(self):
        other = self.make_patient(email='ktos@example.com')
        self.save(weight_kg=71.5)
        self.sign_in(other.user)

        self.assertIsNone(self.client.get(self.url()).json()['weight_kg'])


class ValidationTests(HealthProfileTestCase):
    def test_a_condition_outside_the_vocabulary_is_refused(self):
        """Stored, it would fail to render as a chip — an allergy silently
        missing from a dietitian's intake form."""
        response = self.save(conditions=['migrena'])

        self.assertEqual(response.status_code, 400)
        self.assertFalse(HealthProfile.objects.exists())

    def test_the_same_condition_twice_is_refused_rather_than_stored(self):
        """A double-submitted form, not a second diagnosis — and the database's
        own `uq_health_condition` would otherwise answer it as a 500."""
        response = self.save(conditions=['pcos', 'pcos'])

        self.assertEqual(response.status_code, 400)

    def test_an_activity_level_outside_the_three_is_refused(self):
        self.assertEqual(self.save(activity_level='bardzo wysoki').status_code, 400)

    def test_every_declared_activity_level_is_accepted(self):
        for level in ACTIVITY_LEVELS:
            with self.subTest(level=level):
                self.assertEqual(self.save(activity_level=level).status_code, 200)

    def test_every_declared_condition_is_accepted(self):
        for condition in CONDITIONS:
            with self.subTest(condition=condition):
                self.assertEqual(self.save(conditions=[condition]).status_code, 200)

    def test_a_measurement_past_the_column_s_bound_is_a_400_rather_than_a_500(self):
        """1000 does not fit NUMERIC(4,1). Unchecked, the database answers — and
        a held-down key becomes a server error."""
        self.assertEqual(self.save(height_cm=1000).status_code, 400)

    def test_a_zero_measurement_is_refused(self):
        """Nobody is 0 cm tall: it is a typo, and read as an answer it would put
        a figure on somebody's profile that they did not mean. The frontend
        sends null for it; this is for anything that did not come through it."""
        self.assertEqual(self.save(weight_kg=0).status_code, 400)

    def test_a_negative_measurement_is_refused(self):
        self.assertEqual(self.save(weight_kg=-5).status_code, 400)

    def test_null_is_how_a_measurement_says_nothing_was_written(self):
        response = self.save(weight_kg=None)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['weight_kg'])

    def test_a_runaway_paste_is_refused(self):
        self.assertEqual(self.save(allergies='a' * (MAX_TEXT + 1)).status_code, 400)

    def test_a_hand_written_condition_longer_than_a_diagnosis_is_refused(self):
        self.assertEqual(
            self.save(own_conditions=['a' * (MAX_OWN_CONDITION + 1)]).status_code,
            400,
        )

    def test_more_hand_written_conditions_than_a_list_can_be_is_refused(self):
        self.assertEqual(
            self.save(own_conditions=['x'] * (MAX_OWN_CONDITIONS + 1)).status_code,
            400,
        )

    def test_a_refused_save_changes_nothing(self):
        self.save(weight_kg=71.5, conditions=['pcos'])

        self.save(weight_kg=70, conditions=['migrena'])

        body = self.client.get(self.url()).json()
        self.assertEqual(body['weight_kg'], 71.5)
        self.assertEqual(body['conditions'], ['pcos'])


class NothingIsAVerdictTests(HealthProfileTestCase):
    """§13's rule, guarded as a shape rather than as one absent field.

    "Wśród pacjentek są osoby z zaburzeniami odżywiania — te dwie liczby są
    danymi dla specjalisty, nie celem pokazywanym codziennie." So the response
    carries the numbers somebody wrote and nothing derived from them: no BMI, no
    difference, no ratio, no target-reached flag, no judgement on a value. The
    sweep is on the payload's *keys*, because the way this rule gets broken is a
    convenience field added to save the client an arithmetic it is not allowed
    to perform either.
    """

    FORBIDDEN = (
        'bmi', 'body_mass_index', 'weight_difference', 'difference',
        'to_target', 'target_difference', 'progress', 'percent', 'ratio',
        'category', 'verdict', 'status', 'ideal_weight', 'healthy_range',
    )

    def test_the_payload_derives_nothing_from_the_two_weights(self):
        body = self.save(
            height_cm=168, weight_kg=71.5, target_weight_kg=65,
        ).json()

        for key in self.FORBIDDEN:
            with self.subTest(key=key):
                self.assertNotIn(key, body)

    def test_the_payload_holds_exactly_the_nine_fields_the_form_has(self):
        """An exact set rather than a blocklist: the next derived field would be
        one this test has never heard of."""
        self.assertEqual(set(self.save().json()), {
            'height_cm', 'weight_kg', 'target_weight_kg', 'activity_level',
            'allergies', 'intolerances', 'dietary_preferences',
            'conditions', 'own_conditions',
        })

    def test_the_table_holds_no_derived_column(self):
        columns = {field.column for field in HealthProfile._meta.concrete_fields}

        for key in self.FORBIDDEN:
            with self.subTest(key=key):
                self.assertNotIn(key, columns)

    def test_a_target_below_the_current_weight_is_stored_without_comment(self):
        """The two numbers are independent and nothing compares them. A refusal
        or a warning here would be the app having an opinion about a body."""
        response = self.save(weight_kg=71.5, target_weight_kg=45)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['target_weight_kg'], 45)


class GateTests(HealthProfileTestCase):
    """Whose record this is, answered by refusing rather than by emptiness.

    A guardian handed an empty profile would read it as "we hold no diagnoses
    for you" rather than as "you are not the subject of this record" — and on
    this screen, unlike the counters beside it, the difference is somebody
    else's psychiatric history.
    """

    def test_a_guardian_is_refused_on_both_verbs(self):
        self.sign_in(self.make_user(email='rodzic@example.com', role='rodzic'))

        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.save(weight_kg=71.5).status_code, 403)

    def test_a_specialist_is_refused_on_both_verbs(self):
        Specjalist.objects.create(
            user=self.make_user(email='specjalista@example.com', role='specjalista'),
            specjalization='psychodietetyka',
        )
        self.sign_in(User.objects.get(email='specjalista@example.com'))

        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.save(weight_kg=71.5).status_code, 403)

    def test_a_refused_specialist_writes_nothing(self):
        """Being a specialist grants no access to a patient's data — and
        certainly not to writing it."""
        Specjalist.objects.create(
            user=self.make_user(email='specjalista@example.com', role='specjalista'),
            specjalization='psychodietetyka',
        )
        self.sign_in(User.objects.get(email='specjalista@example.com'))

        self.save(weight_kg=71.5)

        self.assertFalse(HealthProfile.objects.exists())

    def test_a_signed_out_request_is_refused(self):
        self.client.cookies.clear()

        self.assertEqual(self.client.get(self.url()).status_code, 403)


class ModelTests(TestCase):
    databases = {'medical'}

    def test_a_condition_row_needs_exactly_one_of_its_two_columns(self):
        """`ck_health_condition`. A row with neither says nothing; a row with
        both says two things about one diagnosis."""
        from django.db import IntegrityError, transaction

        profile = HealthProfile.objects.create(id_medical=uuid.uuid4())

        for kwargs in ({}, {'condition': 'pcos', 'own_label': 'PCOS'}):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(IntegrityError), transaction.atomic(using='medical'):
                    HealthCondition.objects.create(profile=profile, **kwargs)

    def test_two_profiles_for_one_patient_are_refused_by_the_schema(self):
        """The one-row rule belongs to the schema, not to the API alone."""
        from django.db import IntegrityError, transaction

        id_medical = uuid.uuid4()
        HealthProfile.objects.create(id_medical=id_medical)

        with self.assertRaises(IntegrityError), transaction.atomic(using='medical'):
            HealthProfile.objects.create(id_medical=id_medical)

    def test_deleting_a_profile_takes_its_conditions_with_it(self):
        """CASCADE: a condition has no meaning without the profile it is on."""
        profile = HealthProfile.objects.create(id_medical=uuid.uuid4())
        HealthCondition.objects.create(profile=profile, condition='pcos')

        profile.delete()

        self.assertFalse(HealthCondition.objects.exists())

    def test_two_hand_written_conditions_may_repeat_where_a_chip_may_not(self):
        """NULLs are distinct in Postgres, and that is the right behaviour here:
        somebody may well write two things the list does not have."""
        profile = HealthProfile.objects.create(id_medical=uuid.uuid4())

        HealthCondition.objects.create(profile=profile, own_label='Migrena')
        HealthCondition.objects.create(profile=profile, own_label='Migrena')

        self.assertEqual(HealthCondition.objects.count(), 2)
