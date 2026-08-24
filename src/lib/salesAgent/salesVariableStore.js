import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import {
    VARIABLE_KINDS,
    normalizeSalesVariableVersion,
    normalizeVariableKey,
} from './salesVariables'

const VARIABLE_KIND_SET = new Set(VARIABLE_KINDS)
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/

const variableRef = key => adminDb.collection('sales_variables').doc(key)
const versionRef = (key, versionId) => variableRef(key).collection('versions').doc(versionId)
const uploadRef = uploadId => adminDb.collection('sales_variable_uploads').doc(uploadId)

const toMs = value => {
    if (value == null) return null
    if (typeof value === 'number') return value
    if (typeof value?.toMillis === 'function') return value.toMillis()
    if (typeof value?.seconds === 'number') return value.seconds * 1000
    return null
}

const safeActor = value => String(value || 'system').trim().slice(0, 160) || 'system'

function safeUploadId(value) {
    const id = String(value ?? '').trim()
    if (!UPLOAD_ID_PATTERN.test(id)) throw new Error('INVALID_UPLOAD_ID')
    return id
}

function safeKind(value) {
    const kind = String(value ?? '')
    if (!VARIABLE_KIND_SET.has(kind)) throw new Error('INVALID_VARIABLE_KIND')
    return kind
}

function publicVariable(row = {}) {
    return {
        key: normalizeVariableKey(row.key),
        label: String(row.label || '').slice(0, 120),
        kind: safeKind(row.kind),
        draftVersionId: row.draftVersionId == null ? null : String(row.draftVersionId).slice(0, 120),
        publishedVersionId: row.publishedVersionId == null ? null : String(row.publishedVersionId).slice(0, 120),
        archived: row.archived === true,
        createdAtMs: toMs(row.createdAt),
        updatedAtMs: toMs(row.updatedAt),
        updatedBy: typeof row.updatedBy === 'string' ? row.updatedBy.slice(0, 160) : null,
    }
}

function publicVersion(row = {}) {
    const normalized = normalizeSalesVariableVersion(row)
    return { ...normalized, storedAtMs: toMs(row.storedAt) }
}

export async function listSalesVariables({ limit = 200 } = {}) {
    const capped = Math.max(1, Math.min(500, Number(limit) || 200))
    const snap = await adminDb.collection('sales_variables').orderBy('key', 'asc').limit(capped).get()
    return snap.docs.map(doc => publicVariable(doc.data())).sort((a, b) => a.key.localeCompare(b.key))
}

export async function readSalesVariableVersions(key, { limit = 100 } = {}) {
    const variableKey = normalizeVariableKey(key)
    const capped = Math.max(1, Math.min(250, Number(limit) || 100))
    const snap = await variableRef(variableKey).collection('versions').orderBy('createdAtMs', 'desc').limit(capped).get()
    return snap.docs.map(doc => publicVersion(doc.data())).sort((a, b) => b.createdAtMs - a.createdAtMs)
}

function expectedDraftId(value) {
    return value == null ? null : String(value).trim()
}

async function stageDraft(tx, {
    key,
    label,
    kind,
    expectedDraftVersionId,
    version,
    updatedBy,
    currentSnap: suppliedCurrent,
    targetSnap: suppliedTarget,
}) {
    const ref = variableRef(key)
    const target = versionRef(key, version.id)
    const currentSnap = suppliedCurrent || await tx.get(ref)
    const targetSnap = suppliedTarget || await tx.get(target)
    const current = currentSnap.exists ? currentSnap.data() : null
    const currentDraft = current?.draftVersionId == null ? null : String(current.draftVersionId)
    if (expectedDraftId(expectedDraftVersionId) !== currentDraft) throw new Error('STALE_VARIABLE_DRAFT')
    if (current?.publishedVersionId && current?.kind !== kind) throw new Error('PUBLISHED_VARIABLE_KIND_IMMUTABLE')
    if (targetSnap.exists) {
        const targetStatus = targetSnap.data()?.status
        if (targetStatus === 'published') throw new Error('PUBLISHED_VARIABLE_VERSION_IMMUTABLE')
        throw new Error('VARIABLE_VERSION_EXISTS')
    }

    const timestamp = FieldValue.serverTimestamp()
    const variable = {
        key,
        label,
        kind,
        draftVersionId: version.id,
        publishedVersionId: current?.publishedVersionId == null ? null : String(current.publishedVersionId),
        archived: false,
        createdAt: current?.createdAt || timestamp,
        updatedAt: timestamp,
        updatedBy: safeActor(updatedBy),
    }
    tx.set(target, { ...version, status: 'draft', storedAt: timestamp })
    tx.set(ref, variable)
    return publicVariable(variable)
}

export async function saveVariableDraft(input = {}, { updatedBy } = {}) {
    const key = normalizeVariableKey(input.key)
    const kind = safeKind(input.kind)
    const label = String(input.label ?? '').trim()
    if (!label || label.length > 120) throw new Error('INVALID_VARIABLE_LABEL')
    const version = normalizeSalesVariableVersion(input.version)
    if (version.status !== 'draft') throw new Error('INVALID_VARIABLE_DRAFT')
    if (version.kind !== kind) throw new Error('INVALID_VARIABLE_VERSION_KIND')
    return adminDb.runTransaction(tx => stageDraft(tx, {
        key,
        label,
        kind,
        expectedDraftVersionId: input.expectedDraftVersionId,
        version,
        updatedBy,
    }))
}

