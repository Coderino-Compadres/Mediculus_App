"""Serializers for the authentication endpoints.

Field names on the wire are snake_case and mirror the columns in `core.models`;
the frontend maps its camelCase form state onto them in `src/api/auth.ts`.
"""

import datetime
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from . import guardian
from .consents import SCOPES, consent_state, has_active_consents
from .models import ParentChild, Patient, User, UserRole

# What the registration form's "account type" choice means in the schema. Role
# names match the rows seeded by scripts/mock_data.sql; a specialist account is
# still created by the organization, not through the public form.
#
# A guardian gets no `patient` row at all: they are not a clinical subject, so
# they have no id_medical and nothing in medical_db can refer to them.
ACCOUNT_TYPE_PATIENT = 'patient'
ACCOUNT_TYPE_MINOR_PATIENT = 'minor_patient'
ACCOUNT_TYPE_PARENT = 'parent'

ACCOUNT_TYPES = {
    ACCOUNT_TYPE_PATIENT: {'role': 'patient', 'is_child': False},
    ACCOUNT_TYPE_MINOR_PATIENT: {'role': 'patient', 'is_child': True},
    ACCOUNT_TYPE_PARENT: {'role': 'rodzic', 'is_child': None},
}

# The one role a `parent_child.id_parent` may point at. Read from ACCOUNT_TYPES
# rather than spelled again, so the registration form and the linking form can
# never disagree about what a guardian account is.
GUARDIAN_ROLE = ACCOUNT_TYPES[ACCOUNT_TYPE_PARENT]['role']

# Rejects typos and swapped digits ('0202-05-14').
EARLIEST_DATE_OF_BIRTH = datetime.date(1900, 1, 1)

# Where "małoletni" stops. Named rather than inlined because it is a policy
# decision, not a fact — RODO art. 8 uses 16 for consent to digital services,
# so this may well need revisiting per what the foundation decides.
ADULT_AGE = 18


def age_on(date_of_birth, today):
    """Full years completed by `today`.

    Compares (month, day) tuples rather than dividing by 365.25: the naive
    version puts someone born on 29 February a day out in non-leap years.
    """
    had_birthday_this_year = (today.month, today.day) >= (date_of_birth.month, date_of_birth.day)
    return today.year - date_of_birth.year - (0 if had_birthday_this_year else 1)


