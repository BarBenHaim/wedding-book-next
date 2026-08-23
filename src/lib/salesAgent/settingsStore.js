import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { DEFAULT_SALES_SETTINGS, normalizeSalesSettings, resolveSalesSettings } from './settings'

const activeRef = () => adminDb.collection('sales_agent_settings').doc('active')
const historyRef = revision => adminDb.collection('sales_agent_settings_history').doc(`revision-${revision}`)

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

const salesSettingsStore = { readSalesSettings, saveSalesSettings }
export default salesSettingsStore
