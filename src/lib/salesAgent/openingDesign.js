import sharp from 'sharp'

const GRAPH = 'https://graph.facebook.com/v19.0'
const TIMEOUT_MS = 12_000
const MAX_IMAGE_BYTES = 10_000_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function openingError(code, message = 'opening media unavailable') {
    const error = new Error(message)
    error.code = code
    return error
}

function safeHttpsUrl(value) {
    try {
        const parsed = new URL(String(value || ''))
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : null
    } catch {
        return null
    }
}

export async function downloadWhatsAppMedia(mediaId, {
    fetchFn = fetch,
    token = process.env.WHATSAPP_TOKEN,
    graphBase = GRAPH,
} = {}) {
    const opaqueId = String(mediaId || '').trim().slice(0, 500)
    if (!opaqueId || !token) throw openingError('MEDIA_NOT_CONFIGURED')
    const headers = { Authorization: `Bearer ${token}` }
    try {
        const signal = AbortSignal.timeout(TIMEOUT_MS)
        const metadataResponse = await fetchFn(`${String(graphBase).replace(/\/$/, '')}/${encodeURIComponent(opaqueId)}`, { headers, signal })
        if (!metadataResponse?.ok) throw openingError('MEDIA_DOWNLOAD_FAILED')
        const metadata = await metadataResponse.json().catch(() => null)
        const mimeType = String(metadata?.mime_type || '').toLowerCase()
        const declaredSize = Number(metadata?.file_size)
        const url = safeHttpsUrl(metadata?.url)
        if (!url) throw openingError('MEDIA_PROVIDER_INVALID')
        if (!IMAGE_TYPES.has(mimeType)) throw openingError('UNSUPPORTED_MEDIA_TYPE')
        if (!Number.isFinite(declaredSize) || declaredSize < 1 || declaredSize > MAX_IMAGE_BYTES) {
            throw openingError('MEDIA_TOO_LARGE')
        }

        const mediaResponse = await fetchFn(url, { headers, signal })
        if (!mediaResponse?.ok) throw openingError('MEDIA_DOWNLOAD_FAILED')
        const contentType = String(mediaResponse.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase()
        const contentLength = Number(mediaResponse.headers?.get?.('content-length') || declaredSize)
        if (!IMAGE_TYPES.has(contentType) || contentType !== mimeType) throw openingError('UNSUPPORTED_MEDIA_TYPE')
        if (!Number.isFinite(contentLength) || contentLength > MAX_IMAGE_BYTES) throw openingError('MEDIA_TOO_LARGE')
        const bytes = Buffer.from(await mediaResponse.arrayBuffer())
        if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw openingError('MEDIA_TOO_LARGE')
        return { bytes, mimeType }
    } catch (error) {
        if (error?.code) throw error
        throw openingError('MEDIA_DOWNLOAD_FAILED')
    }
}

export async function renderOpeningDesign({ image, templateId }) {
    if (templateId !== 'bar-mitzvah-v1') throw openingError('INVALID_OPENING_TEMPLATE', 'opening design unavailable')
    try {
        const photo = await sharp(image, { failOn: 'error', limitInputPixels: 40_000_000 })
            .rotate()
            .resize(760, 900, { fit: 'cover', position: 'attention' })
            .png()
            .toBuffer()
        const frame = Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1f2d"/><stop offset="1" stop-color="#184a48"/></linearGradient></defs>
            <rect width="1080" height="1350" rx="48" fill="url(#g)"/>
            <circle cx="950" cy="135" r="170" fill="#77e2bd" fill-opacity=".14"/>
            <circle cx="90" cy="1220" r="210" fill="#f5c665" fill-opacity=".12"/>
            <rect x="135" y="212" width="810" height="950" rx="40" fill="#f7f2e8"/>
            <text x="540" y="120" fill="#f7f2e8" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="700">WEDDING TALES</text>
            <text x="540" y="1252" fill="#ffffff" text-anchor="middle" direction="rtl" font-family="Arial, sans-serif" font-size="48" font-weight="700">ספר הברכות האישי שלך</text>
            <text x="540" y="1305" fill="#bcefdc" text-anchor="middle" direction="rtl" font-family="Arial, sans-serif" font-size="28">דוגמת עיצוב • לפני אישור ושליחה</text>
        </svg>`)
        return await sharp(frame)
            .composite([{ input: photo, left: 160, top: 237 }])
            .png({ compressionLevel: 9, adaptiveFiltering: true })
            .toBuffer()
    } catch (error) {
        if (error?.code === 'INVALID_OPENING_TEMPLATE') throw error
        throw openingError('DESIGN_RENDER_FAILED', 'opening design unavailable')
    }
}

const openingDesign = { downloadWhatsAppMedia, renderOpeningDesign }

export default openingDesign