class UserSerializer(serializers.ModelSerializer):
    """The shape of the logged-in user as the frontend sees it."""

    id = serializers.UUIDField(source='id_user', read_only=True)
    role = serializers.SerializerMethodField()
    is_patient = serializers.SerializerMethodField()
    consents = serializers.SerializerMethodField()
    is_child = serializers.SerializerMethodField()
    guardian_status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name', 'surname', 'date_of_birth', 'role',
            'is_patient', 'is_child', 'guardian_status',
            # The consent register the profile screen reads back, and the gate
            # the router reads. One key, not five: `data_consent_at` and
            # `services_consent_at` used to ride alongside it as declared model
            # fields, which meant the same instant reached the browser twice in
            # two renderings — DRF puts declared DateTimeFields in
            # settings.TIME_ZONE and the method field's raw values in UTC. A
            # screen compared the two as strings and read a withdrawn consent as
            # active. Both halves are fixed (see `get_consents`), and the
            # duplicate is gone so the mistake has nowhere to come back from.
            'consents',
        ]
        read_only_fields = fields

    def get_role(self, user):
        # user_role is nullable in the schema, so a user without one is valid.
        return user.user_role.name if user.user_role_id else None

    def _patient(self, user):
        """The `patient` row behind this user, looked up once per serialization.

        Two fields need it and one of them calls the other, so without the cache
        this was three queries — on the endpoint the frontend hits at every app
        start and after every 403. Keyed by user rather than a plain attribute
        because a serializer instance can be reused across a list.
        """
        if not hasattr(self, '_patients'):
            self._patients = {}
        if user.pk not in self._patients:
            self._patients[user.pk] = Patient.objects.filter(user=user).first()
        return self._patients[user.pk]

    def get_consents(self, user):
        """Both consents, each with when it was granted, when withdrawn, and
        whether it currently holds.

        The frontend gates on `active` and shows the dates, so all three travel
        rather than a single boolean: a screen offering a consent back has to be
        able to say when it was given and when it was withdrawn, and deriving
        that from two nullable timestamps in the browser would be a second copy
        of the comparison in core/consents.py.
        """
        # Rendered through DRF's own DateTimeField rather than handed over as
        # raw datetimes. A SerializerMethodField's return value goes to the JSON
        # encoder untouched, which writes UTC with a 'Z'; the declared fields
        # above go through DRF and come out in settings.TIME_ZONE with a
        # '+02:00' offset. Two renderings of the same instant in one payload is
        # not merely untidy — it cost a real bug: `ConsentsRequired` compared
        # `withdrawn_at` against `data_consent_at` as *strings*, and
        # '…T10:…Z' <= '…T12:…+02:00' is true, so a withdrawn consent read as
        # active and the screen offered no way to restore it.
        moment = serializers.DateTimeField()
        state = consent_state(user)
        return {
            'active': has_active_consents(user),
            **{
                name: {
                    'granted_at': moment.to_representation(value['granted_at'])
                    if value['granted_at'] else None,
                    'withdrawn_at': moment.to_representation(value['withdrawn_at'])
                    if value['withdrawn_at'] else None,
                    'active': value['active'],
                }
                for name, value in state.items()
            },
        }

    def get_is_patient(self, user):
        """Whether a `patient` row exists — `_require_patient`'s first check.

        Its own field rather than something the frontend infers, because the
        obvious inference is wrong: `is_child` is None both for an account with
        no patient row *and* for a patient row that never answered the question
        (nullable column, and mock_data.sql predates it being set). Reading
        `is_child !== null` would therefore hide the profile's counters from a
        patient the backend happily serves.
        """
        return self._patient(user) is not None

    def get_is_child(self, user):
        # None means either "not a patient at all" (a guardian) or a patient row
        # that never answered — `is_patient` above is what tells the two apart.
        # Read off the patient row rather than derived from date_of_birth.
        patient = self._patient(user)
        return patient.is_child if patient else None

    def get_guardian_status(self, user):
        """'none', 'pending' or 'accepted' — where this account's link stands.

        None for everyone the question does not apply to — an adult patient, a
        guardian, a specialist — so the frontend blocks only the accounts that
        are genuinely stuck: a minor whose consent to process health data is not
        valid on its own (RODO art. 8). Only 'accepted' unblocks the app: a
        named guardian who has not answered has consented to nothing.
        """
        if self.get_is_child(user) is not True:
            return None
        return guardian.guardian_status(user)


