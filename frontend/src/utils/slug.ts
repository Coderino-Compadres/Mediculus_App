/**
 * The catalogue address a technique gets, derived from its name.
 *
 * WHY THIS EXISTS. `slug` is the technique's URL — `/techniques/:id` resolves
 * `:id` against it (see `techniqueDetailPath` in routes.ts) — and it is also
 * the key `utils/techniques.ts` merges the two halves of the catalogue on. It
 * used to be typed by hand into its own input on the technique form, with a
 * hint explaining that it had to be "małe litery bez polskich znaków, cyfry i
 * łączniki". That asked a psychotherapist to perform a transliteration and to
 * know what a slug is, so the field is gone and this derives it instead.
 *
 * THE OUTPUT ALWAYS SATISFIES THE BACKEND'S REGEX, and that is the whole job.
 * `TechniqueSerializer.slug` is a `RegexField(r'^[a-z0-9]+(-[a-z0-9]+)*$',
 * max_length=64)` — no underscores, no capitals, no diacritics, no leading,
 * trailing or doubled hyphens, and never empty. Anything else is a 400 on a
 * field the form no longer shows, i.e. a save that fails with nothing on
 * screen. So every branch below ends in a value that matches, including the
 * degenerate one where the name holds no letters or digits at all.
 *
 * THE `id-` PREFIX was asked for, and it earns its place: no built-in slug
 * starts with it (see BUILTIN_SLUGS in core/techniques.py — 'tipp', 'please',
 * 'dear-man', …), so a technique written in the panel can no longer collide
 * with the hardcoded, clinically-reviewed half of the catalogue. That makes
 * `SLUG_BUILTIN` unreachable from this form. It is `id-` rather than the `id_`
 * originally suggested because the regex above rejects an underscore.
 *
 * What it does NOT prevent is two techniques with the same name: `slug` is
 * unique across the whole table — both modules, every author (no filter in
 * `validate_slug`) — so the second one is refused with `SLUG_TAKEN`. The form
 * shows that under "Nazwa techniki", as `NAME_TAKEN` below, worded so it does
 * not claim the clash is in the specialist's own catalogue: it may be a
 * technique of the other module they never see.
 *
 * A NAME WITH NO LATIN LETTER OR DIGIT ('🙂', 'Дыхание', '!!!') has nothing to
 * derive from, and used to become the bare stem 'id' — one slot for every such
 * name in the app, so the second was refused as taken. The forms now refuse it
 * before the request (`hasSlugBody`, `NAME_NEEDS_LATIN`); `techniqueSlug`
 * itself still returns 'id' there, so it keeps its never-invalid contract.
 */

/** Matches `max_length` on TechniqueSerializer.slug. */
const MAX_LENGTH = 64

const PREFIX = 'id-'

/** Shown under "Nazwa techniki" when the backend answers `SLUG_TAKEN`. */
export const NAME_TAKEN =
  'Ta nazwa jest już zajęta przez inną technikę w aplikacji — nazwy nie mogą '
  + 'się powtarzać, bo z nazwy powstaje adres techniki. Zmień ją nieco.'

/** Shown under "Nazwa techniki" when `hasSlugBody` is false. */
export const NAME_NEEDS_LATIN =
  'Nazwa musi zawierać co najmniej jedną literę alfabetu łacińskiego lub cyfrę '
  + '— z nich powstaje adres techniki.'

/**
 * Polish letters, mapped before NFKD rather than by it.
 *
 * `ł` and `Ł` are single code points with no canonical decomposition, so
 * `'ł'.normalize('NFKD')` returns 'ł' unchanged and the strip-combining-marks
 * pass below never sees a base letter to keep — 'ł' would simply be dropped as
 * a non-`[a-z0-9]` character and "łatwy" would become "atwy". The same trap is
 * documented on `normalize_emotion` in core/emotions.py, which is the backend's
 * half of this problem.
 *
 * The rest (ą ć ę ń ó ś ź ż) NFKD would handle, but listing them here keeps the
 * mapping in one readable place instead of splitting it across two mechanisms.
 */
const POLISH: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
}

/** The part after `id-`: '' when the name has nothing usable in it. */
function slugBody(name: string): string {
  return name
    .toLowerCase()
    // Before NFKD, for 'ł' — see POLISH above.
    .replace(/[ąćęłńóśźż]/g, (letter) => POLISH[letter])
    .normalize('NFKD')
    // Combining marks left by the decomposition, so 'é' has already
    // contributed its 'e' by the time its accent is removed.
    .replace(/[̀-ͯ]/g, '')
    // Any run of anything else collapses to ONE hyphen. A run rather than a
    // single character is what keeps '--' out of the result, which the regex
    // rejects.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH - PREFIX.length)
    // The slice can cut immediately after a hyphen, which would leave a
    // trailing one.
    .replace(/-+$/, '')
}

/**
 * Whether `name` holds anything a slug can be derived from — at least one
 * Latin letter (Polish ones included) or digit. A blank name answers false
 * too; the forms leave that one to the backend's "Podaj nazwę techniki."
 */
export function hasSlugBody(name: string): boolean {
  return slugBody(name) !== ''
}

/**
 * A technique's catalogue address, from the name the specialist typed.
 *
 * Never returns an invalid slug: a name with nothing usable in it ('!!!', '###')
 * yields the bare prefix stem 'id', which matches the regex on its own. That is
 * a value the backend could only refuse as taken, never as malformed — and the
 * forms do not send it at all, see `hasSlugBody`.
 */
export function techniqueSlug(name: string): string {
  const body = slugBody(name)
  return body ? PREFIX + body : PREFIX.replace(/-+$/, '')
}
