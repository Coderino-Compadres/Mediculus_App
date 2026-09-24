import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import { useAuth } from '../auth/authContext'
import { isSpecialist } from '../api/auth'
import { catalogueHasPlaceholders, publishedDietTechniques } from '../utils/dietTechniques'
import { PLACEHOLDER_NOTICE_LIST } from '../data/dietTechniques'
import type { DietTechnique } from '../types/dietTechnique'
import { ROUTES, dietTechniqueDetailPath } from '../routes'
import './dietTechniques.css'

/**
 * "Techniki psychodietetyczne" — §12 of the diet mockups, the list.
 *
 * A catalogue to read, like the psychotherapy one, and built from the same
 * parts: a row that is a link, a card, a step list with a drawn marker. It
 * wears this module's clothes though — its own stylesheet, its own class
 * prefix, ochre as the accent — because `pages/techniques.css` and
 * `components/techniqueCatalogue.css` dress a different catalogue and sharing
 * them is how two screens end up being changed as one by accident.
 *
 * THE CONTENT IS NOT WRITTEN YET. The foundation writes it; both mockup sets
 * say so on the artboard. What is in `data/dietTechniques.ts` today is ten
 * placeholders that read as placeholders in every field, and the notice below
 * says that out loud rather than leaving a patient to work it out. It is driven
 * by the entries themselves (`catalogueHasPlaceholders`), so it goes away in the
 * same edit that fills the last one in — nobody has to remember a flag. See that
 * file for how to swap the real thing in.
 *
 * WHAT THIS SCREEN DELIBERATELY DOES NOT DO:
 *   - **no tabs, no categories, no search.** Both mockup sets are explicit:
 *     "Lista bez kategorii i bez podpowiedzi «polecane dla Ciebie»" and
 *     "Dziewięć pozycji na jednej liście, w stałej kolejności". The
 *     psychotherapy catalogue's `TechniqueSchoolTabs` is not reused and not
 *     parametrised — tabs here would be against the artboard, and generalising
 *     that component would edit the other module for nothing.
 *   - **no coloured dot on a row.** §12 draws one and its own note says the
 *     colour is "wyłącznie oznaczeniem porządkowym listy, nie sugestią emocji,
 *     do której technika «pasuje»". In this app a coloured dot on a row has so
 *     far always meant a mood or an emotion (the diary rows, the meal chips),
 *     so it would be read as exactly the thing the note rules out. Left out
 *     rather than drawn with a disclaimer nobody reads.
 *   - **no technique suggested from anything.** No "polecane dla Ciebie", no
 *     proposal after a hard entry. The client's rule, repeated twice in §12:
 *     choosing a technique is the specialist's job.
 *   - **no effectiveness question** — see the TODO on the detail screen.
 *   - **no pagination.** Two reasons, and the first one is the artboard: §12
 *     draws one scrolling list, and the client's own note counts the items as
 *     one set ("dziewięć pozycji na jednej liście"). The second is that the
 *     psychotherapy catalogue's eleven rows have none either, so a patient
 *     crossing between the modules meets one catalogue, not two. This is a
 *     departure from the house rule of seven (CLAUDE.md §4) and it is the only
 *     list screen in this module without it.
 */

/**
 * Said in the module's own voice: what the list is, and that nothing picks for you.
 *
 * **No number in it, and none is coming.** How many techniques there are is
 * whatever the data holds; a count written into a sentence is the same hardcoded
 * ten as a count written into the code, except a patient reads it and it is wrong
 * from the first time the foundation sends nine or twelve. Pinned by a test.
 */
export const INTRO =
  'Krótkie ćwiczenia, po które możesz sięgnąć wtedy, kiedy ich potrzebujesz. Nic nie jest tu dobierane automatycznie — wybór należy do Ciebie.'

/**
 * No technique at all.
 *
 * Reachable today only through the one-line switch in `data/dietTechniques.ts`,
 * and it is worth keeping honest: one sentence, nothing to press. There is
 * nothing a patient could do about an empty catalogue, so a button here would
 * suggest otherwise.
 */
export const EMPTY =
  'Nie ma tu jeszcze żadnej techniki. Pojawią się, kiedy fundacja przygotuje opisy.'

function TechniqueRow({ technique }: { technique: DietTechnique }) {
  return (
    <li className="diet-techniques-row">
      <Link className="diet-techniques-link" to={dietTechniqueDetailPath(technique.id)}>
        <span className="diet-techniques-name">{technique.nazwa}</span>
        {/* The artboard's meta line: how long it takes and when to reach for
            it, in that order, separated by the module's middle dot. Both are
            printed exactly as the data holds them — nothing here formats a
            duration, because a duration here is text (see DietTechnique). */}
        <span className="diet-techniques-meta">
          {technique.czasTrwania} · {technique.momentZastosowania}
        </span>
        <span className="diet-techniques-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  )
}

function DietTechniques() {
  // Order is the data file's order; nothing sorts it and nothing counts it.
  const techniques = publishedDietTechniques()
  const { user } = useAuth()
  const specialist = user !== null && isSpecialist(user)

  return (
    <div className="diet-techniques-page">
      <header className="diet-techniques-header">
        {/* The arrow the whole module has and the psychotherapy catalogue does
            not: /diet screens are entered from the module's home and several of
            them have no other way back. Same label as its siblings. */}
        {/* A specialist reads this catalogue from their panel, and /diet is a
            patient's home they would only be bounced out of. */}
        <Link
          className="diet-techniques-back"
          to={specialist ? ROUTES.specialistHome : ROUTES.diet}
          aria-label={
            specialist ? 'Wróć do panelu' : 'Wróć do strony głównej modułu dietetycznego'
          }
        >
          ←
        </Link>
        <div className="diet-techniques-header-titles">
          <p className="diet-techniques-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Techniki psychodietetyczne</h1>
        </div>
        <HeaderMenu />
      </header>

      <p className="diet-techniques-intro">{INTRO}</p>

      {/* Asked of the entries, not of a flag — see catalogueHasPlaceholders. It
          is on the screen rather than in a comment because a patient reading
          placeholder rows deserves to know why they are there, and because this
          app would rather show an open question than hide it. */}
      {/* A plain paragraph, deliberately not `role="status"`: this is on the
          page from the first paint and never changes while the screen is open,
          and a live region that never updates is an announcement waiting for
          news that does not come. The psychotherapy catalogue's `role="status"`
          note is the other case — it appears when a request fails. */}
      {catalogueHasPlaceholders() && (
        <p className="diet-techniques-pending">{PLACEHOLDER_NOTICE_LIST}</p>
      )}

      {techniques.length === 0 ? (
        <p className="diet-techniques-empty">{EMPTY}</p>
      ) : (
        /* `role="list"` restated on purpose: `list-style: none` makes WebKit
           drop list semantics, so without it VoiceOver stops calling this a list
           of anything. Harmless everywhere else. */
        <ul className="diet-techniques-list" role="list">
          {techniques.map((technique) => (
            <TechniqueRow key={technique.id} technique={technique} />
          ))}
        </ul>
      )}
    </div>
  )
}

export default DietTechniques
