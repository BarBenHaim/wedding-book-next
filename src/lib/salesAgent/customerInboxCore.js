// The pure rules of the customer inbox. No Firebase in here, so every rule
// can be tested. The design is in
// docs/superpowers/specs/2026-11-25-whatsapp-customer-inbox-design.md.

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024
export const MAX_TEXT = 4000

const EXTENSIONS = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
    'application/pdf': 'pdf', 'text/plain': 'txt',
    'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

// `weddings.ownerPhone` is whatever the buyer typed at checkout, so one
// number has to be searched for in every shape it is commonly typed in.
export function phoneVariants(intl) {
    const digits = String(intl || '').replace(/\D/g, '')
    if (digits.length < 11) return []
    const rest = digits.slice(3) // 501234567
    const local = `0${rest}` // 0501234567
    const head = local.slice(0, 3)
    const [mid, tail] = [local.slice(3, 6), local.slice(6)]
    const abroad = rest.slice(0, 2)
    return [...new Set([
        digits,
        `+${digits}`,
        local,
        `${head}-${local.slice(3)}`,
        `${head}-${mid}-${tail}`,
        `${head} ${local.slice(3)}`,
        `${head} ${mid} ${tail}`,
        `+972 ${abroad}-${rest.slice(2, 5)}-${rest.slice(5)}`,
        `+972-${abroad}-${rest.slice(2, 5)}-${rest.slice(5)}`,
        `+972 ${abroad} ${rest.slice(2, 5)} ${rest.slice(5)}`,
    ])]
}

export function isCapturable(body) {
    return Boolean(String(body?.text || '').trim() || String(body?.mediaId || '').trim())
}

export function buildInboxItem({ phone, body, matches }) {
    const weddingIds = (matches || []).map(match => match?.weddingId).filter(Boolean)
    const mediaId = String(body?.mediaId || '').trim().slice(0, 500) || null
    return {
        phone: String(phone),
        weddingIds,
        // Two books on one phone: leave it open and ask, never guess.
        weddingId: weddingIds.length === 1 ? weddingIds[0] : null,
        customerName: matches?.[0]?.ownerName || String(body?.profileName || '').trim() || null,
        messageType: String(body?.messageType || 'text'),
        text: String(body?.text || '').slice(0, MAX_TEXT),
        mediaId,
        occurredAt: body?.occurredAt || null,
        status: 'new',
        fileStatus: mediaId ? 'pending' : 'none',
    }
}

export function mediaExtension(mimeType) {
    const base = String(mimeType || '').split(';')[0].trim().toLowerCase()
    return EXTENSIONS[base] || 'bin'
}
