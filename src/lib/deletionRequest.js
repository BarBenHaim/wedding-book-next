// src/lib/deletionRequest.js
//
// Validation for the public "delete my account" request at /account-deletion.
//
// Google Play requires a URL, reachable WITHOUT installing the app, where a
// user can ask for their account and data to be deleted. That page is public
// and unauthenticated by definition — anyone can POST to it — so everything
// this module does is about making an unauthenticated write safe and cheap:
//
//   • the only field that matters is an email address, and it is normalised
//     so "Bar@Gmail.com " and "bar@gmail.com" collapse to one request rather
//     than two rows a human then has to reconcile;
//   • the free-text note is capped, because an uncapped string on a public
//     endpoint is a way to run up a Firestore bill;
//   • the returned value is a plain object with a fixed shape, so the route
//     writes exactly these keys and nothing the caller invented.
//
// Deliberately NOT done here: deleting anything. A public endpoint that
// deletes on receipt would let anyone erase a stranger's wedding by typing
// their address. The request is recorded and actioned by a human (or by the
// authenticated in-app flow, which knows who the caller is).

export const NOTE_MAX = 600
export const EMAIL_MAX = 254 // RFC 5321 practical maximum

// Intentionally loose. This guards a database write, not a mailbox: the
// tight-regex approach rejects real addresses, and the cost of accepting a
// typo is a request nobody can match to an account — which a human sees
// anyway. What we must reject is the shapes that are not addresses at all.
const EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@,;:<>()[\]\\.]+(\.[^\s@,;:<>()[\]\\.]+)+$/

export function normalizeEmail(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().toLowerCase()
}

export function isEmail(raw) {
    const e = normalizeEmail(raw)
    return e.length > 0 && e.length <= EMAIL_MAX && EMAIL_RE.test(e)
}

// Collapses runs of whitespace so a note pasted out of a mail client does
// not arrive as 400 characters of newlines, then truncates. Truncating
// before collapsing would let whitespace eat the budget.
export function cleanNote(raw) {
    if (typeof raw !== 'string') return ''
    return raw.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
}

export const REASONS = ['no_longer_needed', 'privacy', 'duplicate', 'other']

export function validateDeletionRequest(body) {
    const b = body && typeof body === 'object' ? body : {}
    const email = normalizeEmail(b.email)

    if (!email) return { ok: false, error: 'email_required' }
    if (!isEmail(email)) return { ok: false, error: 'email_invalid' }

    return {
        ok: true,
        value: {
            email,
            reason: REASONS.includes(b.reason) ? b.reason : 'other',
            note: cleanNote(b.note),
        },
    }
}