def check_password_strength(password, user):
    """Django's own validators, run with the user they need to be worth anything.

    `validate_password(password)` — no second argument — is what this used to be,
    and it quietly disabled one of the four configured validators:
    `UserAttributeSimilarityValidator.validate()` returns immediately when `user`
    is None, so a password identical to the account's own e-mail address passed
    registration. Nothing about the call looked wrong, which is why it survived;
    the only way to see it is from the outside, by registering with one.

    `user` may be unsaved — at registration there is no row yet, and the
    validator only reads attributes off it. Which attributes is set in
    AUTH_PASSWORD_VALIDATORS' OPTIONS, because core.User has `name`/`surname`
    rather than Django's `first_name`/`last_name`.

    Raises DRF's ValidationError with the messages as a list, so the caller can
    put them under whichever field submitted the password.
    """
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc


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
    date_of_birth = serializers.DateField(
        error_messages={
            'required': 'Podaj datę urodzenia.',
            'null': 'Podaj datę urodzenia.',
            'invalid': 'Podaj poprawną datę urodzenia.',
        },
    )
    account_type = serializers.ChoiceField(
        choices=sorted(ACCOUNT_TYPES), write_only=True,
        error_messages={
            'required': 'Wybierz rodzaj konta.',
            'invalid_choice': 'Wybierz jedną z dostępnych opcji rodzaju konta.',
        },
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

    def validate_date_of_birth(self, value):
        # localdate(), not utcnow(): "today" has to mean today where the person
        # filling the form is, or someone born today is rejected for a few hours.
        if value > timezone.localdate():
            raise serializers.ValidationError('Data urodzenia nie może być z przyszłości.')
        if value < EARLIEST_DATE_OF_BIRTH:
            raise serializers.ValidationError('Sprawdź datę urodzenia — wygląda na literówkę.')
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

        self._check_password_strength(attrs)
        self._check_age_matches_account_type(attrs)
        return attrs

    def _check_password_strength(self, attrs):
        """Here rather than in a `validate_password` method, and that is the fix.

        A field-level validator sees only its own value, so the similarity check
        had nothing to compare the password against (see
        `check_password_strength`). By the time `validate()` runs, `attrs` holds
        the address and the name the account is being created with, which is
        exactly what that check needs.

        Re-raised under 'password' so the message still lands on the input that
        produced it — `REGISTER_FIELDS` in src/api/auth.ts maps it back.
        """
        password = attrs.get('password')
        # Absent when the field itself failed (blank); that error is the one to
        # report, not a strength complaint about nothing.
        if not password:
            return
        try:
            check_password_strength(password, User(
                email=attrs.get('email'),
                name=attrs.get('name'),
                surname=attrs.get('surname'),
            ))
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'password': exc.detail}) from exc

    def _check_age_matches_account_type(self, attrs):
        """The declared account type has to agree with the date of birth.

        Without this, `patient.is_child` could say one thing while
        `user.date_of_birth` says the opposite — and whichever of the two a later
        feature happens to trust, some of the records would be wrong. Raised as a
        non-field error because the conflict belongs to the pair, not to either
        input on its own.
        """
        account_type = attrs.get('account_type')
        date_of_birth = attrs.get('date_of_birth')
        # Absent when the field itself failed; that error is the one to report.
        if not account_type or not date_of_birth:
            return

        expects_minor = ACCOUNT_TYPES[account_type]['is_child']
        if expects_minor is None:  # a guardian; see the note in ACCOUNT_TYPES
            return

        is_adult = age_on(date_of_birth, timezone.localdate()) >= ADULT_AGE
        if not expects_minor and not is_adult:
            raise serializers.ValidationError(
                'Podana data urodzenia oznacza osobę niepełnoletnią. Wybierz '
                '„konto pacjenta małoletniego” albo popraw datę urodzenia.'
            )
        if expects_minor and is_adult:
            raise serializers.ValidationError(
                'Podana data urodzenia oznacza osobę pełnoletnią. Wybierz '
                '„konto pacjenta” albo popraw datę urodzenia.'
            )

    def create(self, validated_data):
        now = timezone.now()
        account = ACCOUNT_TYPES[validated_data['account_type']]
        # Looked up by name because user_role is seeded by SQL, not by a
        # migration: a database without the row yields role=None, not a failure.
        role = UserRole.objects.filter(name=account['role']).first()

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
                    date_of_birth=validated_data['date_of_birth'],
                    data_consent_at=now,
                    services_consent_at=now,
                )
                if account['is_child'] is not None:
                    Patient.objects.create(user=user, is_child=account['is_child'])
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


