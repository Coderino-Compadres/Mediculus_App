"""The psychodietetic catalogue's database half — core/diet_techniques.py.

The same rules as the DBT catalogue (test_techniques.py), and the one new one:
each module's catalogue is written by that module's specialists, and the two
never show up in each other's lists.
"""

import re
from unittest import mock

from django.test import SimpleTestCase
from django.urls import reverse

from core.diet_techniques import DietTechniqueSerializer
from core.models import Technique
from core.techniques import DIET_BUILTIN_SLUGS

from .test_techniques import FRONTEND, TechniqueTestCase

DIET_DATA_TS = FRONTEND / 'data' / 'dietTechniques.ts'


class DietBuiltinSlugTests(SimpleTestCase):
    def test_it_lists_exactly_the_techniques_the_app_ships_with(self):
        source = DIET_DATA_TS.read_text(encoding='utf-8')
        declared = set(re.findall(r"^    id: '([^']+)',$", source, flags=re.MULTILINE))

        self.assertTrue(declared, 'nie sparsowano żadnego id z data/dietTechniques.ts')
        self.assertEqual(set(DIET_BUILTIN_SLUGS), declared)


class DietTechniqueTestCase(TechniqueTestCase):
    def setUp(self):
        super().setUp()
        self.specjalist.module = 'diet'
        self.specjalist.save()

    def diet_body(self, **overrides):
        body = {
            'slug': 'id-uwazne-zakupy',
            'name': 'Uważne zakupy',
            'moment': 'przed wyjściem do sklepu',
            'intro': 'O czym jest ta technika.',
            'steps': [
                {'name': 'Zatrzymaj się', 'description': 'Zrób listę.'},
                {'name': '', 'description': 'Trzymaj się jej.'},
            ],
            'example': 'Przykład: lista na lodówce.',
            'note': 'Nie chodzi o kontrolę.',
            'duration_min': 5,
        }
        body.update(overrides)
        return body

    def create_diet(self, **overrides):
        return self.client.post(
            reverse('core:specialist-diet-techniques'),
            self.diet_body(**overrides), format='json',
        )


class DietWritingTests(DietTechniqueTestCase):
    def test_a_psychodietitian_writes_a_technique_with_its_whole_structure(self):
        response = self.create_diet()

        self.assertEqual(response.status_code, 201, response.data)
        technique = Technique.objects.get()
        self.assertEqual(technique.module, 'diet')
        self.assertEqual(technique.author_id_specjalist, self.specjalist.pk)
        self.assertEqual(technique.subtitle, 'przed wyjściem do sklepu')
        self.assertEqual(technique.example, 'Przykład: lista na lodówce.')
        self.assertEqual(technique.note, 'Nie chodzi o kontrolę.')
        self.assertEqual(technique.schools, [])
        self.assertEqual(technique.steps[1], {'name': None, 'description': 'Trzymaj się jej.'})

    def test_a_slug_lost_to_a_concurrent_save_is_a_400_not_a_500(self):
        self.create_diet()
        with mock.patch.object(
            DietTechniqueSerializer, 'validate_slug', lambda self, value: value,
        ):
            response = self.create_diet(name='Inna nazwa')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['slug'], [DietTechniqueSerializer.SLUG_TAKEN])
        self.assertEqual(Technique.objects.count(), 1)

    def test_it_is_in_the_diet_catalogue_at_once_and_not_in_the_dbt_one(self):
        self.create_diet()
        patient = self.make_patient()
        self.sign_in(patient.user)

        diet = self.client.get(reverse('core:diet-technique-catalogue')).data
        dbt = self.client.get(reverse('core:technique-catalogue')).data

        self.assertEqual([row['slug'] for row in diet], ['id-uwazne-zakupy'])
        self.assertEqual(dbt, [])

    def test_a_dbt_technique_never_reaches_the_diet_catalogue(self):
        self.specjalist.module = 'psychotherapy'
        self.specjalist.save()
        self.create()

        self.assertEqual(self.client.get(reverse('core:diet-technique-catalogue')).data, [])

    def test_blank_optional_text_is_stored_as_null(self):
        self.create_diet(moment='', example='', note='', duration_min=None)

        technique = Technique.objects.get()
        self.assertIsNone(technique.subtitle)
        self.assertIsNone(technique.example)
        self.assertIsNone(technique.note)
        self.assertIsNone(technique.duration_min)

    def test_a_technique_needs_at_least_one_step_with_a_description(self):
        self.assertEqual(self.create_diet(steps=[]).status_code, 400)
        self.assertEqual(
            self.create_diet(steps=[{'name': 'X', 'description': ''}]).status_code, 400)
        self.assertFalse(Technique.objects.exists())

    def test_a_slug_cannot_shadow_a_built_in_technique_of_either_catalogue(self):
        for slug in ('halt', 'tipp'):
            with self.subTest(slug=slug):
                self.assertEqual(self.create_diet(slug=slug).status_code, 400)

    def test_a_slug_is_unique_across_both_catalogues(self):
        self.specjalist.module = 'psychotherapy'
        self.specjalist.save()
        self.create(slug='id-wspolna')
        self.specjalist.module = 'diet'
        self.specjalist.save()

        self.assertEqual(self.create_diet(slug='id-wspolna').status_code, 400)

    def test_the_payload_is_the_documented_shape_and_carries_no_author(self):
        self.create_diet()

        row = self.client.get(reverse('core:diet-technique-catalogue')).data[0]

        self.assertEqual(set(row), {
            'slug', 'id_technique', 'name', 'moment', 'intro', 'steps', 'example',
            'note', 'duration_min', 'created_at', 'updated_at',
        })

    def test_no_write_verb_exists_on_the_catalogue(self):
        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    reverse('core:diet-technique-catalogue'), {}, format='json')
                self.assertEqual(response.status_code, 405)


