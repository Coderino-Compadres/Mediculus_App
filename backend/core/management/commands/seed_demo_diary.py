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

ONE RULE SILENCES ALL FOUR DIET DIARIES ON THE SAME DAYS (`is_silent_day`).
Each of them skips days of its own, but on different days — so with four
running, the patient turned out to have written something on every single day of
the run and the weekly report's "brak wpisu" line was unreachable from a seeded
database. An empty day is a real state of a real diary and §02 is explicit that
it "nie jest brakiem"; the demo has to be able to show one.

IT CAN ALSO WRITE THE TWO DEMO SPECIALIST ACCOUNTS (`--specialists`), one per
module, each with the seeded patient already accepted on their caseload. That
half is opt-in rather than part of the default run, and the line between them is
the line between data and credentials: everything above writes rows into an
account that already exists, while this writes an account somebody can log into,
with a password `core/colleagues.py` would never issue. See
DEMO_SPECIALIST_PASSWORD for which protections it steps over and why they do not
apply to a laptop on a projector.

WHAT IT DOES NOT SEED, because nothing can read it back: a meal photo. That
would be the first file this deployment ever stored, and where it lives, how
long it is kept and which consent covers it are all unanswered — see
`core/meals.py`.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.account import RISKY_DAYS_FOR_ATTENTION, last_report_needs_attention
from core.colleagues import SPECIALIST_ROLE
from core.consents import has_active_consents
from core.diary import MOOD_LABELS
from core.drinks import BOTTLE_ML, DEFAULT_SERVING_ML, GLASS_ML, OTHER_DRINKS, WATER
from core.meals import streak_days as diet_streak_days
from core.modules import MODULE_DIET, MODULE_PSYCHOTHERAPY, module_label
from core.specialist import accept_invitation, invite
from core.supplements import MAX_SUPPLEMENTS
from core.models import (Diary, DietActivity, DietActivityDay, DietMeal,
                         DietMealEmotion,
                         DietSleep, Hydration, MoodScale, Patient, Specjalist,
                         Supplement, SupplementHour, SupplementIntake, User,
                         UserRole)

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
#:
#: THE FOURTH ITEM IS WHAT WAS FELT at the meal: pairs of an emotion from
#: `core.emotions.EMOTIONS` and its 0-10 rating, where **None is a chip picked
#: and left unrated** — the state `diet_meal_emotion.intensity` is nullable for,
#: and one a seeded demo has to contain, or the screens' unrated branch is only
#: ever reachable by hand. Several meals carry no emotion at all, which is the
#: ordinary case §05 allows and the third branch.
#:
#: The emotions are deliberately mixed rather than uniformly bleak: this is a
#: demo of a food diary, not a portrait of a patient, and a seed where every
#: meal is 'Wstyd' would put a verdict on the module's own screens.
MEAL_SHAPES = (
    (('Śniadanie', '08:10', 'Owsianka z bananem.', (('Spokój', 6),)),
     ('Obiad', '13:30', 'Zupa i kanapka, przy biurku.', (('Stres', 7),)),
     ('Przekąska', '16:20', 'Garść orzechów.', (('Frustracja', None),))),
    (('Śniadanie', '07:50', 'Jajecznica.', ()),
     # The only 'Drugie śniadanie' in the run, and it deliberately carries no
     # chip. §11's "emocje a rodzaj posiłku" has to be able to tell a column
     # holding meals nobody named a feeling at (a measured zero) from one the
     # window holds no meal of at all (an absence, drawn as a dash) — and with
     # every kind either absent or annotated, only one of those two states
     # would be reachable from a seed. 'Podwieczorek' stays absent, so the
     # table shows both.
     ('Drugie śniadanie', '10:30', 'Jogurt naturalny.', ()),
     ('Obiad', '14:00', 'Makaron z warzywami.', (('Radość', 5),)),
     ('Kolacja', '19:30', 'Kanapki przed telewizorem.',
      (('Smutek', 4), ('Spokój', 3)))),
    (('Śniadanie', '09:00', 'Kawa i drożdżówka, w biegu.', (('Stres', 8),)),
     ('Obiad', '13:15', 'Ryż z kurczakiem.', ())),
    ((None, '22:10', 'Podjadanie wieczorem — wpis demonstracyjny.',
      (('Poczucie winy', 6), ('Bezradność', None))),
     ('Kolacja', None, 'Zupa z torebki, nie pamiętam o której.', ())),
    (('Śniadanie', '08:30', 'Kanapki z serem, w spokoju.', (('Spokój', 8),)),
     ('Przekąska', '11:00', 'Jabłko.', ()),
     ('Obiad', '13:45', 'Pierogi u rodziców.', (('Radość', 7),)),
     ('Kolacja', '20:00', 'Sałatka.', (('Spokój', 5),))),
    (('Obiad', '12:40', 'Zamówione na mieście, w pośpiechu.', (('Lęk', 3),)),
     ('Kolacja', '18:50', 'Naleśniki.', (('Radość', 6),))),
    (('Śniadanie', '07:30', 'Jogurt z musli.', ()),
     ('Obiad', '14:20', 'Gulasz z kaszą.', (('Spokój', 4),)),
     ('Przekąska', '17:00', 'Herbatniki przy pracy.',
      (('Frustracja', 5), ('Wstyd', None))),
     ('Kolacja', '21:10', 'Kanapka, późno.', (('Złość', 2),))),
    (('Śniadanie', '10:15', 'Późne śniadanie, weekend.', (('Spokój', 9),)),
     ('Obiad', '15:00', 'Pizza ze znajomymi.', (('Radość', 9),))),
    (('Śniadanie', '08:00', 'Chleb z awokado.', (('Spokój', 6),)),
     ('Obiad', '13:00', 'Zupa krem i pieczywo.', ()),
     ('Kolacja', '19:00', 'Ryba z warzywami.', (('Radość', 4),))),
    ((None, None, 'Wpis demonstracyjny bez szczegółów.', ()),),
)

