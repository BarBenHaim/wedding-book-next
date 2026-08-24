import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    prepare: vi.fn(),
    finalize: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: routeMocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: routeMocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/salesVariableHandlers', async importOriginal => ({
    ...(await importOriginal()),
    salesVariableUploadHandlers: { prepare: routeMocks.prepare, finalize: routeMocks.finalize },
}))

import { createSalesVariableUploadHandlers } from '@/lib/salesAgent/salesVariableHandlers'

const prepareInput = (overrides = {}) => ({
    action: 'prepare', variableKey: 'voice_intro', kind: 'audio', contentType: 'audio/ogg',
    bytes: 1200, checksum: 'a'.repeat(64), ...overrides,
})

function dependencies() {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://storage.googleapis.test/signed-upload'])
    const getMetadata = vi.fn().mockResolvedValue([{
        size: '1200', contentType: 'audio/ogg', metadata: { sha256: 'a'.repeat(64) },
    }])
    return {
        createUploadSession: vi.fn().mockResolvedValue({}),
        readUploadSession: vi.fn().mockResolvedValue({
            id: 'upload-safe-1', variableKey: 'voice_intro', kind: 'audio',
            objectPath: 'sales-variable-media/voice_intro/upload-safe-1.ogg', contentType: 'audio/ogg',
            bytes: 1200, checksum: 'a'.repeat(64), expiresAt: 1_777_003_600_000, consumedAt: null,
        }),
        finalizeUploadSession: vi.fn().mockResolvedValue({ key: 'voice_intro', draftVersionId: 'version-safe-1' }),
        fileForPath: vi.fn(() => ({ getSignedUrl, getMetadata })),
        idFactory: prefix => prefix === 'upload' ? 'upload-safe-1' : 'version-safe-1',
        now: () => 1_777_000_000_000,
        getSignedUrl,
        getMetadata,
    }
}

