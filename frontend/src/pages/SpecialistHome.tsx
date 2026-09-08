import { Link } from 'react-router-dom'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import HeaderMenu from '../components/HeaderMenu'
import SpecialistPatients from '../components/SpecialistPatients'
import { useAuth } from '../auth/authContext'
import { ROUTES, routeTitle } from '../routes'
// styles/panel.css is the frame, the greeting block, the sections and every
// control, shared with /parent. It replaced four stylesheets here — the
// patient's module chooser, the home screen and parentHome.css — which is how
// this screen came to be laid out by classes called .parent-page and
// .parent-menu. home.css stays for the .home-menu-* rules HeaderMenu's markup
// needs, the same explicit import ParentHome.tsx carries.
import '../styles/panel.css'
import './home.css'
import './specialist.css'

/**
 * "Panel specjalisty" — the four things a specialist does here.
 *
 * A specialist is not a clinical subject: they get a `specjalist` row and no
 * `patient` row (core/colleagues.py), so they have no diary,
 * no dashboard and no reports of their own, and every endpoint behind
 * `_require_patient` answers them 403. They land here, exactly as guardians land
 * on /parent, rather than on the patient's module chooser whose tiles lead into
 * refusals.
 *
 * WHAT IS ON THE SCREEN, and why it is these four:
 *
 *   1. the caseload, with a link into each patient's weekly reports. This is the
 *      one the client's visibility rule is about — reports are for the
 *      specialists treating the patient, and the patient cannot switch that off
 *      (see the TODO in pages/Reports.tsx for the clinical reason).
 *   2. issuing a code for a guardian's account, for the family in the room. The
 *      guardian link is normally started by the child; this is the other
 *      direction, and it exists because a specialist is the one person who can
 *      vouch that these two people are a family.
 *   3. creating another specialist's account. This is the only place one can be
 *      created: the public form used to offer "konto specjalisty" and no longer
 *      does, because a professional account is a claim the app cannot check and
 *      an existing specialist can (see pages/SpecialistColleagues.tsx).
 *   4. writing a technique into the catalogue, which every patient then sees.
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
    <div className="panel-page">
      <div className="panel-menu">
        <HeaderMenu />
      </div>

      <div className="panel-header">
        <img className="panel-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <p className="panel-greeting">{firstName ? `Cześć, ${firstName}` : 'Cześć'}</p>
        <h1>Panel specjalisty</h1>
        <p className="panel-subtitle">
          Konto specjalisty. Nie prowadzisz tu własnego dzienniczka.
        </p>
      </div>

      {/* First, because it is the only section with patients waiting on the
          other side of it — an unanswered invitation is a patient who cannot be
          seen and does not know why. */}
      <SpecialistPatients />

      <section className="panel-section" aria-labelledby="specialist-tools-heading">
        <h2 id="specialist-tools-heading" className="panel-section-heading">
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

        {/* The only place a specialist account can be created — registration
            cannot make one any more, so this link is not a convenience. */}
        <Link className="specialist-tool" to={ROUTES.specialistColleagues}>
          <span className="specialist-tool-title">{routeTitle(ROUTES.specialistColleagues)}</span>
          <span className="specialist-tool-text">
            Utwórz konto innego specjalisty. Hasło tymczasowe zobaczysz raz
            i przekazujesz je osobiście; zgody RODO nowe konto udziela samo.
          </span>
          <span className="specialist-tool-arrow" aria-hidden="true">
            →
          </span>
        </Link>

        <Link className="specialist-tool" to={ROUTES.specialistTechniques}>
          <span className="specialist-tool-title">{routeTitle(ROUTES.specialistTechniques)}</span>
          <span className="specialist-tool-text">
            Dodaj technikę do katalogu „Techniki terapeutyczne”. Każda dodana
            technika jest od razu widoczna dla wszystkich pacjentów aplikacji.
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
      <section className="panel-quiet specialist-scope" aria-labelledby="specialist-scope-heading">
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
