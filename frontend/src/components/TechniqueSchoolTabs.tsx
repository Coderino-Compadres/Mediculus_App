import type { TechniqueSchool } from '../types/technique'
import { SCHOOL_TABS } from '../utils/techniques'
import './techniqueCatalogue.css'

interface TechniqueSchoolTabsProps {
  active: TechniqueSchool
  onChange: (school: TechniqueSchool) => void
  /** How many ready techniques each tab holds, shown next to its label. */
  counts: Record<TechniqueSchool, number>
}

/**
 * Level 1 of the catalogue: DBT / CBT / Relaksacyjne.
 *
 * Chips with `aria-pressed` rather than a `role="tablist"` widget, the same
 * pattern (and the same styles) as the filters on "Dzienniczki" and the period
 * chips on "Analiza" — one family, and no half-built tab keyboard model.
 *
 * A tab with no content still shows: its empty state is real information about
 * where the work stands, and the client is meant to see it.
 */
function TechniqueSchoolTabs({ active, onChange, counts }: TechniqueSchoolTabsProps) {
  return (
    <div className="journals-filters" role="group" aria-label="Szkoła terapii">
      {SCHOOL_TABS.map((tab) => (
        <button
          key={tab.school}
          type="button"
          aria-pressed={tab.school === active}
          className={
            tab.school === active
              ? 'journals-filter-chip journals-filter-chip-active'
              : 'journals-filter-chip'
          }
          onClick={() => onChange(tab.school)}
        >
          {tab.label}
          {/* The count is what makes an empty tab legible before it is opened —
              "CBT 0" reads as "nothing here yet" rather than as a broken tab. */}
          <span className="technique-tab-count">{counts[tab.school]}</span>
        </button>
      ))}
    </div>
  )
}

export default TechniqueSchoolTabs
