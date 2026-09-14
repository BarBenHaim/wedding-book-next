import { timingSafeEqual } from 'node:crypto'

const GRAPH_BASE = 'https://graph.facebook.com/v25.0'
const GRAPH_TIMEOUT_MS = 7_500
const CONFIRMATION = 'ENSURE_FOLLOWUP_SITE_TEMPLATE'
const TEMPLATE_NAME = 'wt_followup_site'
const TEMPLATE_LANGUAGE = 'he'
const SAFE_STATUSES = new Set(['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'])

const TEMPLATE_PAYLOAD = Object.freeze({
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    category: 'MARKETING',
    components: [
        {
            type: 'BODY',
            text: '{{1}}, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: https://weddingtales.co.il',
            example: { body_text: [['משפחה יקרה']] },
        },
        {
            type: 'BUTTONS',
            buttons: [{ type: 'URL', text: 'לצפייה בפרטים', url: 'https://weddingtales.co.il' }],
        },
    ],
})

function readConfig() {
    return {
        secret: process.env.SALES_AGENT_SECRET,
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        businessId: process.env.META_BUSINESS_ID || '1432105074957627',
    }
}

function sameSecret(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected) return false
    const actualBytes = Buffer.from(actual)
    const expectedBytes = Buffer.from(expected)
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function reply(status, body) {
    return { status, body }
}

function templateStatus(value) {
    const normalized = String(value || '').toUpperCase()
    return SAFE_STATUSES.has(normalized) ? normalized : 'UNKNOWN'
}

function safeMetaCode(body) {
    const code = body?.error?.code
    return Number.isSafeInteger(code) && code >= 0 ? { metaCode: code } : {}
}

export function createWhatsAppTemplateBootstrapHandler({ fetchFn = (...args) => fetch(...args), getConfig = readConfig } = {}) {
    return async function handleWhatsAppTemplateBootstrap(request) {
        const config = getConfig()
        if (!sameSecret(request.headers.get('x-wt-secret'), config.secret)) {
            return reply(401, { ok: false, error: 'UNAUTHORIZED' })
        }
        const body = await request.json().catch(() => null)
        if (body?.confirm !== CONFIRMATION) {
            return reply(400, { ok: false, error: 'CONFIRMATION_REQUIRED' })
        }
        if (!config.token || !config.phoneId || !config.businessId) {
            return reply(503, { ok: false, error: 'WHATSAPP_NOT_CONFIGURED' })
        }

        const graph = async (path, init = {}) => {
            let response
            try {
                response = await fetchFn(`${GRAPH_BASE}/${path}`, {
                    ...init,
                    headers: {
                        Authorization: `Bearer ${config.token}`,
                        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
                    },
                    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
                })
            } catch (error) {
                if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
                    return { error: reply(504, { ok: false, error: 'META_TIMEOUT' }) }
                }
                return { error: reply(502, { ok: false, error: 'META_UNAVAILABLE' }) }
            }
            const providerBody = await response.json().catch(() => null)
            if (!response.ok) {
                return { error: reply(502, { ok: false, error: 'META_REJECTED', ...safeMetaCode(providerBody) }) }
            }
            return { body: providerBody }
        }

        const accounts = await graph(`${encodeURIComponent(config.businessId)}/owned_whatsapp_business_accounts?fields=id&limit=100`)
        if (accounts.error) return accounts.error
        const wabas = Array.isArray(accounts.body?.data) ? accounts.body.data : null
        if (!wabas) {
            return reply(502, { ok: false, error: 'META_RESPONSE_INVALID' })
        }

        let wabaId = null
        for (const waba of wabas) {
            if (typeof waba?.id !== 'string' || !waba.id) continue
            const phoneNumbers = await graph(`${encodeURIComponent(waba.id)}/phone_numbers?fields=id&limit=100`)
            if (phoneNumbers.error) return phoneNumbers.error
            const phones = Array.isArray(phoneNumbers.body?.data) ? phoneNumbers.body.data : null
            if (!phones) return reply(502, { ok: false, error: 'META_RESPONSE_INVALID' })
            if (phones.some(phone => phone?.id === config.phoneId)) {
                wabaId = waba.id
                break
            }
        }
        if (!wabaId) return reply(502, { ok: false, error: 'WHATSAPP_ACCOUNT_NOT_FOUND' })

        const existing = await graph(`${encodeURIComponent(wabaId)}/message_templates?fields=name,status,language&limit=100`)
        if (existing.error) return existing.error
        const templates = Array.isArray(existing.body?.data) ? existing.body.data : null
        if (!templates) return reply(502, { ok: false, error: 'META_RESPONSE_INVALID' })
        const match = templates.find(item => item?.name === TEMPLATE_NAME && item?.language === TEMPLATE_LANGUAGE)
        if (match) {
            return reply(200, {
                ok: true,
                result: 'TEMPLATE_EXISTS',
                templateStatus: templateStatus(match.status),
            })
        }

        const created = await graph(`${encodeURIComponent(wabaId)}/message_templates`, {
            method: 'POST',
            body: JSON.stringify(TEMPLATE_PAYLOAD),
        })
        if (created.error) return created.error
        if (typeof created.body?.id !== 'string' || !created.body.id) {
            return reply(502, { ok: false, error: 'META_RESPONSE_INVALID' })
        }
        return reply(200, {
            ok: true,
            result: 'TEMPLATE_SUBMITTED',
            templateStatus: templateStatus(created.body.status || 'PENDING'),
        })
    }
}

export const handleWhatsAppTemplateBootstrap = createWhatsAppTemplateBootstrapHandler()
