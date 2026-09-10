import './stepper.css'

interface StepperProps {
  /** Ties the label to the value; the buttons take their names from `label`. */
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  /** How far one tap moves the value. */
  step?: number
  min?: number
  /** Omitted means unbounded upwards. */
  max?: number
  /** How the value reads on screen and to a screen reader — '35 min', '1'. */
  formatValue?: (value: number) => string
  /** A read-only day still shows its value; it just cannot be moved. */
  disabled?: boolean
}

/**
 * Minus / value / plus, for a number somebody adjusts rather than types.
 *
 * WHY THIS EXISTS AT ALL. The app had no stepper — it had `LevelSlider` (a
 * range input for a 0-10 self-assessment) and plain text inputs, and neither
 * fits a count. A slider is wrong for minutes because it implies a bounded
 * scale with meaningful extremes, and a number field is wrong for "how many
 * times did the night break" because it opens a keyboard for an answer that is
 * almost always 0, 1 or 2.
 *
 * WHY THE BOUNDS DO NOT DISABLE THE BUTTONS. At `min` the minus is
 * `aria-disabled` and does nothing, rather than carrying the `disabled`
 * attribute. A truly disabled button drops out of the tab order the moment it
 * is pressed into its own limit, which throws keyboard focus to the top of the
 * document mid-interaction — the control works, and then loses you. Announcing
 * it as unavailable while keeping it reachable is the same information without
 * the trapdoor. (`disabled` proper is still used for the whole control on a
 * read-only day, where nothing is meant to be interactive.)
 *
 * The value is an `<output>`, whose implicit role is `status`: a screen reader
 * announces the new number after a press without the button having to describe
 * what it did. The buttons carry the field's own name ("Czas trwania: mniej"),
 * so a list of controls read out of context still says which number each moves.
 */
function Stepper({
  id,
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  formatValue = (current) => String(current),
  disabled = false,
}: StepperProps) {
  const atMin = value <= min
  const atMax = max !== undefined && value >= max

  function move(delta: number) {
    const next = value + delta
    if (next < min) return
    if (max !== undefined && next > max) return
    onChange(next)
  }

  return (
    <div className="stepper" role="group" aria-labelledby={`${id}-label`}>
      <span className="stepper-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="stepper-controls">
        <button
          type="button"
          className="stepper-button"
          aria-label={`${label}: mniej`}
          aria-disabled={atMin || disabled}
          disabled={disabled}
          onClick={() => !atMin && move(-step)}
        >
          −
        </button>
        <output className="stepper-value" id={id}>
          {formatValue(value)}
        </output>
        <button
          type="button"
          className="stepper-button"
          aria-label={`${label}: więcej`}
          aria-disabled={atMax || disabled}
          disabled={disabled}
          onClick={() => !atMax && move(step)}
        >
          +
        </button>
      </div>
    </div>
  )
}

export default Stepper
