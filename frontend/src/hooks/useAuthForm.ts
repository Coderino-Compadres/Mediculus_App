import { useState, type ChangeEvent, type FormEvent } from 'react'
import { ApiError, type FieldErrors } from '../api/client'
import { toFormErrors } from '../api/auth'

export type FormErrors = Record<string, string | null>

export type AuthFormStatus = 'idle' | 'submitting' | 'success'

interface SubmitOptions<T> {
  /** Client-side checks; when any of them fails nothing is sent. */
  validate: (values: T) => FormErrors
  /** The API call. Rejecting with an ApiError is how the server's verdict arrives. */
  submit: (values: T) => Promise<void>
  /** API field name -> form field name, for placing the server's field errors. */
  fields?: Record<string, string>
}

export function useAuthForm<T extends Record<string, string>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<AuthFormStatus>('idle')
  const [formError, setFormError] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
    setStatus('idle')
    // A rejection the user is now editing away shouldn't keep shouting at them.
    setFormError(null)
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    { validate, submit, fields = {} }: SubmitOptions<T>,
  ) {
    event.preventDefault()
    setFormError(null)

    const clientErrors = validate(values)
    setErrors(clientErrors)
    if (Object.values(clientErrors).some(Boolean)) {
      setStatus('idle')
      return
    }

    setStatus('submitting')
    try {
      await submit(values)
      setStatus('success')
    } catch (error) {
      setStatus('idle')
      if (error instanceof ApiError) {
        // The server validates independently of the browser, so it can reject
        // things the client-side checks let through (a taken e-mail, a password
        // Django's validators dislike). Show that verdict on the same inputs.
        setErrors(toFormErrors(error.fieldErrors as FieldErrors, fields))
        setFormError(error.formMessage)
      } else {
        setFormError('Coś poszło nie tak. Spróbuj ponownie.')
      }
    }
  }

  return {
    values,
    errors,
    status,
    formError,
    submitting: status === 'submitting',
    handleChange,
    handleSubmit,
    setStatus,
    setFormError,
  }
}