class PasswordChangeSerializer(serializers.Serializer):
    """Changes the signed-in account's password. POST /api/account/password/.

    THE CURRENT PASSWORD IS ASKED FOR AGAIN, and checked here rather than only in
    the browser. A live session is not proof that the person holding it is the
    account owner — a phone left unlocked on a table is the ordinary case, not an
    exotic one — and the whole value of this field is that taking an account over
    needs the password and not just the device. `PasswordChangeThrottle` bounds
    how often it can be guessed.

    IT IS NOT VALIDATED FOR STRENGTH, only for presence. Rows seeded by
    mock_data.sql, and accounts created before the 8-character rule, hold
    passwords that would fail today's validators — running them through would
    put "min. 8 znaków" under *Obecne hasło* and leave those accounts unable to
    submit the form at all, which is the one outcome a password-change screen
    must not produce. Whether the password is right is this serializer's
    judgement, not the field's. src/components/ProfilePasswordForm.tsx makes the
    same call for the same reason.

    The new password goes through Django's validators *with the user*, so it can
    be refused for resembling the account's own e-mail or name — see
    `check_password_strength`.
    """

    current_password = serializers.CharField(
        write_only=True, trim_whitespace=False,
        error_messages={
            'blank': 'Podaj obecne hasło.', 'required': 'Podaj obecne hasło.',
        },
    )
    new_password = serializers.CharField(
        write_only=True, trim_whitespace=False,
        error_messages={'blank': 'Podaj nowe hasło.', 'required': 'Podaj nowe hasło.'},
    )
    new_password_confirm = serializers.CharField(
        write_only=True, trim_whitespace=False,
        error_messages={'blank': 'Powtórz nowe hasło.', 'required': 'Powtórz nowe hasło.'},
    )

    WRONG_CURRENT_PASSWORD = 'Obecne hasło jest nieprawidłowe.'
    SAME_AS_CURRENT = 'Nowe hasło musi różnić się od obecnego.'

    @property
    def user(self):
        return self.context['user']

    def validate_current_password(self, value):
        # Unlike login, naming which half is wrong leaks nothing: the caller is
        # already signed in as this account, so they know it exists.
        if not _password_matches(value, self.user.password_hash):
            raise serializers.ValidationError(self.WRONG_CURRENT_PASSWORD)
        return value

    def validate(self, attrs):
        if attrs.get('new_password') != attrs.get('new_password_confirm'):
            raise serializers.ValidationError(
                {'new_password_confirm': 'Hasła nie są identyczne.'}
            )

        # A request-level error rather than a field one: blaming either input for
        # the two being equal would be arbitrary, and the frontend renders
        # `detail` above the form for exactly this case.
        if (
            attrs.get('new_password')
            and attrs['new_password'] == attrs.get('current_password')
        ):
            raise serializers.ValidationError({'detail': self.SAME_AS_CURRENT})

        if attrs.get('new_password'):
            try:
                check_password_strength(attrs['new_password'], self.user)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({'new_password': exc.detail}) from exc
        return attrs

    def save(self):
        """Writes the new hash, and nothing else.

        Other sessions of this account deliberately survive. Django's usual
        answer (`update_session_auth_hash`) invalidates them because its sessions
        carry a hash of the password; ours carry `core_user_id` and nothing more
        (see core/authentication.py), so there is no hash to go stale. Signing
        the other devices out is a real feature — the one you want after "I think
        somebody knows my password" — but it needs a way to enumerate an
        account's sessions, which this deployment does not have, and doing half
        of it silently would be worse than not claiming it.
        """
        self.user.password_hash = make_password(self.validated_data['new_password'])
        self.user.save(update_fields=['password_hash', 'updated_at'])
        return self.user


class ConsentScopeSerializer(serializers.Serializer):
    """Which consent a withdrawal or a restore covers.

    'all' is a scope of its own rather than two requests: consenting to both was
    one gesture on the registration form, and art. 7(3) asks for withdrawal to
    be no harder than that.
    """

    scope = serializers.ChoiceField(
        choices=sorted(SCOPES),
        error_messages={
            'required': 'Wskaż, której zgody dotyczy decyzja.',
            'invalid_choice': 'Nieznany zakres zgody.',
        },
    )


