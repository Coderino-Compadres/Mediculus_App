import { useState, type ChangeEvent, type FormEvent } from 'react'

export type FormErrors = Record<string, string | null>

export function useAuthForm<T extends Record<string, string>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'success'>('idle')

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
    setStatus('idle')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>, validate: (values: T) => FormErrors) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    setStatus(Object.values(nextErrors).every((error) => !error) ? 'success' : 'idle')
  }

  return { values, errors, status, handleChange, handleSubmit, setStatus }
}
