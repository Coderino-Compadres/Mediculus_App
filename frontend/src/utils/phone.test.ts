import { describe, expect, it } from 'vitest'
import { telHref, type PhoneNumber } from './phone'

/**
 * A number is two strings on purpose: `dial` is what a handset receives and
 * `display` is what a person reads. `data/crisisLines.test.ts` pins the numbers
 * themselves; this pins the href, which is the half that has to stay
 * punctuation-free — some handsets dial a space and some drop it.
 */

describe('telHref', () => {
  it('builds a tel: link from the dialled form, never from the readable one', () => {
    const line: PhoneNumber = { dial: '800702222', display: '800 70 2222' }

    expect(telHref(line)).toBe('tel:800702222')
  })

  it('keeps a leading + for an international line', () => {
    expect(telHref({ dial: '+48800702222', display: '+48 800 70 2222' }))
      .toBe('tel:+48800702222')
  })

  it('produces an href with no space in it, whatever the display says', () => {
    const line: PhoneNumber = { dial: '116123', display: '116 123' }

    expect(telHref(line)).not.toContain(' ')
    expect(telHref(line)).toBe(`tel:${line.dial}`)
  })
})
