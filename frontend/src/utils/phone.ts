/**
 * A phone number as it is dialled and as it is read.
 *
 * Two strings rather than one, because they are genuinely different: `dial` goes
 * into a `tel:` href and has to be unpunctuated (a space or a dash in there is
 * dialled by some handsets and dropped by others), while `display` is grouped the
 * way the line publishes it — '800 70 2222', not '800702222', which nobody can
 * read back to a friend or copy onto paper.
 *
 * Shared rather than per-screen: crisis lines, the people a patient trusts and
 * the treating specialist are all rendered as the same kind of link, and one of
 * them formatting numbers differently would look like a data error.
 */
export interface PhoneNumber {
  /** Digits only (a leading '+' allowed for an international line), for `tel:`. */
  dial: string
  /** Grouped for reading aloud: '800 70 2222'. */
  display: string
}

/** The href for a `<a>` that should place a call on a phone. */
export function telHref(phone: PhoneNumber): string {
  return `tel:${phone.dial}`
}
