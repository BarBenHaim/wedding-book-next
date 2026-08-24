import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    list: vi.fn(),
    mutate: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/salesVariableHandlers', async importOriginal => ({
    ...(await importOriginal()),
    salesVariableHandlers: { list: mocks.list, mutate: mocks.mutate },
}))

import { createSalesVariableHandlers } from '@/lib/salesAgent/salesVariableHandlers'

let GET, POST

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'variables-route-secret'
    mocks.list.mockResolvedValue({ variables: [] })
    mocks.mutate.mockResolvedValue({ variable: { key: 'opening_copy' } })
    ;({ GET, POST } = await import('@/app/api/sales-agent/variables/route'))
})

const request = (method, body, secret = 'variables-route-secret') => new Request('http://localhost/api/sales-agent/variables', {
    method,
    headers: { 'x-wt-secret': secret, 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
})

describe('sales variable pure handlers', () => {
    it('joins draft and published versions without exposing private object paths', async () => {
        const handlers = createSalesVariableHandlers({
            listSalesVariables: vi.fn().mockResolvedValue([{
                key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', archived: false,
                draftVersionId: 'v2', publishedVersionId: 'v1', updatedAtMs: 123,
            }]),
            readSalesVariableVersions: vi.fn().mockResolvedValue([
                {
                    id: 'v2', kind: 'audio', objectPath: 'sales-variable-media/private/v2.ogg',
                    contentType: 'audio/ogg', bytes: 1200, checksum: 'a'.repeat(64), caption: '', when: 'opening',
                    voiceNote: true, status: 'draft', createdAtMs: 2,
                },
                {
                    id: 'v1', kind: 'audio', objectPath: 'sales-variable-media/private/v1.ogg',
                    contentType: 'audio/ogg', bytes: 1100, checksum: 'b'.repeat(64), caption: '', when: 'opening',
                    voiceNote: true, status: 'published', createdAtMs: 1,
                },
            ]),
            saveVariableDraft: vi.fn(),
            archiveSalesVariable: vi.fn(),
            signPreview: vi.fn(async version => `https://storage.test/${version.id}`),
            idFactory: () => 'unused',
            now: () => 10,
        })

        const result = await handlers.list()
        expect(result.variables[0]).toMatchObject({
            key: 'voice_intro',
            draftVersion: { id: 'v2', previewUrl: 'https://storage.test/v2' },
            publishedVersion: { id: 'v1', previewUrl: 'https://storage.test/v1' },
        })
        expect(JSON.stringify(result)).not.toContain('sales-variable-media/private')
    })

    it('creates a server-versioned text draft and archives only an exact variable', async () => {
        const saveVariableDraft = vi.fn().mockResolvedValue({ key: 'opening_copy', draftVersionId: 'version-safe-1' })
        const archiveSalesVariable = vi.fn().mockResolvedValue({ key: 'opening_copy', archived: true })
        const handlers = createSalesVariableHandlers({
            listSalesVariables: vi.fn(), readSalesVariableVersions: vi.fn(), saveVariableDraft,
            archiveSalesVariable, signPreview: vi.fn(), idFactory: () => 'version-safe-1', now: () => 1_777_000_000_000,
        })

        await expect(handlers.mutate({
            action: 'save_text', variableKey: 'opening_copy', label: 'פתיח',
            expectedDraftVersionId: null, value: 'שלום {{first_name}}', ignored: 'attacker-value',
        }, { updatedBy: 'owner@example.test' })).resolves.toEqual({
            variable: { key: 'opening_copy', draftVersionId: 'version-safe-1' },
        })
        expect(saveVariableDraft).toHaveBeenCalledWith({
            key: 'opening_copy', label: 'פתיח', kind: 'text', expectedDraftVersionId: null,
            version: {
                id: 'version-safe-1', kind: 'text', value: 'שלום {{first_name}}',
                status: 'draft', createdAtMs: 1_777_000_000_000,
            },
        }, { updatedBy: 'owner@example.test' })
        expect(JSON.stringify(saveVariableDraft.mock.calls)).not.toContain('attacker-value')

        await handlers.mutate({ action: 'archive', variableKey: 'opening_copy', expectedDraftVersionId: 'version-safe-1' }, { updatedBy: 'owner@example.test' })
        expect(archiveSalesVariable).toHaveBeenCalledWith('opening_copy', {
            expectedDraftVersionId: 'version-safe-1', updatedBy: 'owner@example.test',
        })
    })
})

describe('sales variable route boundary', () => {
    it('authenticates before reads or mutations', async () => {
        expect((await GET(request('GET', undefined, 'wrong'))).status).toBe(401)
        expect((await POST(request('POST', { action: 'archive' }, 'wrong'))).status).toBe(401)
        expect(mocks.list).not.toHaveBeenCalled()
        expect(mocks.mutate).not.toHaveBeenCalled()
    })

    it('returns the allowlisted control payload and actor identity', async () => {
        mocks.list.mockResolvedValue({ variables: [{ key: 'opening_copy' }] })
        const read = await GET(request('GET'))
        expect(await read.json()).toEqual({ ok: true, variables: [{ key: 'opening_copy' }] })

        const write = await POST(request('POST', { action: 'archive', variableKey: 'opening_copy' }))
        expect(write.status).toBe(200)
        expect(mocks.mutate).toHaveBeenCalledWith({ action: 'archive', variableKey: 'opening_copy' }, { updatedBy: 'shared-secret' })
        expect(await write.json()).toEqual({ ok: true, variable: { key: 'opening_copy' } })
    })

    it('rejects malformed and 64 KiB-plus JSON with fixed private errors', async () => {
        expect((await POST(request('POST', '{bad'))).status).toBe(400)
        expect((await POST(request('POST', JSON.stringify({ action: 'archive', padding: 'x'.repeat(65_536) })))).status).toBe(413)
        expect(mocks.mutate).not.toHaveBeenCalled()
    })
})
