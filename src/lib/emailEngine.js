// src/lib/emailEngine.js — SERVER ONLY.
//
// The shared engine behind the admin email system. Used by:
//   • /api/admin/email   (super-admin compose / send / schedule / CRUD)
//   • /api/cron/email     (daily evaluator for scheduled + automated mail)
//
// Audience is always the COUPLE (the account holder). Guests have no
// email in the system, so "remind the guests" is served by sending the
// couple a ready-to-forward WhatsApp message + link.
//
// Collections (all admin-SDK only; client never touches them):
//   emailTemplates/{id}   { name, subject, body, createdAt, updatedAt }
//   emailCampaigns/{id}   one-off sends incl. scheduled
//   emailAutomations/{id} event-relative rules (X days before/after)
//   emailLog/{id}         audit + dedup (automations use a deterministic id)

import nodemailer from 'nodemailer'
import { buildShareCopy } from '@/lib/shareCopy'
import { randomUUID } from 'node:crypto'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'

export const COL = {
    templates: 'emailTemplates',
    campaigns: 'emailCampaigns',
    automations: 'emailAutomations',
    log: 'emailLog',
}

// Gmail SMTP — fine at this volume (a few weddings/month). If broadcast
// volume grows past Gmail's ~500/day, swap for a real ESP here.
function transporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    })
}

// Map client attachment payloads ({ filename, contentBase64 }) to the
// shape nodemailer expects. Returns undefined when there are none.
function toMailAttachments(list) {
    if (!Array.isArray(list) || list.length === 0) return undefined
    const out = list
        .filter(a => a && a.filename && a.contentBase64)
        .map(a => ({ filename: String(a.filename).slice(0, 200), content: a.contentBase64, encoding: 'base64' }))
    return out.length ? out : undefined
}

// ─── Date helpers (day granularity, UTC) ─────────────────────────────
function todayISO() {
    return new Date().toISOString().slice(0, 10)
}
function addDaysISO(iso, days) {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + Number(days || 0))
    return d.toISOString().slice(0, 10)
}
function daysBetween(fromISO, toISODate) {
    const a = new Date(fromISO + 'T00:00:00Z').getTime()
    const b = new Date(toISODate + 'T00:00:00Z').getTime()
    return Math.round((b - a) / 86400000)
}
function tsToISO(ts) {
    if (!ts) return ''
    if (typeof ts === 'string') return ts.slice(0, 10)
    if (ts.toDate) return ts.toDate().toISOString().slice(0, 10)
    return ''
}
function formatDateHe(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    if (!d) return iso
    return `${d}/${m}/${y}`
}

function coupleName(w) {
    const b = (w.brideName || '').trim()
    const g = (w.groomName || '').trim()
    const c = (w.celebrantName || '').trim()
    if (b && g) return `${b} ו${g}`
    return b || g || c || 'זוג יקר'
}

function emailOf(w) {
    return (w.ownerEmail || w.email || '').trim()
}

// Ensure the wedding has a no-login digital token; mint one if missing.
async function ensureToken(weddingId, w) {
    const tokens = Array.isArray(w.digitalTokens) ? w.digitalTokens : []
    if (tokens.length) return tokens[0]
    const tok = randomUUID()
    await adminDb.collection('weddings').doc(weddingId).set(
        { digitalTokens: FieldValue.arrayUnion(tok) },
        { merge: true },
    )
    return tok
}

