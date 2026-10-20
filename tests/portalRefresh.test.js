import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// Execute the actual portal effect with dummy browser/auth/API objects.
// Keeping React/Next rendering out of this Node suite avoids a browser or
// Firebase dependency while exercising the production polling lifecycle.
const page = readFileSync(new URL('../src/app/wedding/[weddingId]/portal/page.js', import.meta.url), 'utf8')
const start = page.indexOf('    useEffect(() => {')
const end = page.indexOf('\n    const face =', start)
const effectSource = page.slice(start, end)
const cleanups = []

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    vi.useRealTimers()
})

function mountPortal() {
    const user = { uid: 'dummy-owner', getIdToken: vi.fn(async () => 'dummy-token') }
    const auth = { currentUser: null }
    const window = Object.assign(new EventTarget(), { location: { assign: vi.fn() } })
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    let records = [{ id: 'first', text: 'Dummy blessing', orderIndex: 0 }]
    let entries = null
    let wedding = null
    let authListener
    let mount
    const unsubscribe = vi.fn()
    const setEntries = vi.fn(value => { entries = value })
    const setW = vi.fn(value => { wedding = value })
    const fetch = vi.fn(async url => Response.json(url.startsWith('/api/entries') ? records : { wedding: { brideName: 'Dummy owner' } }))
    const onAuthStateChanged = vi.fn((_, listener) => { authListener = listener; return unsubscribe })
    new Function('useEffect', 'onAuthStateChanged', 'auth', 'weddingId', 'setW', 'setEntries', 'window', 'document', 'fetch', effectSource)(
        callback => { mount = callback }, onAuthStateChanged, auth, 'dummy-event', setW, setEntries, window, document, fetch,
    )
    const cleanup = mount()
    cleanups.push(cleanup)
    return {
        user, auth, window, document, fetch, setEntries, setW, unsubscribe, cleanup,
        signIn() { auth.currentUser = user; authListener(user) },
        signOut() { auth.currentUser = null; authListener(null) },
        replaceRecords(next) { records = next },
        get entries() { return entries },
        get wedding() { return wedding },
    }
}

it('refreshes authenticated records, ordering and photo/blessing counts every 15 seconds', async () => {
    const p = mountPortal()
    expect(p.fetch).not.toHaveBeenCalled()
    p.signIn()
    await vi.advanceTimersByTimeAsync(0)
    expect(p.entries).toHaveLength(1)
    p.replaceRecords([
        { id: 'new', text: 'New dummy blessing', imageUrl: '/dummy.jpg', orderIndex: 0 },
        { id: 'first', text: 'Edited elsewhere', orderIndex: 1 },
    ])
    await vi.advanceTimersByTimeAsync(15000)
    expect(p.entries.map(entry => entry.id)).toEqual(['new', 'first'])
    expect(p.entries.filter(entry => entry.imageUrl)).toHaveLength(1)
    expect(p.entries).toHaveLength(2)
    expect(p.entries[1].text).toBe('Edited elsewhere')
    expect(p.fetch).toHaveBeenCalledTimes(4)
    for (const [, options] of p.fetch.mock.calls) {
        expect(options).toMatchObject({ headers: { Authorization: 'Bearer dummy-token' }, cache: 'no-store' })
    }
    expect(p.user.getIdToken).toHaveBeenCalledTimes(2)
})

it('pauses hidden-tab polling and refreshes on visibility, focus and reconnect', async () => {
    const p = mountPortal()
    p.signIn()
    await vi.advanceTimersByTimeAsync(0)
    p.document.visibilityState = 'hidden'
    await vi.advanceTimersByTimeAsync(30000)
    expect(p.fetch).toHaveBeenCalledTimes(2)
    p.replaceRecords([])
    p.document.visibilityState = 'visible'
    p.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(p.entries).toEqual([])
    p.window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    p.window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(p.fetch).toHaveBeenCalledTimes(8)
})

it('retains the last view through transient failure and retries on the next tick', async () => {
    const p = mountPortal()
    p.signIn()
    await vi.advanceTimersByTimeAsync(0)
    p.fetch.mockRejectedValueOnce(new Error('dummy network failure'))
    await vi.advanceTimersByTimeAsync(15000)
    expect(p.entries).toHaveLength(1)
    expect(p.window.location.assign).not.toHaveBeenCalled()
    p.replaceRecords([])
    await vi.advanceTimersByTimeAsync(15000)
    expect(p.entries).toEqual([])
})

it('deduplicates in-flight refreshes and aborts/ignores their results after sign-out', async () => {
    const p = mountPortal()
    const pending = []
    p.fetch.mockImplementation(url => new Promise(resolve => pending.push({ url, resolve })))
    p.signIn()
    await vi.advanceTimersByTimeAsync(0)
    p.window.dispatchEvent(new Event('focus'))
    p.window.dispatchEvent(new Event('online'))
    expect(p.fetch).toHaveBeenCalledTimes(2)
    const signal = p.fetch.mock.calls[0][1].signal
    p.signOut()
    expect(signal.aborted).toBe(true)
    for (const { url, resolve } of pending) resolve(Response.json(url.startsWith('/api/entries') ? [{ id: 'stale' }] : { wedding: { brideName: 'Stale' } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(p.entries).toBeNull()
    expect(p.wedding).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(p.window.location.assign).toHaveBeenCalledWith('/login')
})

it('cleans up timers/listeners on unmount and discards late requests', async () => {
    const p = mountPortal()
    p.signIn()
    await vi.advanceTimersByTimeAsync(0)
    const calls = p.fetch.mock.calls.length
    p.cleanup()
    await vi.advanceTimersByTimeAsync(30000)
    p.window.dispatchEvent(new Event('focus'))
    p.document.dispatchEvent(new Event('visibilitychange'))
    expect(p.fetch).toHaveBeenCalledTimes(calls)
    expect(p.unsubscribe).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
})

it('clears private data if polling reports that ownership access was lost', async () => {
    const p = mountPortal()
    p.signIn()
    await vi.advanceTimersByTimeAsync(0)
    p.fetch.mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }))
    await vi.advanceTimersByTimeAsync(15000)
    expect(p.entries).toBeNull()
    expect(p.wedding).toBeNull()
    expect(p.window.location.assign).toHaveBeenCalledWith('/login')
})
