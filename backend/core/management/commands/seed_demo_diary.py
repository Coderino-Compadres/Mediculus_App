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
from core.drinks import BOTTLE_ML, GLASS_ML, OTHER_DRINKS, WATER
from core.meals import streak_days as diet_streak_days
from core.supplements import MAX_SUPPLEMENTS
from core.models import (Diary, DietMeal, Hydration, MoodScale, Patient,
                         Supplement, SupplementHour, SupplementIntake, User)

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

#: How many days of water and supplements get rows, today being the last.
#: Seven, because that is the window §08's "Ostatnie 7 dni" chart draws — a
#: shorter run would leave columns of the chart empty for no reason other than
#: the seed, and a longer one would write rows no screen can reach: hydration
#: has no history screen, only today and that chart.
DIET_DAYS = 7

#: How many days of *meals* get rows, today being the last.
#:
#: Longer than DIET_DAYS, and the split is the point: "Historia dzienniczków
#: żywieniowych" is the one screen in this module that looks further back than
#: a week, and it paginates at seven days a page (hooks/usePagination.ts). A
#: seed of exactly seven days is exactly one page, so the control renders
#: nothing at all — correct behaviour on the screen, and invisible on the demo,
#: which is what made the pagination look missing. Sixteen days less the gap
#: below is fifteen, i.e. three pages, so the seed shows a middle page rather
#: than only a second one.
#:
#: Raise this rather than DIET_DAYS if more history is wanted: the water figure
#: is bounded by what the chart draws, and the two are not the same question.
MEAL_DAYS = 16

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
    (('Śniadanie', '08:30', 'Kanapki z serem, w spokoju.'),
     ('Przekąska', '11:00', 'Jabłko.'),
     ('Obiad', '13:45', 'Pierogi u rodziców.'),
     ('Kolacja', '20:00', 'Sałatka.')),
    (('Obiad', '12:40', 'Zamówione na mieście, w pośpiechu.'),
     ('Kolacja', '18:50', 'Naleśniki.')),
    (('Śniadanie', '07:30', 'Jogurt z musli.'),
     ('Obiad', '14:20', 'Gulasz z kaszą.'),
     ('Przekąska', '17:00', 'Herbatniki przy pracy.'),
     ('Kolacja', '21:10', 'Kanapka, późno.')),
    (('Śniadanie', '10:15', 'Późne śniadanie, weekend.'),
     ('Obiad', '15:00', 'Pizza ze znajomymi.')),
    (('Śniadanie', '08:00', 'Chleb z awokado.'),
     ('Obiad', '13:00', 'Zupa krem i pieczywo.'),
     ('Kolacja', '19:00', 'Ryba z warzywami.')),
    ((None, None, 'Wpis demonstracyjny bez szczegółów.'),),
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
    ('Witamina D3', '2000 IU', 'raz dziennie', ('08:00',), 180, None, True),
    ('Magnez', '200 mg', 'raz dziennie', ('21:00',), 99, -7, True),
    ('Sertralina', '50 mg', 'raz dziennie, wg zaleceń lekarza', ('08:00',),
     190, None, False),
)

