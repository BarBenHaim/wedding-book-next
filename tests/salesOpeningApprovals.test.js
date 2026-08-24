import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: {},
    adminStorage: {},
}))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: vi.fn() }))
vi.mock('@/lib/salesAgent/leads', () => ({ prepareFollowUpDelivery: vi.fn(), recordDeliveryEvent: vi.fn() }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({ sendWhatsAppImage: vi.fn() }))

import {
    createOpeningApprovalRecord,
    decideOpeningApproval,
    generateOpeningApproval,
    openingApprovalId,
} from '../src/lib/salesAgent/openingApprovals'

const ready = {
    id: 'a'.repeat(32), status: 'ready', leadId: 'non-dialable-lead-41',
    variantId: 'A', variantRevision: 3, templateId: 'bar-mitzvah-v1',
    storagePath: `sales-opening-approvals/${'a'.repeat(32)}.png`,
}

describe('opening approvals', () => {
    it('derives a phone-free stable id and a private pending record', () => {
        const id = openingApprovalId('non-dialable-lead-41', 5)
        const record = createOpeningApprovalRecord({
            leadId: 'non-dialable-lead-41', stateVersion: 5, mediaId: 'opaque-provider-id',
            templateId: 'bar-mitzvah-v1', variantId: 'A', variantRevision: 3,
        })
        expect(id).toMatch(/^[a-f0-9]{32}$/)
        expect(id).not.toContain('41')
        expect(record).toMatchObject({ id, status: 'pending_generation', mediaId: 'opaque-provider-id' })
        expect(record).not.toHaveProperty('photoUrl')
    })

    it('generates once, stores only the generated private object path, and is idempotent', async () => {
        const approval = { ...ready, status: 'pending_generation', mediaId: 'opaque-provider-id', storagePath: null }
        const deps = {
            read: vi.fn().mockResolvedValueOnce(approval).mockResolvedValueOnce({ ...approval, status: 'ready', storagePath: ready.storagePath }),
            claim: vi.fn().mockResolvedValue({ action: 'claimed', approval }),
            download: vi.fn().mockResolvedValue({ bytes: Buffer.from('image'), mimeType: 'image/png' }),
            render: vi.fn().mockResolvedValue(Buffer.from('generated-png')),
            upload: vi.fn().mockResolvedValue(ready.storagePath),
            markReady: vi.fn().mockResolvedValue({ ...approval, status: 'ready', storagePath: ready.storagePath }),
        }

        await expect(generateOpeningApproval(approval.id, deps)).resolves.toMatchObject({ status: 'ready' })
        expect(deps.upload).toHaveBeenCalledWith(approval.id, Buffer.from('generated-png'))
        expect(deps.markReady).toHaveBeenCalledWith(approval.id, ready.storagePath)

        await expect(generateOpeningApproval(approval.id, deps)).resolves.toMatchObject({ status: 'ready' })
        expect(deps.download).toHaveBeenCalledTimes(1)
        expect(deps.upload).toHaveBeenCalledTimes(1)
    })

    it('never sends before approval and refuses stopped global or variant switches', async () => {
        const send = vi.fn()
        const baseDeps = {
            read: vi.fn().mockResolvedValue(ready),
            updateDecision: vi.fn().mockResolvedValue({ ...ready, status: 'rejected' }),
            send,
        }
        await expect(decideOpeningApproval(ready.id, 'reject', {
            ...baseDeps,
            readSettings: vi.fn().mockResolvedValue({ openingExperiment: { enabled: true, variants: [{ id: 'A', enabled: true }] } }),
        })).resolves.toMatchObject({ status: 'rejected' })
        expect(send).not.toHaveBeenCalled()

        for (const experiment of [
            { enabled: false, variants: [{ id: 'A', enabled: true }] },
            { enabled: true, variants: [{ id: 'A', enabled: false }] },
        ]) {
            await expect(decideOpeningApproval(ready.id, 'approve', {
                ...baseDeps,
                readSettings: vi.fn().mockResolvedValue({ openingExperiment: experiment }),
            })).rejects.toMatchObject({ code: 'OPENING_EXPERIMENT_STOPPED' })
        }
        expect(send).not.toHaveBeenCalled()
    })

    it('sends the generated design exactly through the injected approval seam', async () => {
        const sent = { accepted: true, outboundId: 'phone-free-outbound-id' }
        const deps = {
            read: vi.fn().mockResolvedValue(ready),
            readSettings: vi.fn().mockResolvedValue({ openingExperiment: { enabled: true, variants: [{ id: 'A', enabled: true }] } }),
            updateDecision: vi.fn().mockResolvedValue({ ...ready, status: 'approved' }),
            send: vi.fn().mockResolvedValue(sent),
        }
        await expect(decideOpeningApproval(ready.id, 'approve', deps)).resolves.toEqual({ ...ready, status: 'sent', ...sent })
        expect(deps.updateDecision).toHaveBeenCalledWith(ready.id, 'approved')
        expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ id: ready.id, storagePath: ready.storagePath }))
    })

    it('rejects status and identity mismatches with fixed errors', async () => {
        await expect(decideOpeningApproval('wrong', 'approve', { read: vi.fn().mockResolvedValue(ready) }))
            .rejects.toMatchObject({ code: 'APPROVAL_MISMATCH' })
        await expect(decideOpeningApproval(ready.id, 'delete', { read: vi.fn() }))
            .rejects.toMatchObject({ code: 'INVALID_APPROVAL_DECISION' })
    })
})
