"""What `scripts/mock_data.sql` has to *contain* for the diet screens to show.

NOT A SCHEMA TEST — `test_schema_sync.py` already checks that the seed inserts
into columns that exist. This checks the arithmetic of the dates in it, which no
schema check can see and which nothing else would catch until somebody opened
the demo and found an empty card.

**THE FAILURE THIS EXISTS FOR.** §10's report covers a diet week that has
*ended*, and a diet week is seven days counted from the patient's first entry
(not a Monday). The seed's emotions used to stop three days back — all of them
inside the week still in progress — so every report the demo could open had an
empty "Najczęstsze emocje przy jedzeniu" while the meal screens looked fully
seeded. Nothing was broken; the data simply never reached the screen, which is
the kind of gap a demo is supposed to close.

**THE SEED HAS TWO DIET BLOCKS AND THEY ARE CHECKED DIFFERENTLY.** The
hand-written one (the most recent 25 days) is row-by-row, each row there for a
reason somebody can read, and it is parsed and checked in detail below. The
generated one behind it is *volume* — around 300 meals over 120 days, built from
a rotation — and its rows cannot be parsed, so what is checked there is the
generator's contract: that it abuts the hand-written block, that it carries the
`fe` prefix its idempotence depends on, and that it silences every diary on the
same days.

It parses the file rather than loading it, so it runs without a database — the
same trade `test_schema_sync.py` makes, and the same limit: this checks what the
seed says, not that Postgres accepted it.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from core.diet_reports import DAYS_IN_DIET_WEEK
from core.emotions import EMOTIONS
from core.meals import MEAL_KINDS

MOCK_SQL = Path(__file__).resolve().parent.parent.parent.parent / 'scripts' / 'mock_data.sql'

#: `hooks/usePagination.ts`, restated rather than imported because it lives in
#: the frontend. What it is used for here is a floor on how much history the
#: seed holds, not a claim about the control.
REPORTS_PER_PAGE = 7

#: Every generated row's UUID starts with this. It is what lets the generated
#: block be deleted and rewritten on a re-run without touching a row somebody
#: entered through the app, which keeps a random UUID.
#:
#: **ITS LENGTH IS THE POINT.** A two-character marker collides with a random
#: UUID once in 256, and on a real development database `LIKE 'fe%'` already
#: matched three rows nobody generated — so the delete would eventually take
#: somebody's own entry with it. Eight characters puts that at one in four
#: billion. Shortening this is not a tidy-up.
GENERATED_PREFIX = 'fe5eed00'

#: The tables the generated block writes. Each one has to be cleared by prefix
#: before it is rewritten, or a re-run stacks a second run's dates on the first.
GENERATED_TABLES = (
    ('diet_meal', 'id_meal'),
    ('hydration', 'id_hydration'),
    ('diet_activity', 'id_activity'),
    ('diet_activity_day', 'id_activity_day'),
    ('diet_sleep', 'id_sleep'),
)

#: One row of the `diet_meal` INSERT: its id, how many days back it is, the kind
#: and the hour. `CURRENT_DATE` with no arithmetic after it is today, i.e. 0.
_MEAL_ROW = re.compile(
    r"\('(f1[0-9a-f-]+)',\s*'c0[0-9a-f-]+',\s*"
    r"CURRENT_DATE(?:\s*-\s*(\d+))?\s*,\s*"
    r"(NULL|'[^']*')\s*,\s*"
    r"(NULL|'[^']*')\s*,",
)

#: One row of the `diet_meal_emotion` INSERT: the meal, the name, the rating.
_EMOTION_ROW = re.compile(
    r"\('(f1[0-9a-f-]+)',\s*'([^']+)',\s*(\d+|NULL)\s*\)",
)


def _unquote(value):
    """`'Obiad'` -> `'Obiad'`; the literal `NULL` -> None."""
    return None if value == 'NULL' else value.strip("'")


class MockDataDietSeedTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        source = MOCK_SQL.read_text(encoding='utf-8')

        cls.meals = {
            meal_id: {
                'days_ago': int(days_ago or 0),
                'kind': _unquote(kind),
                'hour': _unquote(hour),
            }
            for meal_id, days_ago, kind, hour in _MEAL_ROW.findall(source)
        }
        cls.emotions = [
            {
                'meal': meal_id,
                'emotion': emotion,
                'intensity': None if rating == 'NULL' else int(rating),
            }
            for meal_id, emotion, rating in _EMOTION_ROW.findall(source)
        ]

    # -- the parse itself -------------------------------------------------

    def test_the_file_was_actually_read(self):
        """Guards the guard: every assertion below passes vacuously on an empty
        parse, and a regex is one edit away from matching nothing."""
        self.assertGreater(len(self.meals), 20)
        self.assertGreater(len(self.emotions), 20)

    def test_every_chip_hangs_off_a_meal_the_file_also_inserts(self):
        """A typo in a UUID is a foreign key violation at seed time, and the
        only place it is visible before then is here."""
        for chip in self.emotions:
            with self.subTest(meal=chip['meal'], emotion=chip['emotion']):
                self.assertIn(chip['meal'], self.meals)

    def test_every_name_is_one_of_the_ten(self):
        """`core.emotions.EMOTIONS`, spelled exactly. A name outside the
        vocabulary is refused by the API and would render a chip with no colour
        — `EMOTION_COLORS` looks its colour up by name."""
        for chip in self.emotions:
            with self.subTest(emotion=chip['emotion']):
                self.assertIn(chip['emotion'], EMOTIONS)

    def test_every_kind_is_one_the_picker_offers(self):
        for meal in self.meals.values():
            if meal['kind'] is None:
                continue
            with self.subTest(kind=meal['kind']):
                self.assertIn(meal['kind'], MEAL_KINDS)

    # -- the weeks --------------------------------------------------------

    def completed_weeks(self, anchor=None):
        """Every closed diet week, as an inclusive range of "days ago".

        Counted from the **oldest** meal in the file, which is what
        `patient.diet_week_start` latches onto, and stopping before the week
        that contains today — a report describes a week that has ended, so the
        running one has none.

        Ranges are in days-ago, so they run downwards: the first week of a
        24-day seed is (24, 18).

        `anchor` defaults to the whole seed's oldest day, which is the generated
        block's. Pass the hand-written block's own oldest day to walk only the
        weeks whose rows this file can actually read.
        """
        if anchor is None:
            anchor = self.generated_range()[1]

        weeks = []
        start = anchor
        while True:
            end = start - (DAYS_IN_DIET_WEEK - 1)
            if end <= 0:
                # The week reaches today or past it, so it is still running.
                break
            weeks.append((start, end))
            start -= DAYS_IN_DIET_WEEK
        return weeks

    def hand_written_oldest(self):
        """The oldest day the literal rows reach — the last day this file can be
        read row by row."""
        return max(meal['days_ago'] for meal in self.meals.values())

    def generated_range(self):
        """(newest, oldest) day offset of the generated meal block."""
        source = MOCK_SQL.read_text(encoding='utf-8')
        match = re.search(
            r'FROM generate_series\((\d+), (\d+)\) AS d\s*\n\s*JOIN \(VALUES\s*\n\s*'
            r'-- idx, rotacja',
            source,
        )
        self.assertIsNotNone(match, 'the generated meal block was not found')
        return int(match.group(1)), int(match.group(2))

    def chips_in(self, week):
        start, end = week
        return [
            chip for chip in self.emotions
            if end <= self.meals[chip['meal']]['days_ago'] <= start
        ]

    def test_the_seed_fills_more_than_one_page_of_reports(self):
        """§10's list pages at `usePagination`'s fixed seven per page, and a
        control that never appears is a control nobody tests by hand. Two pages
        is the least that makes it visible; the generated block gives three."""
        self.assertGreater(len(self.completed_weeks()), REPORTS_PER_PAGE)

    def test_every_hand_written_week_has_emotions_at_its_meals(self):
        """**THE ONE THIS FILE EXISTS FOR.** A week whose meals carry no chip
        renders §10's report without its emotions card at all — correctly, since
        §05's rule is that no field blocks a save, but invisibly: the demo shows
        a feature that looks unbuilt.

        Walked from the hand-written block's own oldest day, because those are
        the only weeks whose rows are in this file to be read. The generated
        block's weeks are covered by its rule instead — see
        `test_the_generated_block_puts_a_chip_on_most_meals`."""
        for week in self.completed_weeks(anchor=self.hand_written_oldest()):
            with self.subTest(days_ago=week):
                self.assertTrue(
                    self.chips_in(week),
                    f'no meal between {week[0]} and {week[1]} days ago carries an '
                    f'emotion, so that week\'s report shows no ranking',
                )

    def test_a_chip_picked_and_left_unrated_reaches_a_completed_week(self):
        """`intensity` is nullable so that pressing a chip without moving the
        slider means "felt, and I did not say how strongly" — and the report
        renders that row differently, with a sentence instead of an average.
        Seeded only with numbers, that branch is reachable by hand and never by
        demo."""
        unrated = [
            chip for week in self.completed_weeks(anchor=self.hand_written_oldest())
            for chip in self.chips_in(week)
            if chip['intensity'] is None
        ]

        self.assertTrue(unrated)

    def test_a_completed_week_also_holds_meals_with_no_chip_at_all(self):
        """The ordinary case, and the third of the three states. A seed where
        every meal carries an emotion would make the picker look required."""
        annotated = {chip['meal'] for chip in self.emotions}
        bare = [
            meal_id for week in self.completed_weeks(anchor=self.hand_written_oldest())
            for meal_id, meal in self.meals.items()
            if week[1] <= meal['days_ago'] <= week[0] and meal_id not in annotated
        ]

        self.assertTrue(bare)

    # -- the columns §11 only draws when the data calls for them -----------

    def test_a_meal_with_no_hour_carries_a_chip(self):
        """"Bez godziny" is the fifth column of "Emocje a pora dnia" and is
        drawn only when the window holds such a meal — so without this the
        column is unreachable from a seeded database."""
        self.assertTrue(any(
            self.meals[chip['meal']]['hour'] is None for chip in self.emotions
        ))

    def test_a_meal_with_no_kind_carries_a_chip(self):
        """Likewise "Bez rodzaju" on "Emocje a rodzaj posiłku"."""
        self.assertTrue(any(
            self.meals[chip['meal']]['kind'] is None for chip in self.emotions
        ))

    def test_a_meal_after_ten_at_night_carries_a_chip_in_a_completed_week(self):
        """The "Noc" column exists because this module's night bucket wraps
        midnight — the deliberate departure from the artboard's 6-22 bands, made
        because night eating is what a psychodietitian reads the report for. An
        empty column would make that departure invisible."""
        late = [
            chip for week in self.completed_weeks(anchor=self.hand_written_oldest())
            for chip in self.chips_in(week)
            if (self.meals[chip['meal']]['hour'] or '') >= '22:00'
        ]

        self.assertTrue(late)

    # -- the anchor -------------------------------------------------------

    def test_the_seed_clears_the_stored_week_anchor(self):
        """`patient.diet_week_start` is latched once and never moved, which is
        right for a real account and wrong after a re-seed: everything here is
        relative to CURRENT_DATE and moves daily, so an anchor from an earlier
        run cuts the reports at boundaries matching nothing in the data."""
        source = MOCK_SQL.read_text(encoding='utf-8')

        self.assertRegex(
            source, r'UPDATE\s+patient\s+SET\s+diet_week_start\s*=\s*NULL')

    def test_the_meals_are_re_anchored_on_a_re_run_rather_than_skipped(self):
        """Every diet row here is relative to CURRENT_DATE, so `DO NOTHING`
        leaves a database seeded weeks ago holding meals at the absolute dates
        it got then — outside §02's today, outside §07's history and outside
        §11's window, with the script still reporting success. Re-running the
        seed is how this file is meant to be used, so it has to leave the same
        picture every time rather than only the first."""
        source = MOCK_SQL.read_text(encoding='utf-8')
        # Bounded by the *next statement* rather than by the first ';'. A
        # semicolon inside one of this file's comments is ordinary SQL and cut
        # the statement in half when this test looked for one.
        meals_insert = (
            source.split('INSERT INTO diet_meal ')[1]
            .split('INSERT INTO diet_meal_emotion')[0]
        )

        self.assertIn('ON CONFLICT (id_meal) DO UPDATE', meals_insert)
        self.assertIn('entry_date = EXCLUDED.entry_date', meals_insert)


class GeneratedDietHistoryTests(SimpleTestCase):
    """The block behind the hand-written one: 120 days of volume.

    Its rows cannot be parsed — they are a rotation crossed with a day range —
    so what is pinned here is the generator's **contract**. Each of these is a
    property the demo silently loses if somebody edits the block without
    noticing what it was for.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = MOCK_SQL.read_text(encoding='utf-8')
        cls.block = cls.source.split('GŁĘBOKA HISTORIA DIETETYCZNA')[1]

    def test_the_generated_meals_abut_the_hand_written_ones(self):
        """**NO GAP BETWEEN THE TWO BLOCKS.** A week nobody wrote in has no
        report at all (`build_diet_reports` skips it), so a hole where the two
        meet would read as data loss in the middle of the archive rather than as
        a quiet week."""
        seed = MockDataDietSeedTests
        seed.setUpClass()
        newest_generated, oldest_generated = seed().generated_range()
        oldest_hand_written = max(m['days_ago'] for m in seed.meals.values())

        self.assertEqual(newest_generated, oldest_hand_written + 1)
        self.assertGreater(oldest_generated, newest_generated)

    def test_it_reaches_far_enough_back_to_page_the_report_list(self):
        seed = MockDataDietSeedTests
        seed.setUpClass()
        _, oldest = seed().generated_range()

        # Whole weeks that have ended, from the oldest day.
        weeks = (oldest - (DAYS_IN_DIET_WEEK - 1)) // DAYS_IN_DIET_WEEK + 1
        self.assertGreater(weeks, REPORTS_PER_PAGE)

    def test_every_generated_table_is_cleared_before_it_is_rewritten(self):
        """The dates are relative to CURRENT_DATE, so a re-run has to replace
        the previous generation rather than add to it. Delete by prefix, so a
        row somebody entered through the app — which carries a random UUID —
        is never one of the casualties."""
        for table, key in GENERATED_TABLES:
            with self.subTest(table=table):
                self.assertRegex(
                    self.block,
                    rf"DELETE FROM {table}\b[\s\S]{{0,260}}?"
                    rf"{key}::text LIKE '{GENERATED_PREFIX}-%'",
                )

    def test_every_generated_id_carries_the_prefix_the_delete_looks_for(self):
        """A generated row whose UUID did not start with the prefix would
        survive every later re-seed and sit in the data for ever."""
        built = re.findall(r"\('(\w+)' \|\| substr\(md5\(", self.block)

        self.assertTrue(built)
        self.assertEqual(set(built), {GENERATED_PREFIX})

    def test_the_marker_is_long_enough_not_to_hit_a_real_uuid(self):
        """Two characters collide with a random UUID once in 256, and a delete
        that matched one would silently remove something a person entered."""
        self.assertGreaterEqual(len(GENERATED_PREFIX), 8)

    def test_the_two_tables_with_a_unique_day_yield_to_a_row_already_there(self):
        """`diet_activity_day` and `diet_sleep` are one row per day, so a night
        somebody described through the app occupies the day this block would
        write. `DO NOTHING` keeps theirs; without it the whole seed aborts on a
        demo account that has been used."""
        for table in ('diet_activity_day', 'diet_sleep'):
            with self.subTest(table=table):
                statement = self.block.split(f'INSERT INTO {table}')[1]
                self.assertIn(
                    'ON CONFLICT (id_medical, entry_date) DO NOTHING', statement)

    def test_one_silent_day_rule_runs_through_every_diary(self):
        """**"brak wpisu" HAS TO BE REACHABLE.** Each diary skips days of its
        own, but on different days — so with four of them running, the patient
        turns out to have written something on all 120 days and the report's
        empty-day branch is never drawn. One shared rule silences them together.

        Six occurrences: meals, water, other drinks, activity, steps, sleep.
        Counted over the SQL only — the block's own header explains the rule in
        prose, and a comment is not a WHERE clause."""
        statements = '\n'.join(
            line for line in self.block.splitlines()
            if not line.lstrip().startswith('--')
        )

        self.assertEqual(statements.count('d % 23 <> 5'), 6)

    def test_the_generated_block_puts_a_chip_on_most_meals_and_rates_most_of_them(self):
        """Two thirds of meals carry an emotion and one rating in nine is NULL —
        the three states §05 allows, spread over every week the generated range
        covers. A rule that attached a chip to every meal would make the picker
        look required; one that rated every chip would hide the branch that
        prints a sentence instead of an average."""
        emotions = self.block.split('DIET_MEAL_EMOTION')[1]

        # A chip on some meals and not others.
        self.assertIn('(m.d + m.h) % 3 <> 0', emotions)
        # And an unrated one among them.
        self.assertRegex(emotions, r'% 9 = 0 THEN NULL')

    def test_nothing_generated_counts_food(self):
        """The module's own rule, applied to the block most likely to break it:
        a generator is where somebody adds a portion size because the column
        "would be easy to fill"."""
        for banned in ('kcal', 'kalor', 'gram', 'porcj', 'waga', 'białk'):
            with self.subTest(banned=banned):
                self.assertNotIn(banned, self.block.lower())
