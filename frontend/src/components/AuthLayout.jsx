import mediculusLogo from '../assets/mediculus-logo.jpeg'
import './auth.css'

function AuthLayout({ title, subtitle, successMessage, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {successMessage && <p className="auth-success">{successMessage}</p>}

        {children}

        {footer}
      </div>
    </div>
  )
}

export default AuthLayout
