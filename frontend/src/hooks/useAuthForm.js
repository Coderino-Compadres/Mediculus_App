import { useState } from 'react'

export function useAuthForm(initialValues) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')

  function handleChange(event) {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
    setStatus('idle')
  }

  function handleSubmit(event, validate) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    setStatus(Object.values(nextErrors).every((error) => !error) ? 'success' : 'idle')
  }

  return { values, errors, status, handleChange, handleSubmit, setStatus }
}
