import { useEffect, useState } from 'react'
import { fetchStoredTechniques, type StoredTechnique } from '../api/techniques'

/**
 * The catalogue's database half — the techniques specialists have published.
 *
 * FAILS SOFT ON PURPOSE. The hardcoded half of the catalogue needs no network at
 * all, so a failed request must not take it down with it: the hook returns an
 * empty list and sets `failed`, the screen renders every built-in technique as
 * before and says in one line that some may be missing. A catalogue that shows
 * eleven techniques instead of twelve, and says so, is far better than a
 * catalogue that shows an error page.
 *
 * `loading` starts true, which the screens deliberately do **not** use as a
 * spinner over the whole list — see pages/Techniques.tsx.
 */
export function useStoredTechniques(): {
  techniques: StoredTechnique[]
  loading: boolean
  failed: boolean
} {
  const [techniques, setTechniques] = useState<StoredTechnique[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchStoredTechniques()
      .then((loaded) => {
        if (!cancelled) setTechniques(loaded)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { techniques, loading, failed }
}
