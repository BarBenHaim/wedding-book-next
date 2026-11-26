// The frame around the super admin: which screens get the menu, and what the
// menu lists. Pure, so the rules are testable.

// Print outputs: anything drawn around them would end up in the exported file.
const OUTPUT = /^\/admin\/wedding\/[^/]+\/(cover-print|picabook-export)$/
// Design editors need the width, and their previews must not inherit our font.
const EDITORS = ['/admin/studio', '/admin/guest-design']
// Screens that are only admin interface, so the admin font applies to all of it.
const SERIF = ['/admin', '/admin/customers', '/admin/customers/board', '/admin/sales-leads']

// Four places and two windows. A place with several screens shows them as tabs.
export const NAV = [
    { href: '/admin/customers', label: 'היום' },
    { href: '/admin', label: 'אירועים', tabs: [{ href: '/admin', label: 'אירועים' }, { href: '/admin/qrcodes', label: 'ברקודים' }] },
    {
        href: '/admin/sales-leads', label: 'הודעות',
        tabs: [{ href: '/admin/sales-leads', label: 'לידים' }, { href: '/admin/customers/board', label: 'אוטומציות' }, { href: '/admin/emails', label: 'מיילים' }],
    },
    {
        href: '/admin/studio', label: 'עיצוב',
        tabs: [{ href: '/admin/studio', label: 'ספר וכריכה' }, { href: '/admin/guest-design', label: 'דף הברכה' }],
    },
    { open: 'bot', label: 'בוט וואטסאפ' },
    { open: 'spend', label: 'הוצאות' },
]

const trim = pathname => (pathname || '').replace(/\/+$/, '')
const under = (path, base) => path === base || path.startsWith(`${base}/`)

export function adminShell(pathname) {
    const path = trim(pathname)
    if (!under(path, '/admin') || OUTPUT.test(path)) return null
    const editor = EDITORS.some(base => under(path, base))
    return { rail: editor ? 'slim' : 'full', serif: SERIF.includes(path), themed: !editor }
}

// The place a screen belongs to: the screen itself, or the tab that is closest
// to it ('/admin' only matches itself).
function placeOf(pathname) {
    const path = trim(pathname)
    const screens = NAV.flatMap(item => (item.href ? (item.tabs || [item]).map(screen => ({ screen: screen.href, item })) : []))
    return screens
        .filter(({ screen }) => (screen === '/admin' ? path === '/admin' : under(path, screen)))
        .sort((a, b) => b.screen.length - a.screen.length)[0] || null
}

// The href of the lit menu entry.
export function activeNav(pathname) {
    return placeOf(pathname)?.item.href || null
}

// The tabs drawn above a screen, with the open one marked.
export function tabsFor(pathname) {
    if (!adminShell(pathname)) return []
    const place = placeOf(pathname)
    return (place?.item.tabs || []).map(tab => ({ ...tab, current: tab.href === place.screen }))
}