describe('sales variable direct upload handlers', () => {
    it('prepares a one-hour signed PUT with exact checksum metadata', async () => {
        const deps = dependencies()
        const handlers = createSalesVariableUploadHandlers(deps)
        const result = await handlers.prepare(prepareInput(), { updatedBy: 'owner@example.test' })

        expect(result).toEqual({
            uploadId: 'upload-safe-1', method: 'PUT', uploadUrl: 'https://storage.googleapis.test/signed-upload',
            headers: { 'content-type': 'audio/ogg', 'x-goog-meta-sha256': 'a'.repeat(64) },
            expiresAt: 1_777_003_600_000,
        })
        expect(deps.fileForPath).toHaveBeenCalledWith('sales-variable-media/voice_intro/upload-safe-1.ogg')
        expect(deps.getSignedUrl).toHaveBeenCalledWith({
            version: 'v4', action: 'write', expires: 1_777_003_600_000, contentType: 'audio/ogg',
            extensionHeaders: { 'x-goog-meta-sha256': 'a'.repeat(64) },
        })
        expect(deps.createUploadSession).toHaveBeenCalledWith(expect.objectContaining({
            id: 'upload-safe-1', variableKey: 'voice_intro', kind: 'audio', expiresAt: 1_777_003_600_000,
        }), { createdBy: 'owner@example.test' })
    })

    it.each([
        ['unknown kind', { kind: 'document', contentType: 'application/pdf' }],
        ['wrong audio MIME', { contentType: 'audio/wav' }],
        ['oversized audio', { bytes: 16 * 1024 * 1024 + 1 }],
        ['oversized image', { kind: 'image', contentType: 'image/png', bytes: 5 * 1024 * 1024 + 1 }],
        ['bad checksum', { checksum: 'not-a-checksum' }],
    ])('rejects %s before signing or persistence', async (_name, override) => {
        const deps = dependencies()
        const handlers = createSalesVariableUploadHandlers(deps)
        await expect(handlers.prepare(prepareInput(override), { updatedBy: 'owner' })).rejects.toThrow()
        expect(deps.fileForPath).not.toHaveBeenCalled()
        expect(deps.createUploadSession).not.toHaveBeenCalled()
    })

    it('verifies stored object metadata and finalizes without trusting a client URL', async () => {
        const deps = dependencies()
        const handlers = createSalesVariableUploadHandlers(deps)
        const result = await handlers.finalize({
            action: 'finalize', uploadId: 'upload-safe-1', label: 'פתיח קולי',
            expectedDraftVersionId: null, caption: 'הסבר קצר', when: 'opening', voiceNote: true,
            url: 'https://attacker.test/file',
        }, { updatedBy: 'owner@example.test' })

        expect(result).toEqual({ variable: { key: 'voice_intro', draftVersionId: 'version-safe-1' } })
        expect(deps.finalizeUploadSession).toHaveBeenCalledWith(expect.objectContaining({
            uploadId: 'upload-safe-1', nowMs: 1_777_000_000_000,
            version: expect.objectContaining({
                id: 'version-safe-1', kind: 'audio', objectPath: 'sales-variable-media/voice_intro/upload-safe-1.ogg',
                contentType: 'audio/ogg', bytes: 1200, checksum: 'a'.repeat(64), voiceNote: true,
            }),
        }), { updatedBy: 'owner@example.test' })
        expect(JSON.stringify(deps.finalizeUploadSession.mock.calls)).not.toContain('attacker.test')
    })

    it('fails closed on missing objects and metadata mismatch without consuming the upload', async () => {
        const missing = dependencies()
        missing.getMetadata.mockRejectedValue(new Error('provider body with private bucket'))
        await expect(createSalesVariableUploadHandlers(missing).finalize({
            action: 'finalize', uploadId: 'upload-safe-1', label: 'פתיח', expectedDraftVersionId: null,
        }, { updatedBy: 'owner' })).rejects.toThrow('UPLOAD_OBJECT_MISSING')
        expect(missing.finalizeUploadSession).not.toHaveBeenCalled()

        const mismatch = dependencies()
        mismatch.getMetadata.mockResolvedValue([{ size: '1201', contentType: 'audio/ogg', metadata: { sha256: 'a'.repeat(64) } }])
        await expect(createSalesVariableUploadHandlers(mismatch).finalize({
            action: 'finalize', uploadId: 'upload-safe-1', label: 'פתיח', expectedDraftVersionId: null,
        }, { updatedBy: 'owner' })).rejects.toThrow('UPLOAD_METADATA_MISMATCH')
        expect(mismatch.finalizeUploadSession).not.toHaveBeenCalled()
    })
})

describe('sales variable upload route boundary', () => {
    let POST
    const request = (body, secret = 'upload-route-secret') => new Request('http://localhost/api/sales-agent/variables/upload', {
        method: 'POST', headers: { 'x-wt-secret': secret, 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })

    beforeEach(async () => {
        vi.resetModules()
        vi.clearAllMocks()
        process.env.SALES_AGENT_SECRET = 'upload-route-secret'
        routeMocks.prepare.mockResolvedValue({ uploadId: 'upload-safe-1' })
        routeMocks.finalize.mockResolvedValue({ variable: { key: 'voice_intro' } })
        ;({ POST } = await import('@/app/api/sales-agent/variables/upload/route'))
    })

    it('authenticates before upload work and dispatches only prepare/finalize', async () => {
        expect((await POST(request(prepareInput(), 'wrong'))).status).toBe(401)
        expect(routeMocks.prepare).not.toHaveBeenCalled()
        expect((await POST(request(prepareInput()))).status).toBe(200)
        expect(routeMocks.prepare).toHaveBeenCalledWith(prepareInput(), { updatedBy: 'shared-secret' })
        expect((await POST(request({ action: 'delete_everything' }))).status).toBe(400)
    })

    it('returns only fixed safe errors for malformed, oversized, or provider failures', async () => {
        expect((await POST(request('{bad'))).status).toBe(400)
        expect((await POST(request(JSON.stringify({ action: 'prepare', padding: 'x'.repeat(65_536) })))).status).toBe(413)
        routeMocks.prepare.mockRejectedValueOnce(new Error('provider body with storage credentials'))
        const failed = await POST(request(prepareInput()))
        expect(failed.status).toBe(503)
        expect(await failed.json()).toEqual({ error: 'VARIABLE_UPLOAD_UNAVAILABLE' })
    })
})
