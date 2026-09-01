import type { TechniqueStep } from '../types/technique'
import './techniqueCatalogue.css'

interface TechniqueStepListProps {
  steps: TechniqueStep[]
}

/**
 * The "Jak to zrobić" list: the component skills of a technique, or its numbered
 * steps — the same shape covers both (seven letters of ACCEPTS, six senses of
 * self-soothing, seven steps of DEAR MAN).
 *
 * An `<ol>`, because in every one of them the order is part of the technique.
 * The number is drawn rather than left to the list marker so an unnamed step —
 * the source document writes a few techniques as plain bullets — still has
 * something to be referred to by.
 *
 * A step marked `wprowadzaSpecjalista` is rendered as a note instead of an
 * instruction: TIPP's "Temperatura" is named here but deliberately not explained
 * (medical contraindications — see the data file).
 */
function TechniqueStepList({ steps }: TechniqueStepListProps) {
  return (
    <ol className="technique-steps">
      {steps.map((step, index) => (
        <li
          // Steps are static content with no id of their own; the name is unique
          // within a technique where it exists, and the index covers the unnamed
          // bullets. Nothing here reorders or is inserted at runtime.
          key={step.nazwa ?? index}
          className={
            step.wprowadzaSpecjalista ? 'technique-step technique-step-specialist' : 'technique-step'
          }
        >
          <span className="technique-step-index" aria-hidden="true">
            {index + 1}
          </span>
          <div className="technique-step-body">
            {step.nazwa && <h3 className="technique-step-name">{step.nazwa}</h3>}
            <p className="technique-step-text">{step.opis}</p>
            {step.wprowadzaSpecjalista && (
              <p className="technique-step-flag">Do omówienia ze specjalistą</p>
            )}
            {/* The document's own *Przykłady* line, kept as a separate,
                highlighted row under the description — and singular when the
                document gave one example rather than a list. */}
            {step.przyklady && step.przyklady.length > 0 && (
              <p className="technique-step-examples">
                <span className="technique-step-examples-label">
                  {step.przyklady.length === 1 ? 'Przykład:' : 'Przykłady:'}
                </span>{' '}
                {step.przyklady.join(' · ')}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default TechniqueStepList
