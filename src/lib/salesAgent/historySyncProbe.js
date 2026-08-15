import { timingSafeEqual } from 'crypto'

const GRAPH_BASE = 'https://graph.facebook.com/v25.0'
const GRAPH_TIMEOUT_MS = 7_500
const CONFIRMATION = 'REQUEST_180_DAY_HISTORY'

function readConfig() {
    return {
        enabled: process.env.WHATSAPP_HISTORY_PROBE_ENABLED,
        secret: process.env.WHATSAPP_HISTORY_PROBE_SECRET,
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
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

export function createHistorySyncProbeHandler({ fetchFn = (...args) => fetch(...args), getConfig = readConfig } = {}) {
    return async function handleHistorySyncProbe(request) {
        const config = getConfig()
        if (config.enabled !== 'true') return reply(404, { ok: false, error: 'NOT_FOUND' })

        if (!sameSecret(request.headers.get('x-history-probe-secret'), config.secret)) {
            return reply(401, { ok: false, error: 'UNAUTHORIZED' })
        }

        const body = await request.json().catch(() => null)
        if (body?.confirm !== CONFIRMATION) {
            return reply(400, { ok: false, error: 'CONFIRMATION_REQUIRED' })
        }

        if (!config.token || !config.phoneId) {
            return reply(503, { ok: false, error: 'WHATSAPP_NOT_CONFIGURED' })
        }

        let response
        try {
            response = await fetchFn(`${GRAPH_BASE}/${config.phoneId}/smb_app_data`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' }),
                signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
            })
        } catch (error) {
            if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
                return reply(200, { ok: false, error: 'META_TIMEOUT' })
            }
            return reply(200, { ok: false, error: 'META_UNAVAILABLE' })
        }

        const providerBody = await response.json().catch(() => null)
        if (!response.ok) {
            const metaCode = providerBody?.error?.code
            const safeCode = Number.isSafeInteger(metaCode) && metaCode >= 0 ? { metaCode } : {}
            return reply(200, { ok: false, error: 'META_REJECTED', ...safeCode })
        }

        if (providerBody?.success !== true) {
            return reply(200, { ok: false, error: 'META_RESPONSE_INVALID' })
        }

        return reply(200, { ok: true, result: 'HISTORY_REQUEST_ACCEPTED' })
    }
}

export const handleHistorySyncProbe = createHistorySyncProbeHandler()
