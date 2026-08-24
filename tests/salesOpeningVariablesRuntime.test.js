import { describe, expect, it, vi } from 'vitest'
import { resolveOpeningSnapshotParts } from '@/lib/salesAgent/openingRuntime'

const versions = {
    'opening_copy:v4': {
        id: 'v4', kind: 'text', value: 'היי {{first_name}}', status: 'published', createdAtMs: 1,
    },
    'voice_intro:v2': {
        id: 'v2', kind: 'audio', objectPath: 'sales-variable-media/voice_intro/v2.ogg',
        contentType: 'audio/ogg', bytes: 1200, checksum: 'a'.repeat(64), caption: 'הסבר קצר',
        when: 'opening', voiceNote: true, status: 'published', createdAtMs: 2,
    },
}

const flow = {
    id: 'A', label: 'פתיח', revision: 4,
    blocks: [
        { id: 'a-text', type: 'text', variableKey: 'opening_copy', variableVersionId: 'v4' },
        { id: 'a-audio', type: 'media', variableKey: 'voice_intro', variableVersionId: 'v2' },
        { id: 'a-stop', type: 'stop' },
    ],
}

describe('published opening variable runtime', () => {
    it('renders exact lead fields and signs only the reached published media version', async () => {
        const signDownload = vi.fn().mockResolvedValue('https://storage.test/signed')
        const result = await resolveOpeningSnapshotParts({
            flow,
            state: { cursor: 0, waitingFor: null },
            variableVersions: versions,
            leadContext: { first_name: 'נועה' },
            eventId: 'event-safe-1',
            signDownload,
        })

        expect(result.parts).toEqual([
            {
                partId: expect.stringMatching(/^[a-f0-9]{32}$/), blockId: 'a-text', order: 1,
                kind: 'text', text: 'היי נועה', variableKey: 'opening_copy', variableVersionId: 'v4',
            },
            {
                partId: expect.stringMatching(/^[a-f0-9]{32}$/), blockId: 'a-audio', order: 2,
                kind: 'audio', url: 'https://storage.test/signed', caption: 'הסבר קצר', voiceNote: true,
                variableKey: 'voice_intro', variableVersionId: 'v2',
            },
        ])
        expect(signDownload).toHaveBeenCalledTimes(1)
        expect(signDownload).toHaveBeenCalledWith(expect.objectContaining({
            id: 'v2', objectPath: 'sales-variable-media/voice_intro/v2.ogg',
        }))
    })

    it('fails closed on missing required context or a missing/mismatched version', async () => {
        await expect(resolveOpeningSnapshotParts({
            flow, variableVersions: versions, leadContext: {}, eventId: 'event-safe-2', signDownload: vi.fn(),
        })).rejects.toThrow('REQUIRED_SYSTEM_VARIABLE_MISSING')
        await expect(resolveOpeningSnapshotParts({
            flow, variableVersions: {}, leadContext: { first_name: 'נועה' }, eventId: 'event-safe-2', signDownload: vi.fn(),
        })).rejects.toThrow('OPENING_VARIABLE_VERSION_MISSING')
        await expect(resolveOpeningSnapshotParts({
            flow,
            variableVersions: { ...versions, 'voice_intro:v2': { ...versions['voice_intro:v2'], kind: 'text', value: 'x' } },
            leadContext: { first_name: 'נועה' }, eventId: 'event-safe-2', signDownload: vi.fn(),
        })).rejects.toThrow('OPENING_VARIABLE_KIND_MISMATCH')
    })

    it('does not sign media behind a wait boundary and keeps part ids stable on reevaluation', async () => {
        const waitingFlow = {
            id: 'C', label: 'פרטים', revision: 1,
            blocks: [
                { id: 'c-event', type: 'ask_event', text: 'מה תאריך האירוע?' },
                { id: 'c-audio', type: 'media', variableKey: 'voice_intro', variableVersionId: 'v2' },
                { id: 'c-stop', type: 'stop' },
            ],
        }
        const signDownload = vi.fn()
        const first = await resolveOpeningSnapshotParts({
            flow: waitingFlow, variableVersions: versions, eventId: 'event-safe-3', signDownload,
        })
        const second = await resolveOpeningSnapshotParts({
            flow: waitingFlow, variableVersions: versions, eventId: 'event-safe-3', signDownload,
        })
        expect(first.action).toBe('wait_event')
        expect(first.parts.map(part => part.partId)).toEqual(second.parts.map(part => part.partId))
        expect(signDownload).not.toHaveBeenCalled()
    })
})
