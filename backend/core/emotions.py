"""The emotion vocabulary shared by the API and the frontend.

`frontend/src/utils/emotions.ts` holds the same ten names (and a colour for
each); the strings here have to match it character for character, because the
dashboard sends them over the wire and the chart looks up its colours by name.

Two of the three places emotions live in the database are numeric — the nine
`mood_scale` columns and `diary.stress_level` — and one, `diary.current_strongest_emotion`,
is free text typed by whoever filled the form. `normalize_emotion` maps that
text onto the vocabulary and answers None when it cannot: the seed data alone
contains 'zmęczenie', which is not one of the ten, and inventing a match for it
would put a wrong colour on someone's chart.
"""

import unicodedata

RADOSC = 'Radość'
SMUTEK = 'Smutek'
LEK = 'Lęk'
ZLOSC = 'Złość'
STRES = 'Stres'
POCZUCIE_WINY = 'Poczucie winy'
FRUSTRACJA = 'Frustracja'
WSTYD = 'Wstyd'
BEZRADNOSC = 'Bezradność'
SPOKOJ = 'Spokój'

EMOTIONS = (
    RADOSC, SMUTEK, LEK, ZLOSC, STRES,
    POCZUCIE_WINY, FRUSTRACJA, WSTYD, BEZRADNOSC, SPOKOJ,
)

# `mood_scale` column -> emotion. Ordered, and the order is load-bearing: it
# breaks ties when two emotions are rated equally high, so the same entry always
# yields the same dominant emotion instead of one picked by dict iteration.
MOOD_SCALE_EMOTIONS = (
    ('anxiety_scale', LEK),
    ('sadness_scale', SMUTEK),
    ('anger_scale', ZLOSC),
    ('frustration_scale', FRUSTRACJA),
    ('helplessness_scale', BEZRADNOSC),
    ('guilt_scale', POCZUCIE_WINY),
    ('shame_scale', WSTYD),
    ('happiness_scale', RADOSC),
    ('calm_scale', SPOKOJ),
)

# One of the ten still has no scale column of its own: 'Stres' is rated on
# `diary.stress_level` instead (see dashboard.py). 'Wstyd' and 'Spokój' used to
# be in the same position and got `shame_scale`/`calm_scale` in core.0005, so
# every emotion the entry form offers can now be stored as a number. Rows
# written before that migration have NULL there, which `_ratings` skips — an
# unrated emotion, not a zero.

# Free-text spellings, keyed by their de-accented, lower-cased form. Includes the
# canonical names themselves, so 'Lęk' and a typed 'lek' land in the same place.
_TEXT_ALIASES = {
    'radosc': RADOSC,
    'szczescie': RADOSC,
    'zadowolenie': RADOSC,
    'smutek': SMUTEK,
    'przygnebienie': SMUTEK,
    'lek': LEK,
    'niepokoj': LEK,
    'strach': LEK,
    'obawa': LEK,
    'zlosc': ZLOSC,
    'gniew': ZLOSC,
    'wscieklosc': ZLOSC,
    'stres': STRES,
    'napiecie': STRES,
    'poczucie winy': POCZUCIE_WINY,
    'wina': POCZUCIE_WINY,
    'wyrzuty sumienia': POCZUCIE_WINY,
    'frustracja': FRUSTRACJA,
    'wstyd': WSTYD,
    'zaklopotanie': WSTYD,
    'bezradnosc': BEZRADNOSC,
    'bezsilnosc': BEZRADNOSC,
    'spokoj': SPOKOJ,
    'ukojenie': SPOKOJ,
}


def _fold(text):
    """Lower-case, strip diacritics, collapse whitespace."""
    decomposed = unicodedata.normalize('NFKD', text)
    without_accents = ''.join(char for char in decomposed if not unicodedata.combining(char))
    return ' '.join(without_accents.lower().split())


def normalize_emotion(text):
    """One of `EMOTIONS` for a free-text emotion, or None if it is not one of them."""
    if not text:
        return None
    return _TEXT_ALIASES.get(_fold(text))
