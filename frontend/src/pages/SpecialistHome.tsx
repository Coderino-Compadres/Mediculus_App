import { Link } from 'react-router-dom'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import HeaderMenu from '../components/HeaderMenu'
import SpecialistPatients from '../components/SpecialistPatients'
import { useAuth } from '../auth/authContext'
import { ROUTES, routeTitle } from '../routes'
// moduleSelect.css is the page frame, the logo and the greeting block, reused
// rather than redrawn — this screen is the specialist's equivalent of the
// patient's module chooser. home.css is here for the .home-menu-* rules
// HeaderMenu's markup needs, the same explicit import ParentHome.tsx carries.
import './moduleSelect.css'
import './home.css'
import './parentHome.css'
import './specialist.css'

/**
 * "Panel specjalisty" — the three things a specialist does here.
 *
 * A specialist is not a clinical subject: they get a `specjalist` row and no
 * `patient` row (ACCOUNT_TYPES in core/serializers.py), so they have no diary,
 * no dashboard and no reports of their own, and every endpoint behind
 * `_require_patient` answers them 403. They land here, exactly as guardians land
 * on /parent, rather than on the patient's module chooser whose tiles lead into
 * refusals.
 *
 * WHAT IS ON THE SCREEN, and why it is these three:
 *
 *   1. the caseload, with a link into each patient's weekly reports. This is the
 *      one the client's visibility rule is about — reports are for the
 *      specialists treating the patient, and the patient cannot switch that off
 *      (see the TODO in pages/Reports.tsx for the clinical reason).
 *   2. issuing a code for a guardian's account, for the family in the room. The
 *      guardian link is normally started by the child; this is the other
 *      direction, and it exists because a specialist is the one person who can
 *      vouch that these two people are a family.
 *   3. writing a technique into the catalogue, which every patient then sees.
 *
 * WHAT IS DELIBERATELY NOT HERE. No view of a patient's diary and no analysis
 * screens: the specialist's access is the weekly reports and nothing else for
 * now. Whether a treating specialist may read the diary itself is an open
 * question with the client, and the app's one firm rule in the area runs in the
 * other direction (a patient cannot cut the specialist off) — so it is not a
 * question to answer by adding a tile. Nothing on this screen promises it
 * either, for the same reason ParentHome's placeholder promises nothing about a
 * child's entries.
 */
function SpecialistHome() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''

  return (
    <div className="module-page parent-page">
      <div className="parent-menu">
        <HeaderMenu />
      </div>

      <div className="module-header">
        <img className="module-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <p className="module-greeting">{firstName ? `Cześć, ${firstName}` : 'Cześć'}</p>
        <h1>Panel specjalisty</h1>
        <p className="module-subtitle">
          Konto specjalisty. Nie prowadzisz tu własnego dzienniczka.
        </p>
      </div>

      {/* First, because it is the only section with patients waiting on the
          other side of it — an unanswered invitation is a patient who cannot be
          seen and does not know why. */}
      <SpecialistPatients />

      <section className="specialist-tools" aria-labelledby="specialist-tools-heading">
        <h2 id="specialist-tools-heading" className="specialist-tools-heading">
          Narzędzia
        </h2>

        <Link className="specialist-tool" to={ROUTES.specialistParentAccounts}>
          <span className="specialist-tool-title">{routeTitle(ROUTES.specialistParentAccounts)}</span>
          <span className="specialist-tool-text">
            Wystaw kod, którym rodzic lub opiekun zakłada konto powiązane z Twoim
            małoletnim pacjentem. Kod przekazujesz mu osobiście.
          </span>
          <span className="specialist-tool-arrow" aria-hidden="true">
            →
          </span>
        </Link>

        <Link className="specialist-tool" to={ROUTES.specialistTechniques}>
          <span className="specialist-tool-title">{routeTitle(ROUTES.specialistTechniques)}</span>
          <span className="specialist-tool-text">
            Dodaj technikę do katalogu „Techniki terapeutyczne”. Opublikowana
            technika jest widoczna dla wszystkich pacjentów aplikacji.
          </span>
          <span className="specialist-tool-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </section>

      {/* Says what the panel does not do, rather than what it might. The
          alternative — naming "podgląd dzienniczka" as coming soon — would answer
          a question that is still open with the client, and a client reviewing
          this screen would reasonably read it as settled. */}
      <section className="specialist-scope" aria-labelledby="specialist-scope-heading">
        <h2 id="specialist-scope-heading">Zakres dostępu</h2>
        <p>
          Widzisz raporty tygodniowe pacjentów, którzy potwierdzili Twoje
          zaproszenie. Nie widzisz treści ich dzienniczków ani danych pacjentów,
          którzy nie potwierdzili zaproszenia.
        </p>
      </section>
    </div>
  )
}

export default SpecialistHome
