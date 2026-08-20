function ConsentField({ id, label, checked, onChange, error }) {
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="auth-consent-item">
      <div className="auth-consent">
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {error && (
        <span id={errorId} className="auth-field-error">
          {error}
        </span>
      )}
    </div>
  )
}

export default ConsentField
