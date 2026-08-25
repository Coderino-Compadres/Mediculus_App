import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library mounts into a container it does not remove by itself when
// `globals: true` is used without its own auto-cleanup hook; two suites in one
// file would otherwise find two copies of every element.
afterEach(cleanup)
