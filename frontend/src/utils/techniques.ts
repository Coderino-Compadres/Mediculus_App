import { TECHNIQUES } from '../data/techniques'
import { ROUTES } from '../routes'
import type {
  Technique,
  TechniqueDbtModule,
  TechniqueGroup,
  TechniqueSchool,
} from '../types/technique'

/**
 * Labels and lookups for the technique catalogue.
 *
 * The Polish wording lives here rather than in the data or the screens, for the
 * same reason emotion colours live in `utils/emotions.ts`: the list screen, the
 * detail screen and (later) the specialist's view all have to name a group the
 * same way, and a second copy is a second thing to correct.
 */

/** Level 1 — the three tabs, in the mockup's order. DBT is the default. */
export const SCHOOL_TABS: { school: TechniqueSchool; label: string }[] = [
  { school: 'dbt', label: 'DBT' },
  { school: 'cbt', label: 'CBT' },
  { school: 'relaksacyjne', label: 'Relaksacyjne' },
]

export const DEFAULT_SCHOOL: TechniqueSchool = 'dbt'

/** The badge on a row and in the detail header — shorter than the tab label. */
export const SCHOOL_BADGES: Record<TechniqueSchool, string> = {
  dbt: 'DBT',
  cbt: 'CBT',
  relaksacyjne: 'Relaks',
}

/**
 * Level 2 — the four DBT groups, ordered by time horizon (minutes → weeks).
 *
 * `horyzont` is shown under the heading because the group names alone do not say
 * what orders them, and the order is the whole point of the grouping: a person
 * opening the app at stress 8/10 should reach the first group, not read four
 * headings and guess.
 */
export const DBT_GROUPS: { group: TechniqueGroup; label: string; horyzont: string }[] = [
  { group: 'kryzys', label: 'Kiedy jest naprawdę ciężko', horyzont: 'minuty' },
  { group: 'odpornosc', label: 'Codzienna odporność', horyzont: 'nawyki' },
  { group: 'relacje', label: 'Relacje i rozmowy', horyzont: 'konkretna sytuacja' },
  { group: 'akceptacja', label: 'Kiedy nie mogę tego zmienić', horyzont: 'tygodnie' },
]

/**
 * The module name the patient's own therapist uses.
 *
 * Shown on the detail screen precisely because the app's group names are its
 * own invention: if the therapist says "to umiejętność z regulacji emocji" and
 * the app only ever says "codzienna odporność", the patient is left matching two
 * vocabularies. (Whether the patient should see app-specific group names at all
 * is still an open question for the specialist — see the document.)
 */
export const DBT_MODULE_LABELS: Record<TechniqueDbtModule, string> = {
  tolerancja: 'Tolerancja dyskomfortu psychicznego',
  regulacja: 'Regulacja emocji',
  drogaSrodkowa: 'Podążanie drogą środkową',
  skutecznoscInterpersonalna: 'Skuteczność interpersonalna',
}

/**
 * The catalogue's tab lives in the URL, so a technique opened from the
 * relaxation tab leads back to the relaxation tab, and a link can be shared.
 * The default tab is left out of the address, so `?szkola=dbt` and the bare
 * `/techniques` are not two addresses for one screen.
 */
export const SCHOOL_PARAM = 'szkola'

export function techniquesListPath(school: TechniqueSchool): string {
  return school === DEFAULT_SCHOOL
    ? ROUTES.techniques
    : `${ROUTES.techniques}?${SCHOOL_PARAM}=${school}`
}

/** Narrows a `?szkola=` query value; anything unrecognised falls back to the default tab. */
export function isTechniqueSchool(value: string | null): value is TechniqueSchool {
  return SCHOOL_TABS.some((tab) => tab.school === value)
}

/**
 * Whether a technique may appear in the self-service catalogue at all.
 *
 * Two conditions, and both are gates rather than filters:
 *   - `opisGotowy`, so a technique whose name is known before its description
 *     arrives can sit in the data without becoming a row that opens an empty
 *     screen.
 *   - `dostepnosc === 'ogolna'`. Nothing is flagged 'wymagaSpecjalisty' today, so
 *     this changes no screen — but the field exists precisely for the four
 *     techniques carrying medical contraindications or touching eating behaviour
 *     directly, and if setting it did not actually withhold them it would be a
 *     safety flag that silently does nothing. Read in one place, so a technique
 *     flagged later disappears from the tabs AND from its own URL at once.
 */
function isPublished(technique: Technique): boolean {
  return technique.opisGotowy && technique.dostepnosc === 'ogolna'
}

/** Every published technique tagged with this school, in declaration order. */
export function techniquesForSchool(school: TechniqueSchool): Technique[] {
  return TECHNIQUES.filter((technique) => isPublished(technique) && technique.szkola.includes(school))
}

export interface TechniqueSections {
  /** The four groups, in time-horizon order, empty ones dropped. */
  sections: { group: TechniqueGroup; label: string; horyzont: string; techniques: Technique[] }[]
  /**
   * Everything the four groups did not claim.
   *
   * A backstop, not a feature: `grupa` is optional (the other two tabs are not
   * grouped), so a DBT technique added without one — "Radykalna akceptacja" is
   * the next one due, and its group is exactly the question it raises — would
   * otherwise be rendered by nothing at all, while the tab's counter still
   * counted it. Silently missing from the list is the one outcome a catalogue
   * must not have; the screen lists these after the sections instead.
   */
  ungrouped: Technique[]
}

/** The DBT tab's sections, plus whatever no section covers. */
export function groupedTechniques(techniques: Technique[]): TechniqueSections {
  const sections = DBT_GROUPS.map((group) => ({
    ...group,
    techniques: techniques.filter((technique) => technique.grupa === group.group),
  })).filter((section) => section.techniques.length > 0)

  const grouped = new Set(sections.flatMap((section) => section.techniques))

  return { sections, ungrouped: techniques.filter((technique) => !grouped.has(technique)) }
}

/** One technique by id — the same gates as the list, so a URL cannot bypass them. */
export function findTechnique(id: string | undefined): Technique | undefined {
  return TECHNIQUES.find((technique) => technique.id === id && isPublished(technique))
}

/**
 * Which school's badge to draw for a technique.
 *
 * A technique can carry several tags, and the badge should say the tab the
 * reader is in — a row found under "Relaksacyjne" reading "DBT" would look like
 * the wrong list. `preferred` is that tab (or, on the detail screen, the tab the
 * reader came from); a technique that is not tagged with it falls back to its
 * first tag.
 */
export function badgeSchool(technique: Technique, preferred?: TechniqueSchool): TechniqueSchool {
  if (preferred && technique.szkola.includes(preferred)) return preferred
  // `szkola: []` is a state the type allows, and `[0]` there is `undefined` —
  // which reached the screen as an empty badge and a `?szkola=undefined` link.
  return technique.szkola[0] ?? DEFAULT_SCHOOL
}
