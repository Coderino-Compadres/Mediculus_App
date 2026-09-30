import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('waits half a second — the app-wide search delay', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(500)
  })

  it('starts with the value it was given', () => {
    const { result } = renderHook(() => useDebouncedValue('a'))

    expect(result.current).toBe('a')
  })

  it('answers with the new value only once it has stopped changing', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    })

    rerender({ value: 'k' })
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1))
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('k')
  })

  it('restarts the wait on every change, so a word filters once', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    })

    for (const value of ['k', 'ko', 'kow']) {
      rerender({ value })
      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 100))
    }
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('kow')
  })
})