// ─── Variable map for a wedding ──────────────────────────────────────
async function varsFor(w) {
    const slug = w.slug
    const guestLink = slug ? `${BASE_URL}/w/${slug}` : `${BASE_URL}/wedding/${w.id}`
    const token = await ensureToken(w.id, w)
    const bookLink = `${BASE_URL}/wedding/${w.id}/book/${token}`
    const loginLink = `${BASE_URL}/login`
    const portalLink = `${BASE_URL}/wedding/${w.id}/portal`
    const wd = w.weddingDate || ''
    const daysUntil = wd ? daysBetween(todayISO(), wd) : ''
    const waText = buildShareCopy(w).whatsapp + ' ' + guestLink
    const waLink = `https://wa.me/?text=${encodeURIComponent(waText)}`

    const btn = (href, label, solid = true) =>
        solid
            ? `<a href="${href}" style="display:inline-block;background:linear-gradient(180deg,#d3b46a,#b8893d);color:#fff;text-decoration:none;padding:13px 26px;border-radius:14px;font-weight:700;font-size:15px;margin:6px 0;">${label}</a>`
            : `<a href="${href}" style="display:inline-block;background:#fff;border:2px solid #aa8840;color:#aa8840;text-decoration:none;padding:11px 24px;border-radius:14px;font-weight:700;font-size:15px;margin:6px 0;">${label}</a>`

    return {
        coupleName: coupleName(w),
        brideName: w.brideName || '',
        groomName: w.groomName || '',
        celebrantName: w.celebrantName || '',
        weddingDate: formatDateHe(wd),
        daysUntilWedding: daysUntil === '' ? '' : String(daysUntil),
        guestLink,
        bookLink,
        loginLink,
        portalLink,
        whatsappShareLink: waLink,
        // Ready-made styled buttons
        bookButton: btn(bookLink, 'צפו בספר ובחרו עיצוב ←', false),
        guestButton: btn(guestLink, 'לעמוד הברכות ←'),
        loginButton: btn(loginLink, 'כניסה למערכת ←'),
        portalButton: btn(portalLink, 'לעמוד הניהול שלכם ←', false),
        whatsappButton: `<a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:13px 26px;border-radius:14px;font-weight:700;font-size:15px;margin:6px 0;">שיתוף בוואטסאפ ←</a>`,
    }
}

// Replace {{var}} tokens; unknown tokens are left intact so typos are visible.
function applyVars(str, vars) {
    return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
        k in vars ? String(vars[k] ?? '') : `{{${k}}}`,
    )
}

// Branded gold shell around the body. Body newlines become <br>.
function wrapHtml(bodyHtml) {
    const body = String(bodyHtml || '').replace(/\n/g, '<br>')
    return `
<div style="font-family:Arial,'Heebo',sans-serif;direction:rtl;text-align:right;max-width:600px;margin:0 auto;background:#fdf9ef;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#aa8840,#c9a44e);padding:22px 24px;color:#fff;">
    <h1 style="margin:0;font-size:20px;">Wedding Tales</h1>
  </div>
  <div style="padding:24px;font-size:15px;line-height:1.8;color:#3d2e1a;">
    ${body}
  </div>
  <div style="background:#fdf9ef;padding:16px 24px;border-top:1px solid rgba(170,136,64,0.2);text-align:center;color:#9a8665;font-size:11px;">
    באהבה, צוות Wedding Tales — Your moments, forever
  </div>
</div>`
}

// ─── Recipients ──────────────────────────────────────────────────────
// segment = { type, n?, eventType?, ids? }
export async function resolveWeddings(segment) {
    const snap = await adminDb.collection('weddings').get()
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(w => emailOf(w))
    const today = todayISO()
    const type = segment?.type || 'all'
    switch (type) {
        case 'upcoming':
            list = list.filter(w => w.weddingDate && w.weddingDate >= today)
            break
        case 'past':
            list = list.filter(w => w.weddingDate && w.weddingDate < today)
            break
        case 'noDate':
            list = list.filter(w => !w.weddingDate)
            break
        case 'nextNdays': {
            const end = addDaysISO(today, Number(segment.n || 14))
            list = list.filter(w => w.weddingDate && w.weddingDate >= today && w.weddingDate <= end)
            break
        }
        case 'eventType':
            list = list.filter(w => (w.eventType || 'wedding') === segment.eventType)
            break
        case 'specific': {
            const ids = new Set(segment.ids || [])
            list = list.filter(w => ids.has(w.id))
            break
        }
        case 'all':
        default:
            break
    }
    return list
}

export async function renderForWedding(template, w) {
    const vars = await varsFor(w)
    return {
        to: emailOf(w),
        subject: applyVars(template.subject, vars),
        html: wrapHtml(applyVars(template.body, vars)),
    }
}

// Send to one wedding. `dedupKey` (optional) makes the send idempotent
// (used by automations so a daily cron never double-sends).
export async function sendToWedding({ template, wedding, source, dedupKey, attachments }) {
    const to = emailOf(wedding)
    if (!to) return { skipped: 'no-email' }
    if (dedupKey) {
        const existing = await adminDb.collection(COL.log).doc(dedupKey).get()
        if (existing.exists) return { skipped: 'already-sent' }
    }
    const { subject, html } = await renderForWedding(template, wedding)
    await transporter().sendMail({
        from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
        to,
        subject,
        html,
        attachments: toMailAttachments(attachments),
    })
    const logDoc = {
        to,
        weddingId: wedding.id,
        subject,
        source: source || null,
        sentAt: FieldValue.serverTimestamp(),
    }
    if (dedupKey) await adminDb.collection(COL.log).doc(dedupKey).set(logDoc)
    else await adminDb.collection(COL.log).add(logDoc)
    return { sent: true, to }
}

