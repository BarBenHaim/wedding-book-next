/**
 * Generate a short, human-friendly slug for wedding URLs.
 * Format: 6 lowercase alphanumeric characters (e.g., "a3k9x7").
 * ~2.2 billion combinations — more than enough for weddings.
 *
 * First TypeScript file in the repo. Used here as the smoke test
 * that .ts and .js coexist cleanly under the new tsconfig (allowJs
 * true, checkJs false). Existing .js callers
 * (api/admin/create-user, api/createWedding) resolve the path
 * alias unchanged — they pull from '@/lib/generateSlug' and the
 * bundler picks up the .ts.
 */
export function generateSlug(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789' // no i/l/o/0/1 to avoid confusion
    let slug = ''
    for (let i = 0; i < 6; i++) {
        slug += chars[Math.floor(Math.random() * chars.length)]
    }
    return slug
}
