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
const GRAPH_TIMEOUT_MS = 12_000

// Which follow-up template goes out. `wt_followup` ({{1}} = the whole
// message) was designed on 15.9 and never approved by Meta. `wt_followup_he`
// ("היי {{1}}, רק מוודא שלא פספסתי אותך לגבי ספר הברכות...") has been
// APPROVED on the production WABA since 5.8 - found in WhatsApp Manager on
// 18.9 while 163 leads sat blocked waiting for a template. Its one variable
// is the customer's name, so the two are not interchangeable; see
// followupStrategy.js for how parameters are chosen per template.
export const APPROVED_NAME_TEMPLATE = 'wt_followup_he'
// The universal template's name. Still allowlisted so it can be switched
// to with SALES_FOLLOWUP_TEMPLATE_NAME the day Meta approves it.
export const FOLLOWUP_TEMPLATE = 'wt_followup'
export const DAILY_DIGEST_TEMPLATE = 'wt_daily_digest'

// Resolved per call, not at import: the cron and the tests both need to
// be able to change it without a redeploy of the module graph.
export function activeFollowupTemplate(env = process.env) {
    const name = String(env?.SALES_FOLLOWUP_TEMPLATE_NAME || '').trim()
    return TEMPLATE_PARAMETERS.has(name) ? name : APPROVED_NAME_TEMPLATE
}

const TEMPLATE_PARAMETERS = new Map([
    [FOLLOWUP_TEMPLATE, 1],
    [APPROVED_NAME_TEMPLATE, 1],
    [DAILY_DIGEST_TEMPLATE, 4],
])

export function canSendWhatsApp() {
    return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID)
}

async function post(payload) {
    if (!canSendWhatsApp()) throw graphError('WHATSAPP_NOT_CONFIGURED')
    // Hard timeout below every route/cron budget. Meta's API on a restricted account can
    // HANG rather than error, and a hanging send inside the daily run
    // holds a worker slot until the platform kills the whole function —
    // which is a truncated morning with no error anywhere. A timeout is
    // an error we can log per lead; a hang is 25 leads' problem.
    const abort = AbortSignal.timeout(GRAPH_TIMEOUT_MS)
    let res
    try {
        res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: abort,
        })
    } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw graphError('GRAPH_TIMEOUT')
        throw graphError('GRAPH_REJECTED')
    }
    // Provider rejection bodies may include recipient/account details. Keep
    // only Meta's numeric classification, which is enough to distinguish a
    // missing template from an expired token without retaining customer data.
    if (!res.ok) {
        const rejected = await res.json().catch(() => null)
        const providerCode = Number.isInteger(rejected?.error?.code) ? rejected.error.code : null
        const providerSubcode = Number.isInteger(rejected?.error?.error_subcode)
            ? rejected.error.error_subcode
            : null
        console.warn('[sales-agent/whatsapp] graph rejected', { providerCode, providerSubcode })
        throw graphError('GRAPH_REJECTED', { providerCode, providerSubcode })
    }

    const body = await res.json().catch(() => null)
    const providerMessageId = typeof body?.messages?.[0]?.id === 'string'
        ? body.messages[0].id.trim().slice(0, 500)
        : ''
    if (!providerMessageId) throw graphError('PROVIDER_MESSAGE_ID_MISSING')
    return { accepted: true, providerMessageId }
}

function graphError(errorCode, metadata = {}) {
    const error = new Error('whatsapp graph send failed')
    error.errorCode = errorCode
    if (Number.isInteger(metadata.providerCode)) error.providerCode = metadata.providerCode
    if (Number.isInteger(metadata.providerSubcode)) error.providerSubcode = metadata.providerSubcode
    return error
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

/** A video by URL, with an optional caption. Only valid inside the 24-hour window. */
export function sendWhatsAppVideo(to, url, caption = '') {
    return post({
        messaging_product: 'whatsapp',
        to: String(to),
        type: 'video',
        video: { link: String(url), caption: String(caption || '').slice(0, 1024) },
    })
}

/** An audio file by URL. Graph determines the rendered audio presentation from the media. */
export function sendWhatsAppAudio(to, url, _voiceNote = false) {
    return post({
        messaging_product: 'whatsapp',
        to: String(to),
        type: 'audio',
        audio: { link: String(url) },
    })
}

/** Business-initiated messages may use only the named, parameter-bounded templates. */
export function sendWhatsAppTemplate(to, templateName, parameters = [], options = {}) {
    const expected = TEMPLATE_PARAMETERS.get(templateName)
    if (!expected || !Array.isArray(parameters) || parameters.length !== expected) {
        return Promise.reject(graphError('TEMPLATE_NOT_CONFIGURED'))
    }
    const clean = parameters.map(value => String(value || '')
        .replace(/[\n\r\t]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim()
        .slice(0, 1024))
    if (clean.some(value => !value)) return Promise.reject(graphError('TEMPLATE_NOT_CONFIGURED'))

    if (options?.headerVideoUrl != null) {
        return Promise.reject(graphError('TEMPLATE_NOT_CONFIGURED'))
    }

    const components = [{
        type: 'body',
        parameters: clean.map(text => ({ type: 'text', text })),
    }]

    return post({
        messaging_product: 'whatsapp',
        to: String(to),
        type: 'template',
        template: {
            name: templateName,
            language: { code: 'he' },
            components,
        },
    })
}

const whatsapp = {
    FOLLOWUP_TEMPLATE,
    DAILY_DIGEST_TEMPLATE,
    canSendWhatsApp,
    sendWhatsAppAudio,
    sendWhatsAppText,
    sendWhatsAppImage,
    sendWhatsAppVideo,
    sendWhatsAppTemplate,
}

export default whatsapp
