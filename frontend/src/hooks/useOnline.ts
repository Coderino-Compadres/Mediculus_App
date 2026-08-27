import { useEffect, useState } from 'react'

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is a weak signal — it says the device has *a* connection,
 * not that our API is reachable — so this only drives an advisory banner, never
 * a decision about whether to send a request. Being wrong in the optimistic
 * direction costs a failed fetch that the screens already handle; being wrong
 * the other way would block someone from writing a diary entry over a
 * connection that works.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
