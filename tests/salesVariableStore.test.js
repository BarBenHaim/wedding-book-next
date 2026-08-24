import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let failCommit = false
    const ref = key => ({
        key,
        id: key.split('/').at(-1),
        collection: name => collection(`${key}/${name}`),
        get: async () => snapshot(key),
    })
    const snapshot = key => ({ id: key.split('/').at(-1), exists: docs.has(key), data: () => structuredClone(docs.get(key)) })
    const query = prefix => ({
        orderBy: () => query(prefix),
        limit: () => query(prefix),
        get: async () => ({
            docs: [...docs.entries()]
                .filter(([key]) => key.startsWith(`${prefix}/`) && key.slice(prefix.length + 1).split('/').length === 1)
                .map(([key]) => snapshot(key)),
        }),
    })
    const collection = name => ({ ...query(name), doc: id => ref(`${name}/${id}`) })
    const db = {
        collection,
        runTransaction: async work => {
            const writes = []
            const tx = {
                get: async target => snapshot(target.key),
                set: (target, value, options) => writes.push({ key: target.key, value: structuredClone(value), merge: options?.merge === true }),
            }
            const result = await work(tx)
            if (failCommit) throw new Error('TEST_COMMIT_FAILED')
            for (const write of writes) {
                const current = write.merge ? docs.get(write.key) || {} : {}
                docs.set(write.key, { ...current, ...write.value })
            }
            return result
        },
    }
    return {
        db,
        reset() { docs.clear(); failCommit = false },
        seed(key, value) { docs.set(key, structuredClone(value)) },
        get(key) { return docs.has(key) ? structuredClone(docs.get(key)) : undefined },
        failNextCommit() { failCommit = true },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }))

import {
    archiveSalesVariable,
    createUploadSession,
    finalizeUploadSession,
    listSalesVariables,
    readSalesVariableVersions,
    saveVariableDraft,
} from '@/lib/salesAgent/salesVariableStore'

const textVersion = (id, value = 'שלום {{first_name}}') => ({
    id, kind: 'text', value, status: 'draft', createdAtMs: 1_777_000_000_000,
})

const audioVersion = (id, status = 'draft') => ({
    id, kind: 'audio', objectPath: `sales-variable-media/voice_intro/${id}.ogg`,
    contentType: 'audio/ogg', bytes: 1024, checksum: 'a'.repeat(64), caption: '', when: 'opening',
    voiceNote: true, status, createdAtMs: 1_777_000_000_000,
})

beforeEach(() => store.reset())

describe('sales variable Firestore store', () => {
    it('creates a first draft and lists only safe variable/version metadata', async () => {
        await saveVariableDraft({
            key: 'opening_copy', label: 'טקסט פתיחה', kind: 'text', expectedDraftVersionId: null,
            version: textVersion('v1'),
        }, { updatedBy: 'owner@example.test' })

        expect(store.get('sales_variables/opening_copy')).toMatchObject({
            key: 'opening_copy', label: 'טקסט פתיחה', kind: 'text', draftVersionId: 'v1',
            publishedVersionId: null, archived: false, updatedBy: 'owner@example.test', updatedAt: 'SERVER_TIME',
        })
        expect(store.get('sales_variables/opening_copy/versions/v1')).toMatchObject({
            id: 'v1', kind: 'text', value: 'שלום {{first_name}}', status: 'draft',
        })
        expect(await listSalesVariables()).toEqual([expect.objectContaining({ key: 'opening_copy', draftVersionId: 'v1' })])
        expect(await readSalesVariableVersions('opening_copy')).toEqual([expect.objectContaining({ id: 'v1', status: 'draft' })])
    })

    it('replacing a published audio variable creates a draft without changing published truth', async () => {
        store.seed('sales_variables/voice_intro', {
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', archived: false,
            publishedVersionId: 'v1', draftVersionId: 'v1',
        })
        store.seed('sales_variables/voice_intro/versions/v1', audioVersion('v1', 'published'))

        await saveVariableDraft({
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', expectedDraftVersionId: 'v1',
            version: audioVersion('v2'),
        }, { updatedBy: 'owner@example.test' })

        expect(store.get('sales_variables/voice_intro')).toMatchObject({ publishedVersionId: 'v1', draftVersionId: 'v2' })
        expect(store.get('sales_variables/voice_intro/versions/v1')).toMatchObject({ status: 'published' })
        expect(store.get('sales_variables/voice_intro/versions/v2')).toMatchObject({ status: 'draft' })
    })

    it('rejects stale drafts, published overwrites, and kind changes without partial writes', async () => {
        store.seed('sales_variables/voice_intro', {
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', archived: false,
            publishedVersionId: 'v1', draftVersionId: 'v1',
        })
        store.seed('sales_variables/voice_intro/versions/v1', audioVersion('v1', 'published'))

        await expect(saveVariableDraft({
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', expectedDraftVersionId: 'old',
            version: audioVersion('v2'),
        })).rejects.toThrow('STALE_VARIABLE_DRAFT')
        await expect(saveVariableDraft({
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', expectedDraftVersionId: 'v1',
            version: audioVersion('v1'),
        })).rejects.toThrow('PUBLISHED_VARIABLE_VERSION_IMMUTABLE')
        await expect(saveVariableDraft({
            key: 'voice_intro', label: 'פתיח קולי', kind: 'video', expectedDraftVersionId: 'v1',
            version: { ...audioVersion('v2'), kind: 'video', contentType: 'video/mp4', objectPath: 'sales-variable-media/voice_intro/v2.mp4', voiceNote: false },
        })).rejects.toThrow('PUBLISHED_VARIABLE_KIND_IMMUTABLE')
        expect(store.get('sales_variables/voice_intro/versions/v2')).toBeUndefined()
    })

    it('archives a variable while preserving every referenced version', async () => {
        store.seed('sales_variables/voice_intro', {
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', archived: false,
            publishedVersionId: 'v1', draftVersionId: 'v2',
        })
        store.seed('sales_variables/voice_intro/versions/v1', audioVersion('v1', 'published'))
        store.seed('sales_variables/voice_intro/versions/v2', audioVersion('v2'))

        await archiveSalesVariable('voice_intro', { expectedDraftVersionId: 'v2', updatedBy: 'owner@example.test' })
        expect(store.get('sales_variables/voice_intro')).toMatchObject({ archived: true, publishedVersionId: 'v1', draftVersionId: 'v2' })
        expect(store.get('sales_variables/voice_intro/versions/v1')).toBeDefined()
        expect(store.get('sales_variables/voice_intro/versions/v2')).toBeDefined()
    })

    it('rolls back a draft pointer and version together when commit fails', async () => {
        store.failNextCommit()
        await expect(saveVariableDraft({
            key: 'opening_copy', label: 'טקסט פתיחה', kind: 'text', expectedDraftVersionId: null,
            version: textVersion('v1'),
        })).rejects.toThrow('TEST_COMMIT_FAILED')
        expect(store.get('sales_variables/opening_copy')).toBeUndefined()
        expect(store.get('sales_variables/opening_copy/versions/v1')).toBeUndefined()
    })
})

