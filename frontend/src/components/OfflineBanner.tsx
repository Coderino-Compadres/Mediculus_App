import { useOnline } from '../hooks/useOnline'
import './offlineBanner.css'

/**
 * Says the device is offline, because otherwise it looks like the app broke.
 *
 * Every screen already reports a failed request as "Nie udało się wczytać…",
 * which is the right words for a server that answered badly and the wrong ones
 * for a phone in a lift: the first invites a retry now, the second needs the
 * person to know that waiting is the fix. This is an app people are meant to
 * install and open on a train.
 */
function OfflineBanner() {
  const online = useOnline()
  if (online) return null

  return (
    <p className="offline-banner" role="status">
      Brak połączenia z internetem. Możesz przeglądać to, co już się wczytało — zapisywanie
      i odświeżanie zadziała, gdy wrócisz do sieci.
    </p>
  )
}

export default OfflineBanner