export async function archiveSalesVariable(key, { expectedDraftVersionId, updatedBy } = {}) {
    const variableKey = normalizeVariableKey(key)
    return adminDb.runTransaction(async tx => {
        const ref = variableRef(variableKey)
        const snap = await tx.get(ref)
        if (!snap.exists) throw new Error('VARIABLE_NOT_FOUND')
        const current = snap.data()
        const currentDraft = current?.draftVersionId == null ? null : String(current.draftVersionId)
        if (expectedDraftId(expectedDraftVersionId) !== currentDraft) throw new Error('STALE_VARIABLE_DRAFT')
        const next = {
            ...current,
            archived: true,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: safeActor(updatedBy),
        }
        tx.set(ref, next)
        return publicVariable(next)
    })
}

function normalizeUploadSession(input, actor) {
    const id = safeUploadId(input.id)
    const variableKey = normalizeVariableKey(input.variableKey)
    const kind = safeKind(input.kind)
    const objectPath = String(input.objectPath ?? '').trim()
    if (!objectPath.startsWith(`sales-variable-media/${variableKey}/`) || objectPath.includes('..') || objectPath.length > 500) {
        throw new Error('INVALID_VARIABLE_OBJECT_PATH')
    }
    const contentType = String(input.contentType ?? '').trim().toLowerCase()
    const bytes = Number(input.bytes)
    const checksum = String(input.checksum ?? '').trim().toLowerCase()
    const expiresAt = Number(input.expiresAt)
    if (!contentType || !Number.isSafeInteger(bytes) || bytes < 1 || !/^[a-f0-9]{64}$/.test(checksum)) {
        throw new Error('INVALID_UPLOAD_METADATA')
    }
    if (!Number.isSafeInteger(expiresAt) || expiresAt < 1) throw new Error('INVALID_UPLOAD_EXPIRY')
    return {
        id,
        variableKey,
        kind,
        objectPath,
        contentType,
        bytes,
        checksum,
        expiresAt,
        consumedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: safeActor(actor),
    }
}

export async function createUploadSession(input = {}, { createdBy } = {}) {
    const session = normalizeUploadSession(input, createdBy)
    return adminDb.runTransaction(async tx => {
        const ref = uploadRef(session.id)
        const snap = await tx.get(ref)
        if (snap.exists) throw new Error('UPLOAD_SESSION_EXISTS')
        tx.set(ref, session)
        return { ...session, createdAt: null }
    })
}

export async function readUploadSession(uploadId) {
    const id = safeUploadId(uploadId)
    const snap = await uploadRef(id).get()
    if (!snap.exists) throw new Error('UPLOAD_NOT_FOUND')
    const row = snap.data() || {}
    return {
        id,
        variableKey: normalizeVariableKey(row.variableKey),
        kind: safeKind(row.kind),
        objectPath: String(row.objectPath || ''),
        contentType: String(row.contentType || ''),
        bytes: Number(row.bytes),
        checksum: String(row.checksum || ''),
        expiresAt: Number(row.expiresAt),
        consumedAt: row.consumedAt == null ? null : toMs(row.consumedAt),
    }
}

function uploadMatchesVersion(upload, version) {
    return upload.kind === version.kind
        && upload.objectPath === version.objectPath
        && upload.contentType === version.contentType
        && Number(upload.bytes) === Number(version.bytes)
        && upload.checksum === version.checksum
}

export async function finalizeUploadSession(input = {}, { updatedBy } = {}) {
    const uploadId = safeUploadId(input.uploadId)
    const nowMs = Number(input.nowMs)
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('INVALID_UPLOAD_TIME')
    const label = String(input.label ?? '').trim()
    if (!label || label.length > 120) throw new Error('INVALID_VARIABLE_LABEL')
    const version = normalizeSalesVariableVersion(input.version)
    if (version.status !== 'draft') throw new Error('INVALID_VARIABLE_DRAFT')

    return adminDb.runTransaction(async tx => {
        const sessionRef = uploadRef(uploadId)
        const sessionSnap = await tx.get(sessionRef)
        if (!sessionSnap.exists) throw new Error('UPLOAD_NOT_FOUND')
        const upload = sessionSnap.data()
        if (upload.consumedAt != null) throw new Error('UPLOAD_ALREADY_CONSUMED')
        if (Number(upload.expiresAt) < nowMs) throw new Error('UPLOAD_EXPIRED')
        if (!uploadMatchesVersion(upload, version)) throw new Error('UPLOAD_METADATA_MISMATCH')

        const ref = variableRef(upload.variableKey)
        const target = versionRef(upload.variableKey, version.id)
        const [currentSnap, targetSnap] = await Promise.all([tx.get(ref), tx.get(target)])
        const result = await stageDraft(tx, {
            key: upload.variableKey,
            label,
            kind: upload.kind,
            expectedDraftVersionId: input.expectedDraftVersionId,
            version,
            updatedBy,
            currentSnap,
            targetSnap,
        })
        tx.set(sessionRef, { ...upload, consumedAt: FieldValue.serverTimestamp() })
        return result
    })
}

const salesVariableStore = {
    listSalesVariables,
    readSalesVariableVersions,
    saveVariableDraft,
    archiveSalesVariable,
    createUploadSession,
    readUploadSession,
    finalizeUploadSession,
}

export default salesVariableStore
