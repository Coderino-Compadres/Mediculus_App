"""The JSON parser every API view uses.

Python's `json` accepts `"\\ud800"` — a lone UTF-16 surrogate — and hands back a
str that cannot be encoded as UTF-8. CharFields refuse it, but a ChoiceField
echoes the bad value into its 400 ("… nie jest poprawnym wyborem"), and the
renderer then dies encoding that message: a 500 for one malformed character.
Refusing such a body here, before any serializer sees it, closes the whole class.
"""

from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser

INVALID_CHARACTERS = 'Żądanie zawiera nieprawidłowe znaki.'
#: DRF's own says "JSON parse error - <the decoder's English>".
MALFORMED = 'Nieprawidłowy format danych.'


def _has_lone_surrogate(value) -> bool:
    if isinstance(value, str):
        try:
            value.encode('utf-8')
        except UnicodeEncodeError:
            return True
        return False
    if isinstance(value, dict):
        return any(_has_lone_surrogate(k) or _has_lone_surrogate(v) for k, v in value.items())
    if isinstance(value, list):
        return any(_has_lone_surrogate(item) for item in value)
    return False


class StrictJSONParser(JSONParser):
    def parse(self, stream, media_type=None, parser_context=None):
        try:
            data = super().parse(stream, media_type, parser_context)
        except ParseError:
            raise ParseError(MALFORMED) from None
        if _has_lone_surrogate(data):
            raise ParseError(INVALID_CHARACTERS)
        return data
