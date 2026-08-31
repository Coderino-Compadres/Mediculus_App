import { useId, useState, type ReactNode } from 'react'

/**
 * A card whose body folds away behind its own heading.
 *
 * The two account-settings sections on the profile are collapsed by default, as
 * in the mockup: they are things a person changes once a year, and expanded they
 * would push everything that matters more — the counters, the care details, the
 * consents — below the fold.
 *
 * Styling is the entry form's collapsible (.diary-entry-collapse-*), reused
 * rather than reinvented so the gesture looks the same wherever it appears.
 */
function CollapsibleCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Generated rather than passed in: the id only exists to tie the button to the
  // region it controls, so no caller should have to invent one.
  const bodyId = useId()

  return (
    <section className="profile-card">
      <button
        type="button"
        className="diary-entry-collapse-toggle"
        aria-expanded={open}
        // Set only while the body is actually in the DOM (see below): collapsed,
        // aria-controls would point at an id that does not exist.
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="diary-entry-collapse-chevron" aria-hidden="true">
          {open ? '⌃' : '⌄'}
        </span>
      </button>
      {/* Kept in the DOM only while open: a hidden form's inputs would still be
          reachable by keyboard, and a screen reader would read fields nobody
          asked for. */}
      {open && (
        <div className="diary-entry-collapse-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  )
}

export default CollapsibleCard
