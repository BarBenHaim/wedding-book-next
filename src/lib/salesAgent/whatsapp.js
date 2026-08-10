// src/lib/salesAgent/whatsapp.js
//
// Direct sends to WhatsApp Cloud, for the paths where Make is not in
// the loop.
//
// The inbound conversation keeps its shape — Make receives the webhook,
// calls /reply, sends what comes back. This module exists for the DAILY
// follow-ups, where the discovery that forced it was unpleasant: the
// Vercel cron called a route that composed the messages, marked every
// lead as chased, and returned the texts to a caller with no hands.
// Vercel's cron does not send WhatsApp messages; it collects JSON and
// throws it away. Had the cron been authorized, it would have burned 25
// follow-ups a morning — marked sent, never delivered, invisible in
// every log — until somebody noticed the silence.
//
// Configured with WHATSAPP_TOKEN (a permanent Meta system-user token)
// and WHATSAPP_PHONE_ID (the business number's phone-number-id). With
// either missing, canSendWhatsApp() is false and callers must degrade
// to reporting without marking — composing without delivering is fine,
// it is only LYING about delivery that is not.

const GRAPH = 'https://graph.facebook.com/v19.0'

export function canSendWhatsApp() {
    return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID)
}

async function post(payload) {
    // Hard 15-second timeout. Meta's API on a restricted account can
    // HANG rather than error, and a hanging send inside the daily run
    // holds a worker slot until the platform kills the whole function —
    // which is a truncated morning with no error anywhere. A timeout is
    // an error we can log per lead; a hang is 25 leads' problem.
    const abort = AbortSignal.timeout(15_000)
    const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abort,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
        // The error body names the real reason — outside the 24h window,
        // bad number, expired token. It is the difference between a fix
        // and a shrug, so it travels with the failure.
        const detail = body?.error?.message || `HTTP ${res.status}`
        throw new Error(detail)
    }
    return body
}

/** One free-form text message. Only valid inside the 24-hour window. */
export function sendWhatsAppText(to, text) {
    return post({
        messaging_product: 'whatsapp',
        to: String(to),
        type: 'text',
        text: { body: String(text || '').slice(0, 4096), preview_url: true },
    })
}

/** An image by URL, with an optional caption. Same window rules. */
export function sendWhatsAppImage(to, url, caption = '') {
    return post({
        messaging_product: 'whatsapp',
        to: String(to),
        type: 'image',
        image: { link: String(url), caption: String(caption || '').slice(0, 1024) },
    })
}

export default { canSendWhatsApp, sendWhatsAppText, sendWhatsAppImage }