// Send a template to every wedding in a segment, throttled for Gmail.
export async function sendCampaign({ template, segment, source, attachments }) {
    const weddings = await resolveWeddings(segment)
    let sent = 0,
        skipped = 0,
        failed = 0
    for (const w of weddings) {
        try {
            const r = await sendToWedding({ template, wedding: w, source, attachments })
            if (r.sent) sent++
            else skipped++
        } catch (e) {
            failed++
            console.error('[emailEngine] send failed for', w.id, e?.message || e)
        }
        await new Promise(r => setTimeout(r, 400)) // throttle
    }
    return { total: weddings.length, sent, skipped, failed }
}

// ─── Cron evaluators ─────────────────────────────────────────────────
export async function runScheduledCampaigns() {
    const now = Date.now()
    const snap = await adminDb.collection(COL.campaigns).where('status', '==', 'scheduled').get()
    const out = []
    for (const d of snap.docs) {
        const c = { id: d.id, ...d.data() }
        const when = c.scheduledFor?.toDate ? c.scheduledFor.toDate().getTime() : new Date(c.scheduledFor).getTime()
        if (!when || when > now) continue
        let template = { subject: c.subject, body: c.body }
        if (c.templateId) {
            const t = await adminDb.collection(COL.templates).doc(c.templateId).get()
            if (t.exists) template = t.data()
        }
        const result = await sendCampaign({ template, segment: c.segment, source: { kind: 'campaign', id: c.id } })
        await adminDb.collection(COL.campaigns).doc(c.id).set(
            { status: 'sent', sentAt: FieldValue.serverTimestamp(), result },
            { merge: true },
        )
        out.push({ id: c.id, ...result })
    }
    return out
}

export async function runAutomations() {
    const today = todayISO()
    const snap = await adminDb.collection(COL.automations).where('active', '==', true).get()
    const weddings = await resolveWeddings({ type: 'all' })
    const out = []
    for (const d of snap.docs) {
        const a = { id: d.id, ...d.data() }
        // Journey pruned (owner decision 2026-07): the ONLY automatic email
        // is the welcome-links message right after setup. Legacy automations
        // that may still be seeded in Firestore are skipped here — a code-
        // level kill switch that holds regardless of DB state.
        if (a.name !== 'ברוכים הבאים — מיד אחרי ההקמה') continue
        const t = await adminDb.collection(COL.templates).doc(a.templateId).get()
        if (!t.exists) continue
        const template = t.data()
        const offset = Number(a.trigger?.offsetDays || 0)
        for (const w of weddings) {
            let match = false
            if (a.trigger?.type === 'beforeWedding' && w.weddingDate) {
                match = w.weddingDate === addDaysISO(today, offset)
            } else if (a.trigger?.type === 'afterWedding' && w.weddingDate) {
                match = w.weddingDate === addDaysISO(today, -offset)
            } else if (a.trigger?.type === 'afterPurchase' && w.createdAt) {
                match = tsToISO(w.createdAt) === addDaysISO(today, -offset)
            }
            if (!match) continue
            const dedupKey = `auto_${a.id}_${w.id}`
            try {
                const r = await sendToWedding({
                    template,
                    wedding: w,
                    source: { kind: 'automation', id: a.id, name: a.name || '' },
                    dedupKey,
                })
                out.push({ automation: a.id, wid: w.id, ...r })
            } catch (e) {
                out.push({ automation: a.id, wid: w.id, error: e?.message || String(e) })
            }
            await new Promise(r => setTimeout(r, 400))
        }
    }
    return out
}

// Variables surfaced to the admin UI (for the "insert variable" buttons).
export const TEMPLATE_VARIABLES = [
    { key: 'coupleName', label: 'שם הזוג' },
    { key: 'weddingDate', label: 'תאריך האירוע' },
    { key: 'daysUntilWedding', label: 'ימים עד האירוע' },
    { key: 'guestLink', label: 'קישור אורחים (URL)' },
    { key: 'bookLink', label: 'קישור לספר (URL)' },
    { key: 'loginLink', label: 'קישור כניסה (URL)' },
    { key: 'portalLink', label: 'קישור פורטל (URL)' },
    { key: 'whatsappShareLink', label: 'קישור שיתוף וואטסאפ (URL)' },
    { key: 'bookButton', label: 'כפתור: צפייה בספר' },
    { key: 'guestButton', label: 'כפתור: עמוד ברכות' },
    { key: 'loginButton', label: 'כפתור: כניסה' },
    { key: 'portalButton', label: 'כפתור: פורטל' },
    { key: 'whatsappButton', label: 'כפתור: שיתוף וואטסאפ' },
]

