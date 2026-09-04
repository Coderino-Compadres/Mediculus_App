"""The technique catalogue's database half, and the two lists it has to agree with.

Two kinds of test here, and the second kind is the one that catches real bugs:

* the endpoints — who may write a technique, what a patient is shown, and the
  rules on a slug;
* **cross-language checks**, parsing `frontend/src/types/technique.ts` and
  `frontend/src/data/techniques.ts`. The vocabularies in
  `core/technique_vocabulary.py` are not translations of the TypeScript union
  types, they are *the same strings*: they travel on the wire and end up as keys
  into the label maps in `utils/techniques.ts`, so a value outside them reaches a
  screen that has no name for it. And `BUILTIN_SLUGS` is a copy of the ids in the
  hardcoded catalogue, which is what stops a stored technique shadowing a
  built-in one. Nothing else keeps either pair in step — the same guard
  `test_emotions.py` puts on the emotion names.
"""

import pathlib
import re

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import Patient, Specjalist, Technique, User, UserRole
from core.technique_vocabulary import (AVAILABILITIES, DBT_GROUPS, DBT_MODULES,
                                       SCHOOLS)
from core.techniques import BUILTIN_SLUGS

PASSWORD = 'TajneHaslo123'

FRONTEND = pathlib.Path(settings.BASE_DIR).parent / 'frontend' / 'src'
TYPES_TS = FRONTEND / 'types' / 'technique.ts'
DATA_TS = FRONTEND / 'data' / 'techniques.ts'


def union_members(source, name):
    """The string literals of `export type <name> = 'a' | 'b'`, in order.

    Tolerates the declaration spanning several lines, which is how the longer
    ones are written in that file.
    """
    match = re.search(
        rf"export type {name} =\s*(?P<body>(?:\s*\|?\s*'[^']+')+)", source,
    )
    assert match, f'nie znaleziono deklaracji {name} w technique.ts'
    return tuple(re.findall(r"'([^']+)'", match.group('body')))


