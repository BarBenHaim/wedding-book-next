import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: { doc: vi.fn() },
    adminStorage: { bucket: vi.fn() },
}))

import { createOpeningVariableRuntimeStore } from '@/lib/salesAgent/openingVariableRuntimeStore'

const experiment = {
    variants: [{
        blocks: [
            { id: 'a-copy', type: 'text', variableKey: 'opening_copy', variableVersionId: 'v4' },
            { id: 'a-audio', type: 'media', variableKey: 'voice_intro', variableVersionId: 'v2' },
        ],
    }],
}

describe('opening variable runtime storage boundary', () => {
    it('loads only exact published version identities and signs a 15-minute private read', async () => {
        const docs = new Map([
            ['sales_variables/opening_copy/versions/v4', { id: 'v4', kind: 'text', value: 'שלום', status: 'published', createdAtMs: 1 }],
            ['sales_variables/voice_intro/versions/v2', {
                id: 'v2', kind: 'audio', objectPath: 'sales-variable-media/voice_intro/v2.ogg',
                contentType: 'audio/ogg', bytes: 1200, checksum: 'a'.repeat(64), caption: '', when: 'opening',
                voiceNote: true, status: 'published', createdAtMs: 2,
            }],
        ])
        const getSignedUrl = vi.fn().mockResolvedValue(['https://storage.test/private-read'])
        const store = createOpeningVariableRuntimeStore({
            readDoc: vi.fn(async path => docs.get(path) || null),
            fileForPath: vi.fn(() => ({ getSignedUrl })),
            now: () => 1_777_000_000_000,
        })

        const versions = await store.loadOpeningVariableVersions(experiment)
        expect(Object.keys(versions)).toEqual(['opening_copy:v4', 'voice_intro:v2'])
        await expect(store.signOpeningVariableDownload(versions['voice_intro:v2']))
            .resolves.toBe('https://storage.test/private-read')
        expect(getSignedUrl).toHaveBeenCalledWith({
            version: 'v4', action: 'read', expires: 1_777_000_900_000,
        })
    })

    it('fails closed on an unbound, absent, mismatched, draft, or unsafe version', async () => {
        const make = row => createOpeningVariableRuntimeStore({
            readDoc: vi.fn().mockResolvedValue(row),
            fileForPath: vi.fn(),
            now: () => 1,
        })
        await expect(make(null).loadOpeningVariableVersions(experiment)).rejects.toThrow('OPENING_VARIABLE_VERSION_MISSING')
        await expect(make({ id: 'other', kind: 'text', value: 'x', status: 'published', createdAtMs: 1 }).loadOpeningVariableVersions(experiment))
            .rejects.toThrow('OPENING_VARIABLE_VERSION_MISMATCH')
        await expect(make({ id: 'v4', kind: 'text', value: 'x', status: 'draft', createdAtMs: 1 }).loadOpeningVariableVersions(experiment))
            .rejects.toThrow('OPENING_VARIABLE_UNPUBLISHED')
        await expect(make(null).loadOpeningVariableVersions({
            variants: [{ blocks: [{ id: 'x', type: 'text', variableKey: 'opening_copy' }] }],
        })).rejects.toThrow('OPENING_VARIABLE_VERSION_MISSING')
        await expect(make(null).signOpeningVariableDownload({
            id: 'v2', kind: 'audio', objectPath: '../private', status: 'published',
        })).rejects.toThrow('INVALID_VARIABLE_OBJECT_PATH')
    })
})
