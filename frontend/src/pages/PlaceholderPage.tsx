import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { ROUTES } from '../routes'

interface PlaceholderPageProps {
  title: string
  backTo?: string
  backLabel?: string
}

/** Stand-in for a screen that isn't built yet; every menu/nav link needs somewhere to go. */
function PlaceholderPage({ title, backTo = ROUTES.home, backLabel = '← Wróć do strony głównej' }: PlaceholderPageProps) {
  return (
    <AuthLayout
      title={title}
      subtitle="Ten ekran jeszcze nie istnieje. Wróci tu jako osobne zadanie."
      footer={
        <p className="auth-switch">
          <Link to={backTo}>{backLabel}</Link>
        </p>
      }
    >
      {null}
    </AuthLayout>
  )
}

export default PlaceholderPage
