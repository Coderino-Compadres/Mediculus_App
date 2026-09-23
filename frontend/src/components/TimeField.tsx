import { useEffect, useRef, useState } from 'react'
import './timeField.css'

/**
 * A time of day, entered as HH:MM and always on a 24-hour clock.
 *
 * WHY THIS EXISTS AND NOT `<input type="time">`. The native control is rendered
 * by the browser in the *browser's* locale, not the page's: on a Chrome set to
 * English it draws "02:46 PM", and `<html lang="pl">` does not change it — both
 * were checked side by side before this file was written. The value it hands
 * back is 24-hour either way, so nothing downstream was ever wrong; what was
 * wrong is what a patient reads while typing it. Polish has no "pm", and a
 * clinical diary that shows one to some patients and not others is telling two
 * different stories about the same meal.
 *
 * WHAT IT COSTS, stated plainly because it is a real loss: there is no native
 * clock picker any more. On a phone this is a numeric keypad (`inputMode`)
 * rather than a dial. That is the trade the 24-hour guarantee is bought with.
 *
 * THE VALUE CONTRACT IS THE NATIVE ONE, so this drops into the four places that
 * had `type="time"` without changing any of them: `value` is 'HH:MM' or '', and
 * `onChange` is called with 'HH:MM' once a complete, valid time is typed and
 * with '' while it is not. A half-typed "14:" is not a time, exactly as the
 * native control reports nothing for one.
 *
 * WHAT IT DOES NOT DO is throw away what somebody typed. An hour of 99 stays on
 * screen, marked invalid and explained, rather than being silently erased or
 * silently corrected — the same rule the rest of the app follows about never
 * inventing a value nobody chose.
 */

/** Digits only, at most four: '1446' for 14:46. The mask is derived from this
 *  rather than from the visible string, so Backspace walks back through it one
 *  digit at a time instead of getting stuck on the colon. */
function toDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, 4)
}

/**
 * '1446' → '14:46', '144' → '14:4', '1' → '1'.
 *
 * A first digit of 3 or more cannot start an hour, so it is read as a one-digit
 * hour and the colon goes in straight away: typing 9 gives '09:', ready for the
 * minutes. This is what the native control did and what keeps single-digit
 * hours quick to type.
 *
 * `trailingColon` is off while somebody is deleting, and it is not a nicety.
 * A finished hour is shown as '14:' so the next keystroke lands where it looks
 * like it will — but if the mask also added that colon back during a delete,
 * Backspace on '14:' would remove the colon and immediately get it again, and
 * the field could never be emptied from the keyboard at all. Caught by
 * TimeField.test.tsx before this shipped.
 */
function mask(digits: string, trailingColon = true): string {
  if (digits === '') return ''
  if (digits.length === 1) {
    if (Number(digits) < 3) return digits
    return trailingColon ? `0${digits}:` : `0${digits}`
  }
  if (digits.length === 2 && !trailingColon) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** 'HH:MM' when the string names a real time of day, else null. */
export function parseTime(text: string): string | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(text.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** What the field shows for a value handed in from outside. */
function display(value: string): string {
  return parseTime(value) ?? ''
}

export default function TimeField({
  id,
  value,
  onChange,
  className,
  readOnly = false,
  'aria-describedby': describedBy,
}: {
  id: string
  /** 'HH:MM' or '' — the native control's contract. */
  value: string
  /** Called with 'HH:MM' for a complete valid time, '' otherwise. */
  onChange: (value: string) => void
  className?: string
  readOnly?: boolean
  'aria-describedby'?: string
}) {
  const [text, setText] = useState(() => display(value))
  /** What this field last reported upwards. Lets an outside change be told
   *  apart from the echo of our own `onChange`, which must not reformat what
   *  somebody is still typing. */
  const reported = useRef(display(value))

  useEffect(() => {
    if (value === reported.current) return
    reported.current = display(value)
    setText(display(value))
  }, [value])

  const complete = parseTime(text)
  /** Wrong rather than unfinished: '25:00' is a mistake worth naming, '14:' is
   *  just somebody mid-keystroke and gets no red ink. */
  const invalid = text !== '' && complete === null && toDigits(text).length === 4
  const errorId = `${id}-time-error`

  function edit(next: string, deleting: boolean) {
    const shown = mask(toDigits(next), !deleting)
    setText(shown)
    const parsed = parseTime(shown) ?? ''
    reported.current = parsed
    onChange(parsed)
  }

  /** Pads on the way out — '9:5' typed with a colon becomes '09:05'. Only ever
   *  formats what is already a valid time; it never guesses a missing half. */
  function normalize() {
    const parsed = parseTime(text)
    if (parsed && parsed !== text) setText(parsed)
  }

  return (
    <>
      <input
        id={id}
        type="text"
        className={className}
        value={text}
        readOnly={readOnly}
        inputMode="numeric"
        autoComplete="off"
        placeholder="--:--"
        maxLength={5}
        size={5}
        aria-invalid={invalid}
        aria-describedby={[describedBy, invalid ? errorId : null].filter(Boolean).join(' ') || undefined}
        onChange={(event) => {
          // `inputType` rather than a length comparison against `text`: React
          // batches state, so during fast repeats `text` is the render before
          // last and the field decides it is growing while it shrinks. The
          // browser says what the edit was, and it is never stale.
          const how = (event.nativeEvent as InputEvent).inputType ?? ''
          edit(event.target.value, how.startsWith('delete'))
        }}
        onBlur={normalize}
      />
      {invalid && (
        <p className="time-field-error" id={errorId} role="alert">
          Godzina zapisywana jest w formacie 24-godzinnym, od 00:00 do 23:59.
        </p>
      )}
    </>
  )
}
