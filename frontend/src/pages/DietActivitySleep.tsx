import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import DietActivityPanel from '../components/DietActivityPanel'
import DietSleepPanel from '../components/DietSleepPanel'
import { useCurrentDay } from '../hooks/useCurrentDay'
import { fromIsoDate } from '../utils/days'
import { nightLabel } from '../utils/sleep'
import { ROUTES } from '../routes'
import './dietActivitySleep.css'

/**
 * "Aktywność i sen" — §09 of `Makiety modułu dietetycznego`, both screens of it.
 *
 * TWO SCREENS, ONE ROUTE, and that is the change this makes to the mockup. §03
 * gives the module's menu a single entry called "Aktywność i sen", and §09's own
 * design note says the two artboards are reached "z jednej pozycji menu — w
 * prototypie przełączasz się między nimi przez menu". Switching by menu is a
 * limitation of a click-through prototype, not a design decision: in a real app
 * it would mean leaving the screen to reach its other half. So the two share one
 * address and a segmented switch, and the menu keeps the one entry §03 asks for.
 *
 * WHAT IS TAKEN FROM THE MOCKUP is the layout: the order of the cards, the two
 * hours side by side above the computed length, the chip rows, the step count on
 * its own quiet card. WHAT IS NOT is the wording and the scope — see the two
 * panels for the specific departures ("Lepsze" rather than "Dobre", nouns rather
 * than feminine adjectives on the wake-feeling chips, no seven-night chart).
 *
 * BOTH ARTBOARDS ARE MARKED "Etap 2 — jeśli starczy czasu", so this is
 * deliberately the smallest thing that is genuinely usable. Nothing here is a
 * placeholder for a richer version.
 *
 * THE HEADER IS THE ONE BOTH MODULES SHARE: the back arrow on the left, the
 * nadtytuł and `<h1>` in the middle, the menu on the right — what both of the
 * client's mockup sets draw and what pages/DiaryEntry.tsx and
 * pages/JournalDetail.tsx already do. The *structure* is shared; the styling is
 * the diet module's own (own class prefix, own stylesheet, tokens from
 * styles/theme.css), because dressing one screen in another's class names is the
 * mistake styles/panel.css exists to undo.
 *
 * THE ARROW IS A LINK, NOT A BUTTON, and the rule behind that is worth stating
 * because the two look identical. A screen whose back control has to *run*
 * something first — pages/DiaryEntry.tsx, which asks about unsaved changes —
 * needs a button. A screen that simply goes somewhere is a link, and gets the
 * things only a link has: middle-click and cmd-click to open in a new tab, the
 * destination on hover, "copy link address". This screen has no guard, so it is
 * a link wearing the arrow's shape.
 *
 * BOTH PANELS STAY MOUNTED, which is a correctness matter rather than a
 * preference. They were rendered as a ternary, so switching to "Sen" destroyed
 * the activity panel's state: a patient who had logged two activities and typed
 * a step count, then went to describe last night, came back to an empty list and
 * an empty field. Nothing persists them — there is no backend — so the unmount
 * was not tidiness, it was data loss. `hidden` keeps both alive and out of the
 * accessibility tree, and it is also what lets each panel keep a stable id for
 * its tab's `aria-controls` to point at.
 */

const TABS = [
  { id: 'activity', label: 'Aktywność' },
  { id: 'sleep', label: 'Sen' },
] as const

type TabId = (typeof TABS)[number]['id']

function DietActivitySleep() {
  /**
   * Fixed at mount, like pages/DiaryEntry.tsx and pages/Journals.tsx.
   *
   * Which is precisely why both panels still check the day lock: a phone left
   * open overnight holds a `today` that has stopped being today, and the check
   * is what stops the form offering to write into a day that has ended.
   */
  const today = useMemo(() => new Date(), [])

  /**
   * The live calendar day, for the subtitle only.
   *
   * The panels ask for it themselves to decide whether they may still be written
   * to. Here it does something smaller but just as visible: a screen left open
   * across midnight would otherwise go on naming yesterday under the title.
   */
  const currentDay = useCurrentDay()
  const currentDate = fromIsoDate(currentDay)

  /**
   * Which half is on screen. Component state rather than the URL.
   *
   * The app does put view state in the address where losing it costs something
   * — `?page=` on both list screens, so that opening a row from page three and
   * coming back returns to page three. Nothing navigates away from here and
   * back, so the same argument does not apply.
   *
   * TODO(klientka): if the module ever links straight to the sleep form (a
   * morning reminder is the obvious candidate), this wants to move into the
   * query string so the link can name which half it means.
   */
  const [tab, setTab] = useState<TabId>('activity')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  /**
   * Left/right arrows move between the tabs, Home/End jump to the ends — the
   * keyboard contract a `tablist` promises the moment it claims the role.
   * Selection follows focus, which is the right choice for two panels that are
   * both already rendered: there is nothing to load, so there is nothing to
   * make a user confirm.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    const target = TABS[next]
    setTab(target.id)
    tabRefs.current[target.id]?.focus()
  }

  /* Under the title: which day the activity entries belong to, or which night
     the sleep entry describes. The sleep screen cannot say "piątek" — the entry
     spans two days and belongs to neither on its own. */
  const subtitle =
    tab === 'activity'
      ? currentDate.toLocaleDateString('pl-PL', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : nightLabel(currentDate)

  return (
    <div className="diet-as-page">
      <header className="diet-as-header">
        <Link
          className="diet-as-back"
          to={ROUTES.diet}
          aria-label="Wróć do strony głównej modułu dietetycznego"
        >
          ←
        </Link>
        <div className="diet-as-header-titles">
          <p className="diet-as-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Aktywność i sen</h1>
          <p className="diet-as-subtitle">{subtitle}</p>
        </div>
        <HeaderMenu />
      </header>

      <div className="diet-as-switch" role="tablist" aria-label="Aktywność albo sen">
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            ref={(node) => {
              tabRefs.current[entry.id] = node
            }}
            type="button"
            role="tab"
            id={`diet-as-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`diet-as-panel-${entry.id}`}
            // Roving tabindex: one stop for the whole group, then the arrows.
            // Two tab stops for two views of one screen is noise.
            tabIndex={tab === entry.id ? 0 : -1}
            className={
              tab === entry.id ? 'diet-as-switch-tab diet-as-switch-tab-active' : 'diet-as-switch-tab'
            }
            onClick={() => setTab(entry.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/* Both mounted, the inactive one `hidden`. See the note at the top: a
          ternary here destroyed whatever was on the panel being left, and
          nothing in this module persists it. `hidden` also takes the panel out
          of the accessibility tree, so the two ids below are always in the DOM
          and each tab's `aria-controls` points at something real — which it did
          not when only the active panel was rendered. */}
      <div
        role="tabpanel"
        id="diet-as-panel-activity"
        aria-labelledby="diet-as-tab-activity"
        hidden={tab !== 'activity'}
      >
        <DietActivityPanel today={today} />
      </div>
      <div
        role="tabpanel"
        id="diet-as-panel-sleep"
        aria-labelledby="diet-as-tab-sleep"
        hidden={tab !== 'sleep'}
      >
        <DietSleepPanel today={today} />
      </div>
    </div>
  )
}

export default DietActivitySleep
