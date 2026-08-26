import { useNavigate } from 'react-router-dom'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import GuardianInvitations from '../components/GuardianInvitations'
import { useAuth } from '../auth/authContext'
import { GUARDIAN_ROLE } from '../api/auth'
import { ROUTES } from '../routes'
import './moduleSelect.css'

/**
 * The rest of the project (Login/Register/App/main) is still plain JS/JSX;
 * this screen and Home.tsx are the first two written in TypeScript.
 */
function ModuleSelect() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const firstName = user?.firstName ?? ''
  // Only a guardian account can have anything to answer, and this is the first
  // screen they land on after logging in — a child is blocked until they do.
  const isGuardian = user?.role === GUARDIAN_ROLE

  return (
    <div className="module-page">
      <div className="module-header">
        <img className="module-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <p className="module-greeting">{firstName ? `Cześć, ${firstName}` : 'Cześć'}</p>
        <h1>Gdzie dzisiaj zaczynamy?</h1>
        <p className="module-subtitle">Możesz przechodzić między modułami w każdej chwili.</p>
      </div>

      {isGuardian && <GuardianInvitations />}

      <div className="module-tiles">
        <button
          type="button"
          className="module-tile module-tile-sage"
          onClick={() => navigate(ROUTES.home)}
        >
          <h2>Psychoterapia</h2>
          <p>Dzienniczek emocji, raporty, analiza i techniki DBT, CBT oraz relaksacyjne.</p>
        </button>

        <button
          type="button"
          className="module-tile module-tile-lavender"
          onClick={() => navigate(ROUTES.diet)}
        >
          <h2>Dietetyka i psychodietetyka</h2>
          <p>Plan żywieniowy, dzienniczek jedzenia i praca nad relacją z jedzeniem.</p>
        </button>
      </div>

      <p className="module-footnote">Twoje dane w obu modułach są ze sobą powiązane.</p>
    </div>
  )
}

export default ModuleSelect