// Default journey templates — seeded on demand from the admin UI.
export const DEFAULT_TEMPLATES = [
    {
        name: 'ברוכים הבאים — הקישורים שלכם',
        subject: 'הקישורים לספר הברכות שלכם 💛',
        body: `שלום {{coupleName}},

איזה כיף שאתם איתנו! הנה שני הקישורים שלכם:

<b>לינק להעלאת ברכה לספר</b> (לשתף עם האורחים):
{{guestLink}}

<b>לינק לצפייה בספר הברכות</b> שמתעדכן בזמן אמת:
{{bookLink}}

כל שאלה — תרגישו בנוח פשוט להשיב למייל הזה.
שיהיה המון מזל טוב!!! 💛
צוות Wedding Tales`,
    },
    {
        name: 'הבוקר שאחרי — הספר מלא (חינמיים → הדפסה)',
        subject: 'איזה ערב 🎉 ספר הברכות שלכם מחכה',
        body: `שלום {{coupleName}},

האירוע היה אמש — והספר שלכם כבר מלא ברגעים שהאורחים השאירו לכם 💛

<b>פתחו ודפדפו (זהירות, מרגש):</b>
{{bookButton}}

מישהו פספס? הקישור עדיין פעיל — שלחו תזכורת אחרונה:
{{whatsappButton}}

<b>רוצים את כל זה גם על המדף?</b>
אנחנו מדפיסים את הספר בכריכה קשה על נייר ארכיב — עד הבית.
פשוט השיבו למייל הזה או כתבו לנו בוואטסאפ, ותוך רגע נסגור את הפרטים.

באהבה,
צוות Wedding Tales`,
    },
    {
        name: 'הקמה — יום-יומיים אחרי הרכישה',
        subject: 'בואו נקים את ספר הברכות שלכם 💍',
        body:
            'שלום {{coupleName}},\n\nהספר שלכם מוכן להקמה! כל מה שנשאר זה למלא את הפרטים ולבחור עיצוב שאתם אוהבים.\n\n{{portalButton}}\n\nאפשר גם לצפות בספר ולבחור עיצוב כאן:\n{{bookButton}}\n\nמחכים לראות אתכם,',
    },
    {
        name: 'תזכורת שיתוף — שבועיים לפני',
        subject: 'עוד {{daysUntilWedding}} ימים — שתפו את הקישור עם האורחים 💌',
        body:
            'שלום {{coupleName}},\n\nהאירוע מתקרב! כדי שהספר יתמלא בברכות, שתפו את הקישור בקבוצות הוואטסאפ של האורחים. הכי קל עם הכפתור:\n\n{{whatsappButton}}\n\nאו העתיקו את הקישור: {{guestLink}}\n\nטיפ: שליחה לקבוצה כמה ימים לפני + תזכורת ביום האירוע מביאות הכי הרבה ברכות.',
    },
    {
        name: 'תזכורת זנב — כמה ימים אחרי',
        subject: 'הברכות עדיין נאספות — הזמנה אחרונה לשתף',
        body:
            'שלום {{coupleName}},\n\nהספר שלכם ממשיך להתמלא! מי שעוד לא הספיק לכתוב ברכה — עדיין יכול. שלחו תזכורת אחרונה:\n\n{{whatsappButton}}\n\nלצפייה בספר עד כה:\n{{bookButton}}',
    },
    {
        name: 'הספר מוכן',
        subject: 'הספר שלכם מוכן ✨',
        body:
            'שלום {{coupleName}},\n\nאיזה כיף — אוסף הברכות שלכם מוכן לצפייה. פתחו, דפדפו, ותיהנו מכל הרגעים שהאורחים השאירו לכם:\n\n{{bookButton}}\n\nהספר המודפס בהפקה ויגיע אליכם בקרוב.',
    },
    {
        name: 'המדריך המלא — כל ההוראות והקישורים',
        subject: 'המדריך המלא שלכם — Wedding Tales ✨',
        body: `שלום {{coupleName}},

הנה כל מה שצריך כדי שספר הברכות שלכם יתמלא 💛

<b>עמוד הניהול</b> — עריכת פרטים, בחירת עיצוב, ומעקב אחרי הברכות:
{{portalButton}}

<b>הספר שלכם</b> — לצפייה ולבחירת עיצוב:
{{bookButton}}

<b>שיתוף עם האורחים</b> — שלחו בקבוצות הוואטסאפ. טיפ: כמה ימים לפני + תזכורת ביום האירוע = הכי הרבה ברכות.
{{whatsappButton}}

<b>📎 קבצים להדפסה (מצורפים למייל)</b>
הדפיסו והציבו את שלטי ה-QR ליד הבר, בקבלת הפנים או על השולחנות — ככל שגלוי יותר, יותר אורחים סורקים ומברכים.

יש שאלה? פשוט השיבו למייל הזה 💛
צוות Wedding Tales`,
    },
]

