import type { ReactNode } from 'react'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import './auth.css'

interface AuthLayoutProps {
  title: string
  subtitle: string
  successMessage?: string | null
  children: ReactNode
  footer?: ReactNode
  /** Pinned to the card's top-right corner, above the logo — see .auth-corner. */
  corner?: ReactNode
}

function AuthLayout({ title, subtitle, successMessage, children, footer, corner }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        {corner && <div className="auth-corner">{corner}</div>}

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
