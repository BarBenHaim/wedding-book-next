import { adminDb, adminStorage } from '@/lib/firebaseAdmin'
import { normalizeSalesVariableVersion, normalizeVariableKey } from './salesVariables'

const VERSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const PREVIEW_MS = 15 * 60 * 1000

function bindingsOf(experiment) {
    const rows = []
    for (const variant of Array.isArray(experiment?.variants) ? experiment.variants : []) {
        for (const block of Array.isArray(variant?.blocks) ? variant.blocks : []) {
            if (!block?.variableKey) continue
            const key = normalizeVariableKey(block.variableKey)
            const versionId = String(block.variableVersionId || '').trim()
            if (!VERSION_ID_PATTERN.test(versionId)) throw new Error('OPENING_VARIABLE_VERSION_MISSING')
            rows.push({ key, versionId })
        }
    }
    return [...new Map(rows.map(row => [`${row.key}:${row.versionId}`, row])).values()]
}

function birthdayBindingsOf(experiment) {
    const variables = experiment?.variables && typeof experiment.variables === 'object' ? experiment.variables : {}
    const versions = experiment?.variableVersions && typeof experiment.variableVersions === 'object' ? experiment.variableVersions : {}
    const slots = ['opening', 'explainer', 'prices', 'timing']
    return slots.map(slot => {
        const key = normalizeVariableKey(variables[slot])
        const versionId = String(versions[slot] || '').trim()
        if (!VERSION_ID_PATTERN.test(versionId)) throw new Error('BIRTHDAY_VARIABLE_VERSION_MISSING')
        return { key, versionId }
    })
}

export function createOpeningVariableRuntimeStore(deps) {
    const loadVariableVersions = async bindings => {
        const entries = await Promise.all(bindings.map(async binding => {
            const row = await deps.readDoc(`sales_variables/${binding.key}/versions/${binding.versionId}`)
            if (!row) throw new Error('OPENING_VARIABLE_VERSION_MISSING')
            const version = normalizeSalesVariableVersion(row)
            if (version.id !== binding.versionId) throw new Error('OPENING_VARIABLE_VERSION_MISMATCH')
            if (version.status !== 'published') throw new Error('OPENING_VARIABLE_UNPUBLISHED')
            return [`${binding.key}:${binding.versionId}`, version]
        }))
        return Object.fromEntries(entries)
    }
    return {
        async loadOpeningVariableVersions(experiment) {
            return loadVariableVersions(bindingsOf(experiment))
        },

        async loadBirthdayVariableVersions(experiment) {
            return loadVariableVersions(birthdayBindingsOf(experiment))
        },

        async signOpeningVariableDownload(version) {
            const objectPath = String(version?.objectPath || '')
            if (!objectPath.startsWith('sales-variable-media/') || objectPath.includes('..') || objectPath.length > 500) {
                throw new Error('INVALID_VARIABLE_OBJECT_PATH')
            }
            const [url] = await deps.fileForPath(objectPath).getSignedUrl({
                version: 'v4', action: 'read', expires: deps.now() + PREVIEW_MS,
            })
            if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('OPENING_VARIABLE_SIGNING_FAILED')
            return url
        },
    }
}

const productionStore = createOpeningVariableRuntimeStore({
    readDoc: async path => {
        const snap = await adminDb.doc(path).get()
        return snap.exists ? snap.data() : null
    },
    fileForPath: path => adminStorage.bucket().file(path),
    now: () => Date.now(),
})

export const loadOpeningVariableVersions = productionStore.loadOpeningVariableVersions
export const loadBirthdayVariableVersions = productionStore.loadBirthdayVariableVersions
export const signOpeningVariableDownload = productionStore.signOpeningVariableDownload

export default productionStore
