// Centralised super-admin email list.
//
// Resolution order (first non-empty wins):
//   1. SUPER_ADMIN_EMAILS              — server-only env (preferred)
//   2. NEXT_PUBLIC_SUPER_ADMIN_EMAILS  — exposed to client too (Header, etc)
//   3. 'barbenbh@gmail.com'            — original sole admin, kept as a
//      fallback so existing prod deploys keep working without a
//      simultaneous env-var rollout.
//
// Format is comma-separated emails, e.g.
//   SUPER_ADMIN_EMAILS=barbenbh@gmail.com,partner@example.com
//
// Comparison is case-insensitive (Firebase normalises emails to
// lowercase on signup, but defensive lowering avoids surprises if
// anyone ever sets the env var with mixed case).

const FALLBACK_EMAIL = 'barbenbh@gmail.com'

const rawList =
    (typeof process !== 'undefined' && process.env.SUPER_ADMIN_EMAILS) ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS) ||
    (typeof process !== 'undefined' && process.env.SUPER_ADMIN_EMAIL) ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL) ||
    FALLBACK_EMAIL

export const SUPER_ADMIN_EMAILS = rawList
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

/** Primary admin = first email in the list. Used for "send me a
 *  notification" use cases (book-ready emails, Lulu order alerts). */
export const PRIMARY_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0] || FALLBACK_EMAIL

/** True if the given email belongs to the super-admin list. */
export function isSuperAdmin(email) {
    if (!email) return false
    return SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}
