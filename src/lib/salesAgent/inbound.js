// src/lib/salesAgent/inbound.js
//
// Reading a request body that Make may have broken on the way here.
//
// On 8 August a woman asked "כמה זה עולה" and got nothing back. The
// scenario had failed at the HTTP module with 400 and `bad-json`, which
// looked like our fault and was: this endpoint refused the request. But
// the request was already malformed when it arrived.
//
// Make's HTTP module builds the body as a raw string with the values
// interpolated straight into it:
//
//     {"phone":"{{8.Contacts[].WhatsApp ID}}","text":"{{8.Messages[].Text.Body}}",...}
//
// Nothing escapes those values. Her message was two lines - a date, then
// the question - so a literal newline landed inside a JSON string
// literal, and the whole body stopped being JSON. A double quote does
// the same thing, and a backslash, and a tab. On a channel where people
// write however they like, that is not an edge case; it is Tuesday.
//
// The clean fix belongs in Make, wrapping every value in toJSON(). It is
// also the fix nobody can verify without sending a real message through
// a live scenario, and if Make's toJSON turns out not to include the
// surrounding quotes it breaks EVERY message instead of the occasional
// one. So the repair lives here, where it can be tested, and where this
// project already keeps its logic. If Make is fixed later this file
// costs nothing: valid JSON never reaches the repair path.
//
// What makes the repair safe is that we are not parsing arbitrary JSON.
// We wrote the template. The keys are known, their order is known, and
// every value is a string. So we find the keys and take everything
// between them verbatim - which is exactly the content a strict parser
// choked on.

// The template's fields, in the order Make writes them. Order matters:
// each key is searched for only AFTER the previous one, so a customer
// who types something that looks like JSON cannot make us mis-read a
// field that was already read.
export const BODY_KEYS = ['phone', 'text', 'profileName', 'source', 'from', 'to', 'businessPhone', 'field']

// A body this large is not a WhatsApp message, it is something wrong.
// Bailing early keeps a bad request from turning into slow string work.
export const MAX_BODY_CHARS = 100_000

// NOTE on escapes: there are none to undo here, and trying was a bug.
//
// The repair path only ever runs on a body Make assembled by hand, and
// Make escapes nothing. So every backslash in it is a backslash the
// customer typed - somebody sending a Windows path, or writing 50\% -
// and translating it would quietly corrupt their message. The value is
// taken verbatim. Bodies that DID arrive properly escaped are valid
// JSON and never reach this code; JSON.parse handles them.
//
// A first version of this file unescaped anyway, and a test with
// C:\\תמונות in it turned that into C:תמונות. The backslash disappeared
// from the customer's own words on the way to the model.

// Take one raw slice from between two keys and turn it back into a value.
// The slice arrives with its structural punctuation attached, because
// that punctuation is the only reliable boundary we have.
function unwrapValue(chunk) {
    let s = String(chunk == null ? '' : chunk)
    s = s.replace(/\s+$/, '')
    if (s.endsWith('}')) s = s.slice(0, -1).replace(/\s+$/, '')
    if (s.endsWith(',')) s = s.slice(0, -1).replace(/\s+$/, '')
    s = s.replace(/^\s+/, '')
    if (s.startsWith('"')) {
        s = s.slice(1)
        if (s.endsWith('"')) s = s.slice(0, -1)
        return s
    }
    // Unquoted: a null, a number, or nothing at all. Everything
    // downstream treats these as strings, and an absent name is '' not
    // the four letters n-u-l-l.
    if (s === 'null' || s === 'undefined') return ''
    return s
}

/**
 * Parse the inbound body, repairing it if it is not valid JSON.
 *
 * Returns `{ body, repaired, reason }`. `body` is null only when there
 * is nothing recognisable to work with, which is the one case that still
 * deserves a 400.
 *
 * `repaired` is worth logging. It is not an error - the customer gets a
 * normal answer either way - but a rising count means Make is sending
 * broken bodies routinely, and that is worth knowing before someone
 * spends an afternoon on a bug that is not in this repo.
 */
export function parseInboundBody(raw, keys = BODY_KEYS) {
    const s = typeof raw === 'string' ? raw : ''
    if (!s.trim()) return { body: null, repaired: false, reason: 'empty' }
    if (s.length > MAX_BODY_CHARS) return { body: null, repaired: false, reason: 'too-large' }

    try {
        const parsed = JSON.parse(s)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { body: parsed, repaired: false, reason: null }
        }
    } catch {
        /* fall through to the repair */
    }

    const found = []
    let cursor = 0
    for (const key of keys) {
        const marker = `"${key}":`
        const at = s.indexOf(marker, cursor)
        if (at === -1) continue
        found.push({ key, at, valueAt: at + marker.length })
        cursor = at + marker.length
    }
    if (!found.length) return { body: null, repaired: false, reason: 'no-fields' }

    const body = {}
    for (let i = 0; i < found.length; i++) {
        const end = i + 1 < found.length ? found[i + 1].at : s.length
        body[found[i].key] = unwrapValue(s.slice(found[i].valueAt, end))
    }
    return { body, repaired: true, reason: null }
}

export default { parseInboundBody, BODY_KEYS, MAX_BODY_CHARS }
