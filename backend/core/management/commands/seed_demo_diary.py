"""Fill a patient's diary with demo entries, for testing screens by hand.

WHY THIS IS A COMMAND AND NOT SQL. `scripts/mock_data.sql` seeds the accounts a
fresh environment needs, by literal UUID. This writes into accounts that already
exist — ones somebody registered through the app while testing — so it has to
look a patient up by e-mail and follow `patient.id_medical` across into
medical_db. That is a join Postgres does not enforce and SQL by hand gets wrong
(see the note on the pseudonymized join in CLAUDE.md).

WHAT IT IS FOR. The guardian panel's attention marker
(`core.account.CHILD_ATTENTION_FIELD`) fires on the child's **most recent
weekly report**, and a report only exists for a week that has *ended*. So there
is no way to see that marker by using the app for five minutes: you have to have
been writing entries last week. This command writes them.

IT REFUSES TO RUN WITH DEBUG=False. What it writes is fabricated clinical
content against a named account, which is exactly the thing this project is
otherwise careful about — a mis-set DJANGO_ENV_FILE pointing at the deployment
must not be one keystroke away from putting invented self-harm notes in
somebody's record.

IT IS IDEMPOTENT PER WEEK: the entries it wrote before for that patient and that
week are deleted and rewritten, so running it twice does not produce two entries
for one day (which the app itself forbids — one entry per calendar day).
"""

import datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.account import RISKY_DAYS_FOR_ATTENTION, last_report_needs_attention
from core.diary import MOOD_LABELS
from core.models import Diary, MoodScale, Patient, User

#: The week the entries land in: the most recent one that has ended, i.e. the one
#: the newest report covers. Anything written into the current week would be
#: invisible to every report screen.
DAYS_IN_WEEK = 7

#: One plausible day, repeated with different numbers. Nothing here is a real
#: clinical record and none of it is meant to read as one — it is a shape for the
#: screens to draw.
DAY_SHAPES = (
    {'mood': 'bad', 'stress': 8, 'energy': 3, 'tension': 7,
     'sadness': 7, 'anxiety': 6, 'calm': 2},
    {'mood': 'neutral', 'stress': 5, 'energy': 5, 'tension': 4,
     'sadness': 4, 'anxiety': 3, 'calm': 5},
    {'mood': 'very_bad', 'stress': 9, 'energy': 2, 'tension': 9,
     'sadness': 8, 'anxiety': 8, 'calm': 1},
    {'mood': 'good', 'stress': 3, 'energy': 7, 'tension': 3,
     'sadness': 2, 'anxiety': 2, 'calm': 7},
    {'mood': 'bad', 'stress': 7, 'energy': 4, 'tension': 6,
     'sadness': 6, 'anxiety': 5, 'calm': 3},
    {'mood': 'neutral', 'stress': 4, 'energy': 6, 'tension': 4,
     'sadness': 3, 'anxiety': 4, 'calm': 6},
    {'mood': 'good', 'stress': 2, 'energy': 8, 'tension': 2,
     'sadness': 1, 'anxiety': 1, 'calm': 8},
)

#: Deliberately dull, and deliberately not a description of a method. A flagged
#: day is the most sensitive field in the app; demo text that reads like a real
#: note is the kind of thing that ends up in a screenshot in a client deck.
RISKY_NOTE = 'Wpis demonstracyjny — dzień oznaczony jako trudny.'
SITUATION = 'Wpis demonstracyjny.'


def last_completed_week_start(today):
    """The Monday of the most recent week that has ended, in settings.TIME_ZONE."""
    this_monday = today - datetime.timedelta(days=today.weekday())
    return this_monday - datetime.timedelta(days=DAYS_IN_WEEK)


