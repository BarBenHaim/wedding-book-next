import { randomUUID } from 'crypto'
import { adminStorage } from '@/lib/firebaseAdmin'
import {
    archiveSalesVariable,
    createUploadSession,
    finalizeUploadSession,
    listSalesVariables,
    readSalesVariableVersions,
    readUploadSession,
    saveVariableDraft,
} from './salesVariableStore'
import { normalizeVariableKey } from './salesVariables'

const HOUR_MS = 60 * 60 * 1000
const PREVIEW_MS = 15 * 60 * 1000
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/

export const VARIABLE_UPLOAD_LIMITS = Object.freeze({
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
})

const CONTENT_TYPES = Object.freeze({
    image: new Set(['image/jpeg', 'image/png']),
    video: new Set(['video/mp4', 'video/3gpp']),
    audio: new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus']),
})

const EXTENSIONS = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/amr': 'amr',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
})

const safeUploadId = value => {
    const id = String(value || '').trim()
    if (!UPLOAD_ID_PATTERN.test(id)) throw new Error('INVALID_UPLOAD_ID')
    return id
}

function normalizeUploadInput(input = {}) {
    const variableKey = normalizeVariableKey(input.variableKey)
    const kind = String(input.kind || '')
    if (!Object.prototype.hasOwnProperty.call(VARIABLE_UPLOAD_LIMITS, kind)) throw new Error('INVALID_VARIABLE_KIND')
    const contentType = String(input.contentType || '').trim().toLowerCase()
    if (!CONTENT_TYPES[kind].has(contentType)) throw new Error('INVALID_VARIABLE_CONTENT_TYPE')
    const bytes = Number(input.bytes)
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > VARIABLE_UPLOAD_LIMITS[kind]) {
        throw new Error('INVALID_VARIABLE_BYTES')
    }
    const checksum = String(input.checksum || '').trim().toLowerCase()
    if (!CHECKSUM_PATTERN.test(checksum)) throw new Error('INVALID_VARIABLE_CHECKSUM')
    return { variableKey, kind, contentType, bytes, checksum }
}

function publicVersion(version, previewUrl) {
    if (!version) return null
    const base = {
        id: version.id,
        kind: version.kind,
        status: version.status,
        createdAtMs: version.createdAtMs,
    }
    if (version.kind === 'text') return { ...base, value: version.value }
    return {
        ...base,
        contentType: version.contentType,
        bytes: version.bytes,
        checksum: version.checksum,
        caption: version.caption,
        when: version.when,
        voiceNote: version.voiceNote === true,
        previewUrl,
    }
}

export function createSalesVariableHandlers(deps) {
    return {
        async list() {
            const rows = await deps.listSalesVariables()
            const variables = await Promise.all(rows.map(async row => {
                const versions = await deps.readSalesVariableVersions(row.key)
                const byId = new Map(versions.map(version => [version.id, version]))
                const draft = row.draftVersionId ? byId.get(row.draftVersionId) || null : null
                const published = row.publishedVersionId ? byId.get(row.publishedVersionId) || null : null
                const [draftPreview, publishedPreview] = await Promise.all([
                    draft && draft.kind !== 'text' ? deps.signPreview(draft) : null,
                    published && published.kind !== 'text' ? deps.signPreview(published) : null,
                ])
                return {
                    ...row,
                    draftVersion: publicVersion(draft, draftPreview),
                    publishedVersion: publicVersion(published, publishedPreview),
                }
            }))
            return { variables }
        },

        async mutate(input = {}, { updatedBy } = {}) {
            if (input.action === 'save_text') {
                const variable = await deps.saveVariableDraft({
                    key: input.variableKey,
                    label: input.label,
                    kind: 'text',
                    expectedDraftVersionId: input.expectedDraftVersionId,
                    version: {
                        id: deps.idFactory('version'),
                        kind: 'text',
                        value: input.value,
                        status: 'draft',
                        createdAtMs: deps.now(),
                    },
                }, { updatedBy })
                return { variable }
            }
            if (input.action === 'archive') {
                const variable = await deps.archiveSalesVariable(input.variableKey, {
                    expectedDraftVersionId: input.expectedDraftVersionId,
                    updatedBy,
                })
                return { variable }
            }
            throw new Error('UNSUPPORTED_VARIABLE_ACTION')
        },
    }
}

