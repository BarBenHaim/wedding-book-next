// Which screens wear the house design (Golden Jerusalem), outside the super
// admin, which has its own frame (adminShell.js). Pure, so the rules are
// testable.
//
// Guest screens are deliberately absent: their look is the one the event owner
// chose, and the house design must never paint over it.

const FULL = { header: true, page: true, band: true }
const FRAMED = { header: true, page: true, band: false }
const BAR = { header: true, page: false, band: false }

const RULES = [
    [/^\/(set-password|terms|privacy|account-deletion)$/, FULL],
    [/^\/wedding\/[^/]+\/(admin|portal\/classic)$/, FULL],
    [/^\/wedding\/[^/]+\/stats\/[^/]+$/, FULL],
    [/^\/(manage|arrange)\/[^/]+$/, FULL],
    // They draw their own top bar, or the whole screen.
    [/^\/my$/, FRAMED],
    [/^\/manage\/[^/]+\/photos$/, FRAMED],
    // They draw themselves; only the site bar above them follows the house.
    [/^\/wedding\/[^/]+\/(viewer|portal)$/, BAR],
]

export function hallFor(pathname) {
    const path = (pathname || '').replace(/\/+$/, '')
    const rule = RULES.find(([pattern]) => pattern.test(path))
    return rule ? { ...rule[1] } : null
}
