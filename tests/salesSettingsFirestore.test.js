import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    const ref = key => ({ key, collection: name => ({ doc: id => ref(`${key}/${name}/${id}`) }) })
    const snapshot = target => ({ exists: docs.has(target.key), data: () => docs.get(target.key) })
    const db = {
        collection: name => ({ doc: id => ref(`${name}/${id}`) }),
        runTransaction: async work => {
            const writes = []
            const result = await work({
                get: async target => snapshot(target),
                set: (target, value) => writes.push([target.key, value]),
            })
            for (const [key, value] of writes) docs.set(key, value)
            return result
        },
    }
    return {
        db,
        reset() { docs.clear() },
        get(key) { return docs.get(key) },
        set(key, value) { docs.set(key, value) },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }))

import {
    publishSalesSettingsSnapshot,
    readSalesSettings,
    restoreSalesSettingsRevision,
    saveSalesSettings,
} from '@/lib/salesAgent/settingsStore'
import { DEFAULT_OPENING_EXPERIMENT } from '@/lib/salesAgent/openingExperiment'

beforeEach(() => store.reset())

describe('sales settings Firestore store', () => {
    it('reads a safe default without creating a document', async () => {
        expect(await readSalesSettings()).toMatchObject({ revision: 0, enabled: true, provider: 'auto' })
        expect(store.get('sales_agent_settings/active')).toBeUndefined()
    })

    it('saves with optimistic concurrency and snapshots the prior version', async () => {
        store.set('sales_agent_settings/active', {
            revision: 2, enabled: true, provider: 'auto', model: 'claude-sonnet-4-5',
            businessInstructions: '', activeOpeningIds: ['answer_first'], openingMediaSequence: [],
        })

        const saved = await saveSalesSettings({
            revision: 2,
            enabled: false,
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            businessInstructions: 'תשאל שאלה אחת',
            activeOpeningIds: ['value_question'],
            openingMediaSequence: ['photo-a'],
            changeNote: 'ניסוי',
        }, { updatedBy: 'owner@example.test', registeredMediaKeys: ['photo-a'] })

        expect(saved).toMatchObject({ revision: 3, enabled: false, updatedBy: 'owner@example.test' })
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 3, updatedAt: 'SERVER_TIME' })
        expect(store.get('sales_agent_settings_history/revision-2')).toMatchObject({ revision: 2, replacedByRevision: 3 })
    })

    it('publishes the normalized experiment and restores an old snapshot as a new revision', async () => {
        const oldExperiment = structuredClone(DEFAULT_OPENING_EXPERIMENT)
        oldExperiment.enabled = false
        const currentExperiment = structuredClone(DEFAULT_OPENING_EXPERIMENT)
        currentExperiment.enabled = true
        currentExperiment.variants[0].label = 'גרסה נוכחית'
        store.set('sales_agent_settings/active', {
            revision: 5, enabled: false, mode: 'opening_only', openingText: 'פתיחה',
            provider: 'auto', model: 'claude-sonnet-4-5', activeOpeningIds: ['answer_first'],
            openingMediaSequence: [], openingExperiment: currentExperiment,
        })
        store.set('sales_agent_settings_history/revision-2', {
            revision: 2, enabled: false, mode: 'opening_only', openingText: 'פתיחה ישנה',
            provider: 'auto', model: 'claude-sonnet-4-5', activeOpeningIds: ['answer_first'],
            openingMediaSequence: [], openingExperiment: oldExperiment,
        })

        const restored = await restoreSalesSettingsRevision(2, {
            expectedRevision: 5,
            updatedBy: 'owner@example.test',
            registeredMediaKeys: ['cover_personalised', 'book_open_spread'],
        })

        expect(restored).toMatchObject({ revision: 6, openingText: 'פתיחה ישנה', updatedBy: 'owner@example.test' })
        expect(restored.openingExperiment.enabled).toBe(false)
        expect(store.get('sales_agent_settings_history/revision-5')).toMatchObject({ revision: 5, replacedByRevision: 6 })
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 6, restoredFromRevision: 2 })
    })

    it('rejects a missing or stale restore without changing the active revision', async () => {
        store.set('sales_agent_settings/active', {
            revision: 5, enabled: false, provider: 'auto', model: 'claude-sonnet-4-5',
        })
        await expect(restoreSalesSettingsRevision(2, { expectedRevision: 4 })).rejects.toThrow('STALE_REVISION')
        await expect(restoreSalesSettingsRevision(2, { expectedRevision: 5 })).rejects.toThrow('REVISION_NOT_FOUND')
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 5 })
    })

    it('rejects a stale save without writing either document', async () => {
        store.set('sales_agent_settings/active', { revision: 4, enabled: true, provider: 'auto', model: 'claude-sonnet-4-5' })
        await expect(saveSalesSettings({ revision: 3 }, { updatedBy: 'owner@example.test' })).rejects.toThrow('STALE_REVISION')
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 4 })
        expect(store.get('sales_agent_settings_history/revision-4')).toBeUndefined()
    })

    it('migrates a retired opening arm while saving an opening-only control change', async () => {
        store.set('sales_agent_settings/active', {
            revision: 5,
            enabled: true,
            provider: 'auto',
            model: 'claude-sonnet-4-5',
            activeOpeningIds: ['call_offer'],
            openingMediaSequence: [],
        })

        const saved = await saveSalesSettings({
            revision: 5,
            enabled: false,
            openingText: 'פתיחה מבוקרת',
        }, { updatedBy: 'owner@example.test' })

        expect(saved).toMatchObject({ revision: 6, enabled: false, openingText: 'פתיחה מבוקרת' })
        expect(saved.activeOpeningIds).not.toContain('call_offer')
    })

    it('publishes one immutable experiment snapshot and its exact variable draft atomically', async () => {
        store.set('sales_agent_settings/active', {
            revision: 7, enabled: false, mode: 'opening_only', provider: 'auto', model: 'claude-sonnet-4-5',
            openingText: 'פתיחה', activeOpeningIds: ['answer_first'], openingMediaSequence: [],
            openingExperiment: DEFAULT_OPENING_EXPERIMENT,
        })
        store.set('sales_variables/voice_intro', {
            key: 'voice_intro', label: 'פתיח קולי', kind: 'audio', archived: false,
            draftVersionId: 'v2', publishedVersionId: 'v1',
        })
        store.set('sales_variables/voice_intro/versions/v2', {
            id: 'v2', kind: 'audio', objectPath: 'sales-variable-media/voice_intro/v2.ogg',
            contentType: 'audio/ogg', bytes: 1200, checksum: 'a'.repeat(64), caption: '', when: 'opening',
            voiceNote: true, status: 'draft', createdAtMs: 1_777_000_000_000,
        })
        const experiment = {
            enabled: true,
            minSamplePerVariant: 30,
            variants: [{
                id: 'A', label: 'קול', enabled: true, weight: 100, revision: 2,
                blocks: [
                    { id: 'a-audio', type: 'media', variableKey: 'voice_intro' },
                    { id: 'a-stop', type: 'stop' },
                ],
            }],
        }

        const published = await publishSalesSettingsSnapshot({
            revision: 7,
            expectedVariableDrafts: { voice_intro: 'v2' },
            openingExperiment: experiment,
            changeNote: 'פתיח קולי',
        }, { updatedBy: 'owner@example.test' })

        expect(published).toMatchObject({
            revision: 8,
            openingExperiment: {
                variants: [{ blocks: [
                    { id: 'a-audio', type: 'media', variableKey: 'voice_intro', variableVersionId: 'v2' },
                    { id: 'a-stop', type: 'stop' },
                ] }],
            },
        })
        expect(store.get('sales_variables/voice_intro')).toMatchObject({
            draftVersionId: 'v2', publishedVersionId: 'v2',
        })
        expect(store.get('sales_variables/voice_intro/versions/v2')).toMatchObject({ status: 'published' })
        expect(store.get('sales_agent_settings_history/revision-7')).toMatchObject({
            revision: 7, replacedByRevision: 8,
        })
    })

    it('refuses stale, missing, archived, or incompatible variable drafts without changing settings', async () => {
        const current = {
            revision: 7, enabled: false, mode: 'opening_only', provider: 'auto', model: 'claude-sonnet-4-5',
            openingText: 'פתיחה', activeOpeningIds: ['answer_first'], openingMediaSequence: [],
            openingExperiment: DEFAULT_OPENING_EXPERIMENT,
        }
        const experiment = {
            enabled: true,
            minSamplePerVariant: 30,
            variants: [{
                id: 'A', label: 'בדיקה', enabled: true, weight: 100, revision: 2,
                blocks: [{ id: 'a-copy', type: 'text', variableKey: 'opening_copy' }, { id: 'a-stop', type: 'stop' }],
            }],
        }
        store.set('sales_agent_settings/active', current)
        store.set('sales_variables/opening_copy', {
            key: 'opening_copy', label: 'טקסט', kind: 'text', archived: false,
            draftVersionId: 'v2', publishedVersionId: null,
        })
        store.set('sales_variables/opening_copy/versions/v2', {
            id: 'v2', kind: 'text', value: 'שלום {{first_name}}', status: 'draft', createdAtMs: 1,
        })

        await expect(publishSalesSettingsSnapshot({
            revision: 7, expectedVariableDrafts: { opening_copy: 'v1' }, openingExperiment: experiment,
        })).rejects.toThrow('STALE_VARIABLE_DRAFT')
        expect(store.get('sales_agent_settings/active')).toEqual(current)

        store.set('sales_variables/opening_copy', {
            ...store.get('sales_variables/opening_copy'), archived: true,
        })
        await expect(publishSalesSettingsSnapshot({
            revision: 7, expectedVariableDrafts: { opening_copy: 'v2' }, openingExperiment: experiment,
        })).rejects.toThrow('OPENING_VARIABLE_ARCHIVED')
        expect(store.get('sales_agent_settings/active')).toEqual(current)
    })

    it('restores a bound historical snapshot only while every exact variable version still exists', async () => {
        const bound = {
            enabled: true,
            minSamplePerVariant: 30,
            variants: [{
                id: 'A', label: 'ישן', enabled: true, weight: 100, revision: 1,
                blocks: [
                    { id: 'a-copy', type: 'text', variableKey: 'opening_copy', variableVersionId: 'v1' },
                    { id: 'a-stop', type: 'stop' },
                ],
            }],
        }
        store.set('sales_agent_settings/active', {
            revision: 5, enabled: false, mode: 'opening_only', provider: 'auto', model: 'claude-sonnet-4-5',
            openingText: 'נוכחי', activeOpeningIds: ['answer_first'], openingMediaSequence: [],
            openingExperiment: DEFAULT_OPENING_EXPERIMENT,
        })
        store.set('sales_agent_settings_history/revision-2', {
            revision: 2, enabled: false, mode: 'opening_only', provider: 'auto', model: 'claude-sonnet-4-5',
            openingText: 'ישן', activeOpeningIds: ['answer_first'], openingMediaSequence: [], openingExperiment: bound,
        })

        await expect(restoreSalesSettingsRevision(2, { expectedRevision: 5 }))
            .rejects.toThrow('OPENING_VARIABLE_VERSION_MISSING')
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 5 })

        store.set('sales_variables/opening_copy/versions/v1', {
            id: 'v1', kind: 'text', value: 'שלום', status: 'published', createdAtMs: 1,
        })
        const restored = await restoreSalesSettingsRevision(2, { expectedRevision: 5 })
        expect(restored).toMatchObject({ revision: 6 })
        expect(store.get('sales_agent_settings/active')).toMatchObject({ restoredFromRevision: 2 })
        expect(restored.openingExperiment.variants[0].blocks[0]).toMatchObject({
            variableKey: 'opening_copy', variableVersionId: 'v1',
        })
    })
})
