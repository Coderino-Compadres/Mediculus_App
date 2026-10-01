"""Polish wording for the DRF field messages its own Polish catalogue lacks.

DRF ships `pl` translations, but not for every msgid: "Not a valid string.",
"Must be a valid boolean.", the list-length messages and a few others reach the
API in English, and some of the translated ones read badly ("nie więcej niż
1 cyfr dziesiętnych", "otrzymano  list" with the type name and a double space).
Forms show the first field error verbatim, so these are what a patient reads.

The defaults are class attributes that every field instance merges in
`Field.__init__`, so replacing them once at start-up covers every serializer —
a field that sets its own `error_messages` still wins.
"""

from rest_framework import serializers

MESSAGES = {
    serializers.CharField: {
        'invalid': 'Nieprawidłowa wartość — oczekiwano tekstu.',
        'surrogate_characters_not_allowed': 'Tekst zawiera nieprawidłowe znaki.',
    },
    serializers.BooleanField: {
        'invalid': 'Nieprawidłowa wartość — oczekiwano „tak” albo „nie”.',
    },
    serializers.ListField: {
        'min_length': 'Lista musi mieć co najmniej {min_length} poz.',
        'max_length': 'Lista może mieć najwyżej {max_length} poz.',
    },
    serializers.ListSerializer: {
        'min_length': 'Lista musi mieć co najmniej {min_length} poz.',
        'max_length': 'Lista może mieć najwyżej {max_length} poz.',
    },
    serializers.DictField: {
        'not_a_dict': 'Nieprawidłowe dane — oczekiwano obiektu.',
        'empty': 'To pole nie może być puste.',
    },
    serializers.Serializer: {
        'invalid': 'Nieprawidłowe dane — oczekiwano obiektu.',
    },
    serializers.DecimalField: {
        'max_digits': 'Liczba ma za dużo cyfr (najwyżej {max_digits}).',
        'max_decimal_places': 'Za dużo cyfr po przecinku (najwyżej {max_decimal_places}).',
        'max_whole_digits': 'Liczba jest za duża (najwyżej {max_whole_digits} cyfr przed przecinkiem).',
    },
    serializers.UUIDField: {
        'invalid': 'Nieprawidłowy identyfikator.',
    },
}


def install():
    for field_class, messages in MESSAGES.items():
        # Copied, not mutated in place: a subclass that inherited the dict object
        # itself (rather than defining its own) must not be changed by accident.
        field_class.default_error_messages = {**field_class.default_error_messages, **messages}
