import { Link, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import { findDietTechnique } from '../utils/dietTechniques'
import { PLACEHOLDER_NOTICE_TECHNIQUE } from '../data/dietTechniques'
import type { DietTechniqueStep } from '../types/dietTechnique'
import { ROUTES } from '../routes'
import './dietTechniques.css'

/**
 * One psychodietetic technique — §12, the detail. Read-only: there is nothing
 * to save here.
 *
 * The text comes from `data/dietTechniques.ts`, which holds placeholders until
 * the foundation writes the content. Read that file's header before editing any
 * of it — in particular before giving a placeholder a plausible name.
 *
 * A TECHNIQUE THAT IS STILL A PLACEHOLDER SAYS SO HERE, not only on the list.
 * This address is what gets copied into a message, and somebody who opens it
 * never passed the list at all; before `zastepczy` the only thing marking this
 * screen as unfinished was the placeholder wording itself, which is exactly what
 * stops being reliable the moment anyone writes a plausible name over it.
 */

/** The line at the foot of the screen. Why it is its own sentence: see the comment on it below. */
export const DISCLAIMER =
  'To materiał do czytania. Opisy nie zastępują kontaktu ze specjalistą — jeśli któraś z technik ma wejść na stałe do Twojego dnia, warto omówić ją na wizycie.'

/**
 * What the screen says about an address that names no technique it may show.
 *
 * Exported so the tests can say "the screen shows its not-found line" instead of
 * repeating the line — a correction to the wording is not a broken screen.
 */
export const NOT_FOUND = 'Nie znaleziono takiej techniki.'

function StepList({ steps }: { steps: DietTechniqueStep[] }) {
  return (
    /* `role="list"` restated on purpose: `list-style: none` makes WebKit drop
       list semantics, and this list is the one place in the module that depends
       on them — the drawn number is aria-hidden precisely because the <ol> is
       supposed to be counting. Without the role a VoiceOver listener gets no
       step numbers at all, from either source. */
    <ol className="diet-technique-steps" role="list">
      {steps.map((step, index) => (
        <li
          // Steps are static content with no id of their own; the name is
          // unique within a technique where it exists, and the index covers the
          // unnamed ones. Nothing here reorders or is inserted at runtime.
          key={step.nazwa ?? index}
          className="diet-technique-step"
        >
          {/* The marker is drawn rather than left to the list's own numbering,
              which is what lets a technique put a letter there instead (§12
              draws both).

              A DRAWN NUMBER IS HIDDEN, A LETTER IS NOT. The `<ol>` already
              tells a screen reader which item this is, so reading "1" before
              the first step says it twice. A letter is the opposite case: it is
              content — the technique is the mnemonic it spells — and hiding it
              would leave a listener with the four steps of something whose name
              they cannot reconstruct. */}
          {step.etykieta === undefined ? (
            <span className="diet-technique-step-marker" aria-hidden="true">
              {index + 1}
            </span>
          ) : (
            <span className="diet-technique-step-marker">{step.etykieta}</span>
          )}
          <div className="diet-technique-step-body">
            {step.nazwa && <h3 className="diet-technique-step-name">{step.nazwa}</h3>}
            <p className="diet-technique-step-text">{step.opis}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function DietTechniqueDetail() {
  const { id } = useParams<{ id: string }>()
  // No request and no loading state: this catalogue ships with the app. The
  // psychotherapy screen waits for the specialists' half of its catalogue
  // before saying "nie znaleziono"; there is no second half here to wait for.
  const technique = findDietTechnique(id)

  if (!technique) {
    /* The same answer the rest of the module gives: a typed-in address and a
       technique that is withheld are indistinguishable from here, and neither
       tells the patient anything they could act on. Nothing on this screen
       implies the technique exists somewhere. */
    return (
      <div className="diet-techniques-page">
        <p className="diet-techniques-not-found">{NOT_FOUND}</p>
        <Link className="diet-techniques-back-link" to={ROUTES.dietTechniques}>
          ← Wróć do technik
        </Link>
      </div>
    )
  }

  return (
    <div className="diet-techniques-page">
      <header className="diet-techniques-header">
        <Link
          className="diet-techniques-back"
          to={ROUTES.dietTechniques}
          aria-label="Wróć do technik psychodietetycznych"
        >
          ←
        </Link>
        <div className="diet-techniques-header-titles">
          <p className="diet-techniques-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>{technique.nazwa}</h1>
          {/* Two chips, as the artboard draws them: the duration in the
              module's ochre, the moment in the neutral one. Ochre is this
              module's "state" colour — the chip you picked, the hour you
              entered — and how long something takes is the nearer of the two to
              that role. Neither is a verdict and neither is red. */}
          <p className="diet-technique-chips">
            <span className="diet-technique-chip diet-technique-chip-time">
              {technique.czasTrwania}
            </span>
            <span className="diet-technique-chip">{technique.momentZastosowania}</span>
          </p>
        </div>
        <HeaderMenu />
      </header>

      {/* Above the introduction rather than beside the title: it has to be read
          before the steps are, and it is the same paragraph, in the same class,
          that the list uses — one visual language for one statement. Plain <p>
          for the reason the list gives: static from first paint. */}
      {technique.zastepczy && (
        <p className="diet-techniques-pending">{PLACEHOLDER_NOTICE_TECHNIQUE}</p>
      )}

      {/* No heading over the introduction: the artboard opens with the text
          itself, and "Wprowadzenie" over one paragraph is a label for the sake
          of having one. */}
      <section className="diet-techniques-card">
        <p className="diet-technique-intro">{technique.wprowadzenie}</p>
      </section>

      <section className="diet-techniques-card" aria-labelledby="diet-technique-steps-heading">
        <h2 id="diet-technique-steps-heading">Kroki</h2>
        <StepList steps={technique.kroki} />
      </section>

      {/* TODO(klientka): this is where "Czy to pomogło?" — the three buttons
          "Pomogło / Trochę / Nie tym razem" — would go. It is left out on
          purpose, and there are four reasons rather than one:

          1. The same three buttons are a blocked TODO on the psychotherapy
             detail screen (pages/TechniqueDetail.tsx), because the client's own
             materials describe rating three different ways — yes/no plus why on
             the exercise cards, a 1-100 arousal scale before and after for
             TIPP, and the mockup's three-way split that appears nowhere else.
             Building one of them here picks the variant she never proposed.
          2. Two tests in that module pin the buttons' absence, so shipping them
             here would leave the app answering the same question two ways.
          3. The answer has nowhere to go. §12 says it "trafia do raportu jako
             informacja «co zostało zastosowane»" — that is the third column of
             "Zestawienie tygodnia", which does not exist and carries its own
             TODO(§12) in pages/DietReportDetail.tsx. A button that records
             something nothing reads is a promise the app does not keep.
          4. Underneath all three sits one open question for the whole app:
             whether Mediculus gets a skills-practice module (the patient picks
             a technique, records that they used it) or stays a catalogue to
             read. Putting buttons here would quietly answer it.

          Blocked on: the client's decision. Waiting on the same decision:
          the TODO in pages/TechniqueDetail.tsx and the TODO(§12) in
          pages/DietReportDetail.tsx. */}

      {/* A third disclaimer, and deliberately not a copy of either existing one.
          APP_DISCLAIMER (utils/disclaimer.ts) is about the app as a whole and is
          already on this module's home screen; the psychotherapy catalogue's
          line is written for therapy and says "omów ją na sesji". This one says
          what is true here: a dietitian's patient has wizyty, and what they
          would take away from this screen is a habit rather than a skill to
          practise between sessions. */}
      <section className="diet-techniques-disclaimer">
        <span aria-hidden="true">ⓘ</span>
        <p>{DISCLAIMER}</p>
      </section>
    </div>
  )
}

export default DietTechniqueDetail
