import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CrisisLines from './CrisisLines'
import { CRISIS_LINES } from '../data/crisisLines'

/**
 * The support panel takes no props and no session — it is the same for every
 * account, which is the whole reason it can be rendered before anything is
 * known about the patient. So it renders bare, without the router/session
 * wrapper the screens need.
 */

describe('CrisisLines', () => {
  it('renders every published line as a real tel: link', () => {
    render(<CrisisLines />)

    for (const line of CRISIS_LINES) {
      const link = screen.getByRole('link', { name: new RegExp(line.number.display) })
      expect(link).toHaveAttribute('href', `tel:${line.number.dial}`)
      // The digits stay readable as digits: the href is unpunctuated, the text
      // is grouped the way the line publishes it.
      expect(link).toHaveTextContent(line.number.display)
    }
  })

  it('says of every line who it is for and what it costs', () => {
    render(<CrisisLines />)

    for (const line of CRISIS_LINES) {
      expect(screen.getByText(new RegExp(`${line.audience}.*${line.availability}`))).toBeInTheDocument()
    }
  })

  it('marks the lines for children and teenagers in words, not only in colour', () => {
    /** Minors have accounts here (`minor_patient` at registration). An adult
     *  helpline handed to a 14-year-old as though it were theirs is a wasted
     *  call at the worst possible moment — and a badge carried only by a colour
     *  does not survive being read aloud. */
    render(<CrisisLines />)

    const youth = CRISIS_LINES.filter((line) => line.forYouth)
    expect(youth.length).toBeGreaterThan(0)
    expect(screen.getAllByText(/dla młodych/i)).toHaveLength(youth.length)
  })

  it('names the owner of each number in its accessible label', () => {
    /** Tabbing through this panel otherwise reads out five strings of numerals
     *  with nothing to tell them apart. */
    render(<CrisisLines />)

    for (const line of CRISIS_LINES) {
      expect(screen.getByRole('link', { name: new RegExp(line.name) })).toBeInTheDocument()
    }
  })

  it('sets 112 apart from the helplines rather than listing it as one', () => {
    /** Calling emergency services is a different act from calling a helpline;
     *  blurring the two either wastes an emergency call or delays one. */
    render(<CrisisLines />)

    const emergency = CRISIS_LINES.filter((line) => line.isEmergency)
    expect(emergency).toHaveLength(1)
    const rows = document.querySelectorAll('.crisis-line-emergency')
    expect(rows).toHaveLength(1)
    expect(within(rows[0] as HTMLElement).getByRole('link')).toHaveAttribute('href', 'tel:112')
  })

  it('does not reuse the home screen\'s alarm styling', () => {
    /** The red banner on /home means "your data crossed a threshold"; this panel
     *  means "here is where help is". Read as one signal, the second would tell
     *  the user the app had concluded something about them. */
    render(<CrisisLines />)

    expect(document.querySelector('.crisis-lines')).toBeInTheDocument()
    expect(document.querySelector('.home-crisis-banner')).not.toBeInTheDocument()
    expect(document.querySelector('.home-stat-card-alert')).not.toBeInTheDocument()
  })

  it('is an accessible region named by its own heading', () => {
    /** A <section> only becomes a landmark once it has an accessible name, and
     *  without one this panel is an anonymous group a screen-reader user cannot
     *  jump to — on the one screen where finding it quickly is the point. The
     *  aria-labelledby that provides the name had no test until a mutation
     *  removed it and the whole suite still passed. */
    render(<CrisisLines />)

    expect(screen.getByRole('region', { name: /gdy potrzebujesz rozmowy teraz/i })).toBeInTheDocument()
  })

  it('announces the numbers as a list, so their count is heard before they are read', () => {
    render(<CrisisLines />)

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(CRISIS_LINES.length)
  })
})
