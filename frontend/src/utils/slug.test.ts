import { describe, expect, it } from 'vitest'
import { techniqueSlug } from './slug'

/**
 * The contract this file exists to pin is a single regex on the backend:
 * `TechniqueSerializer.slug` is `RegexField(r'^[a-z0-9]+(-[a-z0-9]+)*$',
 * max_length=64)`. The technique form no longer renders a slug input, so a
 * value this function gets wrong is a 400 on a field nobody can see — a save
 * that fails silently. Hence the sweep at the bottom: every case above, and a
 * few hostile ones, checked against the regex itself rather than against a
 * hand-written expectation only.
 */
const BACKEND_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_LENGTH = 64

describe('techniqueSlug', () => {
  it('derives the address from the name, prefixed', () => {
    expect(techniqueSlug('Radykalna akceptacja')).toBe('id-radykalna-akceptacja')
  })

  it('transliterates Polish letters rather than dropping them', () => {
    // The one that matters: 'ł' has no canonical decomposition, so an
    // NFKD-only implementation turns "Łatwe" into "atwe" — the letter vanishes
    // instead of becoming 'l'. Same trap as normalize_emotion in
    // core/emotions.py.
    expect(techniqueSlug('Łatwe ćwiczenie')).toBe('id-latwe-cwiczenie')
    expect(techniqueSlug('ąćęłńóśźż')).toBe('id-acelnoszz')
    expect(techniqueSlug('ĄĆĘŁŃÓŚŹŻ')).toBe('id-acelnoszz')
  })

  it('collapses every run of anything else into one hyphen', () => {
    // A run rather than a character, because '--' fails the regex.
    expect(techniqueSlug('TIPP — szybkie   schłodzenie!!!')).toBe(
      'id-tipp-szybkie-schlodzenie',
    )
    expect(techniqueSlug('za / i / przeciw')).toBe('id-za-i-przeciw')
  })

  it('leaves no leading or trailing hyphen', () => {
    expect(techniqueSlug('   oddech   ')).toBe('id-oddech')
    expect(techniqueSlug('...oddech...')).toBe('id-oddech')
  })

  it('keeps digits, which are legal', () => {
    expect(techniqueSlug('Oddech 4-7-8')).toBe('id-oddech-4-7-8')
  })

  it('stays inside the column, and does not end on the hyphen the cut leaves', () => {
    // 'a'.repeat(30) + ' ' repeated: the truncation lands on a separator, which
    // would otherwise be a trailing hyphen and therefore an invalid slug.
    const long = `${'a'.repeat(58)} ${'b'.repeat(20)}`
    const slug = techniqueSlug(long)
    expect(slug.length).toBeLessThanOrEqual(MAX_LENGTH)
    expect(slug).toMatch(BACKEND_REGEX)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('still returns a valid slug when the name has nothing usable in it', () => {
    // Not an empty string and not a bare 'id-': both would be refused as
    // malformed, and the form has no slug field to report that on. 'id' on its
    // own matches the regex, so the backend can only refuse it as *taken*,
    // which is a message the form can word usefully.
    expect(techniqueSlug('!!!')).toBe('id')
    expect(techniqueSlug('   ')).toBe('id')
    expect(techniqueSlug('')).toBe('id')
  })

  it('cannot collide with a built-in technique, whatever the name', () => {
    // BUILTIN_SLUGS in core/techniques.py holds none that starts with 'id-',
    // so the prefix makes SLUG_BUILTIN unreachable from this form. Typing a
    // built-in name verbatim is the case that used to hit it.
    expect(techniqueSlug('TIPP')).toBe('id-tipp')
    expect(techniqueSlug('DEAR MAN')).toBe('id-dear-man')
  })

  it('never produces a value the backend would reject', () => {
    const names = [
      'Radykalna akceptacja',
      'Łatwe ćwiczenie',
      'TIPP — szybkie schłodzenie!!!',
      'Oddech 4-7-8',
      '   ',
      '!!!',
      '',
      '---',
      'a',
      'ż',
      'Ćwiczenie "uważności" (5 min)',
      'a'.repeat(200),
      '🙂 emoji 🙂',
      'ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż',
      'under_score',
      'UPPER CASE NAME',
    ]

    for (const name of names) {
      const slug = techniqueSlug(name)
      expect(slug, `name: ${JSON.stringify(name)}`).toMatch(BACKEND_REGEX)
      expect(slug.length, `name: ${JSON.stringify(name)}`).toBeLessThanOrEqual(MAX_LENGTH)
    }
  })
})