class DietEditingTests(DietTechniqueTestCase):
    def setUp(self):
        super().setUp()
        self.create_diet()
        self.technique = Technique.objects.get()
        self.url = reverse('core:specialist-diet-technique', args=[self.technique.pk])

    def test_the_author_can_correct_the_text(self):
        response = self.client.put(
            self.url, self.diet_body(intro='Poprawione.', note=''), format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.technique.refresh_from_db()
        self.assertEqual(self.technique.intro, 'Poprawione.')
        self.assertIsNone(self.technique.note)

    def test_the_slug_cannot_be_changed(self):
        response = self.client.put(
            self.url, self.diet_body(slug='id-inna'), format='json')

        self.assertEqual(response.status_code, 400)

    def test_a_colleague_s_technique_answers_like_a_nonexistent_one(self):
        colleague = self.make_specialist(email='kolega@example.com')
        colleague.module = 'diet'
        colleague.save()
        self.sign_in(colleague.user)

        self.assertEqual(
            self.client.put(self.url, self.diet_body(), format='json').status_code, 404)
        self.assertEqual(self.client.delete(self.url).status_code, 404)

    def test_the_panel_lists_only_own_diet_techniques(self):
        listed = self.client.get(reverse('core:specialist-diet-techniques')).data

        self.assertEqual([row['id_technique'] for row in listed], [self.technique.pk])

    def test_deleting_removes_it_from_the_catalogue(self):
        self.assertEqual(self.client.delete(self.url).status_code, 204)

        self.assertEqual(self.client.get(reverse('core:diet-technique-catalogue')).data, [])


class DietModuleTests(DietTechniqueTestCase):
    """Each module's catalogue is written by that module's specialists."""

    def test_a_psychotherapist_cannot_write_into_the_diet_catalogue(self):
        self.specjalist.module = 'psychotherapy'
        self.specjalist.save()

        self.assertEqual(self.create_diet().status_code, 403)
        self.assertEqual(
            self.client.get(reverse('core:specialist-diet-techniques')).status_code, 403)
        self.assertFalse(Technique.objects.exists())

    def test_the_dbt_endpoint_cannot_edit_a_diet_technique(self):
        self.create_diet()
        technique = Technique.objects.get()
        self.specjalist.module = 'psychotherapy'
        self.specjalist.save()
        url = reverse('core:specialist-technique', args=[technique.pk])

        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertTrue(Technique.objects.filter(pk=technique.pk).exists())

    def test_a_patient_cannot_reach_the_panel(self):
        patient = self.make_patient()
        self.sign_in(patient.user)

        self.assertEqual(
            self.client.get(reverse('core:specialist-diet-techniques')).status_code, 403)