// ─── WhatsApp helpers ────────────────────────────────────────────────
function phoneOf(w) {
    return (w.ownerPhone || w.phone || '').toString().trim()
}

// Normalize an Israeli / international phone to wa.me digits (country
// code, no +). 0541234567 → 972541234567.
export function normalizePhone(raw) {
    let p = (raw || '').toString().replace(/[^\d+]/g, '')
    if (!p) return ''
    if (p.startsWith('+')) p = p.slice(1)
    if (p.startsWith('00')) p = p.slice(2)
    if (p.startsWith('0')) p = '972' + p.slice(1)
    return p
}

function htmlToPlain(html) {
    return String(html || '')
        .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
        .replace(/<br\s*\/?>(\n)?/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

// Plain-text render for WhatsApp (no email shell). Subject becomes the
// first line; styled buttons collapse to "label (url)".
export async function renderPlainForWedding(template, w) {
    const vars = await varsFor(w)
    const subject = applyVars(template.subject, vars)
    const bodyHtml = applyVars(template.body, vars)
    const text = (subject ? subject + '\n\n' : '') + htmlToPlain(bodyHtml)
    return { to: emailOf(w), phone: phoneOf(w), text }
}

export function waLinkFor(phone, text) {
    const p = normalizePhone(phone)
    const t = encodeURIComponent(text || '')
    return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`
}

// WhatsApp send list for a segment — each recipient gets a ready wa.me
// deep link the admin taps to send from their own phone.
export async function waRecipients(template, segment) {
    const weddings = await resolveWeddings(segment)
    const out = []
    for (const w of weddings) {
        const r = await renderPlainForWedding(template, w)
        out.push({
            id: w.id,
            name: coupleName(w),
            phone: r.phone,
            hasPhone: Boolean(normalizePhone(r.phone)),
            waLink: waLinkFor(r.phone, r.text),
        })
    }
    return out
}

// Default journey automations — wired to the seeded templates by name.
// Active by default: they only fire for weddings matching the trigger on
// a given day, so turning them on never back-blasts existing customers.
export const DEFAULT_AUTOMATIONS = [
    // The whole journey was pruned (owner decision 2026-07): customers get
    // exactly ONE automatic email — the welcome message with their two
    // links — on the day their event is created. Everything else is
    // manual-send only from the admin emails screen.
    { name: 'ברוכים הבאים — מיד אחרי ההקמה', templateName: 'ברוכים הבאים — הקישורים שלכם', trigger: { type: 'afterPurchase', offsetDays: 0 }, active: true },
]

// ─── Test send ───────────────────────────────────────────────────────
// Renders the template against a built-in sample wedding (token already
// present → no DB write) and sends it to an arbitrary address. Subject is
// prefixed [בדיקה]; nothing is logged and no couple is touched.
function sampleWeddingForTest() {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + 14)
    return {
        id: 'sample',
        brideName: 'יעל',
        groomName: 'יואב',
        celebrantName: '',
        weddingDate: d.toISOString().slice(0, 10),
        slug: 'sample',
        ownerEmail: 'demo@weddingtales.co.il',
        eventType: 'wedding',
        digitalTokens: ['preview-token'],
    }
}

export async function sendTest({ template, to, attachments }) {
    if (!to) throw new Error('missing test recipient')
    const { subject, html } = await renderForWedding(template, sampleWeddingForTest())
    await transporter().sendMail({
        from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
        to,
        subject: `[בדיקה] ${subject}`,
        html,
        attachments: toMailAttachments(attachments),
    })
    return { ok: true, to }
}
