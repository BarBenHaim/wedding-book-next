// src/lib/ownerTransfer.js
//
// Moving an event to another person's email — the super-admin fix for
// "I opened it under the wrong address" / "the event belongs to the
// mother, not the cousin who paid".
//
// ── Why this is more than editing ownerEmail ─────────────────────────
// Who can open an event is decided by `ownerId` (the Firebase Auth uid):
// /login and /my query `where('ownerId', '==', uid)` and firestore.rules
// check it on every owner write. `ownerEmail` is only the label. Editing
// the label alone left the event in the OLD person's account while the
// table showed the new address — so the transfer always moves both:
//
//   1. find the Auth user for the new email, or create one with a
//      generated password (the same thing create-user does for a sale);
//   2. write ownerId + ownerEmail on the wedding doc, and keep the
//      previous owner in `previousOwners` so a mistake is reversible;
//   3. optionally email the new owner: the password if the account is
//      new, "the event was added to your account" if it already existed.
//
// The old owner's account is not touched or deleted — it just stops
// listing this event.
//
// Pure helpers only — the route does the I/O, and the tests run here.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Trimmed, lower-cased email — or null when it is not an email. */
export function normalizeOwnerEmail(raw) {
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!v || v.length > 254 || !EMAIL_RE.test(v)) return null
    return v
}

/** Why a transfer request can't go ahead, or null when it can. */
export function transferProblem({ weddingId, email } = {}) {
    if (typeof weddingId !== 'string' || !weddingId.trim() || /[/\\]/.test(weddingId)) return 'bad-wedding-id'
    if (!normalizeOwnerEmail(email)) return 'bad-email'
    return null
}

/**
 * Already owned by exactly this account AND labelled with this email.
 * By uid, not by email: an event whose ownerEmail label was edited by
 * hand (the old way) shows the new address while the old account still
 * owns it — that one must still be movable.
 */
export function isSameOwner(wedding = {}, uid, email) {
    return Boolean(uid) && wedding.ownerId === uid && normalizeOwnerEmail(wedding.ownerEmail || wedding.email) === normalizeOwnerEmail(email)
}

export const TRANSFER_ERRORS = {
    'bad-wedding-id': 'אירוע לא תקין',
    'bad-email': 'כתובת המייל לא תקינה',
    'same-owner': 'האירוע כבר משויך למייל הזה',
    'not-found': 'האירוע לא נמצא',
}

/** One entry for the wedding's `previousOwners` history. */
export function previousOwnerRecord({ ownerId, ownerEmail } = {}, atIso, byEmail) {
    return {
        ownerId: ownerId || null,
        ownerEmail: ownerEmail || null,
        replacedAt: atIso,
        replacedBy: byEmail || null,
    }
}

/** A short, human name for the event, for the email subject and body. */
export function eventLabelForEmail(w = {}) {
    const bride = (w.brideNameHe || w.brideName || '').trim()
    const groom = (w.groomNameHe || w.groomName || '').trim()
    if (bride && groom) return `${bride} ו${groom}`
    const a = (w.celebrantNameHe || w.celebrantName || '').trim()
    const b = (w.celebrantName2 || '').trim()
    if (a && b) return `${a} ו${b}`
    return a || bride || groom || ''
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** { subject, html } for the new owner. `password` only for a new account. */
export function transferEmail({ email, eventLabel, password, loginUrl = 'https://app.weddingtales.co.il/login' }) {
    const what = eventLabel ? `ספר הברכות של ${esc(eventLabel)}` : 'ספר הברכות שלכם'
    const access = password
        ? `<li><b>אימייל:</b> <span dir="ltr">${esc(email)}</span></li>
           <li><b>סיסמה:</b> <span dir="ltr" style="font-weight:bold;letter-spacing:1px">${esc(password)}</span></li>`
        : `<li><b>אימייל:</b> <span dir="ltr">${esc(email)}</span></li>
           <li><b>סיסמה:</b> הסיסמה הקיימת שלכם (אפשר לאפס אותה במסך הכניסה)</li>`
    const html = `
    <div style="font-family:Heebo,Arial,sans-serif;direction:rtl;text-align:right;padding:20px;color:#2b2318">
      <h2 style="margin:0 0 12px">${what} מחכה לכם</h2>
      <p>${password ? 'פתחנו לכם חשבון ב-Wedding Tales והאירוע משויך אליו.' : 'האירוע נוסף לחשבון שלכם ב-Wedding Tales.'}</p>
      <h3 style="margin:18px 0 6px">פרטי הכניסה:</h3>
      <ul style="padding-right:18px;margin:0">${access}</ul>
      <p style="margin-top:18px"><a href="${esc(loginUrl)}" style="color:#AA8840;font-weight:bold">לחצו כאן להתחברות</a></p>
      <hr style="margin:25px 0;border:none;border-top:1px solid #eee"/>
      <p>באהבה,<br>צוות Wedding Tales</p>
    </div>`
    return { subject: eventLabel ? `${eventLabel} — ספר הברכות שלכם ב-Wedding Tales` : 'ספר הברכות שלכם ב-Wedding Tales', html }
}
