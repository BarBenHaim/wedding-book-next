const DEMO_URL = /https:\/\/(?:app\.)?weddingtales\.co\.il\/(?:demo\b|wedding\/[^\s/]+\/photo\b)/i

export function isDemoEvidenceContent({ part, text } = {}) {
    return part === 'image'
        || part === 'video'
        || (part === 'text' && DEMO_URL.test(String(text || '')))
}

export function followUpEvidence(lead = {}) {
    // Draft turns and `imagesSent`/`mediaSent` are persisted before Make or
    // Graph transport. They prove intent to send, not customer delivery.
    // Only acknowledgement-backed fields may unlock "what did you think?".
    const acknowledgedDemo = lead.demoEvidenceDelivered === true
    return {
        hasDemoEvidence: acknowledgedDemo,
        hasMediaEvidence: acknowledgedDemo,
    }
}

export default followUpEvidence

/** Durable customer permission, separate from a service-window or template approval. */
export function normalizeFollowUpConsent(value, nowMs = Date.now()) {
    if (!value || value.status !== 'granted' || value.scope !== 'sales_reminders'
        || value.source !== 'customer_message' || typeof value.sourceMessageId !== 'string'
        || !value.sourceMessageId.trim() || value.sourceMessageId.length > 300
        || !Number.isFinite(value.recordedAtMs) || value.recordedAtMs <= 0 || value.recordedAtMs > nowMs
        || ![1, 2].includes(value.maxReminders)
        || (value.usedReminders != null && (!Number.isInteger(value.usedReminders) || value.usedReminders < 0))
        || (value.callbackAtMs != null && (!Number.isFinite(value.callbackAtMs) || value.callbackAtMs < value.recordedAtMs))) return null
    return { ...value, usedReminders: value.usedReminders ?? 0 }
}

/**
 * Deliberately narrow evidence capture. Bare yes, ad clicks, inquiries, and an
 * assistant's promise never grant consent. An ambiguous date is left for the
 * conversation to clarify; this function never guesses a callback timestamp.
 */
export function captureExplicitFollowUpConsent({ text, sourceMessageId, nowMs = Date.now(), callbackAtMs = null } = {}) {
    const value = String(text || '').trim()
    if (!value || /(?:אל\s|לא\s|בלי\s|don't|do not|no\s)/i.test(value)) return null
    const explicit = /^(?:בבקשה\s+)?(?:תזכיר(?:ו|י)?\s+לי|שלח(?:ו|י)?\s+לי\s+(?:תזכורת|(?:שתי|2)\s+תזכורות)|אפשר\s+(?:לשלוח\s+לי\s+)?תזכורת|ת(?:חזור|חזר)(?:ו|י)?\s+אלי(?:י)?|תדבר(?:ו|י)?\s+איתי|(?:please\s+)?(?:remind\s+me|send\s+me\s+(?:one\s+|two\s+|a\s+)?reminders?|contact\s+me\s+again|follow\s+up\s+with\s+me))(?=\s|[,.!?]|$)/i.test(value)
    if (!explicit) return null
    const exactCallbackAtMs = callbackAtMs ?? parseExplicitCallbackAt(value, nowMs)
    const two = /(?:שתי\s+תזכורות|2\s+תזכורות|פעמיים|two\s+reminders|twice)/i.test(value)
    const one = /(?:פעם\s+אחת|תזכורת\s+אחת|רק\s+אחת|\bonce\b|\bone\s+reminder\b)/i.test(value)
    return normalizeFollowUpConsent({
        status: 'granted', scope: 'sales_reminders', source: 'customer_message',
        sourceMessageId, recordedAtMs: nowMs, maxReminders: two && !one ? 2 : 1,
        usedReminders: 0, callbackAtMs: exactCallbackAtMs,
        callbackPending: exactCallbackAtMs == null && /(?:מחר|מחרתיים|בשבוע|בשנה|בחודש|בהמשך|ביום|בערב|בבוקר|אחרי|תדבר|תחזור|תחזר|tomorrow|next\s|later|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d|\d{1,2}[:./]\d{1,2})/i.test(value),
    }, nowMs)
}

/** Exact customer timestamp only. No locale/DST or natural-language guessing. */
export function parseExplicitCallbackAt(text, nowMs = Date.now()) {
    const matches = [...String(text || '').matchAll(/\b(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})(?![\d:])/g)]
    if (matches.length !== 1) return null
    const [raw, year, month, day, hour, minute, second = '00', offset] = matches[0]
    const components = [year, month, day, hour, minute, second].map(Number)
    const [y, m, d, h, min, sec] = components
    if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || sec > 59) return null
    const calendar = new Date(Date.UTC(y, m - 1, d, h, min, sec))
    if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d) return null
    if (offset !== 'Z') {
        const oh = Number(offset.slice(1, 3)), om = Number(offset.slice(4))
        if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) return null
    }
    const result = Date.parse(raw.replace(' ', 'T'))
    return Number.isFinite(result) && result > nowMs ? result : null
}

/** A clarification fills time on existing unspent consent; it grants no more. */
export function resolveExplicitCallbackConsent({ lead, text, sourceMessageId, nowMs = Date.now() } = {}) {
    if (lead?.lastQuestion !== 'callback_exact_time' || /(?:אל\s|לא\s|don't|do not|no\s)/i.test(String(text || ''))) return null
    const consent = normalizeFollowUpConsent(lead.followUpConsent, nowMs)
    if (!consent || !consent.callbackPending || consent.usedReminders !== 0
        || typeof sourceMessageId !== 'string' || !sourceMessageId.trim() || sourceMessageId.length > 300) return null
    const callbackAtMs = parseExplicitCallbackAt(text, nowMs) ?? parseJerusalemCallbackAt(text, nowMs)
    if (callbackAtMs == null) return null
    return { ...consent, callbackAtMs, callbackPending: false, callbackSourceMessageId: sourceMessageId, callbackRecordedAtMs: nowMs }
}

const JERUSALEM_CALLBACK_CLOCK = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/**
 * Used only after the assistant explicitly asked for a date/time in Israel.
 * Both modern Jerusalem offsets are round-tripped through the actual IANA
 * timezone. A DST gap yields no instant and a repeated hour yields two; both
 * require clarification instead of silently picking an offset.
 */
export function parseJerusalemCallbackAt(text, nowMs = Date.now()) {
    const match = String(text || '').trim().match(/^(?:(?:ביום|בתאריך|ב[-־]?)\s*)?(\d{1,2})[./](\d{1,2})[./](\d{4})[\s,]+(?:(?:בשעה|שעה|ב[-־]?)\s*)?(\d{1,2}):(\d{2})(?:\s*(?:לפי\s+)?שעון\s+ישראל)?[.!]?$/)
    if (!match) return null
    const [, day, month, year, hour, minute] = match
    const [d, m, y, h, min] = [day, month, year, hour, minute].map(Number)
    if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null
    const local = Date.UTC(y, m - 1, d, h, min, 0)
    const candidates = [2, 3].map(offset => local - offset * 3600_000).filter(candidate => {
        const parts = Object.fromEntries(JERUSALEM_CALLBACK_CLOCK.formatToParts(new Date(candidate)).map(part => [part.type, part.value]))
        return Number(parts.year) === y && Number(parts.month) === m && Number(parts.day) === d
            && Number(parts.hour) === h && Number(parts.minute) === min && Number(parts.second) === 0
    })
    // Check uniqueness before excluding past candidates, so an ambiguous hour
    // never becomes acceptable just because its first occurrence has passed.
    return candidates.length === 1 && candidates[0] > nowMs ? candidates[0] : null
}
