// The frame around the super admin: which screens get the menu, and what the
// menu lists. Pure, so the rules are testable.

// Print outputs: anything drawn around them would end up in the exported file.
const OUTPUT = /^\/admin\/wedding\/[^/]+\/(cover-print|picabook-export)$/
// Design editors need the width, and their previews must not inherit our font.
const EDITORS = ['/admin/studio', '/admin/album-studio', '/admin/guest-design']
// Screens that are only admin interface, so the admin font applies to all of it.
const SERIF = ['/admin', '/admin/today', '/admin/customers', '/admin/customers/board', '/admin/sales-leads']

export const NAV = [
    { href: '/admin/today', label: 'היום' },
    { href: '/admin/customers', label: 'לקוחות' },
    { open: 'bot', label: 'בוט וואטסאפ' },
    { open: 'spend', label: 'הוצאות' },
    { href: '/admin/studio', label: 'עיצוב' },
]

export const MORE = [
    { href: '/admin', label: 'אירועים' },
    { href: '/admin/sales-leads', label: 'לידים' },
    { href: '/admin/customers/board', label: 'הודעות ואוטומציות' },
    { href: '/admin/qrcodes', label: 'ברקודים' },
    { href: '/admin/emails', label: 'מיילים' },
    { href: '/admin/social-preview', label: 'תוכן לרשתות' },
    { href: '/admin/guest-design', label: 'עיצוב דף ברכה' },
    { href: '/admin/album-studio', label: 'סטודיו אלבומים' },
    { href: '/admin/project', label: 'הצגת הפרויקט' },
]

const trim = pathname => (pathname || '').replace(/\/+$/, '')
const under = (path, base) => path === base || path.startsWith(`${base}/`)

export function adminShell(pathname) {
    const path = trim(pathname)
    if (!under(path, '/admin') || OUTPUT.test(path)) return null
    const editor = EDITORS.some(base => under(path, base))
    return { rail: editor ? 'slim' : 'full', serif: SERIF.includes(path), themed: !editor }
}

// The href of the lit menu entry, or 'more' for a screen listed under it.
export function activeNav(pathname) {
    const path = trim(pathname)
    const matches = item => item.href && (item.href === '/admin' ? path === '/admin' : under(path, item.href))
    // The closest entry wins: a screen under "more" may sit below a menu entry.
    const found = [...NAV, ...MORE].filter(matches).sort((a, b) => b.href.length - a.href.length)[0]
    return !found ? null : MORE.includes(found) ? 'more' : found.href
}
