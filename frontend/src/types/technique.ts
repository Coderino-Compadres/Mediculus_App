/**
 * One therapeutic technique as the "Techniki terapeutyczne" catalogue shows it.
 *
 * The shape follows the data model agreed in `markdown/techniki-dbt.md`
 * ("Architektura informacji — model danych"), including the three fields that
 * are empty in this first version: adding them later would mean a migration,
 * and the client has already asked for the features behind them.
 *
 * Field names are Polish, because the catalogue's vocabulary is Polish and the
 * document they come from is the source of truth for it — but written without
 * diacritics (`podtytul`, `dostepnosc`, `drogaSrodkowa`), so an identifier can
 * be typed on any keyboard. The Polish spelling lives in the label maps in
 * `utils/techniques.ts`, which is what the screens render.
 */

/**
 * Level 1 of the catalogue — the three tabs from the mockup, confirmed by the
 * client.
 *
 * DELIBERATE DEPARTURE FROM THE MOCKUP: a school is a *tag*, not a folder, so
 * `Technique.szkola` is an array. The mockup assumes the three categories are
 * disjoint and they are not — see the justification on `Technique.szkola`.
 */
export type TechniqueSchool = 'dbt' | 'cbt' | 'relaksacyjne'

/**
 * Level 2, inside the DBT tab: four groups ordered by time horizon.
 *
 * The mockup does not settle how to order a tab's contents, and DBT alone is 11
 * techniques and some 30 component skills — a flat list of thirty rows is
 * unreadable. The grouping is the one proposed in the document, so this
 * completes the mockup rather than replacing it. Only DBT techniques carry a
 * group; the other two tabs render a flat list.
 */
export type TechniqueGroup = 'kryzys' | 'odpornosc' | 'relacje' | 'akceptacja'

/**
 * The DBT module the technique was taught in, for cross-referencing with the
 * specialist's handbook.
 *
 * Not navigation: a patient does not choose a technique by module. It is shown
 * on the detail screen precisely because the patient's own therapist names
 * techniques this way ("to umiejętność z regulacji emocji"), so the group name
 * the app invents does not leave them lost.
 */
export type TechniqueDbtModule =
  | 'tolerancja'
  | 'regulacja'
  | 'drogaSrodkowa'
  | 'skutecznoscInterpersonalna'

/**
 * Whether the technique belongs in a self-service catalogue at all.
 *
 * Everything currently visible is 'ogolna'. The field exists because four
 * techniques in the source material carry medical contraindications or touch
 * eating behaviour directly, and the client still has to decide whether those
 * are unlocked per patient by a specialist instead of being listed here — see
 * "Do decyzji klienta" in `markdown/techniki-dbt.md`.
 */
export type TechniqueAvailability = 'ogolna' | 'wymagaSpecjalisty'

/** Who a text variant is written for. Empty for now — one text per technique. */
export type TechniqueAudience = 'dorosly' | 'nastolatek' | 'rodzic'

/**
 * Which half of the app a text variant belongs to.
 *
 * Empty for now. It exists so the two food-related skills ("Smak",
 * "Regularne odżywianie") can eventually carry a psychodietetic wording without
 * the technique being duplicated in the data.
 */
export type TechniqueAppModule = 'psychoterapeutyczny' | 'dietetyczny'

/** One component skill, or one numbered step, of a technique. */
export interface TechniqueStep {
  /**
   * The skill's name ("A — Aktywność", "Higiena snu").
   *
   * Optional, because a few techniques in the source document are written as
   * plain bullet points with no name of their own. Inventing names for them
   * would be adding content, so those steps are rendered by their number only.
   */
  nazwa?: string
  /** The description, transcribed from the document. Newlines are meaningful. */
  opis: string
  /** The document's own *Przykłady* line, shown as a highlighted row under the description. */
  przyklady?: string[]
  /**
   * A skill this catalogue deliberately does not explain, only names.
   *
   * Set for TIPP's "Temperatura": the source material lists medical
   * contraindications for it and recommends consulting a doctor, and this app
   * has no way of knowing whether the person reading has a heart condition.
   * A step marked this way must never carry instructions.
   */
  wprowadzaSpecjalista?: boolean
}

export interface Technique {
  /** Stable slug, used in the URL (`/techniques/:id`). */
  id: string
  nazwa: string
  /** One sentence: what the technique is for. Condensed from the technique's own description. */
  podtytul: string
  /**
   * TODO: nowhere in the client's materials is a duration given, so no number
   * here would be anything but invented — the mockup's "3 min" included. The
   * field is declared and left empty on purpose: the times have to come from
   * the specialist, and when they do, adding them is data rather than a schema
   * change. Until then the interface shows no duration at all.
   */
  czasTrwaniaMin?: number
  /**
   * Level 1 — the tabs the technique appears in.
   *
   * DELIBERATE DEPARTURE FROM THE MOCKUP — an array, not a single value. Do not
   * "fix" this back into one category without reading this first.
   *
   * Several techniques genuinely belong to two of the mockup's categories at
   * once: progressive muscle relaxation and paced breathing are both components
   * of TIPP and classic relaxation techniques, and "za i przeciw" is both a DBT
   * skill and the classic cost-benefit analysis from CBT. With disjoint folders
   * there are only bad options: duplicate the descriptions (two copies that will
   * drift apart at the first clinical correction — and corrections are coming,
   * the whole document goes to the specialists for review), or shove a technique
   * into one drawer against what it actually is.
   *
   * So a technique exists in the data exactly ONCE and shows up in as many tabs
   * as it has tags.
   *
   * As it happens, every technique currently carries exactly one tag: the two
   * relaxation ones are listed in the relaxation tab and appear inside DBT as
   * steps of TIPP rather than as rows of their own, and "za i przeciw" stays
   * untagged for CBT until the client assigns her own CBT materials. The array
   * is what makes both of those a data decision rather than a rewrite.
   */
  szkola: TechniqueSchool[]
  /** Level 2 inside the DBT tab. Optional: only DBT techniques are grouped. */
  grupa?: TechniqueGroup
  modulDBT?: TechniqueDbtModule
  dostepnosc: TechniqueAvailability
  /** The group description from the document, shown above "Jak to zrobić". */
  wprowadzenie: string
  kroki: TechniqueStep[]
  /**
   * Whether the technique has a description yet.
   *
   * The catalogue lists only techniques where this is true, so a name can be
   * recorded here ahead of its content without turning into a row that opens an
   * empty screen. Every technique in the data is currently `true`; the flag is
   * what lets the CBT and relaxation tabs fill up one technique at a time.
   */
  opisGotowy: boolean
  /** Empty in this version — see TechniqueAudience. */
  odbiorca?: TechniqueAudience[]
  /** Empty in this version — see TechniqueAppModule. */
  modulAplikacji?: TechniqueAppModule[]
}
