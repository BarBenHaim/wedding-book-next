/**
 * Generate a short, human-friendly slug for wedding URLs.
 * Format: 6 lowercase alphanumeric characters (e.g., "a3k9x7")
 * ~2.2 billion combinations — more than enough for weddings.
 */
export function generateSlug() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789' // no i/l/o/0/1 to avoid confusion
    let slug = ''
    for (let i = 0; i < 6; i++) {
        slug += chars[Math.floor(Math.random() * chars.length)]
    }
    return slug
}