class Command(BaseCommand):
    help = (
        'Write demo diary entries into last week for the given patients, so the '
        'weekly report (and the guardian panel\'s attention marker) has '
        'something to show. Example: seed_demo_diary maly2@wp.pl=3 '
        'najmniejszy@wp.pl=2 — the number is how many days carry a risky-'
        f'behaviour note, and the marker needs {RISKY_DAYS_FOR_ATTENTION}.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'targets', nargs='+', metavar='EMAIL=FLAGGED_DAYS',
            help='Patient address and how many of the week\'s days carry a '
                 'risky-behaviour note (0-7).',
        )
        parser.add_argument(
            '--entries', type=int, default=5,
            help='How many days of the week get an entry at all (default 5).',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                'Refusing to run with DEBUG=False: this writes fabricated '
                'clinical entries against a named account. Check which '
                'DJANGO_ENV_FILE is in effect.'
            )

        entries = options['entries']
        if not 1 <= entries <= DAYS_IN_WEEK:
            raise CommandError(f'--entries has to be between 1 and {DAYS_IN_WEEK}.')

        week_start = last_completed_week_start(timezone.localdate())
        self.stdout.write(
            f'Tydzień: {week_start} … '
            f'{week_start + datetime.timedelta(days=DAYS_IN_WEEK - 1)}'
        )

        for target in options['targets']:
            email, flagged = self._parse(target, entries)
            self._seed(email, flagged, entries, week_start)

    def _parse(self, target, entries):
        if '=' not in target:
            raise CommandError(
                f'"{target}" is not EMAIL=FLAGGED_DAYS (e.g. maly2@wp.pl=3).'
            )
        email, _, raw = target.partition('=')
        try:
            flagged = int(raw)
        except ValueError as exc:
            raise CommandError(f'"{raw}" is not a number of days.') from exc
        if not 0 <= flagged <= entries:
            raise CommandError(
                f'{email}: {flagged} flagged days does not fit in {entries} '
                f'entries — raise --entries or lower the number.'
            )
        return email.strip().lower(), flagged

    def _seed(self, email, flagged, entries, week_start):
        user = User.objects.filter(email=email).first()
        if user is None:
            raise CommandError(f'{email}: no account on that address.')
        patient = Patient.objects.filter(user=user).first()
        if patient is None:
            raise CommandError(
                f'{email}: no `patient` row, so there is no diary to write into '
                '(a guardian or a specialist account).'
            )

        week_end = week_start + datetime.timedelta(days=DAYS_IN_WEEK)
        # Both writes are medical_db, so one transaction covers them. The delete
        # is what makes re-running safe: without it a second run would put two
        # entries on one day, which the app itself does not allow.
        with transaction.atomic(using='medical'):
            existing = Diary.objects.filter(
                id_medical=patient.id_medical,
                created_at__gte=self._noon(week_start),
                created_at__lt=self._noon(week_end),
            )
            removed = existing.count()
            # MoodScale is CASCADE on the diary row, so this takes the ratings
            # with it.
            existing.delete()

            for offset in range(entries):
                shape = DAY_SHAPES[offset % len(DAY_SHAPES)]
                self._entry(
                    patient.id_medical,
                    week_start + datetime.timedelta(days=offset),
                    shape,
                    risky=offset < flagged,
                )

        marker = last_report_needs_attention(patient)
        self.stdout.write(
            f'{email}: {entries} wpisów, z tego {flagged} oznaczonych'
            + (f' (usunięto {removed} poprzednich)' if removed else '')
        )
        self.stdout.write(
            self.style.SUCCESS('  → wykrzyknik u opiekuna: TAK')
            if marker
            else f'  → wykrzyknik u opiekuna: nie (próg to {RISKY_DAYS_FOR_ATTENTION})'
        )

    def _noon(self, day):
        return timezone.make_aware(
            datetime.datetime.combine(day, datetime.time(12, 0))
        )

    def _entry(self, id_medical, day, shape, *, risky):
        diary = Diary.objects.create(
            id_medical=id_medical,
            current_mood=MOOD_LABELS[shape['mood']],
            # Derived on save by the real code path (`diary.strongest_emotion`);
            # left alone here so the dashboard falls back to the ratings below,
            # which is the same answer.
            stress_level=shape['stress'],
            energy_level=shape['energy'],
            tension_level=shape['tension'],
            situation=SITUATION,
            situation_place='Dom',
            time_of_day='evening',
            risky_behavior_note=RISKY_NOTE if risky else None,
        )
        MoodScale.objects.create(
            diary=diary,
            sadness_scale=shape['sadness'],
            anxiety_scale=shape['anxiety'],
            calm_scale=shape['calm'],
        )
        # `created_at` is auto_now_add, so the date has to be written afterwards
        # — the same two-step the tests use. It decides which calendar day (and
        # therefore which week) the entry belongs to; see core/days.py.
        Diary.objects.filter(pk=diary.pk).update(created_at=self._noon(day))
        return diary
