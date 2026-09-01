import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The frame every confirmation screen on the profile shares: a back arrow, the
 * module label, a title and a lead paragraph.
 *
 * A full screen rather than a dialog, because each of these decisions needs room
 * for what it actually does — a modal that has to explain the legal consequences
 * of withdrawing a consent is a modal nobody reads. Visually it is the archival
 * diary entry's frame (journalDetail.css), so an unfamiliar screen still looks
 * like part of the app.
 *
 * Being a screen without being a route costs one thing that has to be paid back
 * by hand: `RouteChange` announces a new screen and moves focus only when the
 * *path* changes, and these three share /profile. So the heading takes focus on
 * mount — which both puts the keyboard somewhere sensible (the button that opened
 * this screen has just unmounted, dropping focus to <body>) and gets the title
 * read out, so a screen-reader user is told they are now on a confirmation screen
 * rather than silently landing on one.
 */
function ProfileConfirmLayout({
  title,
  lead,
  onBack,
  children,
}: {
  title: string
  lead: string
  /** Leaves without doing anything — every one of these screens is escapable. */
  onBack: () => void
  children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)

  // On mount only: the title is what identifies the screen, and re-focusing it
  // after every render would fight the user for the caret in the password field.
  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <div className="journal-detail-page">
      <header className="journal-detail-header">
        <button
          type="button"
          className="journal-detail-back"
          onClick={onBack}
          aria-label="Wróć do profilu"
        >
          ←
        </button>
        <div className="journal-detail-header-titles">
          <p className="journal-detail-module-label">PSYCHOTERAPIA</p>
          {/* tabIndex -1 so it can be focused programmatically without joining
              the tab order. */}
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
        </div>
      </header>

      <p className="profile-confirm-lead">{lead}</p>

      {children}
    </div>
  )
}

export default ProfileConfirmLayout
