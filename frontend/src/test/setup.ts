import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library mounts into a container it does not remove by itself when
// `globals: true` is used without its own auto-cleanup hook; two suites in one
// file would otherwise find two copies of every element.
afterEach(cleanup)

// jsdom has no layout, so window.scrollTo is unimplemented and logs a warning
// on every navigation. RouteChange calls it on purpose (see its docstring); the
// stub keeps that intent testable without the noise.
window.scrollTo = () => {}