describe('sales variable upload sessions', () => {
    it('creates and atomically consumes one upload session into a draft version', async () => {
        await createUploadSession({
            id: 'upload-safe-1', variableKey: 'voice_intro', kind: 'audio',
            objectPath: 'sales-variable-media/voice_intro/upload-safe-1.ogg', contentType: 'audio/ogg',
            bytes: 1024, checksum: 'a'.repeat(64), expiresAt: 1_777_000_100_000,
        }, { createdBy: 'owner@example.test' })

        await finalizeUploadSession({
            uploadId: 'upload-safe-1', nowMs: 1_777_000_000_000, label: 'פתיח קולי',
            expectedDraftVersionId: null,
            version: {
                ...audioVersion('v1'),
                objectPath: 'sales-variable-media/voice_intro/upload-safe-1.ogg',
            },
        }, { updatedBy: 'owner@example.test' })

        expect(store.get('sales_variable_uploads/upload-safe-1')).toMatchObject({ consumedAt: 'SERVER_TIME' })
        expect(store.get('sales_variables/voice_intro')).toMatchObject({ draftVersionId: 'v1', publishedVersionId: null })
        expect(store.get('sales_variables/voice_intro/versions/v1')).toMatchObject({ status: 'draft' })
        await expect(finalizeUploadSession({
            uploadId: 'upload-safe-1', nowMs: 1_777_000_000_001, label: 'פתיח קולי',
            expectedDraftVersionId: 'v1', version: audioVersion('v2'),
        })).rejects.toThrow('UPLOAD_ALREADY_CONSUMED')
    })

    it('rejects expired or metadata-mismatched sessions without consuming them', async () => {
        store.seed('sales_variable_uploads/upload-safe-1', {
            id: 'upload-safe-1', variableKey: 'voice_intro', kind: 'audio',
            objectPath: 'sales-variable-media/voice_intro/upload-safe-1.ogg', contentType: 'audio/ogg',
            bytes: 1024, checksum: 'a'.repeat(64), expiresAt: 10, consumedAt: null,
        })
        await expect(finalizeUploadSession({
            uploadId: 'upload-safe-1', nowMs: 11, label: 'פתיח קולי', expectedDraftVersionId: null,
            version: audioVersion('v1'),
        })).rejects.toThrow('UPLOAD_EXPIRED')
        expect(store.get('sales_variable_uploads/upload-safe-1')).toMatchObject({ consumedAt: null })

        store.seed('sales_variable_uploads/upload-safe-1', {
            ...store.get('sales_variable_uploads/upload-safe-1'), expiresAt: 100,
        })
        await expect(finalizeUploadSession({
            uploadId: 'upload-safe-1', nowMs: 20, label: 'פתיח קולי', expectedDraftVersionId: null,
            version: {
                ...audioVersion('v1'),
                objectPath: 'sales-variable-media/voice_intro/upload-safe-1.ogg',
                bytes: 2048,
            },
        })).rejects.toThrow('UPLOAD_METADATA_MISMATCH')
        expect(store.get('sales_variable_uploads/upload-safe-1')).toMatchObject({ consumedAt: null })
    })
})
