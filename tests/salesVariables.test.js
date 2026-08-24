import { describe, expect, it } from 'vitest'
import {
    SYSTEM_VARIABLE_KEYS,
    VARIABLE_KINDS,
    bindOpeningVariables,
    normalizeSalesVariable,
    normalizeSalesVariableVersion,
    normalizeVariableKey,
    renderSalesTemplate,
} from '@/lib/salesAgent/salesVariables'

const singleBlockExperiment = block => ({
    enabled: true,
    minSamplePerVariant: 30,
    variants: [{
        id: 'A',
        label: 'בדיקה',
        enabled: true,
        weight: 100,
        revision: 1,
        blocks: [block, { id: 'a-stop', type: 'stop' }],
    }],
})

describe('typed sales variables', () => {
    it('exposes only the approved variable kinds and system fields', () => {
        expect(VARIABLE_KINDS).toEqual(['text', 'image', 'video', 'audio'])
        expect(SYSTEM_VARIABLE_KEYS).toEqual([
            'first_name', 'event_type', 'event_date', 'child_name', 'days_to_event', 'payment_link',
        ])
    })

    it('normalizes stable owner keys and rejects unsafe keys', () => {
        expect(normalizeVariableKey('  Demo_Video  ')).toBe('demo_video')
        expect(() => normalizeVariableKey('__proto__')).toThrow('INVALID_VARIABLE_KEY')
        expect(() => normalizeVariableKey('demo video')).toThrow('INVALID_VARIABLE_KEY')
        expect(() => normalizeVariableKey('a'.repeat(81))).toThrow('INVALID_VARIABLE_KEY')
    })

    it('normalizes bounded text and audio versions without mutating the input', () => {
        const text = { id: 'text-v1', kind: 'text', value: '  שלום {{first_name}}  ', status: 'draft', createdAtMs: 1_777_000_000_000 }
        const audio = {
            id: 'audio-v2', kind: 'audio', objectPath: 'sales-variable-media/voice_intro/audio-v2.ogg',
            contentType: 'audio/ogg', bytes: 1024, checksum: 'a'.repeat(64), caption: '', when: 'opening',
            voiceNote: true, status: 'published', createdAtMs: 1_777_000_000_001,
        }

        expect(normalizeSalesVariableVersion(text)).toEqual({ ...text, value: 'שלום {{first_name}}' })
        expect(normalizeSalesVariableVersion(audio)).toEqual(audio)
        expect(text.value).toBe('  שלום {{first_name}}  ')
    })

    it('prevents changing a variable kind after its first publication', () => {
        expect(() => normalizeSalesVariable({
            key: 'voice_intro', label: 'פתיח קולי', kind: 'video', archived: false,
            publishedVersion: {
                id: 'audio-v1', kind: 'audio', objectPath: 'sales-variable-media/voice_intro/audio-v1.ogg',
                contentType: 'audio/ogg', bytes: 1024, checksum: 'b'.repeat(64), caption: '', when: 'opening',
                voiceNote: true, status: 'published', createdAtMs: 1_777_000_000_000,
            },
        })).toThrow('PUBLISHED_VARIABLE_KIND_IMMUTABLE')
    })
})

describe('sales template rendering', () => {
    it('renders only allowlisted proven system fields', () => {
        expect(renderSalesTemplate(
            'היי {{first_name}}, האירוע הוא {{event_type}} בתאריך {{event_date}}',
            { first_name: 'נועה', event_type: 'בר מצווה', event_date: '2026-12-03' },
        )).toBe('היי נועה, האירוע הוא בר מצווה בתאריך 2026-12-03')
        expect(() => renderSalesTemplate('שלום {{phone}}', { phone: 'test-phone-123' }))
            .toThrow('UNKNOWN_SYSTEM_VARIABLE')
    })

    it('fails closed when a referenced required field is absent or empty', () => {
        expect(() => renderSalesTemplate('שלום {{first_name}}', {}))
            .toThrow('REQUIRED_SYSTEM_VARIABLE_MISSING')
        expect(() => renderSalesTemplate('שלום {{first_name}}', { first_name: '   ' }))
            .toThrow('REQUIRED_SYSTEM_VARIABLE_MISSING')
    })
})

