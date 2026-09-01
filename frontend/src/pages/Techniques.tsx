import { useSearchParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import TechniqueRow from '../components/TechniqueRow'
import TechniqueSchoolTabs from '../components/TechniqueSchoolTabs'
import type { TechniqueSchool } from '../types/technique'
import {
  DEFAULT_SCHOOL,
  SCHOOL_PARAM,
  SCHOOL_TABS,
  groupedTechniques,
  isTechniqueSchool,
  techniquesForSchool,
} from '../utils/techniques'
import './journals.css'
import './techniques.css'

/**
 * "Techniki terapeutyczne" — a catalogue to read, and nothing more than that.
 *
 * The content comes from `data/techniques.ts`, which transcribes
 * `markdown/techniki-dbt.md` — descriptions the team wrote from the client's
 * materials, still awaiting clinical review. Read that file before changing any
 * text here: several passages are deliberately softened or deliberately silent.
 *
 * Two levels: the mockup's three tabs (confirmed with the client), and inside
 * DBT four groups ordered by time horizon (the document's proposal, filling in a
 * level the mockup does not settle — DBT alone is 11 techniques and some 30
 * component skills, which is not a readable flat list).
 *
 * WHAT THIS SCREEN DELIBERATELY DOES NOT DO:
 *   - no duration on a row. The mockup shows "3 min" everywhere; the client's
 *     materials give no times, so every one of those numbers would be invented.
 *   - no technique suggested from the emotions in a diary entry. The client set
 *     that aside on purpose: choosing a technique is the specialist's job, not
 *     an algorithm's. The "Propozycja na dziś" card on /home keeps its mock data.
 *   - no effectiveness rating — see the TODO on the detail screen.
 */

/**
 * A tab with nothing in it yet. Today that is CBT and only CBT: the client sent
 * materials for DBT alone, and inventing CBT technique names from general
 * knowledge would present our guess as her choice. Worded generally so it holds
 * for any tab that empties out or is added later.
 */
const EMPTY_TAB = 'Materiały w przygotowaniu — czekamy na opisy od specjalistki.'

/**
 * Shown under the relaxation list, which is not empty but is incomplete.
 *
 * Paced breathing and progressive muscle relaxation are here because the client
 * listed them as relaxation techniques herself; everything else in that tab is
 * still to come.
 */
const RELAXATION_NOTE = 'Kolejne materiały w przygotowaniu.'

function Techniques() {
  const [params, setParams] = useSearchParams()
  // Clamped rather than trusted, like the page number on the list screens:
  // `?szkola=cokolwiek` shows the default tab instead of an empty screen.
  const raw = params.get(SCHOOL_PARAM)
  const school: TechniqueSchool = isTechniqueSchool(raw) ? raw : DEFAULT_SCHOOL

  function changeSchool(next: TechniqueSchool) {
    const updated = new URLSearchParams(params)
    // The default tab is left out of the URL, so `?szkola=dbt` and the bare
    // address are not two addresses for one screen.
    if (next === DEFAULT_SCHOOL) updated.delete(SCHOOL_PARAM)
    else updated.set(SCHOOL_PARAM, next)
    setParams(updated, { replace: true })
  }

  const techniques = techniquesForSchool(school)
  const counts = Object.fromEntries(
    SCHOOL_TABS.map((tab) => [tab.school, techniquesForSchool(tab.school).length]),
  ) as Record<TechniqueSchool, number>

  // Only DBT is grouped; the other tabs render a flat list. The group is read
  // off the technique rather than assumed from the tab, so a technique tagged
  // with several schools still lands in its own section here.
  //
  // `ungrouped` is what the four groups did not claim — see groupedTechniques.
  // Rendered below the sections rather than dropped, which also keeps "how many
  // rows are on screen" equal to `techniques.length`, i.e. to the number on the
  // tab chip and to what the empty state below is keyed on.
  const grouped = school === 'dbt' ? groupedTechniques(techniques) : null

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Techniki terapeutyczne</h1>
        </div>
        <HeaderMenu />
      </header>

      <p className="techniques-intro">
        Opisy umiejętności, po które możesz sięgnąć między sesjami. Katalog jest do czytania — nic
        tu nie zapisujesz i nic nie jest raportowane. Jeśli technika Cię zainteresuje, warto o niej
        porozmawiać ze swoim specjalistą.
      </p>

      <TechniqueSchoolTabs active={school} onChange={changeSchool} counts={counts} />

      {grouped !== null && (
        <div className="techniques-sections">
          {grouped.sections.map((section) => (
            <section key={section.group} className="techniques-section">
              <h2 className="techniques-section-heading">{section.label}</h2>
              <div className="journals-list">
                {section.techniques.map((technique) => (
                  <TechniqueRow key={technique.id} technique={technique} school={school} />
                ))}
              </div>
            </section>
          ))}
          {/* No heading: a group name for these would be invented, and the point
              is only that a technique with no group is still reachable. */}
          {grouped.ungrouped.length > 0 && (
            <div className="journals-list">
              {grouped.ungrouped.map((technique) => (
                <TechniqueRow key={technique.id} technique={technique} school={school} />
              ))}
            </div>
          )}
        </div>
      )}

      {grouped === null && (
        <div className="journals-list">
          {techniques.map((technique) => (
            <TechniqueRow key={technique.id} technique={technique} school={school} />
          ))}
        </div>
      )}

      {/* An empty tab is not hidden. Where the work stands is real information,
          and it is meant to be visible to the client too. */}
      {techniques.length === 0 && <p className="journals-empty">{EMPTY_TAB}</p>}

      {school === 'relaksacyjne' && techniques.length > 0 && (
        <p className="techniques-note">{RELAXATION_NOTE}</p>
      )}
    </div>
  )
}

export default Techniques
