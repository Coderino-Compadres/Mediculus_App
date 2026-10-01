"""The project's own password validators, next to Django's in AUTH_PASSWORD_VALIDATORS.

Validators rather than serializer checks, so every path that sets a password —
registration, the profile form, the reset link, `manage.py create_admin` — is
covered by naming them once in settings: all of them go through
`core.serializers.check_password_strength`, which is `validate_password`.
"""

from django.contrib.auth.password_validation import UserAttributeSimilarityValidator
from django.core.exceptions import ValidationError


class NotBlankPasswordValidator:
    """Refuses a password made of whitespace alone.

    The serializers keep `trim_whitespace=False` on purpose — a space is a
    legitimate character inside a password — so their 'blank' check only
    catches the empty string, and eight spaces passed every Django validator
    (long enough, not on the common list, not numeric, like nobody's name).
    """

    MESSAGE = 'Hasło nie może składać się wyłącznie ze spacji.'

    def validate(self, password, user=None):
        if not password.strip():
            raise ValidationError(self.MESSAGE, code='password_blank')

    def get_help_text(self):
        return 'Hasło nie może składać się wyłącznie ze spacji.'


class PolishUserAttributeSimilarityValidator(UserAttributeSimilarityValidator):
    """Django's similarity check, naming the attribute in Polish.

    Django builds the message from the model field's `verbose_name`, which for
    core.User is the bare column name — "Hasło jest zbyt podobne do name." Setting
    `verbose_name` on the fields would fix it too, but would also put a
    migration on a model whose initial migration is faked against
    database_setup.sql; naming them here costs nothing.

    The check itself is Django's, run one attribute at a time so the refusal
    knows which one matched.
    """

    #: Genitive, because the sentence is "zbyt podobne do …".
    ATTRIBUTE_NAMES = {
        'email': 'adresu e-mail',
        'name': 'imienia',
        'surname': 'nazwiska',
    }

    def validate(self, password, user=None):
        for attribute_name in self.user_attributes:
            single = UserAttributeSimilarityValidator(
                user_attributes=(attribute_name,),
                max_similarity=self.max_similarity,
            )
            try:
                single.validate(password, user)
            except ValidationError as exc:
                raise ValidationError(
                    self.get_error_message(),
                    code='password_too_similar',
                    params={
                        'verbose_name': self.ATTRIBUTE_NAMES.get(
                            attribute_name, attribute_name,
                        ),
                    },
                ) from exc

    def get_error_message(self):
        return 'Hasło jest zbyt podobne do %(verbose_name)s.'
