"""The two modules, as a value the database can hold.

The app has had two modules since `/diet` was built, and until now that fact
lived nowhere in the backend: it was a prefix in `core/urls.py`, a pair of menus
in `HeaderMenu.tsx`, and a comment. Nothing needed to *name* a module, because
nothing stored one — a diary row belongs to whichever module's table it is in.

`specjalist_patient.module` is the first column that does, and the reason is the
client's own sentence about who may read a patient's reports: "the specialists
treating the patient", plural, one per module. A psychodietitian and a
psychotherapist are two relationships with one patient, and which reports each
may open is decided by which of the two this column says.

WHY A TEXT COLUMN AND NOT A TABLE. `user_role` is the cautionary example sitting
in the same database: a lookup table whose rows are seeded by SQL, joined on
every request, and authorizing nothing (see `core/colleagues.py`). A module is
a closed set of two values fixed by the product, not data somebody administers,
so a `TEXT` column with the vocabulary in Python is the honest shape — the same
choice `diet_meal.kind` and `technique.school` already make.

WHAT THE VALUES MEAN, and the asymmetry is deliberate: `psychotherapy` is the
module the app started as, and every relationship that existed before this table
is one — see migration 0020, which backfills exactly that. `diet` is spelled the
way the URLs and the frontend routes already spell it, so a value read out of the
database and a path read out of a log say the same word.
"""

#: The psychotherapy module: the diary, its weekly reports, the DBT catalogue.
MODULE_PSYCHOTHERAPY = 'psychotherapy'

#: "Dietetyka i psychodietetyka": the food diary, water, activity, sleep, and
#: the reports built from them.
MODULE_DIET = 'diet'

#: Every module a relationship may name. A serializer's `ChoiceField` reads this,
#: so an unknown value is a 400 rather than a row nothing can interpret.
MODULES = (MODULE_PSYCHOTHERAPY, MODULE_DIET)

#: What each is called on screen, for the one place a module has to be named to a
#: person: the invitation card a patient answers ("Zaproszenie do modułu…").
#:
#: The names are the ones the patient already picks between on `/modules`
#: (pages/ModuleSelect.tsx), rather than a second set invented here — somebody
#: agreeing to be treated in a module should read the same words they read when
#: they chose it.
MODULE_LABELS = {
    MODULE_PSYCHOTHERAPY: 'Psychoterapia',
    MODULE_DIET: 'Dietetyka i psychodietetyka',
}


def module_label(module):
    """The screen name of a module, or the raw value for one nothing knows.

    Falling back to the value rather than raising: this is display text, and a
    row holding an unexpected module is a data problem to see on the screen, not
    a reason for the panel to answer 500.
    """
    return MODULE_LABELS.get(module, module)
