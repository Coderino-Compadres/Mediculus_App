import { describe, expect, it } from 'vitest'
import { matchPath } from 'react-router-dom'
import {
  APP_NAME,
  PLACEHOLDER_ROUTES,
  ROUTES,
  ROUTE_TITLES,
  journalDetailPath,
  reportDetailPath,
  routeTitle,
  specialistPatientReportPath,
  specialistPatientReportsPath,
  specialistTechniqueEditPath,
  techniqueDetailPath,
} from './routes'

/**
 * The route table itself. Two things here can only fail at runtime, and both
 * fail quietly:
 *
 * - a screen with no ROUTE_TITLES entry gets its own path read out as the
 *   document title and announced to a screen reader ('/safety-plan'), because
 *   `routeTitle` falls back to the path;
 * - a path built by hand instead of through the helpers keeps its ':id' and
 *   navigates to a URL that only `*` matches.
 *
 * `RouteChange.test.tsx` covers the announcement; this covers the table it
 * reads.
 */

const PATHS = Object.values(ROUTES)

describe('the route table', () => {
  it('gives every route an absolute path', () => {
    for (const path of PATHS) expect(path.startsWith('/')).toBe(true)
  })

  it('has no two routes on the same path', () => {
    expect(new Set(PATHS).size).toBe(PATHS.length)
  })

  it('names every screen, so none is announced by its own URL', () => {
    const untitled = PATHS.filter((path) => !(path in ROUTE_TITLES))

    expect(untitled).toEqual([])
  })

  it('names every placeholder too, through PLACEHOLDER_ROUTES', () => {
    for (const route of PLACEHOLDER_ROUTES) {
      expect(ROUTE_TITLES[route.path]).toBe(route.title)
    }
  })

  it('titles every screen in Polish and without the app name', () => {
    /** `RouteChange` appends APP_NAME itself, so a title carrying it would read
     *  'Profil — Mediculus — Mediculus' in the browser tab. */
    for (const [path, title] of Object.entries(ROUTE_TITLES)) {
      expect(title.trim(), path).not.toBe('')
      expect(title, path).not.toContain(APP_NAME)
    }
  })

  it('keys the titles by pattern, so a parametrised route resolves through matchPath', () => {
    /** This is the whole reason the titles are not set inside each page: the
     *  announcement happens on the URL change, before a page's effect runs. */
    const pattern = Object.keys(ROUTE_TITLES).find(
      (path) => matchPath(path, '/reports/week-2026-08-03') !== null,
    )

    expect(pattern).toBe(ROUTES.reportDetail)
    expect(ROUTE_TITLES[pattern!]).toBe('Raport tygodniowy')
  })
})

describe('routeTitle', () => {
  it('answers with the screen name a menu entry should print', () => {
    expect(routeTitle(ROUTES.analysis)).toBe('Analiza')
    expect(routeTitle(ROUTES.diet)).toBe('Dietetyka i psychodietetyka')
  })

  it('falls back to the path rather than to an empty label', () => {
    /** A menu entry with no text at all is unclickable; a path is at least
     *  visibly unfinished. */
    expect(routeTitle('/nie-ma-takiego')).toBe('/nie-ma-takiego')
  })
})

describe('the path builders', () => {
  it('fill in a journal, a report and a technique id', () => {
    expect(journalDetailPath('abc-123')).toBe('/journals/abc-123')
    expect(reportDetailPath('week-2026-08-03')).toBe('/reports/week-2026-08-03')
    expect(techniqueDetailPath('tipp')).toBe('/techniques/tipp')
  })

  it('fill in both params of a specialist reading one patient', () => {
    expect(specialistPatientReportsPath('p-1')).toBe('/specialist/patients/p-1/reports')
    expect(specialistPatientReportPath('p-1', 'week-2026-08-03'))
      .toBe('/specialist/patients/p-1/reports/week-2026-08-03')
  })

  it('accept a technique id as the number the API sends', () => {
    /** `technique.id_technique` is an integer, unlike every other id in the
     *  app, so the builder has to take one without the caller stringifying it. */
    expect(specialistTechniqueEditPath(7)).toBe('/specialist/techniques/7/edit')
    expect(specialistTechniqueEditPath('7')).toBe('/specialist/techniques/7/edit')
  })

  it('leave no ":param" behind — the failure mode is a URL only `*` matches', () => {
    const built = [
      journalDetailPath('a'),
      reportDetailPath('week-2026-08-03'),
      techniqueDetailPath('tipp'),
      specialistPatientReportsPath('p'),
      specialistPatientReportPath('p', 'w'),
      specialistTechniqueEditPath(1),
    ]

    for (const path of built) expect(path).not.toContain(':')
  })

  it('build paths their own route pattern still matches', () => {
    expect(matchPath(ROUTES.journalDetail, journalDetailPath('abc-123'))).not.toBeNull()
    expect(matchPath(ROUTES.reportDetail, reportDetailPath('week-2026-08-03'))).not.toBeNull()
    expect(matchPath(ROUTES.techniqueDetail, techniqueDetailPath('tipp'))).not.toBeNull()
    expect(
      matchPath(ROUTES.specialistPatientReport, specialistPatientReportPath('p-1', 'w-1')),
    ).not.toBeNull()
    expect(
      matchPath(ROUTES.specialistTechniqueEdit, specialistTechniqueEditPath(7)),
    ).not.toBeNull()
  })
})
