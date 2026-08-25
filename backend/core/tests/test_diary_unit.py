"""Unit tests for the pieces of `core.diary` that need no database.

`test_diary_api.py` covers the endpoint end to end; this file pins the decisions
underneath it — which emotion counts as the strongest, how a mood label survives
the round trip to `current_mood` and back, and what an empty text box means.
"""

from django.test import SimpleTestCase

from core.diary import (MAX_LEVEL, MIN_LEVEL, MOOD_LABELS, MOOD_VALUES,
                        RATING_ORDER, SCALE_COLUMNS, _blank_to_none,
                        strongest_emotion)
from core.emotions import EMOTIONS, MOOD_SCALE_EMOTIONS, STRES


class StrongestEmotionTests(SimpleTestCase):
    def test_the_highest_rating_wins(self):
        ratings = {'Lęk': 7, 'Złość': 9, 'Wstyd': 2}

        self.assertEqual(strongest_emotion(ratings), 'Złość')

    def test_stress_competes_even_though_it_is_not_in_mood_scale(self):
        self.assertEqual(strongest_emotion({'Smutek': 4, STRES: 8}), STRES)

    def test_a_tie_is_broken_by_rating_order_not_by_dict_order(self):
        """Two dicts with the same pairs in different insertion order must agree."""
        first = strongest_emotion({'Smutek': 6, 'Lęk': 6})
        second = strongest_emotion({'Lęk': 6, 'Smutek': 6})

        self.assertEqual(first, second)
        # RATING_ORDER puts anxiety ahead of sadness, mirroring MOOD_SCALE_EMOTIONS.
        self.assertEqual(first, 'Lęk')

    def test_the_tie_break_matches_what_the_dashboard_would_infer(self):
        # dashboard._ratings sorts by value with a stable sort over
        # MOOD_SCALE_EMOTIONS, then appends stress. If the two orders diverge,
        # the stored emotion and the charted one disagree for tied entries.
        expected = tuple(emotion for _, emotion in MOOD_SCALE_EMOTIONS) + (STRES,)

        self.assertEqual(RATING_ORDER, expected)

    def test_a_zero_still_counts_as_an_answer(self):
        # Picking a chip and rating it 0 is not the same as never picking it.
        self.assertEqual(strongest_emotion({'Wstyd': 0}), 'Wstyd')

    def test_nothing_rated_is_no_strongest_emotion(self):
        self.assertIsNone(strongest_emotion({}))

    def test_an_emotion_outside_the_vocabulary_is_ignored_rather_than_chosen(self):
        self.assertEqual(strongest_emotion({'zmęczenie': 10, 'Lęk': 1}), 'Lęk')

    def test_every_emotion_the_form_offers_can_be_the_strongest(self):
        for emotion in EMOTIONS:
            with self.subTest(emotion=emotion):
                self.assertEqual(strongest_emotion({emotion: 5}), emotion)


class MoodLabelTests(SimpleTestCase):
    def test_there_are_five_levels_and_they_round_trip(self):
        self.assertEqual(len(MOOD_LABELS), 5)
        for value, label in MOOD_LABELS.items():
            with self.subTest(value=value):
                self.assertEqual(MOOD_VALUES[label.casefold()], value)

    def test_the_stored_value_is_the_label_the_patient_saw(self):
        # The dashboard renders `current_mood` straight into the UI, so a row
        # reading 'very_good' would surface as "Very_good".
        self.assertEqual(MOOD_LABELS['very_good'], 'Bardzo dobrze')
        self.assertEqual(MOOD_LABELS['very_bad'], 'Bardzo źle')

    def test_reading_back_ignores_case(self):
        self.assertEqual(MOOD_VALUES['bardzo dobrze'], 'very_good')
        self.assertEqual(MOOD_VALUES['BARDZO DOBRZE'.casefold()], 'very_good')

    def test_a_word_the_form_never_wrote_has_no_value(self):
        # mock_data.sql seeds 'dobry'/'neutralny', which are not the form's labels.
        self.assertNotIn('dobry', MOOD_VALUES)
        self.assertNotIn('neutralny', MOOD_VALUES)

    def test_no_two_levels_share_a_label(self):
        self.assertEqual(len(set(MOOD_LABELS.values())), len(MOOD_LABELS))


class BlankToNoneTests(SimpleTestCase):
    def test_an_empty_box_becomes_null(self):
        for value in ('', '   ', '\t\n'):
            with self.subTest(value=repr(value)):
                self.assertIsNone(_blank_to_none(value))

    def test_null_stays_null(self):
        self.assertIsNone(_blank_to_none(None))

    def test_real_text_is_trimmed_but_kept(self):
        self.assertEqual(_blank_to_none('  Coś napisanego  '), 'Coś napisanego')

    def test_inner_whitespace_is_left_alone(self):
        # Only the edges are ours to tidy; a therapist's note is not.
        self.assertEqual(_blank_to_none(' dwa   słowa '), 'dwa   słowa')


class ScaleColumnTests(SimpleTestCase):
    def test_every_scale_column_maps_back_to_its_emotion(self):
        for column, emotion in MOOD_SCALE_EMOTIONS:
            with self.subTest(column=column):
                self.assertEqual(SCALE_COLUMNS[emotion], column)

    def test_stress_deliberately_has_no_scale_column(self):
        self.assertNotIn(STRES, SCALE_COLUMNS)

    def test_the_rating_range_is_the_one_the_sliders_use(self):
        self.assertEqual((MIN_LEVEL, MAX_LEVEL), (0, 10))
