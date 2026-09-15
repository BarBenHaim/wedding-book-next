import crypto from 'crypto'

const HEALTH = new Set(['green', 'amber', 'red', 'unknown'])
const RECOMMENDATIONS = new Set(['insufficient_evidence', 'pause', 'keep', 'promote'])

function dayInIsrael(nowMs) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(nowMs))
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return `${value.year}-${value.month}-${value.day}`
}

function normalizeCurrent(input = {}) {
    const health = input?.health || {}
    const recommendation = input?.recommendation || {}
    const pausedArms = Array.isArray(input?.pausedArms)
        ? [...new Set(input.pausedArms.map(value => String(value)).filter(value => /^[a-z][a-z0-9_-]{0,63}$/.test(value)))].sort()
        : []
    return {
        verifiedPaidToday: Math.max(0, Number(input?.verifiedPaidToday) || 0),
        targetVerifiedSalesPerDay: Math.max(1, Number(input?.targetVerifiedSalesPerDay) || 2),
        health: {
            inbound: HEALTH.has(health.inbound) ? health.inbound : 'unknown',
            whatsapp: HEALTH.has(health.whatsapp) ? health.whatsapp : 'unknown',
            followups: HEALTH.has(health.followups) ? health.followups : 'unknown',
        },
        recommendation: {
            action: RECOMMENDATIONS.has(recommendation.action) ? recommendation.action : 'insufficient_evidence',
            ...(typeof recommendation.armId === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(recommendation.armId) ? { armId: recommendation.armId } : {}),
            ...(typeof recommendation.winnerArmId === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(recommendation.winnerArmId) ? { winnerArmId: recommendation.winnerArmId } : {}),
        },
        pausedArms,
    }
}

function critical(snapshot) {
    return snapshot?.health?.inbound === 'red' || snapshot?.health?.whatsapp === 'red'
}

export function decideOwnerStatus(previous, input, nowMs = Date.now()) {
    const current = normalizeCurrent(input)
    const before = previous?.snapshot ? normalizeCurrent(previous.snapshot) : null
    const kind = (() => {
        if (critical(current) && !critical(before)) return 'transport_outage'
        if (before && critical(before) && !critical(current)) return 'critical_recovered'
        if ((before?.verifiedPaidToday || 0) < current.targetVerifiedSalesPerDay
            && current.verifiedPaidToday >= current.targetVerifiedSalesPerDay) return 'target_reached'
        const newlyPaused = current.pausedArms.find(id => !before?.pausedArms?.includes(id))
        if (newlyPaused) return 'arm_paused'
        if (current.recommendation.action === 'promote'
            && (before?.recommendation?.action !== 'promote'
                || before?.recommendation?.winnerArmId !== current.recommendation.winnerArmId)) return 'winner_recommended'
        if (previous?.lastDailyDay !== dayInIsrael(nowMs)) return 'daily_digest'
        return null
    })()
    if (!kind) return null
    return { kind, current, day: dayInIsrael(nowMs) }
}

function healthLabel(value) {
    return ({ green: 'תקין', amber: 'דורש תשומת לב', red: 'תקלה', unknown: 'לא ידוע' })[value] || 'לא ידוע'
}

export function buildOwnerStatusPayload(decision = {}) {
    const current = normalizeCurrent(decision.current)
    const title = ({
        daily_digest: 'דוח מכירות יומי', transport_outage: 'תקלה בצינור WhatsApp',
        critical_recovered: 'צינור WhatsApp חזר לפעול', target_reached: 'יעד המכירות היומי הושג',
        arm_paused: 'מודל מכירה נעצר בבטיחות', winner_recommended: 'נמצא מודל מוביל חדש',
    })[decision.kind] || 'עדכון מכירות'
    const recommendation = current.recommendation.action === 'promote'
        ? 'יש המלצה לקדם מודל מנצח לפי תשלומים מאומתים'
        : current.recommendation.action === 'pause'
            ? 'יש המלצה לעצור מודל שחרג מסף בטיחות'
            : 'ממשיכים לאסוף ראיות לפני שינוי הקצאה'
    return [
        title,
        `${current.verifiedPaidToday} מתוך ${current.targetVerifiedSalesPerDay} מכירות מאומתות היום`,
        `קליטה: ${healthLabel(current.health.inbound)} | מסירה: ${healthLabel(current.health.whatsapp)} | פולואפים: ${healthLabel(current.health.followups)}`,
        recommendation,
    ].map(line => line.replace(/[\n\r\t]+/g, ' ').slice(0, 1024))
}

function eventKey(decision) {
    const fingerprint = JSON.stringify({ kind: decision.kind, day: decision.day, current: decision.current })
    return crypto.createHash('sha256').update(fingerprint).digest('hex')
}

export async function claimOwnerStatusNotification(db, input, nowMs = Date.now()) {
    const runtimeRef = db.collection('sales_owner_status').doc('runtime')
    return db.runTransaction(async transaction => {
        const runtimeSnap = await transaction.get(runtimeRef)
        const previous = runtimeSnap.exists ? runtimeSnap.data() || {} : null
        const decision = decideOwnerStatus(previous, input, nowMs)
        const current = normalizeCurrent(input)
        const nextRuntime = {
            snapshot: current,
            lastDailyDay: decision?.kind === 'daily_digest' ? dayInIsrael(nowMs) : previous?.lastDailyDay || null,
            updatedAtMs: nowMs,
        }
        if (!decision) {
            transaction.set(runtimeRef, nextRuntime)
            return { action: 'none' }
        }
        const key = eventKey(decision)
        const eventRef = db.collection('sales_owner_status_events').doc(key)
        const eventSnap = await transaction.get(eventRef)
        if (eventSnap.exists) {
            transaction.set(runtimeRef, nextRuntime)
            return { action: 'none' }
        }
        transaction.set(eventRef, { kind: decision.kind, day: decision.day, status: 'requested', requestedAtMs: nowMs })
        transaction.set(runtimeRef, nextRuntime)
        return { action: 'claimed', eventKey: key, decision }
    })
}

export async function finishOwnerStatusNotification(db, key, input = {}) {
    if (!/^[a-f0-9]{64}$/.test(String(key || ''))) throw new Error('INVALID_OWNER_STATUS_EVENT')
    const status = input.status === 'accepted' ? 'accepted' : input.status === 'not_sent' ? 'not_sent' : null
    if (!status) throw new Error('INVALID_OWNER_STATUS_OUTCOME')
    const eventRef = db.collection('sales_owner_status_events').doc(key)
    return db.runTransaction(async transaction => {
        const snap = await transaction.get(eventRef)
        if (!snap.exists || snap.data()?.status !== 'requested') return { action: 'noop' }
        transaction.set(eventRef, {
            ...snap.data(), status, completedAtMs: Number(input.nowMs) || Date.now(),
            ...(status === 'not_sent' ? { reason: String(input.reason || 'PROVIDER_FAILED').slice(0, 40) } : {}),
        })
        return { action: 'recorded' }
    })
}

const ownerStatus = { decideOwnerStatus, buildOwnerStatusPayload, claimOwnerStatusNotification, finishOwnerStatusNotification }
export default ownerStatus
