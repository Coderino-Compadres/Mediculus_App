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

IT ALSO SEEDS THE DIET MODULE, and that half is on a different clock. The diary
entries go into last *completed* week because that is the only week a report
exists for; the diet screens all show **today** and the last seven days
(§02's home, §07's history, §08's hydration chart and supplement list), so
seeding them into last week would leave every one of them empty. So the diet
rows run from six days ago to today. `--no-diet` turns that half off for
somebody who only wants the report.

WHAT IT DOES NOT SEED, because nothing can read it back: a meal photo. That
would be the first file this deployment ever stored, and where it lives, how
long it is kept and which consent covers it are all unanswered — see
`core/meals.py`.
"""

import datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.account import RISKY_DAYS_FOR_ATTENTION, last_report_needs_attention
from core.diary import MOOD_LABELS
from core.drinks import BOTTLE_ML, GLASS_ML, WATER
from core.meals import streak_days as diet_streak_days
from core.models import (Diary, DietMeal, Hydration, MoodScale, Patient,
                         Supplement, SupplementIntake, User)

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

#: How many days of the diet module get rows, today being the last. Seven,
#: because that is the window §08's "Ostatnie 7 dni" chart draws — a shorter run
#: would leave columns of the chart empty for no reason other than the seed.
DIET_DAYS = 7

#: One day of meals, repeated with different text. Deliberately dull, and
#: deliberately free of any quantity: §04 states the module's scope outright
#: ("nie liczy jedzenia — opisuje je"), so a demo meal that named grams would be
#: seeding a field the module does not have.
#:
#: The last day's shape carries the two cases §05's "no field blocks a save"
#: rule makes possible — a meal with no kind and one with no hour — so the
#: history screen's own branches are reachable from a seeded database rather
#: than only from a hand-written row.
MEAL_SHAPES = (
    (('Śniadanie', '08:10', 'Owsianka z bananem.'),
     ('Obiad', '13:30', 'Zupa i kanapka, przy biurku.'),
     ('Przekąska', '16:20', 'Garść orzechów.')),
    (('Śniadanie', '07:50', 'Jajecznica.'),
     ('Obiad', '14:00', 'Makaron z warzywami.'),
     ('Kolacja', '19:30', 'Kanapki przed telewizorem.')),
    (('Śniadanie', '09:00', 'Kawa i drożdżówka, w biegu.'),
     ('Obiad', '13:15', 'Ryż z kurczakiem.')),
    ((None, '22:10', 'Podjadanie wieczorem — wpis demonstracyjny.'),
     ('Kolacja', None, 'Zupa z torebki, nie pamiętam o której.')),
)

#: Water per day, in millilitres, today first. Some days under the goal and some
#: over it, because the one thing §08 is explicit about is that the goal is "punkt
#: odniesienia, nie ocena" — a seed where every day met it would make the screen
#: look like it rewards that.
WATER_ML_BY_DAY = (1150, 1750, 500, 1000, 0, 1250, 750)

#: The three preparations §08's artboard draws, with its own wording. The medicine's
#: end date is the doctor's call, which goes in `frequency` because there is no
#: column for it and `frequency` is free text.
SUPPLEMENT_SHAPES = (
    ('Witamina D3', '2000 IU', 'raz dziennie', '08:00', 180, None, True),
    ('Magnez', '200 mg', 'raz dziennie', '21:00', 99, -7, True),
    ('Sertralina', '50 mg', 'raz dziennie, wg zaleceń lekarza', '08:00', 190, None, False),
)


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
        parser.add_argument(
            '--no-diet', action='store_true',
            help='Skip the diet module (meals, water, supplements). Its rows '
                 'cover the last seven days ending today, not last week — the '
                 'diet screens all show today.',
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
            patient = self._seed(email, flagged, entries, week_start)
            if not options['no_diet']:
                self._seed_diet(email, patient)

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
        return patient

    def _seed_diet(self, email, patient):
        """Meals, water and a supplement list for the last seven days.

        Ending **today**, unlike the diary half above: every diet screen shows
        today or the last seven days, so rows in last week would leave all of
        them looking empty. There is no diet report to be a week behind for.

        Idempotent the same way — the rows it finds in that window are deleted
        first, so a second run does not double a day. The supplement list is
        replaced whole rather than added to, which also takes its ticks
        (`supplement_intake` is CASCADE).
        """
        today = timezone.localdate()
        first = today - datetime.timedelta(days=DIET_DAYS - 1)

        with transaction.atomic(using='medical'):
            removed = DietMeal.objects.filter(
                id_medical=patient.id_medical,
                entry_date__gte=first, entry_date__lte=today,
            ).delete()[0]
            Hydration.objects.filter(
                id_medical=patient.id_medical,
                entry_date__gte=first, entry_date__lte=today,
            ).delete()
            Supplement.objects.filter(id_medical=patient.id_medical).delete()

            meals = self._seed_meals(patient.id_medical, today)
            self._seed_water(patient.id_medical, today)
            self._seed_supplements(patient.id_medical, today)

        self.stdout.write(
            f'{email}: dietetyka — {meals} posiłków w {DIET_DAYS} dniach, '
            f'nawodnienie i {len(SUPPLEMENT_SHAPES)} pozycje na liście leków'
            + (f' (usunięto {removed} poprzednich posiłków)' if removed else '')
        )
        self.stdout.write(
            f'  → seria w dzienniczku żywieniowym: '
            f'{diet_streak_days(patient.id_medical, today)}'
        )

    def _seed_meals(self, id_medical, today):
        written = 0
        for offset in range(DIET_DAYS):
            day = today - datetime.timedelta(days=offset)
            # One day in the run gets nothing, so the streak stops somewhere
            # and the history screen has a gap in it — which every real diary
            # has, and which a seed of seven identical days would hide.
            if offset == 4:
                continue
            for kind, hour, text in MEAL_SHAPES[offset % len(MEAL_SHAPES)]:
                DietMeal.objects.create(
                    id_medical=id_medical,
                    entry_date=day,
                    kind=kind,
                    eaten_at=datetime.time.fromisoformat(hour) if hour else None,
                    description=text,
                )
                written += 1
        return written

    def _seed_water(self, id_medical, today):
        """Servings, not a total: a row per glass is what the table holds.

        Written as the screen's own two buttons wherever the total divides into
        them, and one custom amount where it does not — which is what makes a
        day read "4,6 szklanki" rather than a whole number, the case the
        rounding rule exists for.
        """
        for offset, water_ml in enumerate(WATER_ML_BY_DAY[:DIET_DAYS]):
            day = today - datetime.timedelta(days=offset)
            left = water_ml
            while left >= BOTTLE_ML:
                self._serving(id_medical, day, BOTTLE_ML)
                left -= BOTTLE_ML
            while left >= GLASS_ML:
                self._serving(id_medical, day, GLASS_ML)
                left -= GLASS_ML
            if left:
                self._serving(id_medical, day, left)
        # One tea and one coffee today, recorded and counting towards nothing --
        # the client's rule, and the state the screen's own note describes.
        for drink in ('Herbata', 'Kawa'):
            Hydration.objects.create(
                id_medical=id_medical, entry_date=today, drink=drink,
                amount_ml=None,
            )

    def _serving(self, id_medical, day, amount_ml):
        Hydration.objects.create(
            id_medical=id_medical, entry_date=day, drink=WATER,
            amount_ml=amount_ml,
        )

    def _seed_supplements(self, id_medical, today):
        """§08's three rows, with two of the three ticked off for today.

        Exactly the state the artboard draws. The third being unticked is the
        point: an absent tick is a question nobody has answered yet, not a
        record of a missed dose, and nothing in the app treats it as one.
        """
        for index, shape in enumerate(SUPPLEMENT_SHAPES):
            name, dose, frequency, hour, started, ends_in, reminder = shape
            supplement = Supplement.objects.create(
                id_medical=id_medical,
                name=name, dose=dose, frequency=frequency,
                hour=datetime.time.fromisoformat(hour),
                start_date=today - datetime.timedelta(days=started),
                end_date=(
                    today - datetime.timedelta(days=ends_in)
                    if ends_in is not None else None
                ),
                reminder_enabled=reminder,
            )
            # The middle one left untouched today, and all three ticked for the
            # two days before -- so the table is not only ever today.
            if index != 1:
                SupplementIntake.objects.create(
                    supplement=supplement, entry_date=today)
            for back in (1, 2):
                SupplementIntake.objects.create(
                    supplement=supplement,
                    entry_date=today - datetime.timedelta(days=back),
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
