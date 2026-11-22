// src/lib/enterLink.js — pure: a signed "enter my book" link. No Firebase, no Next, no mailer.
//
// The first e-mail and the login page's "send me a link" both carry one. It
// signs a customer in with one tap, with no password to type or remember.
// The link holds only the account id and an expiry, signed with a server
// secret; /api/auth/enter checks it and mints a Firebase custom token.
//
// It works like the password the first e-mail already carried: whoever holds
// the e-mail can enter. It expires, and it only ever opens that account.

import { createHmac, timingSafeEqual } from 'crypto'

export const ENTER_TTL_MS = 30 * 24 * 60 * 60 * 1000 // the first e-mail is read days later
export const LOGIN_LINK_TTL_MS = 60 * 60 * 1000 // a link asked for on the login page: an hour

const b64 = s => Buffer.from(s, 'utf8').toString('base64url')
const unb64 = s => Buffer.from(s, 'base64url').toString('utf8')
const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url')

export function enterSecret(env = process.env) {
    return env.ENTER_LINK_SECRET || env.WC_WEBHOOK_SECRET || ''
}

/** A token for one account, or '' when there is no secret to sign with. */
export function signEnterToken(uid, { secret, now = Date.now(), ttlMs = ENTER_TTL_MS } = {}) {
    if (!uid || !secret) return ''
    const body = b64(JSON.stringify({ u: String(uid), e: now + ttlMs }))
    return `${body}.${sign(body, secret)}`
}

/** { ok: true, uid } for a good token; { ok: false, reason } otherwise. */
export function verifyEnterToken(token, { secret, now = Date.now() } = {}) {
    if (!secret) return { ok: false, reason: 'no-secret' }
    if (typeof token !== 'string' || token.length > 600) return { ok: false, reason: 'malformed' }
    const [body, sig, extra] = token.split('.')
    if (!body || !sig || extra !== undefined) return { ok: false, reason: 'malformed' }
    const want = Buffer.from(sign(body, secret))
    const got = Buffer.from(sig)
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad-signature' }
    let data
    try {
        data = JSON.parse(unb64(body))
    } catch {
        return { ok: false, reason: 'malformed' }
    }
    if (!data || typeof data.u !== 'string' || !data.u || !Number.isFinite(data.e)) return { ok: false, reason: 'malformed' }
    if (now > data.e) return { ok: false, reason: 'expired' }
    return { ok: true, uid: data.u }
}

export function enterUrl(origin, token) {
    const base = String(origin || '').replace(/\/+$/, '')
    return `${base}/enter?t=${encodeURIComponent(token)}`
}

const INK = '#14183A'
const PAPER = '#F3F0EA'
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** { subject, html, text } — the e-mail the login page sends: one button. */
export function enterLinkEmail({ email, url }) {
    const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}"><tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;direction:rtl;text-align:right;font-family:Arial,'Segoe UI',Helvetica,sans-serif;color:${INK};">
  <tr><td align="center" style="padding:6px 0 18px;font:400 22px/1 Arial,sans-serif;color:${INK};"><b style="font-weight:900;">Wedding</b> Tales</td></tr>
  <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:22px;border:1px solid #E4DFD3;padding:28px 24px;">
    <h1 style="margin:0 0 10px;font:800 24px/1.25 Arial,sans-serif;color:${INK};">הכניסה שלכם לספר</h1>
    <p style="margin:0 0 22px;font:400 16px/1.6 Arial,sans-serif;color:#5A5D75;">ביקשתם קישור כניסה לחשבון <span dir="ltr">${esc(email)}</span>. לוחצים, ונכנסים. בלי סיסמה.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" bgcolor="${INK}" style="border-radius:14px;"><a href="${esc(url)}" style="display:block;padding:15px 30px;font:700 17px/1.2 Arial,sans-serif;color:#FFFFFF;text-decoration:none;border-radius:14px;">כניסה לספר שלי</a></td></tr></table>
    <p style="margin:22px 0 0;font:400 13.5px/1.6 Arial,sans-serif;color:#7A7D93;">הקישור תקף לשעה. לא ביקשתם? אפשר להתעלם מהמייל, אף אחד לא נכנס בלי הקישור הזה.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
    const text = `ביקשתם קישור כניסה ל-Wedding Tales (${email}).\nלכניסה בלחיצה אחת: ${url}\nהקישור תקף לשעה. לא ביקשתם? אפשר להתעלם מהמייל.`
    return { subject: 'הכניסה שלכם ל-Wedding Tales', html, text }
}