#: Further rows, used only when `--supplements` asks for more than the artboard
#: draws. Same seven-tuple shape.
#:
#: They exist because the list paginates at PAGE_SIZE and three rows are less
#: than half a page — the same reason MEAL_DAYS is longer than DIET_DAYS. The
#: first three stay exactly as §08 draws them, so the default seed is still the
#: artboard and nothing here changes what a reviewer sees unless they ask for
#: it. Two carry no dose and one no hour, because `name` is the only required
#: column and a seed where every row is complete hides that branch.
EXTRA_SUPPLEMENT_SHAPES = (
    ('Omega-3', '1000 mg', 'raz dziennie', ('13:00',), 140, None, True),
    ('Żelazo', '30 mg', 'co drugi dzień', ('07:30',), 60, -30, True),
    ('Witamina B12', '1000 µg', 'raz w tygodniu', ('09:00',), 210, None, False),
    # Twice a day, which is the case the hours table exists for: one position
    # on the list, two badges on its row. Seeded so the state is reachable
    # without typing it.
    ('Probiotyk', None, 'dwa razy dziennie, na czczo', ('06:45', '12:00'),
     45, None, True),
    ('Kwas foliowy', '400 µg', 'raz dziennie', ('08:15',), 120, None, False),
    ('Cynk', '15 mg', 'raz dziennie', ('20:30',), 75, None, True),
    ('Melatonina', '1 mg', 'wieczorem, w razie potrzeby', ('22:30',),
     30, None, True),
    # Three, so the row is not only ever one badge or two.
    ('Wapń', '500 mg', 'trzy razy dziennie', ('08:00', '14:00', '20:00'),
     95, None, False),
    # No hour at all — "no fixed hour", which is what zero rows means.
    ('Witamina C', '500 mg', 'raz dziennie', (), 150, None, False),
    ('Selen', None, 'wg zaleceń', ('11:30',), 20, None, False),
    ('Potas', '300 mg', 'raz dziennie', ('18:00',), 55, None, True),
    ('Koenzym Q10', '100 mg', 'raz dziennie', ('10:00',), 35, None, False),
)

