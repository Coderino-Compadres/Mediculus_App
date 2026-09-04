"""The technique catalogue's closed vocabularies.

Four lists, and they are **the same strings the frontend's union types declare**
(`frontend/src/types/technique.ts`) — not a translation of them. The values
travel on the wire and end up as keys into the label maps in
`frontend/src/utils/techniques.ts`, so a value that is not in those unions
reaches a screen that has no name for it. `test_techniques.py` parses the `.ts`
file and compares both directions, the way `test_emotions.py` does for the
emotion names; nothing else keeps the two in step.

Its own module rather than part of `core/techniques.py` so `core/models.py` can
name the availability default without importing the query layer that imports it
back.

The Polish labels are deliberately absent. They live in `utils/techniques.ts`,
because the screens are the only thing that renders them and a second copy here
would be one free to disagree — the opposite arrangement to `core/emotions.py`,
where the Polish name *is* the stored value.
"""

#: Level 1 — the catalogue's three tabs. `TechniqueSchool` in technique.ts.
SCHOOLS = ('dbt', 'cbt', 'relaksacyjne')

#: Level 2, inside the DBT tab, ordered by time horizon. `TechniqueGroup`.
DBT_GROUPS = ('kryzys', 'odpornosc', 'relacje', 'akceptacja')

#: The DBT module a skill was taught in, for cross-referencing with the
#: specialist's handbook. `TechniqueDbtModule` — camelCase because these are the
#: literal union members, not names anybody types.
DBT_MODULES = (
    'tolerancja', 'regulacja', 'drogaSrodkowa', 'skutecznoscInterpersonalna',
)

#: Whether a technique belongs in a self-service catalogue at all.
#: `TechniqueAvailability`.
AVAILABILITY_GENERAL = 'ogolna'
AVAILABILITY_SPECIALIST = 'wymagaSpecjalisty'
AVAILABILITIES = (AVAILABILITY_GENERAL, AVAILABILITY_SPECIALIST)
