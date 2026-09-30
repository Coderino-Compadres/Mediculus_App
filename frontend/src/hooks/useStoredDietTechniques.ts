import { useEffect, useState } from 'react'
import { fetchStoredDietTechniques, type StoredDietTechnique } from '../api/dietTechniques'

/**
 * The psychodietetic catalogue's database half — what psychodietitians published.
 *
 * Fails soft, like `useStoredTechniques`: the built-in techniques need no
 * network, so a failed request returns an empty list and sets `failed`, and the
 * screen shows everything it has and says in one line that some may be missing.
 */
export function useStoredDietTechniques(): {
  techniques: StoredDietTechnique[]
  loading: boolean
  failed: boolean
} {
  const [techniques, setTechniques] = useState<StoredDietTechnique[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchStoredDietTechniques()
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