#: Every preparation the seed can write, artboard first.
ALL_SUPPLEMENT_SHAPES = SUPPLEMENT_SHAPES + EXTRA_SUPPLEMENT_SHAPES


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
                 'end today, not last week — the diet screens all show today.',
        )
        parser.add_argument(
            '--no-diary', action='store_true',
            help='Skip the psychotherapy diary and write only the diet module. '
                 'The diary half REPLACES last completed week (that is what '
                 'makes it idempotent), so this is the flag to use on an '
                 'account whose entries are real: without it, a week of '
                 'somebody\'s own writing is deleted and fabricated demo text '
                 'is put in its place. With it, FLAGGED_DAYS may be left off '
                 'the address.',
        )
        parser.add_argument(
            '--meal-days', type=int, default=MEAL_DAYS, metavar='N',
            help=f'How many days of meals, ending today (default {MEAL_DAYS}). '
                 'This is the history screen\'s window and it paginates, so a '
                 'larger number is what fills more than one page.',
        )
        parser.add_argument(
            '--water-days', type=int, default=DIET_DAYS, metavar='N',
            help=f'How many days of water, ending today (default {DIET_DAYS}). '
                 'Raising it writes rows no screen can reach — hydration shows '
                 'today and a seven-day chart, and has no history screen.',
        )
        parser.add_argument(
            '--supplements', type=int, default=len(SUPPLEMENT_SHAPES),
            metavar='N',
            help='How many preparations are on the list (default '
                 f'{len(SUPPLEMENT_SHAPES)}, which is exactly what §08\'s '
                 f'artboard draws; at most {len(ALL_SUPPLEMENT_SHAPES)}).',
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

        if options['no_diary'] and options['no_diet']:
            raise CommandError(
                '--no-diary and --no-diet together leave nothing to write.'
            )

        scale = self._scale(options)

        week_start = last_completed_week_start(timezone.localdate())
        if options['no_diary']:
            self.stdout.write(
                'Dzienniczek psychoterapeutyczny: pominięty (--no-diary), '
                'istniejące wpisy zostają nietknięte.'
            )
        else:
            self.stdout.write(
                f'Tydzień: {week_start} … '
                f'{week_start + datetime.timedelta(days=DAYS_IN_WEEK - 1)}'
            )

        for target in options['targets']:
            email, flagged = self._parse(
                target, entries, bare_ok=options['no_diary'])
            if options['no_diary']:
                patient = self._patient(email)
            else:
                patient = self._seed(email, flagged, entries, week_start)
            if not options['no_diet']:
                self._seed_diet(email, patient, scale)

    def _scale(self, options):
        """How much of each thing to write, validated before anything is.

        One dict rather than four arguments threaded through: the diet half
        already takes a patient and an address, and a fifth positional would be
        the point at which a caller passes them in the wrong order.
        """
        meal_days = options['meal_days']
        water_days = options['water_days']
        supplements = options['supplements']

        if meal_days < 1:
            raise CommandError('--meal-days has to be at least 1.')
        if water_days < 1:
            raise CommandError('--water-days has to be at least 1.')
        if not 0 <= supplements <= len(ALL_SUPPLEMENT_SHAPES):
            raise CommandError(
                f'--supplements has to be between 0 and '
                f'{len(ALL_SUPPLEMENT_SHAPES)} — the seed has that many '
                'distinct preparations, and two rows with one name on a '
                'medicine list is a demo that reads as a bug. Add rows to '
                'EXTRA_SUPPLEMENT_SHAPES for more.'
            )
        # Not a limit on the seed for its own sake: MAX_SUPPLEMENTS is what the
        # API itself refuses past, so a seeded list longer than it would be a
        # state the app cannot produce and the patient cannot get back to.
        if supplements > MAX_SUPPLEMENTS:
            raise CommandError(
                f'--supplements above MAX_SUPPLEMENTS ({MAX_SUPPLEMENTS}) '
                'would seed a list the API refuses to write.'
            )
        return {
            'meal_days': meal_days,
            'water_days': water_days,
            'supplements': supplements,
        }

    def _patient(self, email):
        """The patient row, with no write of any kind — the --no-diary path."""
        user = User.objects.filter(email=email).first()
        if user is None:
            raise CommandError(f'{email}: no account on that address.')
        patient = Patient.objects.filter(user=user).first()
        if patient is None:
            raise CommandError(
                f'{email}: no `patient` row, so there is nothing to write into '
                '(a guardian or a specialist account).'
            )
        return patient

    def _parse(self, target, entries, *, bare_ok=False):
        if '=' not in target:
            if bare_ok:
                # Nothing to flag: --no-diary writes no diary entry for a
                # risky-behaviour note to go on.
                return target.strip().lower(), 0
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

    def _seed_diet(self, email, patient, scale):
        """Meals, water and a supplement list, ending today.

        Ending **today**, unlike the diary half above: every diet screen shows
        today or the last seven days, so rows in last week would leave all of
        them looking empty. There is no diet report to be a week behind for.

        Idempotent, and by replacement rather than by window: every diet row
        the patient has is deleted first, so a second run neither doubles a day
        nor leaves the tail of a longer run behind it. That takes the ticks
        with the supplements (`supplement_intake` is CASCADE).

        It is therefore destructive about the whole diet module for this
        patient, which is why the command refuses to run with DEBUG=False. The
        psychotherapy diary is the half with a narrower delete — and the half
        `--no-diary` exists to leave alone entirely.
        """
        today = timezone.localdate()
        meal_days = scale['meal_days']
        water_days = scale['water_days']

        with transaction.atomic(using='medical'):
            # The patient's diet rows are replaced WHOLE, not within the window
            # about to be written — which is what the supplement list already
            # did, and what the other two should have.
            #
            # A window cannot be made correct here: a re-run with a smaller
            # --meal-days than the run before it has to clear days the larger
            # one wrote, and nothing records how large that was. Bounding the
            # delete by the widest *default* looked right and was not — it left
            # a 40-day seed's tail sitting under a 10-day one, i.e. two runs on
            # one screen, which is exactly the state idempotence exists to
            # prevent. `test_a_smaller_run_clears_what_a_larger_one_left` is
            # that case.
            removed = DietMeal.objects.filter(
                id_medical=patient.id_medical).delete()[0]
            Hydration.objects.filter(id_medical=patient.id_medical).delete()
            Supplement.objects.filter(id_medical=patient.id_medical).delete()

            meals = self._seed_meals(patient.id_medical, today, meal_days)
            servings = self._seed_water(patient.id_medical, today, water_days)
            self._seed_supplements(
                patient.id_medical, today, scale['supplements'])

        self.stdout.write(
            f'{email}: dietetyka — {meals} posiłków w {meal_days} dniach, '
            f'{servings} wpisów nawodnienia z {water_days} dni i '
            f"{scale['supplements']} pozycji na liście leków"
            + (f' (usunięto {removed} poprzednich posiłków)' if removed else '')
        )
        self.stdout.write(
            f'  → seria w dzienniczku żywieniowym: '
            f'{diet_streak_days(patient.id_medical, today)}'
        )

    def _seed_meals(self, id_medical, today, meal_days):
        written = 0
        for offset in range(meal_days):
            day = today - datetime.timedelta(days=offset)
            # One day in the run gets nothing, so the streak stops somewhere
            # and the history screen has a gap in it — which every real diary
            # has, and which a seed of identical days would hide. Kept inside
            # the first week so the gap is on the history's first page, where
            # somebody looking at the demo actually meets it.
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

    def _seed_water(self, id_medical, today, water_days):
        """Servings, not a total: a row per glass is what the table holds.

        Written as the screen's own two buttons wherever the total divides into
        them, and one custom amount where it does not — which is what makes a
        day read "4,6 szklanki" rather than a whole number, the case the
        rounding rule exists for.

        WATER_ML_BY_DAY is **cycled** rather than sliced. It used to be
        `[:DIET_DAYS]`, which silently wrote nothing past its seventh entry —
        harmless while the window was that same constant, and a day with meals
        and no water the moment `--water-days` could exceed it.

        Returns how many rows were written, so the caller can report it rather
        than restate the arithmetic.
        """
        written = 0
        for offset in range(water_days):
            water_ml = WATER_ML_BY_DAY[offset % len(WATER_ML_BY_DAY)]
            day = today - datetime.timedelta(days=offset)
            left = water_ml
            while left >= BOTTLE_ML:
                self._serving(id_medical, day, BOTTLE_ML)
                left -= BOTTLE_ML
                written += 1
            while left >= GLASS_ML:
                self._serving(id_medical, day, GLASS_ML)
                left -= GLASS_ML
                written += 1
            if left:
                self._serving(id_medical, day, left)
                written += 1
        # Every chip the screen offers, recorded today and counting towards
        # nothing -- the client's rule, and the state the screen's own note
        # describes. All five rather than two, because the rule is easiest to
        # see broken when the list is long: if any of these ever moved the
        # water figure, a day holding all five would show it plainly.
        for drink in OTHER_DRINKS:
            Hydration.objects.create(
                id_medical=id_medical, entry_date=today, drink=drink,
                amount_ml=None,
            )
            written += 1
        return written

    def _serving(self, id_medical, day, amount_ml):
        Hydration.objects.create(
            id_medical=id_medical, entry_date=day, drink=WATER,
            amount_ml=amount_ml,
        )

    def _seed_supplements(self, id_medical, today, count):
        """§08's three rows by default, with two of the three ticked for today.

        Exactly the state the artboard draws. The third being unticked is the
        point: an absent tick is a question nobody has answered yet, not a
        record of a missed dose, and nothing in the app treats it as one. The
        proportion is kept at every size — one row in each three is left
        untouched — so a longer list does not read as a fuller one.
        """
        for index, shape in enumerate(ALL_SUPPLEMENT_SHAPES[:count]):
            name, dose, frequency, hours, started, ends_in, reminder = shape
            supplement = Supplement.objects.create(
                id_medical=id_medical,
                name=name, dose=dose, frequency=frequency,
                start_date=today - datetime.timedelta(days=started),
                end_date=(
                    today - datetime.timedelta(days=ends_in)
                    if ends_in is not None else None
                ),
                reminder_enabled=reminder,
            )
            # Zero, one or several — a preparation taken twice a day is one
            # position on the list with two hours on its row.
            SupplementHour.objects.bulk_create([
                SupplementHour(
                    supplement=supplement,
                    hour=datetime.time.fromisoformat(hour),
                )
                for hour in hours
            ])
            # One in each three left untouched today, and everything ticked
            # for the two days before -- so the table is not only ever today.
            if index % 3 != 1:
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