#: Days the whole diet module stays silent on, as an offset from today.
#:
#: **"brak wpisu" HAS TO BE REACHABLE.** Each diary already skips days of its
#: own — a day with no meal, a day nobody logged a walk on, a day at 0 ml — but
#: those gaps fall on different days, so with four diaries running the patient
#: turns out to have written *something* on every single day of the run. The
#: weekly report then never draws its empty-day line and never draws an unfilled
#: day chip, and §02's rule that an empty day "nie jest brakiem" is a rule the
#: demo cannot show.
#:
#: Single days, never a whole week: a week nobody wrote in has no report at all
#: (`core.diet_reports.build_diet_reports` skips it), which would read as a hole
#: in the archive rather than as a quiet week. Every 23rd day is well inside
#: that.
#:
#: The first one is deliberately close to today, so somebody opening the demo
#: meets a quiet day on the history's first page rather than four pages in.
SILENT_DAY_INTERVAL = 23
SILENT_DAY_FIRST = 4


def is_silent_day(offset):
    """True for a day the whole diet module leaves empty. See SILENT_DAY_INTERVAL."""
    return offset % SILENT_DAY_INTERVAL == SILENT_DAY_FIRST


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

#: One day of §09, by the day's position in the run: what was done, the step
#: count, and the night that ended that morning.
#:
#: DELIBERATELY RAGGED. Two of the six days hold no activity at all, because
#: most people do not move every day and a seed that said otherwise would make
#: the screen read as a target — which is the one thing §09 must not do. One day
#: carries a step count and nothing else, which is the state `diet_activity_day`
#: exists for (a number belonging to the day rather than to any walk in it), and
#: one night is left undescribed so the report's "nie wpisano" branch is
#: reachable without hand-writing a row.
#:
#: Nothing here is measured: no calories, no intensity, no pace. The tuples are
#: (hour, kind, minutes, feeling after) and (asleep, woke, quality, awakenings,
#: waking feeling) — exactly the columns, and no others.
ACTIVITY_SHAPES = (
    {
        'activities': (('07:10', 'Joga', 25, 'better'),),
        'steps': 6400,
        'night': ('23:20', '06:45', 4, 0, 'rested'),
    },
    {
        'activities': (('18:30', 'Spacer', 45, 'better'),),
        'steps': 9100,
        'night': ('00:15', '07:30', 2, 2, 'heavy'),
    },
    {
        # A day nobody moved on. The step count still says what the day was.
        'activities': (),
        'steps': 3200,
        'night': ('22:50', '06:20', 5, 0, 'calm'),
    },
    {
        'activities': (
            ('08:00', 'Rower', 40, 'neutral'),
            ('20:15', 'Spacer', 20, 'better'),
        ),
        'steps': None,
        'night': ('23:55', '05:50', 2, 1, 'tense'),
    },
    {
        'activities': (('17:45', 'Basen', 60, 'better'),),
        'steps': 7300,
        # A night nobody answered for -- an ordinary gap, and the branch the
        # report renders as "nie wpisano".
        'night': None,
    },
    {
        'activities': (),
        'steps': None,
        'night': ('23:10', '07:10', 3, 1, 'rested'),
    },
)


