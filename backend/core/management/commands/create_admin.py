"""`python manage.py create_admin <email>` — make an account an administrator.

THE ONLY WAY ONE IS MADE. No endpoint creates an `administrator` row, for the
reason core/colleagues.py gives about the first specialist: an endpoint that
could mint the first administrator could mint the tenth. This runs from the
server's shell, which is a stronger credential than any session.

Two shapes:

* the address has no account yet — one is created, with the password typed at
  the prompt (or `--password`, for scripts), and `--name`/`--surname`;
* the address has an account — it is granted the panel, and nothing else about
  it changes.

AN ADMINISTRATOR IS NOBODY ELSE. An account that is a patient, a specialist or
a guardian is refused: the panel shows every account in user_db, and a patient
or a specialist holding it would be reading their own care's other side.

THE CONSENTS ARE NOT GRANTED HERE, for the reason core/colleagues.py spells out:
consent is its owner's act (RODO art. 7), so the new administrator meets the
consent screen at first login like every other account. The password is the
owner's own — typed by whoever runs this — so `must_change_password` stays
FALSE.
"""

import getpass

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import ValidationError

from core.admin_panel import ADMIN_ROLE, GUARDIAN_ROLE
from core.models import Administrator, Patient, Specjalist, User, UserRole
from core.serializers import check_password_strength


class Command(BaseCommand):
    help = 'Nadaje kontu (albo tworzy konto z) uprawnienia administratora.'

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--name', default='')
        parser.add_argument('--surname', default='')
        parser.add_argument(
            '--password',
            help='Hasło nowego konta. Bez tej opcji komenda zapyta o nie.',
        )

    def handle(self, *args, email, name, surname, password, **options):
        email = email.strip().lower()
        user = User.objects.filter(email__iexact=email).first()

        if user is not None:
            self._refuse_other_roles(user)
            if Administrator.objects.filter(user=user).exists():
                self.stdout.write(f'{email}: już jest administratorem.')
                return
            with transaction.atomic(using='default'):
                user.user_role = self._role()
                user.save(update_fields=['user_role', 'updated_at'])
                Administrator.objects.create(user=user)
            self.stdout.write(f'{email}: nadano uprawnienia administratora.')
            return

        if password is None:
            password = getpass.getpass('Hasło: ')
            if password != getpass.getpass('Powtórz hasło: '):
                raise CommandError('Hasła się różnią.')
        candidate = User(email=email, name=name, surname=surname)
        try:
            check_password_strength(password, candidate)
        except ValidationError as exc:
            raise CommandError(' '.join(str(m) for m in exc.detail)) from exc

        with transaction.atomic(using='default'):
            user = User.objects.create(
                user_role=self._role(),
                email=email,
                password_hash=make_password(password),
                name=name or None,
                surname=surname or None,
            )
            Administrator.objects.create(user=user)
        self.stdout.write(
            f'{email}: utworzono konto administratora. Zgody RODO właściciel '
            'konta udzieli przy pierwszym logowaniu.'
        )

    @staticmethod
    def _role():
        role, _ = UserRole.objects.get_or_create(name=ADMIN_ROLE)
        return role

    @staticmethod
    def _refuse_other_roles(user):
        if Patient.objects.filter(user=user).exists():
            raise CommandError('To konto pacjenta — administrator musi mieć osobne konto.')
        if Specjalist.objects.filter(user=user).exists():
            raise CommandError('To konto specjalisty — administrator musi mieć osobne konto.')
        if user.user_role_id and user.user_role.name == GUARDIAN_ROLE:
            raise CommandError('To konto opiekuna — administrator musi mieć osobne konto.')
