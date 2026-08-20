function FormField({ id, label, error, ...inputProps }) {
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        {...inputProps}
      />
      {error && (
        <span id={errorId} className="auth-field-error">
          {error}
        </span>
      )}
    </div>
  )
}

export default FormField
