"""Serializers for the authentication endpoints.

Field names on the wire are snake_case and mirror the columns in `core.models`;
the frontend maps its camelCase form state onto them in `src/api/auth.ts`.
"""

import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from .models import Patient, User, UserRole

# The role every self-service registration gets. Specialists and guardians are
# created by the organization, not through the public form. Matches the row
# seeded by scripts/mock_data.sql.
PATIENT_ROLE_NAME = 'patient'


class UserSerializer(serializers.ModelSerializer):
    """The shape of the logged-in user as the frontend sees it."""

    id = serializers.UUIDField(source='id_user', read_only=True)
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'surname', 'date_of_birth', 'role']
        read_only_fields = fields

    def get_role(self, user):
        # user_role is nullable in the schema, so a user without one is valid.
        return user.user_role.name if user.user_role_id else None


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(
        max_length=255,
        error_messages={
            'blank': 'Podaj adres e-mail.',
            'required': 'Podaj adres e-mail.',
            'invalid': 'Podaj poprawny adres e-mail.',
        },
    )
    password = serializers.CharField(
        write_only=True, trim_whitespace=False,
        error_messages={'blank': 'Podaj hasło.', 'required': 'Podaj hasło.'},
    )
    password_confirm = serializers.CharField(
        write_only=True, trim_whitespace=False,
        error_messages={'blank': 'Potwierdź hasło.', 'required': 'Potwierdź hasło.'},
    )
    name = serializers.CharField(
        max_length=150,
        error_messages={'blank': 'Podaj imię.', 'required': 'Podaj imię.'},
    )
    surname = serializers.CharField(
        max_length=150,
        error_messages={'blank': 'Podaj nazwisko.', 'required': 'Podaj nazwisko.'},
    )
    data_consent = serializers.BooleanField(
        write_only=True,
        error_messages={'required': 'Zgoda na przetwarzanie danych jest wymagana, aby założyć konto.'},
    )
    services_consent = serializers.BooleanField(
        write_only=True,
        error_messages={'required': 'Zgoda na usługi fundacji jest wymagana, aby założyć konto.'},
    )

    def validate_email(self, value):
        # Stored lowercased (see create()), which is what makes the plain unique
        # index on "user".email behave case-insensitively.
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Konto z tym adresem e-mail już istnieje.')
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate_data_consent(self, value):
        if not value:
            raise serializers.ValidationError(
                'Zgoda na przetwarzanie danych jest wymagana, aby założyć konto.'
            )
        return value

    def validate_services_consent(self, value):
        if not value:
            raise serializers.ValidationError(
                'Zgoda na usługi fundacji jest wymagana, aby założyć konto.'
            )
        return value

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password_confirm'):
            raise serializers.ValidationError(
                {'password_confirm': 'Hasła nie są identyczne.'}
            )
        return attrs

    def create(self, validated_data):
        now = timezone.now()
        role = UserRole.objects.filter(name=PATIENT_ROLE_NAME).first()

        # Both writes land in user_db, so one transaction covers them. Nothing
        # here touches medical_db — patient.id_medical is generated locally and
        # only referenced from there (see CLAUDE.md on the pseudonymized join).
        try:
            with transaction.atomic(using='default'):
                user = User.objects.create(
                    user_role=role,
                    email=validated_data['email'],
                    password_hash=make_password(validated_data['password']),
                    name=validated_data['name'],
                    surname=validated_data['surname'],
                    data_consent_at=now,
                    services_consent_at=now,
                )
                # is_child is left NULL on purpose: the form collects no date of
                # birth, so "minor or not" is genuinely unknown at this point.
                Patient.objects.create(user=user)
        except IntegrityError as exc:
            # validate_email lost a race with a concurrent signup for the same
            # address; the unique index is the actual arbiter.
            raise serializers.ValidationError(
                {'email': ['Konto z tym adresem e-mail już istnieje.']}
            ) from exc
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(
        error_messages={
            'blank': 'Podaj adres e-mail.',
            'required': 'Podaj adres e-mail.',
            'invalid': 'Podaj poprawny adres e-mail.',
        },
    )
    password = serializers.CharField(
        write_only=True, trim_whitespace=False,
        error_messages={'blank': 'Podaj hasło.', 'required': 'Podaj hasło.'},
    )

    # Deliberately not "no such user" vs "wrong password": either message would
    # let anyone enumerate who has an account here, which for a mental-health
    # service is itself sensitive information.
    INVALID_CREDENTIALS = 'Nieprawidłowy e-mail lub hasło.'

    def validate(self, attrs):
        user = (
            User.objects.select_related('user_role')
            .filter(email=attrs['email'].lower())
            .first()
        )

        if not _password_matches(attrs['password'], user.password_hash if user else None):
            raise serializers.ValidationError({'detail': self.INVALID_CREDENTIALS})

        attrs['user'] = user
        return attrs


_unmatchable_hash = None


def _get_unmatchable_hash():
    """A real, valid hash of a secret nobody knows.

    Verifying against it costs the same as verifying a genuine password, which is
    the point: an unknown e-mail must not answer faster than a known one, or the
    response time alone tells an attacker who has an account here.
    """
    global _unmatchable_hash
    if _unmatchable_hash is None:
        _unmatchable_hash = make_password(uuid.uuid4().hex)
    return _unmatchable_hash


def _password_matches(raw_password, encoded):
    """`check_password` that survives every non-hash a row might hold.

    Rows seeded by scripts/mock_data.sql carry the literal
    'mock_hash_placeholder', which makes `check_password` raise ValueError rather
    than return False.
    """
    if not encoded:
        return check_password(raw_password, _get_unmatchable_hash())
    try:
        return check_password(raw_password, encoded)
    except ValueError:
        # Unrecognised algorithm prefix — a password nobody can match.
        check_password(raw_password, _get_unmatchable_hash())
        return False
