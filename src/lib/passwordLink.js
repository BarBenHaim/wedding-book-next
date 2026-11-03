// src/lib/passwordLink.js
//
// "Choose your own password" — for customers who already have a book.
//
// Their account was opened for them (WooCommerce order, /admin create,
// an owner transfer) with a generated password that arrived in an email
// they no longer have. Instead of us mailing them another random string,
// they ask for a link, open it, and pick a password themselves.
//
// The link is a Firebase password-reset code (adminAuth.
// generatePasswordResetLink), but it points at OUR page — /set-password —
// instead of Firebase's grey English action page, and the email is ours
// too, in Hebrew. The page verifies the code, sets the password and signs
// the customer straight in.
//
// The request route never says whether an email is registered: the same
// "if it's ours, a link is on its way" answer either way.
//
// Pure helpers only — the routes and pages do the I/O.

export const MIN_PASSWORD_LENGTH = 6 // Firebase Auth's own minimum
export const LINK_COOLDOWN_MS = 60 * 1000 // one email per address per minute

/** The oobCode out of a Firebase action link, or null. */
export function oobCodeFromLink(link) {
    try {
        const code = new URL(link).searchParams.get('oobCode')
        return code && /^[\w-]{10,}$/.test(code) ? code : null
    } catch {
        return null
    }
}

export function setPasswordUrl(origin, code) {
    const base = String(origin || '').replace(/\/$/, '')
    return `${base}/set-password?code=${encodeURIComponent(code)}`
}

/** Why this password can't be used, in Hebrew — or null when it can. */
export function passwordProblem(password, confirm) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return `הסיסמה צריכה להיות לפחות ${MIN_PASSWORD_LENGTH} תווים`
    }
    if (password.length > 128) return 'הסיסמה ארוכה מדי'
    if (confirm !== undefined && confirm !== password) return 'שתי הסיסמאות לא זהות'
    return null
}

/** True when the last request for this address was too recent. */
export function inCooldown(lastAtMs, nowMs, cooldownMs = LINK_COOLDOWN_MS) {
    return Number.isFinite(lastAtMs) && nowMs - lastAtMs < cooldownMs
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** { subject, html } — the email with the choose-a-password button. */
// `sentByUs` — the super-admin sent it from /admin, nobody "asked".
export function setPasswordEmail({ email, url, sentByUs = false }) {
    const intro = sentByUs
        ? `שלחנו לכם קישור לבחירת סיסמה לחשבון <span dir="ltr">${esc(email)}</span>, שבו נמצא ספר הברכות שלכם.`
        : `ביקשתם לבחור סיסמה לחשבון <span dir="ltr">${esc(email)}</span>.`
    const html = `
    <div style="font-family:Heebo,Arial,sans-serif;direction:rtl;text-align:right;padding:20px;color:#2b2318">
      <h2 style="margin:0 0 12px">בחירת סיסמה ל-Wedding Tales</h2>
      <p>${intro}</p>
      <p style="margin:22px 0">
        <a href="${esc(url)}" style="display:inline-block;background:#AA8840;color:#fff;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:999px">לבחירת סיסמה</a>
      </p>
      <p style="color:#7a6a52;font-size:13px">הקישור תקף לשעה ולשימוש אחד.${sentByUs ? '' : ' לא ביקשתם? אפשר להתעלם מהמייל, הסיסמה הקיימת לא משתנה.'}</p>
      <hr style="margin:25px 0;border:none;border-top:1px solid #eee"/>
      <p>באהבה,<br>צוות Wedding Tales</p>
    </div>`
    return { subject: 'בחירת סיסמה ל-Wedding Tales', html }
}

/** Hebrew text for the Firebase client errors the login screens can hit. */
export function authErrorMessage(code) {
    switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-email':
            return 'המייל או הסיסמה לא נכונים. אפשר ללחוץ "בחירת סיסמה חדשה" ולקבל קישור למייל.'
        case 'auth/too-many-requests':
            return 'יותר מדי ניסיונות. חכו כמה דקות ונסו שוב, או בחרו סיסמה חדשה.'
        case 'auth/account-exists-with-different-credential':
            return 'המייל הזה רשום אצלנו עם סיסמה. התחברו עם הסיסמה, או לחצו "בחירת סיסמה חדשה".'
        case 'auth/operation-not-allowed':
        case 'auth/unauthorized-domain':
            return 'ההתחברות עם Google עוד לא זמינה. התחברו עם מייל וסיסמה בינתיים.'
        case 'auth/popup-blocked':
            return 'הדפדפן חסם את חלון Google. אפשרו חלונות קופצים ונסו שוב.'
        case 'auth/network-request-failed':
            return 'אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.'
        case 'auth/expired-action-code':
        case 'auth/invalid-action-code':
            return 'הקישור כבר לא בתוקף. בקשו קישור חדש.'
        case 'auth/weak-password':
            return `הסיסמה חלשה מדי — לפחות ${MIN_PASSWORD_LENGTH} תווים`
        default:
            return 'משהו השתבש. נסו שוב עוד רגע.'
    }
}

/** Popup closed by the person — not an error worth showing. */
export function isUserCancel(code) {
    return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
}
