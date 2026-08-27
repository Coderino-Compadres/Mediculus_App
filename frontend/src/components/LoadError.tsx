import './loadError.css'

interface LoadErrorProps {
  message: string
  onRetry: () => void
  /** The screen's own status classes, so the box matches the one it replaces. */
  className: string
}

/**
 * A failed load, with a way to try again.
 *
 * Four screens said "Spróbuj ponownie" as plain text and offered nothing to
 * press — the only way to act on that sentence was to reload the page by hand,
 * which on a phone means finding the browser chrome a standalone PWA has
 * hidden. Home already had a real button; this is the same affordance
 * everywhere else.
 */
function LoadError({ message, onRetry, className }: LoadErrorProps) {
  return (
    <div className={className} role="alert">
      <p>{message}</p>
      <button type="button" className="load-error-retry" onClick={onRetry}>
        Spróbuj ponownie
      </button>
    </div>
  )
}

export default LoadError
