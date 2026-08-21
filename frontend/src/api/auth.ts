/**
 * The /api/auth/ endpoints, and the one place where the form's camelCase field
 * names are translated to the snake_case columns the API speaks.
 */

import { ApiError, apiRequest, type FieldErrors } from './client'

/** As `core.serializers.UserSerializer` returns it. */
interface UserPayload {
  id: string
  email: string | null
  name: string | null
  surname: string | null
  date_of_birth: string | null
  role: string | null
}

export interface AuthUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  role: string | null
}

function toAuthUser(payload: UserPayload): AuthUser {
  return {
    id: payload.id,
    email: payload.email,
    firstName: payload.name,
    lastName: payload.surname,
    dateOfBirth: payload.date_of_birth,
    role: payload.role,
  }
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  dataConsent: boolean
  servicesConsent: boolean
}

/** API field name -> form field name, so a 400 can be shown under the right input. */
export const LOGIN_FIELDS: Record<string, string> = {
  email: 'email',
  password: 'password',
}

export const REGISTER_FIELDS: Record<string, string> = {
  name: 'firstName',
  surname: 'lastName',
  email: 'email',
  password: 'password',
  password_confirm: 'confirmPassword',
  data_consent: 'dataConsent',
  services_consent: 'servicesConsent',
}

/** Re-keys an ApiError's field errors for the form that produced them. */
export function toFormErrors(fieldErrors: FieldErrors, fields: Record<string, string>): FieldErrors {
  const result: FieldErrors = {}
  for (const [apiField, message] of Object.entries(fieldErrors)) {
    result[fields[apiField] ?? apiField] = message
  }
  return result
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const payload = await apiRequest<UserPayload>('/api/auth/login/', {
    method: 'POST',
    body: { email: input.email, password: input.password },
  })
  return toAuthUser(payload)
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const payload = await apiRequest<UserPayload>('/api/auth/register/', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
      password_confirm: input.confirmPassword,
      name: input.firstName,
      surname: input.lastName,
      data_consent: input.dataConsent,
      services_consent: input.servicesConsent,
    },
  })
  return toAuthUser(payload)
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout/', { method: 'POST' })
}

/**
 * The current user, or null when nobody is logged in.
 *
 * A rejection is the normal answer for a visitor, so it is not an error here.
 * DRF answers 403 rather than 401 for session authentication, hence both.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return toAuthUser(await apiRequest<UserPayload>('/api/auth/me/'))
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null
    }
    throw error
  }
}
