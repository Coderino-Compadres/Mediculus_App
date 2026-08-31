"""The "pora dnia" vocabulary shared by the model and the API.

`frontend/src/utils/timeOfDay.ts` holds the same four values (and the Polish
label for each); the values here have to match it character for character,
because they travel over the wire in both directions — the entry form sends one
and the archive redraws its chip by looking the answer up.

**Only the values live here.** 'Rano'/'Południe'/'Wieczór'/'Noc' are the
frontend's business, and a second copy in Python would be one that can quietly
disagree — the API stores the technical key and never words it. That is the same
split as `utils/triggers.ts` and the opposite of `emotions.py`, where the Polish
name *is* the value the database holds.

Ordered chronologically, so anything that groups by time of day (the analysis
screen's heatmap is the first) reads in the order a day happens rather than in
whatever order the four names sort in.

The question is about the situation the entry describes, not about when the
entry was written: `diary.updated_at` already answers the latter, and a patient
can perfectly well describe a morning episode in the evening. Which is why this
is a column the patient fills in rather than a timestamp the server takes.
"""

MORNING = 'morning'
NOON = 'noon'
EVENING = 'evening'
NIGHT = 'night'

TIMES_OF_DAY = (MORNING, NOON, EVENING, NIGHT)

#: `choices` for the model field. Value and label are the same string on purpose:
#: Django wants a label, the Polish one is the frontend's, and 'Morning' (which
#: is what Django would invent) would be a third wording nobody asked for.
TIME_OF_DAY_CHOICES = tuple((value, value) for value in TIMES_OF_DAY)
