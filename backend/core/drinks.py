"""The hydration screen's vocabulary and the two numbers behind its buttons.

§08 of the client's mockups ("Nawodnienie i suplementy") is where all of this
comes from, and three of its rules are decisions rather than defaults — each one
is the reason a value lives here instead of being spelled into a view:

* **One daily goal, expressed in glasses.** Not in millilitres, not per meal, and
  not per patient: the artboard shows "cel: 6 szklanek" and nothing that changes
  it. `DAILY_TARGET_GLASSES` is therefore a display target, **not** a clinical
  recommendation — this app is not entitled to tell anybody how much to drink. A
  psychodietitian setting it per patient is the obvious next step and is a column
  on `patient`, not an edit to this line.

* **Other drinks are recorded and not converted.** "Herbata, kawa i napary są
  zapisywane, ale nie przeliczane na wodę — decyzja merytoryczna zostaje po
  stronie specjalisty." So `OTHER_DRINKS` exists as a vocabulary and nothing
  anywhere multiplies it by a coefficient. `Woda z cytryną` sitting in that list
  rather than counting as water is the client's call, not an oversight.

* **The goal is a point of reference, never a verdict.** "Po przekroczeniu celu
  pasek po prostu jest pełny. Nie ma gratulacji, serii ani komunikatu o
  niedoborze." Which is why nothing here is a threshold and nothing computes a
  streak: there is no value in this module that a day could fail.

THE POLISH NAME IS THE STORED VALUE, the same arrangement as `core/emotions.py`
and the opposite of `core/time_of_day.py`. The names are short, stable and
already the label; a key plus a label map would be two things to keep in step
for no gain. `frontend/src/utils/drinks.ts` declares the same strings and
`test_drinks.py` compares them character for character — nothing else does.
"""

#: The one drink that counts towards the daily goal.
WATER = 'Woda'

#: Recorded, listed back, and deliberately never added to the water total.
#: The order is the order the chips are drawn in on §08's artboard.
OTHER_DRINKS = ('Herbata', 'Kawa', 'Napar ziołowy', 'Woda z cytryną', 'Kompot')

#: Everything `hydration.drink` may hold.
DRINKS = (WATER,) + OTHER_DRINKS

#: What "one glass" means, so the goal in glasses and the amounts in millilitres
#: are the same scale. From the artboard's own buttons: "+ Szklanka / 250 ml".
GLASS_ML = 250

#: "+ Butelka / 500 ml", the second button. Named rather than written as
#: `2 * GLASS_ML`: it is a serving the mockup names, and a deployment that
#: decided a bottle is 700 ml would change this and not the glass.
BOTTLE_ML = 500

#: "cel: 6 szklanek". A display target — see the module docstring.
DAILY_TARGET_GLASSES = 6

#: Bounds on the "Własna ilość" input. The floor keeps a 0 ml entry (a row that
#: records nothing) out of the table; the ceiling is a sanity limit on a number
#: typed by hand, not a health warning — the app does not tell anybody they have
#: drunk too much.
MIN_AMOUNT_ML = 10
MAX_AMOUNT_ML = 2000

#: A backstop on rows per day, in the spirit of `MAX_HISTORY_ENTRIES`: this is
#: the one clinical endpoint a patient can call by tapping a button, so a stuck
#: finger (or a script) must not be able to fill a table. Comfortably above any
#: real day — 40 glasses is 10 litres — so nobody can meet it by drinking.
MAX_ENTRIES_PER_DAY = 40

#: How many days the "Ostatnie 7 dni" chart covers, today included.
WEEK_DAYS = 7
