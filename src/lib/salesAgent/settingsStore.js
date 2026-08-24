import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { DEFAULT_SALES_SETTINGS, normalizeSalesSettings, resolveSalesSettings } from './settings'
import { bindOpeningVariables } from './salesVariables'

const activeRef = () => adminDb.collection('sales_agent_settings').doc('active')
const historyRef = revision => adminDb.collection('sales_agent_settings_history').doc(`revision-${revision}`)
const variableRef = key => adminDb.collection('sales_variables').doc(key)
const variableVersionRef = (key, versionId) => variableRef(key).collection('versions').doc(versionId)

function variableBindings(experiment) {
    const rows = []
    for (const variant of Array.isArray(experiment?.variants) ? experiment.variants : []) {
        for (const block of Array.isArray(variant?.blocks) ? variant.blocks : []) {
            if (!block?.variableKey) continue
            rows.push({
                key: String(block.variableKey).trim().toLowerCase(),
                versionId: block.variableVersionId == null ? null : String(block.variableVersionId).trim(),
            })
        }
    }
    return [...new Map(rows.map(row => [`${row.key}:${row.versionId || ''}`, row])).values()]
}

const variableKeys = experiment => [...new Set(variableBindings(experiment).map(row => row.key))]

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
    const stored = snap.data()
    return resolveSalesSettings(stored, {
        registeredMediaKeys,
        registeredVariables: variableKeys(stored?.openingExperiment),
    })
}

export async function publishSalesSettingsSnapshot(input, {
    updatedBy,
    registeredMediaKeys = [],
} = {}) {
    return adminDb.runTransaction(async tx => {
        const active = activeRef()
        const activeSnap = await tx.get(active)
        const current = activeSnap.exists ? activeSnap.data() : DEFAULT_SALES_SETTINGS
        const currentRevision = Number(current.revision) || 0
        if (Number(input?.revision) !== currentRevision) throw new Error('STALE_REVISION')

        const bindings = variableBindings(input?.openingExperiment)
        const keys = [...new Set(bindings.map(row => row.key))]
        const expected = input?.expectedVariableDrafts && typeof input.expectedVariableDrafts === 'object'
            && !Array.isArray(input.expectedVariableDrafts)
            ? input.expectedVariableDrafts
            : {}
        const records = await Promise.all(keys.map(async key => {
            const ref = variableRef(key)
            const variableSnap = await tx.get(ref)
            if (!variableSnap.exists) throw new Error('OPENING_VARIABLE_NOT_FOUND')
            const variable = variableSnap.data()
            if (variable.archived === true) throw new Error('OPENING_VARIABLE_ARCHIVED')
            const draftVersionId = variable.draftVersionId == null ? null : String(variable.draftVersionId)
            if (!draftVersionId) throw new Error('OPENING_VARIABLE_UNPUBLISHED')
            if (String(expected[key] ?? '') !== draftVersionId) throw new Error('STALE_VARIABLE_DRAFT')
            const versionRef = variableVersionRef(key, draftVersionId)
            const versionSnap = await tx.get(versionRef)
            if (!versionSnap.exists) throw new Error('OPENING_VARIABLE_VERSION_MISSING')
            const version = versionSnap.data()
            if (version.status !== 'draft' && version.status !== 'published') throw new Error('OPENING_VARIABLE_UNPUBLISHED')
            return { key, ref, versionRef, variable, version: { ...version, status: 'published' } }
        }))

        const registry = Object.fromEntries(records.map(record => [record.key, {
            key: record.key,
            label: record.variable.label,
            kind: record.variable.kind,
            archived: false,
            publishedVersion: record.version,
        }]))
        const boundExperiment = bindOpeningVariables(input.openingExperiment, registry, {
            registeredMedia: registeredMediaKeys,
        })
        const migratedCurrent = resolveSalesSettings(current, {
            registeredMediaKeys,
            registeredVariables: variableKeys(current?.openingExperiment),
        })
        const normalized = normalizeSalesSettings({
            ...migratedCurrent,
            revision: currentRevision,
            openingExperiment: boundExperiment,
            changeNote: typeof input.changeNote === 'string' ? input.changeNote : '',
        }, { registeredMediaKeys, registeredVariables: keys })
        const timestamp = FieldValue.serverTimestamp()
        const next = {
            ...normalized,
            revision: currentRevision + 1,
            fallbackModel: DEFAULT_SALES_SETTINGS.fallbackModel,
            updatedAt: timestamp,
            updatedBy: String(updatedBy || 'system').slice(0, 160),
        }
        if (activeSnap.exists) {
            tx.set(historyRef(currentRevision), {
                ...current,
                replacedByRevision: next.revision,
                replacedAt: timestamp,
            })
        }
        for (const record of records) {
            tx.set(record.versionRef, { ...record.version, publishedAt: timestamp })
            tx.set(record.ref, {
                ...record.variable,
                publishedVersionId: record.version.id,
                updatedAt: timestamp,
                updatedBy: String(updatedBy || 'system').slice(0, 160),
            })
        }
        tx.set(active, next)
        return resolveSalesSettings(next, {
            registeredMediaKeys,
            registeredVariables: keys,
        })
    })
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

        const historicalData = historicalSnap.data()
        const bindings = variableBindings(historicalData?.openingExperiment)
        for (const binding of bindings) {
            if (!binding.versionId) throw new Error('OPENING_VARIABLE_VERSION_MISSING')
            const versionSnap = await tx.get(variableVersionRef(binding.key, binding.versionId))
            if (!versionSnap.exists) throw new Error('OPENING_VARIABLE_VERSION_MISSING')
        }
        const registeredVariables = [...new Set(bindings.map(binding => binding.key))]
        const restored = resolveSalesSettings(historicalData, { registeredMediaKeys, registeredVariables })
        const normalized = normalizeSalesSettings({
            ...restored,
            revision: currentRevision,
            changeNote: `שחזור גרסה ${restoreRevision}`,
        }, { registeredMediaKeys, registeredVariables })
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
        return resolveSalesSettings(next, { registeredMediaKeys, registeredVariables })
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
    publishSalesSettingsSnapshot,
    saveSalesSettings,
    restoreSalesSettingsRevision,
    listSalesSettingsHistory,
}
export default salesSettingsStore
