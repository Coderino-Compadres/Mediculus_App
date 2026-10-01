"""The JSON parser and the Polish DRF messages (core/parsers.py, core/drf_messages.py)."""

import io

from django.test import SimpleTestCase
from rest_framework import serializers
from rest_framework.exceptions import ParseError

from core.parsers import INVALID_CHARACTERS, MALFORMED, StrictJSONParser


def parse(raw: bytes):
    return StrictJSONParser().parse(io.BytesIO(raw), 'application/json', {})


class StrictJSONParserTests(SimpleTestCase):
    def test_plain_body_parses(self):
        self.assertEqual(parse('{"a": ["zażółć 🙂"]}'.encode()), {'a': ['zażółć 🙂']})

    def test_lone_surrogate_anywhere_is_refused(self):
        # A ChoiceField echoing this value into its 400 used to make the
        # renderer fail encoding it: a 500 for one character.
        for raw in (b'{"mood": "\\ud800"}', b'{"a": [{"b": "\\udfff"}]}', b'{"\\ud800": 1}'):
            with self.subTest(raw=raw), self.assertRaisesMessage(ParseError, INVALID_CHARACTERS):
                parse(raw)

    def test_malformed_json_answers_in_polish(self):
        with self.assertRaisesMessage(ParseError, MALFORMED):
            parse(b'{bad')


class PolishFieldMessagesTests(SimpleTestCase):
    def test_messages_drf_leaves_in_english_are_polish(self):
        class Probe(serializers.Serializer):
            text = serializers.CharField()
            flag = serializers.BooleanField()
            items = serializers.ListField(child=serializers.CharField(), max_length=1)

        probe = Probe(data={'text': ['a'], 'flag': 'maybe', 'items': ['a', 'b']})
        self.assertFalse(probe.is_valid())
        self.assertEqual(probe.errors['text'], ['Nieprawidłowa wartość — oczekiwano tekstu.'])
        self.assertEqual(probe.errors['flag'], ['Nieprawidłowa wartość — oczekiwano „tak” albo „nie”.'])
        self.assertEqual(probe.errors['items'], ['Lista może mieć najwyżej 1 poz.'])

    def test_own_error_messages_still_win(self):
        class Probe(serializers.Serializer):
            text = serializers.CharField(error_messages={'invalid': 'własny'})

        probe = Probe(data={'text': ['a']})
        self.assertFalse(probe.is_valid())
        self.assertEqual(probe.errors['text'], ['własny'])
