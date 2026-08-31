import { initials } from '../utils/profile'

/**
 * The initials circle at the top of the profile.
 *
 * Generated from the signed-in account rather than stored, so it is right for
 * whoever is actually logged in.
 *
 * Explicitly **not** the gamification avatar from the earlier concept — points,
 * levels and badges were cut from the project's scope. This is a visual anchor
 * for the identity card and carries no state, which is also why it is
 * `aria-hidden`: the name it abbreviates is read out immediately after it, and
 * hearing "AK" first would just be the name twice.
 */
function ProfileAvatar({
  firstName,
  lastName,
  email,
}: {
  firstName: string | null
  lastName: string | null
  email: string | null
}) {
  return (
    <span className="profile-avatar" aria-hidden="true">
      {initials(firstName, lastName, email)}
    </span>
  )
}

export default ProfileAvatar