class VocabularyTests(SimpleTestCase):
    """The four closed sets, against the unions the frontend declares."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = TYPES_TS.read_text(encoding='utf-8')

    def test_the_schools_match_character_for_character(self):
        self.assertEqual(SCHOOLS, union_members(self.source, 'TechniqueSchool'))

    def test_the_dbt_groups_match_and_keep_their_order(self):
        """The order carries meaning on the screen — the four groups are sorted
        by time horizon, so somebody opening the app at stress 8/10 reaches the
        first one. It is not enforced here for that reason (the frontend orders
        its own tabs) but a difference is worth knowing about."""
        self.assertEqual(DBT_GROUPS, union_members(self.source, 'TechniqueGroup'))

    def test_the_dbt_modules_match(self):
        self.assertEqual(DBT_MODULES, union_members(self.source, 'TechniqueDbtModule'))

    def test_the_availability_flags_match(self):
        self.assertEqual(
            AVAILABILITIES, union_members(self.source, 'TechniqueAvailability'))

    def test_no_polish_labels_leaked_into_the_backend_vocabulary(self):
        """The labels live in utils/techniques.ts, deliberately — the opposite
        arrangement to core/emotions.py, where the Polish name *is* the stored
        value. A second copy here would be one free to disagree."""
        for value in SCHOOLS + DBT_GROUPS + DBT_MODULES + AVAILABILITIES:
            with self.subTest(value=value):
                self.assertNotIn(' ', value)


class BuiltinSlugTests(SimpleTestCase):
    """`BUILTIN_SLUGS` against the ids the hardcoded catalogue actually uses."""

    def test_it_lists_exactly_the_techniques_the_app_ships_with(self):
        source = DATA_TS.read_text(encoding='utf-8')
        # Every technique in that file is an object literal whose first field is
        # `id: '...'`; nothing else in it is indented to four spaces with that key.
        declared = set(re.findall(r"^    id: '([^']+)',$", source, flags=re.MULTILINE))

        self.assertTrue(declared, 'nie sparsowano żadnego id z data/techniques.ts')
        self.assertEqual(set(BUILTIN_SLUGS), declared)


class TechniqueTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.specjalist = self.make_specialist()
        self.sign_in(self.specjalist.user)

    def make_user(self, email, role='patient'):
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0],
            email=email, password_hash=make_password(PASSWORD),
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        )

    def make_specialist(self, email='specjalista@example.com'):
        return Specjalist.objects.create(
            user=self.make_user(email, role='specjalista'), specjalization='DBT',
        )

    def make_patient(self, email='pacjent@example.com'):
        return Patient.objects.create(
            user=self.make_user(email, role='patient'), is_child=False,
        )

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def body(self, **overrides):
        body = {
            'slug': 'radykalna-akceptacja',
            'name': 'Radykalna akceptacja',
            'subtitle': 'Kiedy nie mogę tego zmienić.',
            'schools': ['dbt'],
            'dbt_group': 'akceptacja',
            'dbt_module': 'tolerancja',
            'intro': 'O czym jest ta technika.',
            'steps': [
                {
                    'name': 'Zauważ',
                    'description': 'Zauważ, że walczysz z faktem.',
                    'examples': ['przykład'],
                },
            ],
        }
        body.update(overrides)
        return body

    def create(self, **overrides):
        return self.client.post(
            reverse('core:specialist-techniques'), self.body(**overrides), format='json',
        )


class WritingTests(TechniqueTestCase):
    def test_a_technique_is_written_with_its_whole_structure(self):
        response = self.create()

        self.assertEqual(response.status_code, 201, response.data)
        technique = Technique.objects.get(slug='radykalna-akceptacja')
        self.assertEqual(technique.name, 'Radykalna akceptacja')
        self.assertEqual(technique.schools, ['dbt'])
        self.assertEqual(technique.dbt_group, 'akceptacja')
        self.assertEqual(technique.steps, [
            {
                'name': 'Zauważ',
                'description': 'Zauważ, że walczysz z faktem.',
                'examples': ['przykład'],
            },
        ])
        self.assertTrue(technique.description_ready)

    def test_everything_the_panel_writes_is_in_the_catalogue_at_once(self):
        """No draft state and no safety flag on this form: what a specialist
        saves is what every patient can open."""
        self.create()

        technique = Technique.objects.get()
        self.assertTrue(technique.description_ready)
        self.assertEqual(technique.availability, 'ogolna')

        patient = self.make_patient(email='ktokolwiek@example.com')
        self.sign_in(patient.user)
        self.assertEqual(
            len(self.client.get(reverse('core:technique-catalogue')).data), 1)

    def test_a_request_asking_for_a_draft_is_published_anyway(self):
        """Neither field exists on the serializer, so a hand-made body cannot
        hold one back — and cannot half-succeed either. Pinned rather than left
        to DRF's habit of dropping what it does not declare, because the *shape*
        of that habit is what cost `diary.time_of_day` a real bug."""
        response = self.create(description_ready=False, availability='wymagaSpecjalisty')

        self.assertEqual(response.status_code, 201, response.data)
        technique = Technique.objects.get()
        self.assertTrue(technique.description_ready)
        self.assertEqual(technique.availability, 'ogolna')

    def test_the_author_is_recorded_so_the_panel_knows_whose_it_is(self):
        self.create()

        self.assertEqual(
            Technique.objects.get().author_id_specjalist, self.specjalist.pk)

    def test_the_original_columns_are_kept_in_step(self):
        """`raport.id_technique` joins to this row and the home screen's
        suggestion card reads `name`/`description` off it, so a technique with
        the new columns filled and the old ones empty would show up there blank."""
        self.create()

        technique = Technique.objects.get()
        self.assertEqual(technique.description, 'O czym jest ta technika.')
        self.assertEqual(technique.type, 'dbt')

    def test_a_technique_can_belong_to_two_tabs_at_once(self):
        """The alternative is two rows whose descriptions drift apart at the
        first clinical correction — see the note on `Technique.szkola`."""
        response = self.create(schools=['dbt', 'relaksacyjne'])

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Technique.objects.get().schools, ['dbt', 'relaksacyjne'])

    def test_an_empty_optional_text_is_stored_as_null_not_as_blank(self):
        self.create(subtitle='', dbt_group=None, dbt_module=None)

        technique = Technique.objects.get()
        self.assertIsNone(technique.subtitle)
        self.assertIsNone(technique.dbt_group)
        self.assertIsNone(technique.dbt_module)

    def test_a_value_outside_the_vocabulary_is_a_400_rather_than_free_text(self):
        """diary.time_of_day is the cautionary tale: a plain Serializer drops
        what it does not declare, and a patient was told an answer had been saved
        when it had not."""
        for field, value in (
            ('schools', ['gestalt']),
            ('dbt_group', 'cokolwiek'),
            ('dbt_module', 'cokolwiek'),
        ):
            with self.subTest(field=field):
                response = self.create(**{field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_a_technique_needs_at_least_one_step(self):
        response = self.create(steps=[])

        self.assertEqual(response.status_code, 400)
        self.assertIn('steps', response.data)

    def test_a_step_needs_a_description_but_not_a_name(self):
        unnamed = self.create(steps=[{'description': 'Sam opis.'}])
        self.assertEqual(unnamed.status_code, 201, unnamed.data)
        self.assertIsNone(Technique.objects.get().steps[0]['name'])

        Technique.objects.all().delete()
        nameless = self.create(steps=[{'name': 'Krok', 'description': ''}])
        self.assertEqual(nameless.status_code, 400)

    def test_at_least_one_school_is_required(self):
        response = self.create(schools=[])

        self.assertEqual(response.status_code, 400)
        self.assertIn('schools', response.data)

    def test_a_slug_is_a_url_segment_and_nothing_else(self):
        for slug in ('Radykalna Akceptacja', 'radykalna_akceptacja', 'ŁADNA', 'a--b', ''):
            with self.subTest(slug=slug):
                response = self.create(slug=slug)
                self.assertEqual(response.status_code, 400, slug)
                self.assertIn('slug', response.data)

    def test_a_slug_cannot_shadow_a_technique_the_app_ships_with(self):
        """The patient's catalogue merges the two halves by slug, so a collision
        would make which technique opens a matter of row order."""
        response = self.create(slug='tipp')

        self.assertEqual(response.status_code, 400)
        self.assertIn('slug', response.data)

    def test_a_slug_is_taken_only_once(self):
        self.create()

        response = self.create(name='Inna nazwa')

        self.assertEqual(response.status_code, 400)
        self.assertIn('slug', response.data)
        self.assertEqual(Technique.objects.count(), 1)

    def test_a_colleague_cannot_reuse_a_slug_either(self):
        self.create()
        colleague = self.make_specialist(email='kolega@example.com')
        self.sign_in(colleague.user)

        response = self.create()

        self.assertEqual(response.status_code, 400)


class EditingTests(TechniqueTestCase):
    def setUp(self):
        super().setUp()
        self.create()
        self.technique = Technique.objects.get()
        self.url = reverse('core:specialist-technique', args=[self.technique.pk])

    def test_the_author_can_correct_the_text(self):
        response = self.client.put(
            self.url, self.body(intro='Poprawione wprowadzenie.'), format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.technique.refresh_from_db()
        self.assertEqual(self.technique.intro, 'Poprawione wprowadzenie.')
        self.assertEqual(self.technique.description, 'Poprawione wprowadzenie.')

    def test_a_put_replaces_rather_than_merges(self):
        """The form submits its whole state, so a field left out is an answer
        taken back — the same rule as /api/diary/today/."""
        self.client.put(self.url, self.body(subtitle='', dbt_group=None), format='json')

        self.technique.refresh_from_db()
        self.assertIsNone(self.technique.subtitle)
        self.assertIsNone(self.technique.dbt_group)

    def test_the_slug_cannot_be_changed(self):
        """It is in the URL of a technique patients may already have opened, and
        freeing the old slug for something else is worse than refusing."""
        response = self.client.put(self.url, self.body(slug='inny-slug'), format='json')

        self.assertEqual(response.status_code, 400)
        self.technique.refresh_from_db()
        self.assertEqual(self.technique.slug, 'radykalna-akceptacja')

    def test_a_colleague_s_technique_answers_like_a_nonexistent_one(self):
        colleague = self.make_specialist(email='kolega@example.com')
        self.sign_in(colleague.user)

        self.assertEqual(
            self.client.put(self.url, self.body(), format='json').status_code, 404)
        self.assertEqual(self.client.delete(self.url).status_code, 404)
        self.technique.refresh_from_db()
        self.assertEqual(self.technique.intro, 'O czym jest ta technika.')

    def test_deleting_removes_it_from_the_catalogue(self):
        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Technique.objects.filter(pk=self.technique.pk).exists())

    def test_an_edit_cannot_pull_a_technique_out_of_the_catalogue(self):
        """The only way to withdraw one is to delete it — there is no draft state
        for a specialist to park it in."""
        self.client.put(
            self.url, self.body(description_ready=False), format='json')

        self.technique.refresh_from_db()
        self.assertTrue(self.technique.description_ready)
        self.assertEqual(
            len(self.client.get(reverse('core:technique-catalogue')).data), 1)

    def test_a_row_withheld_by_its_columns_is_still_visible_to_its_author(self):
        """`for_specjalist` filters on nothing, on purpose: a row somebody set
        `description_ready = false` on by hand (a data migration, manage.py
        shell) must not vanish from the one screen that can fix it."""
        Technique.objects.filter(pk=self.technique.pk).update(description_ready=False)

        mine = self.client.get(reverse('core:specialist-techniques'))
        self.assertEqual(len(mine.data), 1)

        catalogue = self.client.get(reverse('core:technique-catalogue'))
        self.assertEqual(catalogue.data, [])


class CataloguePayloadTests(TechniqueTestCase):
    """What a patient is shown, and what never reaches them."""

    def test_a_published_technique_reaches_every_patient(self):
        """The decision behind the feature: what a specialist publishes is a
        catalogue entry like any other, not something scoped to their own
        patients."""
        self.create()
        stranger = self.make_patient(email='obcy@example.com')
        self.sign_in(stranger.user)

        response = self.client.get(reverse('core:technique-catalogue'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['slug'], 'radykalna-akceptacja')

    def test_the_author_never_travels(self):
        """Resolving a specialist's name would mean reading user_db from a
        medical_db row, and this project keeps that meeting point in one named
        module (core/account.py). The panel needs no name; the patient's
        catalogue does not say who wrote an entry."""
        self.create()

        response = self.client.get(reverse('core:technique-catalogue'))

        self.assertNotIn('author_id_specjalist', response.data[0])
        self.assertNotIn(str(self.specjalist.pk), str(response.data))

    def test_the_two_gates_still_withhold_a_row_that_carries_them(self):
        """Neither is reachable from the panel any more — every technique a
        specialist saves is published and 'ogolna'. The gates stay because the
        columns do: `description_ready` False is what keeps the seeded rows out
        (see below), and 'wymagaSpecjalisty' is the flag the source material asks
        for on the four techniques with medical contraindications, which live in
        the hardcoded catalogue. A safety flag that withheld nothing would be
        worse than none, so this pins that `published()` still reads both."""
        self.create()

        for field, value in (
            ('description_ready', False),
            ('availability', 'wymagaSpecjalisty'),
        ):
            with self.subTest(field=field):
                Technique.objects.update(**{field: value})
                self.assertEqual(
                    self.client.get(reverse('core:technique-catalogue')).data, [])
                # Back to the state the panel actually produces.
                Technique.objects.update(description_ready=True, availability='ogolna')
                self.assertEqual(
                    len(self.client.get(reverse('core:technique-catalogue')).data), 1)

    def test_the_rows_mock_data_seeds_are_not_catalogue_entries(self):
        """They hold a name and a sentence, not the structure the detail screen
        renders — which is why `description_ready` defaults to False."""
        Technique.objects.create(name='Uważność', type='DBT', description='Krótki opis.')

        self.assertEqual(self.client.get(reverse('core:technique-catalogue')).data, [])

    def test_a_guardian_may_read_the_same_descriptions_their_child_reads(self):
        self.create()
        guardian = self.make_user('rodzic@example.com', role='rodzic')
        self.sign_in(guardian)

        response = self.client.get(reverse('core:technique-catalogue'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_a_visitor_reads_nothing(self):
        self.create()
        self.client = APIClient()

        self.assertEqual(
            self.client.get(reverse('core:technique-catalogue')).status_code, 403)

    def test_no_write_verb_exists_on_the_catalogue(self):
        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    reverse('core:technique-catalogue'), {}, format='json')
                self.assertEqual(response.status_code, 405)

    def test_the_payload_is_the_documented_shape(self):
        self.create()

        row = self.client.get(reverse('core:technique-catalogue')).data[0]

        # `availability` and `description_ready` are still on the wire although
        # the panel no longer sets them: the frontend's `isPublished` reads them
        # for the hardcoded half of the catalogue, and a payload where one half
        # carries a field and the other does not would be two shapes.
        self.assertEqual(set(row), {
            'slug', 'id_technique', 'name', 'subtitle', 'schools', 'dbt_group',
            'dbt_module', 'availability', 'intro', 'steps', 'duration_min',
            'description_ready', 'created_at', 'updated_at',
        })


class PanelListTests(TechniqueTestCase):
    def test_a_specialist_sees_their_own_techniques_only(self):
        self.create()
        colleague = self.make_specialist(email='kolega@example.com')
        self.sign_in(colleague.user)

        self.assertEqual(self.client.get(reverse('core:specialist-techniques')).data, [])

    def test_a_patient_cannot_reach_the_panel_list(self):
        patient = self.make_patient()
        self.sign_in(patient.user)

        self.assertEqual(
            self.client.get(reverse('core:specialist-techniques')).status_code, 403)
