"""Tests for `age_on` — where a minor's account stops and an adult's begins.

Pure arithmetic, no database. The function is what
`RegisterSerializer._check_age_matches_account_type` trusts when it decides
whether a date of birth agrees with the declared account type, so an off-by-one
day here means a minor registering as an adult (and skipping the guardian
consent RODO art. 8 requires) or an adult being sent to a screen they cannot
leave.

29 February is the reason the implementation compares (month, day) tuples rather
than dividing a timedelta by 365.25, and it is the one case the API-level tests
in test_auth_api.py deliberately step around: their `_birthday_years_ago` helper
catches the ValueError and falls back to the 28th instead of exercising it.
"""

import datetime

from django.test import SimpleTestCase

from core.serializers import ADULT_AGE, age_on

LEAP_YEAR = 2004


def days_of(year):
    """Every calendar day in `year`, as dates."""
    day = datetime.date(year, 1, 1)
    while day.year == year:
        yield day
        day += datetime.timedelta(days=1)


def expected_birthday(date_of_birth, year):
    """The day `date_of_birth` has its anniversary in `year`.

    29 February has none in a non-leap year, and Polish practice puts the
    anniversary on 1 March rather than 28 February — which is exactly what
    comparing (month, day) tuples produces, since (3, 1) > (2, 29) > (2, 28).
    """
    try:
        return date_of_birth.replace(year=year)
    except ValueError:
        return datetime.date(year, 3, 1)


class BirthdayBoundaryTests(SimpleTestCase):
    """The day the number changes, which is the only day the answer is delicate."""

    def test_the_day_before_a_birthday_is_still_the_younger_age(self):
        born = datetime.date(2008, 6, 15)

        self.assertEqual(age_on(born, datetime.date(2026, 6, 14)), 17)

    def test_a_birthday_counts_from_the_day_itself(self):
        born = datetime.date(2008, 6, 15)

        self.assertEqual(age_on(born, datetime.date(2026, 6, 15)), 18)

    def test_the_day_after_a_birthday_is_the_same_age(self):
        born = datetime.date(2008, 6, 15)

        self.assertEqual(age_on(born, datetime.date(2026, 6, 16)), 18)

    def test_someone_born_today_is_nought(self):
        born = datetime.date(2026, 8, 26)

        self.assertEqual(age_on(born, born), 0)

    def test_the_last_day_of_a_year_does_not_borrow_from_the_next(self):
        born = datetime.date(2008, 12, 31)

        self.assertEqual(age_on(born, datetime.date(2026, 12, 30)), 17)
        self.assertEqual(age_on(born, datetime.date(2026, 12, 31)), 18)

    def test_the_first_day_of_a_year_does_not_borrow_from_the_previous(self):
        born = datetime.date(2008, 1, 1)

        self.assertEqual(age_on(born, datetime.date(2025, 12, 31)), 17)
        self.assertEqual(age_on(born, datetime.date(2026, 1, 1)), 18)


class LeapDayTests(SimpleTestCase):
    """The case the naive `days / 365.25` version gets wrong by a day."""

    born = datetime.date(2008, 2, 29)

    def test_a_leap_day_birthday_falls_on_the_first_of_march_otherwise(self):
        # 2026 is not a leap year, so there is no 29 February to turn 18 on.
        self.assertEqual(age_on(self.born, datetime.date(2026, 2, 28)), 17)
        self.assertEqual(age_on(self.born, datetime.date(2026, 3, 1)), 18)

    def test_a_leap_day_birthday_counts_on_the_day_in_a_leap_year(self):
        self.assertEqual(age_on(self.born, datetime.date(2028, 2, 28)), 19)
        self.assertEqual(age_on(self.born, datetime.date(2028, 2, 29)), 20)

    def test_someone_born_on_a_leap_day_is_nought_that_day(self):
        self.assertEqual(age_on(self.born, self.born), 0)

    def test_28_february_is_not_treated_as_the_anniversary(self):
        """Reading it as 28 February would let a minor register a day early."""
        self.assertNotEqual(age_on(self.born, datetime.date(2026, 2, 28)), ADULT_AGE)


class NaiveFormulaTests(SimpleTestCase):
    """Pins down what this function exists to avoid, so nobody 'simplifies' it.

    Dividing elapsed days by 365.25 is the shortcut the docstring in
    serializers.py warns about. It goes wrong on the anniversary itself: the
    quotient has not quite reached the whole number, so the person is told they
    are 17 on the morning of their eighteenth birthday — and the registration
    form would send them to the guardian-consent screen for a day.
    """

    def test_the_shortcut_denies_adulthood_on_the_eighteenth_birthday(self):
        born, today = datetime.date(2008, 8, 26), datetime.date(2026, 8, 26)

        self.assertEqual(int((today - born).days / 365.25), 17)
        self.assertEqual(age_on(born, today), 18)

    def test_the_shortcut_is_wrong_on_plenty_of_birthdays_not_just_one(self):
        today = datetime.date(2026, 8, 26)
        disagreements = [
            born for born in (today.replace(year=year) for year in range(1990, 2009))
            if int((today - born).days / 365.25) != age_on(born, today)
        ]

        self.assertGreater(len(disagreements), 1)


class EveryDayOfALeapYearTests(SimpleTestCase):
    """Exhaustive sweep: the boundary has to hold for all 366 possible birthdays.

    For each day of a leap year as the date of birth, and each of the four years
    that follow, the age must be one lower the day before the anniversary and
    exactly the anniversary number on the day itself. That covers 29 February
    from both sides without singling it out.
    """

    def test_the_age_increments_on_the_anniversary_and_not_before(self):
        for born in days_of(LEAP_YEAR):
            for years in range(1, 5):
                birthday = expected_birthday(born, LEAP_YEAR + years)
                day_before = birthday - datetime.timedelta(days=1)
                with self.subTest(born=born.isoformat(), years=years):
                    self.assertEqual(age_on(born, day_before), years - 1)
                    self.assertEqual(age_on(born, birthday), years)

    def test_the_answer_never_decreases_as_the_days_pass(self):
        born = datetime.date(LEAP_YEAR, 2, 29)
        previous = 0

        for today in days_of(2026):
            age = age_on(born, today)
            with self.subTest(today=today.isoformat()):
                self.assertGreaterEqual(age, previous)
            previous = age

    def test_a_date_of_birth_in_the_future_reads_as_negative_rather_than_zero(self):
        """Not a case the API allows in (validate_date_of_birth refuses it), but
        answering 0 would make an unborn date look like a valid newborn to any
        future caller that skips that validator."""
        born = datetime.date(2027, 1, 1)

        self.assertLess(age_on(born, datetime.date(2026, 8, 26)), 0)


class AdultAgeTests(SimpleTestCase):
    """`ADULT_AGE` is policy, not arithmetic — see the note in serializers.py."""

    def test_the_boundary_is_eighteen_today(self):
        self.assertEqual(ADULT_AGE, 18)

    def test_the_exact_boundary_day_reads_as_an_adult(self):
        today = datetime.date(2026, 8, 26)
        born = today.replace(year=today.year - ADULT_AGE)

        self.assertEqual(age_on(born, today), ADULT_AGE)

    def test_one_day_short_of_the_boundary_is_still_a_minor(self):
        today = datetime.date(2026, 8, 26)
        born = today.replace(year=today.year - ADULT_AGE) + datetime.timedelta(days=1)

        self.assertLess(age_on(born, today), ADULT_AGE)
