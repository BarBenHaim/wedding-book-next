import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    const ref = key => ({ key })
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

import { readSalesSettings, saveSalesSettings } from '@/lib/salesAgent/settingsStore'

beforeEach(() => store.reset())

describe('sales settings Firestore store', () => {
    it('reads a safe default without creating a document', async () => {
        expect(await readSalesSettings()).toMatchObject({ revision: 0, enabled: true, provider: 'auto' })
        expect(store.get('sales_agent_settings/active')).toBeUndefined()
    })

    it('saves with optimistic concurrency and snapshots the prior version', async () => {
        store.set('sales_agent_settings/active', {
            revision: 2, enabled: true, provider: 'auto', model: 'claude-sonnet-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
        })

        const saved = await saveSalesSettings({
            revision: 2,
            enabled: false,
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            businessInstructions: 'תשאל שאלה אחת',
            activeOpeningIds: ['demo_first'],
            openingMediaSequence: ['photo-a'],
            changeNote: 'ניסוי',
        }, { updatedBy: 'owner@example.test', registeredMediaKeys: ['photo-a'] })

        expect(saved).toMatchObject({ revision: 3, enabled: false, updatedBy: 'owner@example.test' })
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 3, updatedAt: 'SERVER_TIME' })
        expect(store.get('sales_agent_settings_history/revision-2')).toMatchObject({ revision: 2, replacedByRevision: 3 })
    })

    it('rejects a stale save without writing either document', async () => {
        store.set('sales_agent_settings/active', { revision: 4, enabled: true, provider: 'auto', model: 'claude-sonnet-4-5' })
        await expect(saveSalesSettings({ revision: 3 }, { updatedBy: 'owner@example.test' })).rejects.toThrow('STALE_REVISION')
        expect(store.get('sales_agent_settings/active')).toMatchObject({ revision: 4 })
        expect(store.get('sales_agent_settings_history/revision-4')).toBeUndefined()
    })
})