#: The password every demo specialist account is given.
#:
#: **A FIXED, KNOWN CREDENTIAL — WHICH IS THE ONE THING `core/colleagues.py`
#: DELIBERATELY REFUSES TO PRODUCE**, and the reason this whole section sits
#: behind an opt-in flag on a command that will not run with DEBUG=False.
#:
#: A real specialist account is created with a *generated* password and is then
#: held on the password form until its owner replaces it
#: (`must_change_password`, see the header of core/colleagues.py), because what
#: such an account opens onto is other people's clinical records. None of that
#: reasoning survives contact with a demo: the account is opened in front of a
#: room by whoever is presenting, so the credential has to be typeable off a
#: slide — and everything it can reach was fabricated by this same command.
#:
#: So the three gates a real account meets are all stepped over here on purpose,
#: and each one is set explicitly in `_seed_specialists` rather than left to a
#: default, so that a reader can see which protection is being waived and why.
DEMO_SPECIALIST_PASSWORD = 'Haslo123!'

#: The two accounts, one per module.
#:
#: ONE SPECIALIST PER MODULE RATHER THAN ONE DOING BOTH, because that is the
#: arrangement the app is built around and the only one that shows it: since
#: migration 0022 `specjalist_patient.module` lets a patient have a
#: psychotherapist *and* a psychodietitian at once, and §13 of the diet mockups
#: draws both, told apart by a coloured dot. A single account holding both
#: relationships would demo a screen the product does not have.
#:
#: The addresses follow the seeded patient's own shape (`test@wp.pl`) so that a
#: presenter reads them off the slide without a second convention to remember.
#: Nothing looks these up by anything but the address, so renaming one here is
#: the whole change.
DEMO_SPECIALISTS = (
    {
        'email': 'psycholog@wp.pl',
        'name': 'Anna',
        'surname': 'Zielińska',
        'date_of_birth': datetime.date(1984, 4, 18),
        'specialization': 'Psychoterapia',
        'module': MODULE_PSYCHOTHERAPY,
    },
    {
        'email': 'dietetyk@wp.pl',
        'name': 'Marek',
        'surname': 'Lewandowski',
        'date_of_birth': datetime.date(1987, 9, 2),
        'specialization': 'Psychodietetyka',
        'module': MODULE_DIET,
    },
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
        f'behaviour note, and the marker needs {RISKY_DAYS_FOR_ATTENTION}. '
        'Add --specialists to also create the two demo specialist accounts '
        'and put every seeded patient on both caseloads.'
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
            '--specialists', action='store_true',
            help='Also create the two demo specialist accounts (one per '
                 'module) with a fixed, known password and put every seeded '
                 'patient on both caseloads, already accepted. OFF BY DEFAULT '
                 'and opt-in on purpose: this writes accounts somebody can log '
                 'into, which is a larger act than writing diary rows, and the '
                 'password it sets is one core/colleagues.py refuses to create.',
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

        # ...unless the specialists are what is being asked for. Linking an
        # account that already has its diaries is a real errand — the two demo
        # specialists arrived after the patient did — and refusing it would
        # only push somebody into re-seeding a week they did not want touched.
        if options['no_diary'] and options['no_diet'] and not options['specialists']:
            raise CommandError(
                '--no-diary and --no-diet together leave nothing to write '
                '(add --specialists to write only the specialist accounts).'
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
            if options['specialists']:
                self._seed_specialists(email, patient)

    def _seed_specialists(self, email, patient):
        """The two demo specialist accounts, with `patient` accepted on both.

        WHY THE LINK IS MADE THROUGH `core/specialist.py` RATHER THAN BY WRITING
        THE ROW. `invite` + `accept_invitation` are the two functions the app
        itself runs when a specialist asks and a patient agrees, so what this
        leaves behind is a state the product can actually reach — including the
        part that is easy to forget: accepting replaces whoever was accepted in
        that module, which the database also insists on
        (`uniq_patient_module_accepted`). A hand-written INSERT would have hit
        that constraint the first time this ran against a patient who already
        had a specialist, which on a shared dev database is most of them.

        Both functions are idempotent, so re-running this is re-running it: the
        invitation is fetched rather than duplicated and an already-accepted
        relationship keeps the moment it was accepted, instead of the seed
        quietly moving the date every time somebody prepares a demo.

        WHAT IS OVERWRITTEN ON AN EXISTING ACCOUNT, and it is worth knowing
        before pointing this at an address somebody is using: the name, the
        surname, the date of birth, the specialization and — the one that
        matters — the password. That is the point of the flag (a demo account
        whose password nobody remembers is not a demo account), but it also
        means these addresses must stay demo addresses.

        WHAT IS NOT OVERWRITTEN: a consent register that is already in force.
        Consents are only granted here when they are not currently held, and a
        withdrawal is never erased — a fresh grant dated now is exactly how
        `core/consents.py` restores one, so the record of both events survives.
        """
        role = UserRole.objects.filter(name=SPECIALIST_ROLE).first()
        now = timezone.now()

        for shape in DEMO_SPECIALISTS:
            with transaction.atomic(using='default'):
                user = User.objects.filter(email=shape['email']).first()
                created = user is None
                if user is None:
                    user = User(email=shape['email'])

                user.name = shape['name']
                user.surname = shape['surname']
                user.date_of_birth = shape['date_of_birth']
                # `user_role` is a nullable column looked up by name from data
                # mock_data.sql seeds, and nothing authorizes on it — a database
                # without the row yields `role: null` rather than a failure, so
                # a missing row is not worth stopping a demo for.
                if role is not None:
                    user.user_role = role

                # The three waivers, spelled out. See DEMO_SPECIALIST_PASSWORD.
                user.password_hash = make_password(DEMO_SPECIALIST_PASSWORD)
                user.must_change_password = False
                if not has_active_consents(user):
                    user.data_consent_at = now
                    user.services_consent_at = now

                user.save()

                specjalist, _ = Specjalist.objects.update_or_create(
                    user=user,
                    defaults={'specjalization': shape['specialization']},
                )
                link = invite(specjalist, patient, shape['module'])
                accept_invitation(patient, link.pk)

            self.stdout.write(
                f'{shape["email"]}: {"utworzono" if created else "zaktualizowano"} '
                f'konto specjalisty ({shape["specialization"]}) — moduł '
                f'„{module_label(shape["module"])}", pacjent {email} przypisany '
                f'i zaakceptowany.'
            )

        self.stdout.write(
            f'  → hasło do obu kont: {DEMO_SPECIALIST_PASSWORD} '
            '(konta demonstracyjne, bez wymuszonej zmiany hasła)'
        )

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
        """Meals, water, a supplement list, activities and nights — ending today.

        Ending **today**, unlike the diary half above: every diet screen shows
        today or the last seven days, so rows in last week would leave all of
        them looking empty.

        THE WEEKLY REPORT (§10) IS THE ONE THAT LOOKS FURTHER BACK, and it is
        fed by the same rows rather than by a window of its own: a diet week is
        seven days from the patient's first entry, so `MEAL_DAYS` of history
        yields two completed weeks and the list has something in it. Those weeks
        are what makes §05's "najczęstsze emocje przy jedzeniu" visible at all —
        a report covers a week that has *ended*, so the chips on today's meals
        are in no report yet, and only the ones further back are.

        **`patient.diet_week_start` IS CLEARED, AND IT HAS TO BE.** The anchor is
        written once and then never moved (`core/diet_reports.latch_week_start`)
        — deliberately, because an anchor that drifted would renumber every
        report a real patient has, and with it every bookmark. This command
        deletes every diet row the patient has and writes a fresh run ending
        today, so an anchor latched by an earlier run is stale *by
        construction*: the weeks would be counted from a day that no longer
        holds an entry, and the reports would be cut at boundaries matching
        nothing in the seed. Clearing it lets the module re-latch from the
        earliest row it just wrote, which is the path a new account takes too.

        NULL rather than a date computed here, so the rule stays owned by the
        one function that owns it and this command does not acquire a second
        opinion about where a diet week starts.

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
            # `.delete()` answers with a *total* across every model it touched,
            # and deleting a meal cascades to its emotion chips — so the plain
            # `[0]` counted 320 meals and 261 chips as "581 posiłków" in a line
            # a person reads. The per-model breakdown is the second element;
            # `.get` because a run with nothing to delete has no key for it.
            removed = DietMeal.objects.filter(
                id_medical=patient.id_medical).delete()[1].get(
                    DietMeal._meta.label, 0)
            Hydration.objects.filter(id_medical=patient.id_medical).delete()
            Supplement.objects.filter(id_medical=patient.id_medical).delete()
            DietActivity.objects.filter(id_medical=patient.id_medical).delete()
            DietActivityDay.objects.filter(id_medical=patient.id_medical).delete()
            DietSleep.objects.filter(id_medical=patient.id_medical).delete()

            meals = self._seed_meals(patient.id_medical, today, meal_days)
            servings = self._seed_water(patient.id_medical, today, water_days)
            self._seed_supplements(
                patient.id_medical, today, scale['supplements'])
            moves, nights = self._seed_activity_and_sleep(
                patient.id_medical, today, meal_days)

        # Outside the `medical` transaction on purpose: `patient` lives in the
        # `default` database, and wrapping a write to one database in the
        # other's atomic block buys nothing — the two cannot commit together
        # anyway (CLAUDE.md: the join across them is logical only). Re-latching
        # is idempotent and happens on the next read of /api/diet/reports/.
        patient.diet_week_start = None
        patient.save(update_fields=['diet_week_start'])

        self.stdout.write(
            f'{email}: dietetyka — {meals} posiłków w {meal_days} dniach, '
            f'{servings} wpisów nawodnienia z {water_days} dni, '
            f"{scale['supplements']} pozycji na liście leków, "
            f'{moves} aktywności i {nights} nocy'
            + (f' (usunięto {removed} poprzednich posiłków)' if removed else '')
        )
        self.stdout.write(
            f'  → seria w dzienniczku żywieniowym: '
            f'{diet_streak_days(patient.id_medical, today)}'
        )

    def _seed_activity_and_sleep(self, id_medical, today, days):
        """§09's two diaries, over the same window the meals cover.

        The same window rather than `DIET_DAYS`, because unlike hydration these
        two *are* reachable further back: the weekly report lists them day by
        day, so a run as long as the meals' is what makes a report look like a
        week somebody lived rather than one they only ate in.

        SHAPED RATHER THAN UNIFORM, like the meals: not every day has an
        activity (most people do not move every day, and a seed that said
        otherwise would make the screen read as a target), one day carries a
        step count and no activity at all — the state `diet_activity_day`
        exists for — and one night is left undescribed, so the report's "nie
        wpisano" branch is reachable from a seed.

        Returns how many of each were written, so the caller reports rather than
        restates the arithmetic.
        """
        moves = 0
        nights = 0
        for offset in range(days):
            # The quiet days, shared with the meals and the water so that a day
            # left empty is empty in all four diaries — see SILENT_DAY_INTERVAL.
            if is_silent_day(offset):
                continue
            day = today - datetime.timedelta(days=offset)
            shape = ACTIVITY_SHAPES[offset % len(ACTIVITY_SHAPES)]

            for hour, kind, minutes, feeling in shape['activities']:
                DietActivity.objects.create(
                    id_medical=id_medical,
                    entry_date=day,
                    logged_at=datetime.time.fromisoformat(hour),
                    kind=kind,
                    duration_minutes=minutes,
                    feeling_after=feeling,
                )
                moves += 1

            if shape['steps'] is not None:
                DietActivityDay.objects.create(
                    id_medical=id_medical, entry_date=day, steps=shape['steps'],
                )

            night = shape['night']
            if night is not None:
                asleep, woke, quality, awakenings, feeling = night
                DietSleep.objects.create(
                    id_medical=id_medical,
                    entry_date=day,
                    fell_asleep_at=datetime.time.fromisoformat(asleep),
                    woke_up_at=datetime.time.fromisoformat(woke),
                    quality=quality,
                    awakenings=awakenings,
                    wake_feeling=feeling,
                )
                nights += 1

        return moves, nights

    def _seed_meals(self, id_medical, today, meal_days):
        written = 0
        for offset in range(meal_days):
            day = today - datetime.timedelta(days=offset)
            # The quiet days, which every real diary has and a seed of
            # identical days hides. It used to be `offset == 4` alone — one gap
            # in the whole run, and only in the meals, so the other three
            # diaries filled that day in and the report still had nothing
            # empty to draw. `is_silent_day` is shared by all four.
            if is_silent_day(offset):
                continue
            for kind, hour, text, feelings in MEAL_SHAPES[offset % len(MEAL_SHAPES)]:
                meal = DietMeal.objects.create(
                    id_medical=id_medical,
                    entry_date=day,
                    kind=kind,
                    eaten_at=datetime.time.fromisoformat(hour) if hour else None,
                    description=text,
                )
                # `intensity` straight from the shape, None included: a chip
                # picked and left unrated is a state the screens render
                # differently, so a seed that turned it into a 0 would hide the
                # branch it exists to show.
                DietMealEmotion.objects.bulk_create([
                    DietMealEmotion(meal=meal, emotion=name, intensity=rating)
                    for name, rating in feelings
                ])
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
            if is_silent_day(offset):
                continue
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
        # Every chip the screen offers, recorded today. They carry a size like
        # any other serving and count towards the goal -- the client reversed
        # §08's "nie przeliczane na wodę" on 2026-09-17, and `add_entry` writes
        # `DEFAULT_SERVING_ML` for a chip tapped without a quantity.
        #
        # THE `amount_ml=None` THEY USED TO GET WAS WHAT THE APP WROTE THEN, and
        # leaving it would have seeded rows the app can no longer produce: the
        # hydration screen would show five drinks under a bar none of them
        # moved, which is the old rule surviving in the demo data alone. All
        # five rather than two, because a day holding all of them shows plainly
        # whether they count.
        for drink in OTHER_DRINKS:
            Hydration.objects.create(
                id_medical=id_medical, entry_date=today, drink=drink,
                amount_ml=DEFAULT_SERVING_ML,
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
