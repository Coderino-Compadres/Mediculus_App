import { describe, expect, it } from 'vitest'
import { APP_DISCLAIMER } from './disclaimer'

/**
 * One sentence, one definition. It appears under the home dashboard and under
 * the safety plan, and two copies are exactly where a correction lands on one
 * screen only — leaving the app describing its own limits in two slightly
 * different ways in the one place where being precise matters most.
 *
 * The screens' own tests assert they render it; this pins what it says, so a
 * paraphrase is a deliberate edit rather than a silent one.
 */

describe('APP_DISCLAIMER', () => {
  it('says the app does not replace a specialist', () => {
    expect(APP_DISCLAIMER).toContain('nie zastępuje pomocy specjalisty')
  })

  it('names where to go in a crisis, rather than only what the app is not', () => {
    expect(APP_DISCLAIMER).toContain('lekarzem')
    expect(APP_DISCLAIMER).toContain('terapeutą')
    expect(APP_DISCLAIMER).toContain('telefonem zaufania')
  })

  it('is one paragraph of plain text — no markup and no stray whitespace', () => {
    expect(APP_DISCLAIMER).not.toMatch(/[<>]/)
    expect(APP_DISCLAIMER).not.toMatch(/\n/)
    expect(APP_DISCLAIMER).toBe(APP_DISCLAIMER.trim())
    expect(APP_DISCLAIMER).not.toMatch(/ {2}/)
  })
})
