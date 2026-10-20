import { beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

const h = vi.hoisted(() => ({
    updateEntry: vi.fn(async () => null),
    setDoc: vi.fn(async () => {}),
    getDoc: vi.fn(),
    recordSubmission: vi.fn(),
}))
vi.mock('@/lib/firebaseClient', () => ({ db: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
    doc: (...parts) => parts.slice(1).join('/'),
    getDoc: h.getDoc,
    setDoc: h.setDoc,
    serverTimestamp: () => 'DUMMY_TIME',
}))
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytesResumable: vi.fn(), getDownloadURL: vi.fn() }))
vi.mock('@/lib/offlineQueue', () => ({ updateEntry: h.updateEntry }))
vi.mock('@/lib/mySubmissions', () => ({ recordSubmission: h.recordSubmission }))

import { uploadQueuedEntry } from '@/lib/uploadEntry'
import { hashGuestEditToken } from '@/lib/guestEditCapability'

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('fetch', vi.fn(async () => ({})))
    h.getDoc.mockResolvedValue({ exists: () => false })
})

it('persists the secret before creation and sends only the hash to Firestore', async () => {
    const entry = { id: 'entry-a', weddingId: 'event-a', name: 'Dummy guest', text: 'Dummy blessing' }
    await uploadQueuedEntry(entry)
    expect(entry.editToken).toMatch(/^[a-f0-9]{64}$/)
    expect(h.updateEntry).toHaveBeenCalledWith('entry-a', { editToken: entry.editToken })
    const data = h.setDoc.mock.calls[0][1]
    expect(data.guestEditTokenHash).toBe(await hashGuestEditToken('event-a', 'entry-a', entry.editToken))
    expect(data).not.toHaveProperty('editToken')
    expect(JSON.stringify(data)).not.toContain(entry.editToken)
    expect(h.recordSubmission).toHaveBeenCalledWith('event-a', entry)
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(entry.editToken)
})

it('reuses a queued secret and restores the same device capability on a retry', async () => {
    const entry = { id: 'entry-a', weddingId: 'event-a', editToken: 'a'.repeat(64) }
    const guestEditTokenHash = await hashGuestEditToken('event-a', 'entry-a', entry.editToken)
    h.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ guestEditTokenHash }) })
    await uploadQueuedEntry(entry)
    expect(h.setDoc).not.toHaveBeenCalled()
    expect(h.recordSubmission).toHaveBeenCalledWith('event-a', entry)
    expect(entry.editToken).toBe('a'.repeat(64))
})

it('never claims a legacy or foreign existing entry during retry', async () => {
    h.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Someone else' }) })
    await uploadQueuedEntry({ id: 'entry-a', weddingId: 'event-a' })
    expect(h.setDoc).not.toHaveBeenCalled()
    expect(h.recordSubmission).not.toHaveBeenCalled()
})

it('keeps the same secret after a failed create', async () => {
    const entry = { id: 'entry-a', weddingId: 'event-a' }
    h.setDoc.mockRejectedValueOnce(new Error('dummy offline'))
    await expect(uploadQueuedEntry(entry)).rejects.toThrow('dummy offline')
    const firstToken = entry.editToken
    await uploadQueuedEntry(entry)
    expect(entry.editToken).toBe(firstToken)
    expect(h.setDoc.mock.calls[0][1].guestEditTokenHash).toBe(h.setDoc.mock.calls[1][1].guestEditTokenHash)
})
