import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { ROUTES } from '../routes'

/**
 * An address that names no screen.
 *
 * It used to redirect to /modules, which is the wrong answer twice over: a
 * mistyped link looked like it had worked, and somebody following a stale
 * bookmark to a screen that has since moved got no hint that anything was
 * wrong. Says so instead, and offers the way back.
 */
function NotFound() {
  return (
    <AuthLayout
      title="Nie ma takiej strony"
      subtitle="Adres, pod który trafiłeś, nie prowadzi do żadnego ekranu. Sprawdź link albo wróć na stronę główną."
      footer={
        <p className="auth-switch">
          <Link to={ROUTES.modules}>← Wróć do aplikacji</Link>
        </p>
      }
    >
      {null}
    </AuthLayout>
  )
}

export default NotFound
