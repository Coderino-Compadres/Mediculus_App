import { useState } from 'react'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../auth/authContext'

/**
 * Placeholder landing page for a logged-in user.
 *
 * It exists so that logging in leads somewhere and so the session can be seen
 * to work end to end; the actual diary lives here eventually.
 */
function Dashboard() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function onSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const greeting = user?.firstName ? `Cześć, ${user.firstName}!` : 'Cześć!'

  return (
    <AuthLayout
      title={greeting}
      subtitle="Jesteś zalogowany. Dzienniczek pojawi się tutaj wkrótce."
    >
      <p className="auth-success">
        Zalogowany jako {user?.email}
        {user?.role ? ` (${user.role})` : ''}
      </p>

      <button
        type="button"
        className="auth-submit"
        onClick={() => void onSignOut()}
        disabled={signingOut}
      >
        {signingOut ? 'Wylogowywanie…' : 'Wyloguj się'}
      </button>
    </AuthLayout>
  )
}

export default Dashboard