export function createSalesVariableUploadHandlers(deps) {
    return {
        async prepare(input = {}, { updatedBy } = {}) {
            const metadata = normalizeUploadInput(input)
            const uploadId = safeUploadId(deps.idFactory('upload'))
            const expiresAt = deps.now() + HOUR_MS
            const objectPath = `sales-variable-media/${metadata.variableKey}/${uploadId}.${EXTENSIONS[metadata.contentType]}`
            const extensionHeaders = { 'x-goog-meta-sha256': metadata.checksum }
            const [uploadUrl] = await deps.fileForPath(objectPath).getSignedUrl({
                version: 'v4',
                action: 'write',
                expires: expiresAt,
                contentType: metadata.contentType,
                extensionHeaders,
            })
            if (typeof uploadUrl !== 'string' || !uploadUrl.startsWith('https://')) throw new Error('UPLOAD_SIGNING_FAILED')
            await deps.createUploadSession({
                id: uploadId,
                ...metadata,
                objectPath,
                expiresAt,
            }, { createdBy: updatedBy })
            return {
                uploadId,
                method: 'PUT',
                uploadUrl,
                headers: { 'content-type': metadata.contentType, ...extensionHeaders },
                expiresAt,
            }
        },

        async finalize(input = {}, { updatedBy } = {}) {
            const uploadId = safeUploadId(input.uploadId)
            const session = await deps.readUploadSession(uploadId)
            const nowMs = deps.now()
            if (session.consumedAt != null) throw new Error('UPLOAD_ALREADY_CONSUMED')
            if (session.expiresAt < nowMs) throw new Error('UPLOAD_EXPIRED')
            let stored
            try {
                ;[stored] = await deps.fileForPath(session.objectPath).getMetadata()
            } catch {
                throw new Error('UPLOAD_OBJECT_MISSING')
            }
            const storedChecksum = String(stored?.metadata?.sha256 || '').trim().toLowerCase()
            if (Number(stored?.size) !== session.bytes
                || String(stored?.contentType || '').toLowerCase() !== session.contentType
                || storedChecksum !== session.checksum) {
                throw new Error('UPLOAD_METADATA_MISMATCH')
            }
            const variable = await deps.finalizeUploadSession({
                uploadId,
                nowMs,
                label: input.label,
                expectedDraftVersionId: input.expectedDraftVersionId,
                version: {
                    id: deps.idFactory('version'),
                    kind: session.kind,
                    objectPath: session.objectPath,
                    contentType: session.contentType,
                    bytes: session.bytes,
                    checksum: session.checksum,
                    caption: String(input.caption || '').trim(),
                    when: String(input.when || '').trim(),
                    voiceNote: session.kind === 'audio' && input.voiceNote === true,
                    status: 'draft',
                    createdAtMs: nowMs,
                },
            }, { updatedBy })
            return { variable }
        },
    }
}

const productionDependencies = {
    listSalesVariables,
    readSalesVariableVersions,
    saveVariableDraft,
    archiveSalesVariable,
    createUploadSession,
    readUploadSession,
    finalizeUploadSession,
    fileForPath: path => adminStorage.bucket().file(path),
    signPreview: async version => {
        const [url] = await adminStorage.bucket().file(version.objectPath).getSignedUrl({
            version: 'v4', action: 'read', expires: Date.now() + PREVIEW_MS,
        })
        return url
    },
    idFactory: prefix => `${prefix}-${randomUUID()}`,
    now: () => Date.now(),
}

export const salesVariableHandlers = createSalesVariableHandlers(productionDependencies)
export const salesVariableUploadHandlers = createSalesVariableUploadHandlers(productionDependencies)

export default salesVariableHandlers
