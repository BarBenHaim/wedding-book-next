import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { DEFAULT_SALES_SETTINGS, normalizeSalesSettings, resolveSalesSettings } from './settings'

const activeRef = () => adminDb.collection('sales_agent_settings').doc('active')
const historyRef = revision => adminDb.collection('sales_agent_settings_history').doc(`revision-${revision}`)

const toMs = value => {
    if (!value) return null
    if (typeof value === 'number') return value
    if (typeof value?.toMillis === 'function') return value.toMillis()
    if (typeof value?.seconds === 'number') return value.seconds * 1000
    return null
}

export async function readSalesSettings({ registeredMediaKeys = [] } = {}) {
    const snap = await activeRef().get?.()
    if (!snap?.exists) return resolveSalesSettings(DEFAULT_SALES_SETTINGS, { registeredMediaKeys })
    return resolveSalesSettings(snap.data(), { registeredMediaKeys })
}

export async function saveSalesSettings(input, { updatedBy, registeredMediaKeys = [] } = {}) {
    return adminDb.runTransaction(async tx => {
        const ref = activeRef()
        const snap = await tx.get(ref)
        const current = snap.exists ? snap.data() : DEFAULT_SALES_SETTINGS
        const currentRevision = Number(current.revision) || 0
        if (Number(input?.revision) !== currentRevision) throw new Error('STALE_REVISION')

        const migratedCurrent = resolveSalesSettings(current, { registeredMediaKeys })
        const normalized = normalizeSalesSettings({ ...migratedCurrent, ...input, revision: currentRevision }, { registeredMediaKeys })
        const next = {
            ...normalized,
            revision: currentRevision + 1,
            fallbackModel: DEFAULT_SALES_SETTINGS.fallbackModel,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: String(updatedBy || 'system').slice(0, 160),
        }
        if (snap.exists) {
            tx.set(historyRef(currentRevision), {
                ...current,
                replacedByRevision: next.revision,
                replacedAt: FieldValue.serverTimestamp(),
            })
        }
        tx.set(ref, next)
        return resolveSalesSettings(next, { registeredMediaKeys })
    })
}

export async function restoreSalesSettingsRevision(revision, {
    expectedRevision,
    updatedBy,
    registeredMediaKeys = [],
} = {}) {
    const restoreRevision = Number(revision)
    if (!Number.isInteger(restoreRevision) || restoreRevision < 0) throw new Error('INVALID_REVISION')
    return adminDb.runTransaction(async tx => {
        const active = activeRef()
        const historical = historyRef(restoreRevision)
        const [activeSnap, historicalSnap] = await Promise.all([tx.get(active), tx.get(historical)])
        const current = activeSnap.exists ? activeSnap.data() : DEFAULT_SALES_SETTINGS
        const currentRevision = Number(current.revision) || 0
        if (Number(expectedRevision) !== currentRevision) throw new Error('STALE_REVISION')
        if (!historicalSnap.exists) throw new Error('REVISION_NOT_FOUND')

        const restored = resolveSalesSettings(historicalSnap.data(), { registeredMediaKeys })
        const normalized = normalizeSalesSettings({
            ...restored,
            revision: currentRevision,
            changeNote: `שחזור גרסה ${restoreRevision}`,
        }, { registeredMediaKeys })
        const next = {
            ...normalized,
            revision: currentRevision + 1,
            fallbackModel: DEFAULT_SALES_SETTINGS.fallbackModel,
            restoredFromRevision: restoreRevision,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: String(updatedBy || 'system').slice(0, 160),
        }
        if (activeSnap.exists) {
            tx.set(historyRef(currentRevision), {
                ...current,
                replacedByRevision: next.revision,
                replacedAt: FieldValue.serverTimestamp(),
            })
        }
        tx.set(active, next)
        return resolveSalesSettings(next, { registeredMediaKeys })
    })
}

export async function listSalesSettingsHistory({ limit = 20 } = {}) {
    const capped = Math.max(1, Math.min(50, Number(limit) || 20))
    const snap = await adminDb.collection('sales_agent_settings_history')
        .orderBy('revision', 'desc')
        .limit(capped)
        .get()
    return snap.docs.map(doc => {
        const row = doc.data() || {}
        return {
            revision: Number(row.revision) || 0,
            updatedAt: toMs(row.updatedAt),
            updatedBy: typeof row.updatedBy === 'string' ? row.updatedBy : null,
            changeNote: typeof row.changeNote === 'string' ? row.changeNote : '',
        }
    })
}

const salesSettingsStore = {
    readSalesSettings,
    saveSalesSettings,
    restoreSalesSettingsRevision,
    listSalesSettingsHistory,
}
export default salesSettingsStore