class GuardianLinkSerializer(serializers.Serializer):
    """Invites a guardian, named by e-mail, to vouch for the signed-in minor.

    The address has to belong to an account whose role is `rodzic`. Any other
    account is refused with the same message as an address nobody registered:
    both are statements about somebody else's account, the child can act on
    neither, and telling the two apart would turn this form into a way to ask
    "does this person have an account here, and what kind" — which for a
    mental-health service is itself sensitive.

    Sending this creates nothing but a request: the row lands with
    `accepted_at` NULL and the child stays blocked until the guardian answers it
    on their own home screen. The guardian is never told anything about the
    child's diary by being asked — only who is asking.

    `context['child']` is the `core.User` from the session; there is no child id
    on the wire, so a request can only ever invite on behalf of the account
    making it.
    """

    guardian_email = serializers.EmailField(
        max_length=255,
        error_messages={
            'blank': 'Podaj adres e-mail rodzica lub opiekuna.',
            'required': 'Podaj adres e-mail rodzica lub opiekuna.',
            'invalid': 'Podaj poprawny adres e-mail.',
        },
    )

    NOT_A_GUARDIAN = 'Nie znaleziono konta rodzica lub opiekuna z tym adresem.'
    OWN_ADDRESS = 'To Twój własny adres. Podaj adres konta rodzica lub opiekuna.'
    ALREADY_LINKED = 'Twoje konto jest już powiązane z kontem opiekuna.'
    ALREADY_INVITED = (
        'Zaproszenie czeka już na odpowiedź innego opiekuna. Anuluj je, jeśli '
        'chcesz podać inny adres.'
    )

    def validate_guardian_email(self, value):
        # Addresses are stored lowercased by registration, so this is what makes
        # the lookup below case-insensitive.
        return value.lower()

    def validate(self, attrs):
        child = self.context['child']
        guardian = (
            User.objects.select_related('user_role')
            .filter(email=attrs['guardian_email'])
            .first()
        )

        # Before the role check, so typing your own address gets an answer you
        # can act on rather than the deliberately vague one below. Mirrors the
        # `parent_child_not_self` constraint.
        if guardian is not None and guardian.pk == child.pk:
            raise serializers.ValidationError({'guardian_email': self.OWN_ADDRESS})

        # Both of these describe the *child's own* account, so they are checked
        # before anything is said about the address — and that ordering is the
        # point, not a detail. The other way round, a child who already had a
        # link got ALREADY_INVITED for a `rodzic` address and NOT_A_GUARDIAN for
        # anything else, which is exactly the "does this person have an account
        # here, and what kind" oracle the shared message exists to prevent. Now
        # every address answers the same once there is a link, whatever it is.
        existing = ParentChild.objects.filter(child=child)
        # An accepted link is final as far as this form goes: a child who has a
        # guardian does not get to swap them, and families with two guardians
        # need the parent panel to add the second one deliberately.
        if existing.filter(accepted_at__isnull=False).exists():
            raise serializers.ValidationError({'guardian_email': self.ALREADY_LINKED})
        # One pending invitation at a time, so a child cannot fish for whichever
        # adult answers first. Re-sending it to the *same* guardian is the same
        # answer arriving twice (a double-clicked button, a retried request) and
        # goes through — `create` is idempotent. `guardian` is None for an
        # address nobody registered, and `exclude(parent=None)` then keeps every
        # pending row, which is what makes an unknown address answer like any
        # other while one is outstanding.
        if existing.exclude(parent=guardian).exists():
            raise serializers.ValidationError({'guardian_email': self.ALREADY_INVITED})

        role = guardian.user_role.name if guardian and guardian.user_role_id else None
        if role != GUARDIAN_ROLE:
            raise serializers.ValidationError({'guardian_email': self.NOT_A_GUARDIAN})

        attrs['guardian'] = guardian
        return attrs

    def create(self, validated_data):
        # accepted_at stays NULL: this is the invitation, not the link.
        link, _ = ParentChild.objects.get_or_create(
            parent=validated_data['guardian'], child=self.context['child'],
        )
        return link
