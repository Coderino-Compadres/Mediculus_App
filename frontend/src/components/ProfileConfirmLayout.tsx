import { useEffect, useRef, type ReactNode } from 'react'
// `.profile-confirm-lead`, plus the archival entry's frame this screen wears
// (.journal-detail-*), which stays in its own file for the same reason the
// collapse rules do — pages/JournalDetail.tsx renders it too.
import './profileForms.css'
import '../pages/journalDetail.css'

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
  moduleLabel = 'PSYCHOTERAPIA',
  children,
}: {
  title: string
  lead: string
  /** Leaves without doing anything — every one of these screens is escapable. */
  onBack: () => void
  /**
   * The nadtytuł over the title — which module the reader is standing in.
   *
   * It used to be the literal 'PSYCHOTERAPIA', which was true while /profile
   * was the only screen that opened these confirmations. The diet module has a
   * profile of its own now, offering the same consent register through the same
   * component, and a patient who pressed "Wycofaj tę zgodę" under a header
   * reading DIETETYKA I PSYCHODIETETYKA was being shown the other module's name
   * on the screen that takes the decision — on a screen whose entire job is to
   * be exact about what is happening and to whom.
   *
   * Defaulted rather than required, so every existing caller keeps the label it
   * had and this stays a strictly additive change: a screen that does not say
   * otherwise is still the psychotherapy one.
   */
  moduleLabel?: string
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
          <p className="journal-detail-module-label">{moduleLabel}</p>
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
