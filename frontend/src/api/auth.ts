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
  is_child: boolean | null
  /** null when the question does not apply: only a minor patient needs a guardian. */
  guardian_status?: GuardianStatus | null
}

export interface AuthUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  role: string | null
  /** null for a guardian: they have no patient row at all, so no answer. */
  isChild: boolean | null
  /** Where the guardian link stands; null when the question does not apply. */
  guardianStatus: GuardianStatus | null
}

function toAuthUser(payload: UserPayload): AuthUser {
  return {
    id: payload.id,
    email: payload.email,
    firstName: payload.name,
    lastName: payload.surname,
    dateOfBirth: payload.date_of_birth,
    role: payload.role,
    isChild: payload.is_child,
    guardianStatus: payload.guardian_status ?? null,
  }
}

/**
 * Mirrors STATUS_* in core/guardian.py. 'pending' is a guardian who has been
 * named and has not answered — which unblocks nothing: being named is not
 * consenting.
 */
export const GUARDIAN_STATUS = {
  none: 'none',
  pending: 'pending',
  accepted: 'accepted',
} as const

export type GuardianStatus = (typeof GUARDIAN_STATUS)[keyof typeof GUARDIAN_STATUS]

/** Mirrors GUARDIAN_ROLE in core/serializers.py — the role that may be invited. */
export const GUARDIAN_ROLE = 'rodzic'

/** Mirrors ACCOUNT_TYPES in core/serializers.py — the wire values, not labels. */
export const ACCOUNT_TYPES = {
  patient: 'patient',
  minorPatient: 'minor_patient',
  parent: 'parent',
} as const

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES]

export interface LoginInput {
  email: string
  password: string
}

export interface LinkGuardianInput {
  guardianEmail: string
}

export interface RegisterInput {
  accountType: string
  firstName: string
  lastName: string
  dateOfBirth: string
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
  account_type: 'accountType',
  name: 'firstName',
  surname: 'lastName',
  date_of_birth: 'dateOfBirth',
  email: 'email',
  password: 'password',
  password_confirm: 'confirmPassword',
  data_consent: 'dataConsent',
  services_consent: 'servicesConsent',
}

export const GUARDIAN_FIELDS: Record<string, string> = {
  guardian_email: 'guardianEmail',
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
      date_of_birth: input.dateOfBirth,
      account_type: input.accountType,
      data_consent: input.dataConsent,
      services_consent: input.servicesConsent,
    },
  })
  return toAuthUser(payload)
}

/**
 * Asks the guardian at that address to vouch for the signed-in minor.
 *
 * This creates a request, not a link: the child stays blocked until the guardian
 * accepts it on their own home screen. Answers with the updated user, so the
 * caller can hand the new `guardianStatus` straight to the session instead of
 * re-asking /api/auth/me/.
 */
export async function linkGuardian(input: LinkGuardianInput): Promise<AuthUser> {
  const payload = await apiRequest<UserPayload>('/api/auth/guardian/', {
    method: 'POST',
    body: { guardian_email: input.guardianEmail },
  })
  return toAuthUser(payload)
}

/**
 * Whether this account is stuck waiting for a guardian.
 *
 * Only 'accepted' lets a minor through — a pending invitation is a question
 * nobody has answered yet. Deliberately fail-closed on `guardianStatus: null`:
 * for a minor that is the backend declining to confirm a link, and letting an
 * unvouched-for minor write health data is the worse of the two ways to be wrong.
 */
export function needsGuardianLink(user: AuthUser): boolean {
  return user.isChild === true && user.guardianStatus !== GUARDIAN_STATUS.accepted
}

/** Whether the child is waiting on an answer rather than still choosing whom to ask. */
export function isGuardianInvitationPending(user: AuthUser): boolean {
  return user.isChild === true && user.guardianStatus === GUARDIAN_STATUS.pending
}

/**
 * Withdraws the invitation the signed-in minor sent, so a mistyped address is
 * not a dead end. Refuses (404) once a guardian has accepted: undoing that is
 * not the child's decision to make.
 */
export async function cancelGuardianInvitation(): Promise<AuthUser> {
  const payload = await apiRequest<UserPayload>('/api/auth/guardian/', {
    method: 'DELETE',
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
