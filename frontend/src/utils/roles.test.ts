import { describe, expect, it } from 'vitest'
import { roleLabel } from './roles'

/**
 * `user.role` is the `user_role` row's own name, and the header menu used to
 * print it straight — so a Polish UI greeted somebody with the word "patient".
 */

describe('roleLabel', () => {
  it('words the three roles the way the registration form does', () => {
    expect(roleLabel('patient')).toBe('Pacjent')
    expect(roleLabel('rodzic')).toBe('Rodzic lub opiekun')
    expect(roleLabel('specjalista')).toBe('Specjalista')
  })

  it('shows an unknown role unchanged rather than hiding it', () => {
    /** `user_role` is seeded by SQL, so a role added on the backend should look
     *  unfinished here — not disappear, which would leave the account looking
     *  like it has no role at all. */
    expect(roleLabel('dietetyk')).toBe('dietetyk')
  })

  it('does not invent a label for an empty role', () => {
    expect(roleLabel('')).toBe('')
  })

  it('is not fooled by a name off Object.prototype', () => {
    /** The map is a plain object, so a lookup has to answer the string itself
     *  rather than a function inherited from the prototype chain. */
    expect(roleLabel('toString')).toBe('toString')
    expect(roleLabel('constructor')).toBe('constructor')
  })
})