describe('opening variable publication binding', () => {
    it('binds one shared media variable to an immutable published version', () => {
        const result = bindOpeningVariables(singleBlockExperiment({
            id: 'a-video', type: 'media', variableKey: 'demo_video',
        }), {
            demo_video: {
                key: 'demo_video', label: 'סרטון הדגמה', kind: 'video', archived: false,
                publishedVersion: {
                    id: 'v3', kind: 'video', objectPath: 'sales-variable-media/demo_video/v3.mp4',
                    contentType: 'video/mp4', bytes: 2048, checksum: 'c'.repeat(64), caption: '',
                    when: 'opening', voiceNote: false, status: 'published', createdAtMs: 1_777_000_000_000,
                },
            },
        })

        expect(result.variants[0].blocks[0]).toEqual({
            id: 'a-video', type: 'media', variableKey: 'demo_video', variableVersionId: 'v3',
        })
        expect(Object.isFrozen(result)).toBe(true)
        expect(Object.isFrozen(result.variants[0].blocks[0])).toBe(true)
    })

    it('retains legacy literal and registered-media blocks as executable', () => {
        const experiment = {
            ...singleBlockExperiment({ id: 'a-text', type: 'text', text: 'שלום' }),
            variants: [{
                ...singleBlockExperiment({ id: 'unused', type: 'text', text: 'x' }).variants[0],
                blocks: [
                    { id: 'a-text', type: 'text', text: 'שלום' },
                    { id: 'a-image', type: 'media', mediaKey: 'cover_personalised' },
                    { id: 'a-stop', type: 'stop' },
                ],
            }],
        }

        const result = bindOpeningVariables(experiment, {})
        expect(result.variants[0].blocks).toEqual([
            { id: 'a-text', type: 'text', text: 'שלום' },
            { id: 'a-image', type: 'media', mediaKey: 'cover_personalised' },
            { id: 'a-stop', type: 'stop' },
        ])
    })

    it('rejects an unpublished, archived, missing, or incompatible shared variable', () => {
        const flow = singleBlockExperiment({ id: 'a-video', type: 'media', variableKey: 'demo_video' })
        expect(() => bindOpeningVariables(flow, {})).toThrow('OPENING_VARIABLE_NOT_FOUND')
        expect(() => bindOpeningVariables(flow, {
            demo_video: { key: 'demo_video', label: 'וידאו', kind: 'video', archived: false, publishedVersion: null },
        })).toThrow('OPENING_VARIABLE_UNPUBLISHED')
        expect(() => bindOpeningVariables(flow, {
            demo_video: { key: 'demo_video', label: 'וידאו', kind: 'video', archived: true, publishedVersion: null },
        })).toThrow('OPENING_VARIABLE_ARCHIVED')
        expect(() => bindOpeningVariables(flow, {
            demo_video: {
                key: 'demo_video', label: 'טקסט', kind: 'text', archived: false,
                publishedVersion: { id: 'v1', kind: 'text', value: 'שלום', status: 'published', createdAtMs: 1 },
            },
        })).toThrow('OPENING_VARIABLE_KIND_MISMATCH')
    })

    it('does not let later draft mutation rewrite a prior publication snapshot', () => {
        const variable = {
            key: 'opening_copy', label: 'פתיח', kind: 'text', archived: false,
            publishedVersion: { id: 'v1', kind: 'text', value: 'גרסה ראשונה', status: 'published', createdAtMs: 1 },
        }
        const result = bindOpeningVariables(singleBlockExperiment({
            id: 'a-copy', type: 'text', variableKey: 'opening_copy',
        }), { opening_copy: variable })

        variable.publishedVersion.id = 'v2'
        variable.publishedVersion.value = 'גרסה שנייה'
        expect(result.variants[0].blocks[0]).toEqual({
            id: 'a-copy', type: 'text', variableKey: 'opening_copy', variableVersionId: 'v1',
        })
    })
})
