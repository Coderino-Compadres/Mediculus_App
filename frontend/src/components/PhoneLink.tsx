import type { PhoneNumber } from '../utils/phone'
import { telHref } from '../utils/phone'

interface PhoneLinkProps {
  phone: PhoneNumber
  /** Who or what is being called, so the link does not read as a bare number to a screen reader. */
  label: string
  className?: string
}

/**
 * A phone number as a real `tel:` link.
 *
 * A real anchor rather than a button with a handler: on a phone this has to
 * place the call with one tap, and it also has to be long-pressable, copyable and
 * reachable by a keyboard — all of which an `<a href="tel:">` gets for free and a
 * click handler has to reimplement badly.
 *
 * `aria-label` names the number's owner as well as the digits, because the link
 * text alone ('800 70 2222') is read out as a string of numerals with no clue
 * what answering it means — and the surrounding text that explains it is not part
 * of the link, so it does not reach somebody tabbing through them.
 */
function PhoneLink({ phone, label, className }: PhoneLinkProps) {
  return (
    <a href={telHref(phone)} className={className} aria-label={`${label}, zadzwoń pod numer ${phone.display}`}>
      {phone.display}
    </a>
  )
}

export default PhoneLink
