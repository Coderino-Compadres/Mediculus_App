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
#: Django wants a label, the Polish one is below, and 'Morning' (which is what
#: Django would invent) would be a third wording nobody asked for.
TIME_OF_DAY_CHOICES = tuple((value, value) for value in TIMES_OF_DAY)

#: The Polish names, which this file did **not** hold until the diet report grew
#: a PDF.
#:
#: WHY THEY ARE HERE NOW, because the arrangement was deliberate and the reason
#: it changed matters. The four keys travel on the wire and the browser prints
#: them, so `frontend/src/utils/timeOfDay.ts` was the one place the Polish
#: existed and a second copy here could only drift. Then §10's report became a
#: document: `core/diet_report_pdf.py` lays out the "Pory posiłków" table on the
#: server, and its column headings are these four words. A PDF whose columns read
#: "morning / noon" is not a smaller problem than a duplicated string.
#:
#: So the duplication is accepted and *pinned* instead, exactly as `emotions.py`
#: is: `test_time_of_day.py` reads the TypeScript and asserts the two agree
#: label for label. The rule is unchanged where it still applies — the wire
#: carries the key, never the label, and `DiaryEntrySerializer` refuses 'Rano'.
TIME_OF_DAY_LABELS = {
    MORNING: 'Rano',
    NOON: 'Południe',
    EVENING: 'Wieczór',
    NIGHT: 'Noc',
}


def time_of_day_label(value):
    """The Polish name of one part of the day, or the raw value for an unknown.

    Falling back rather than raising: this is display text in a document, and a
    value nothing recognises should show up on the page to be noticed, not turn
    a specialist's download into a 500.
    """
    return TIME_OF_DAY_LABELS.get(value, value)
