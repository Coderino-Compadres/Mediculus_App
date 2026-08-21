import type { SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string
  label: string
  options: SelectOption[]
  /** Shown as a selected-nothing entry, so the user has to choose deliberately. */
  placeholder?: string
  error?: string | null
}

function SelectField({ id, label, options, placeholder, error, ...selectProps }: SelectFieldProps) {
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        {...selectProps}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={errorId} className="auth-field-error">
          {error}
        </span>
      )}
    </div>
  )
}

export default SelectField
