import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cssImageUrls, downloadPageBlob, pageDownloadFilename, pagePhotoSources, waitForPageTask } from '@/lib/bookPageDownload'
import { expandBookPages } from '@/lib/bookPages'

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const viewer = source('src/app/wedding/[weddingId]/viewer/page.js')
const hook = source('src/components/BookPageDownload/useBookPageDownload.jsx')
const button = source('src/components/BookPageDownload/BookPageDownloadButton.jsx')
const capture = source('src/lib/bookPageDownload.js')

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('one rendered viewer page', () => {
    it('distinguishes split halves without mapping them back to one entry', () => {
        const pages = expandBookPages([{ id: 'guest', text: 'long', imageUrl: '/photo.jpg', forceSplit: true }])
        expect(pages).toHaveLength(2)
        expect(pagePhotoSources(pages[0])).toEqual([])
        expect(pagePhotoSources(pages[1])).toEqual(['/photo.jpg'])
        expect(pageDownloadFilename('test', 0)).toBe('test-viewer-page-0001.jpg')
        expect(pageDownloadFilename('test', 1)).toBe('test-viewer-page-0002.jpg')
    })
    it('warms every photo on a duo, photo pair or composed page', () => {
        const pair = [{ imageUrl: '/a.jpg' }, { imageUrl: '/b.jpg' }]
        for (const page of [{ _duo: pair }, { _photoPair: pair }, { _composed: { entries: pair } }]) {
            expect(pagePhotoSources(page)).toEqual(['/a.jpg', '/b.jpg'])
        }
        expect(pagePhotoSources({ _duo: [pair[0], pair[0], null] })).toEqual(['/a.jpg'])
    })
    it('accepts blanks and empty pages without inventing a photo', () => {
        expect(pagePhotoSources({ kind: 'blank', pageStyle: { backgroundUrl: '/background.jpg' } })).toEqual([])
        expect(pagePhotoSources(null)).toEqual([])
    })
    it('keeps filenames filesystem-safe, bounded, and explicitly viewer-numbered', () => {
        expect(pageDownloadFilename('../bad/name?', 42)).toBe('___bad_name_-viewer-page-0043.jpg')
        expect(pageDownloadFilename('a'.repeat(100), 0).split('-viewer')[0]).toHaveLength(80)
        expect(pageDownloadFilename(null, 0)).toBe('book-viewer-page-0001.jpg')
    })
    it('reads CSS images, including layered surfaces and URLs containing parentheses', () => {
        expect(cssImageUrls('linear-gradient(red, blue), url("https://a.test/p(1).jpg"), url(\'/b.png\'), url(/c.png)')).toEqual(['https://a.test/p(1).jpg', '/b.png', '/c.png'])
        expect(cssImageUrls('none')).toEqual([])
        expect(cssImageUrls()).toEqual([])
    })
})

describe('bounded readiness and download cleanup', () => {
    it('passes success and failures through', async () => {
        expect(await waitForPageTask(Promise.resolve(7))).toBe(7)
        await expect(waitForPageTask(Promise.reject(new Error('broken')))).rejects.toThrow('broken')
    })
    it('does not hang on a missing image or font', async () => {
        vi.useFakeTimers()
        const pending = waitForPageTask(new Promise(() => {}), undefined, 100)
        const assertion = expect(pending).rejects.toThrow('timed out')
        await vi.advanceTimersByTimeAsync(100)
        await assertion
        expect(vi.getTimerCount()).toBe(0)
    })
    it('cancels promptly, including an already-aborted signal', async () => {
        const controller = new AbortController()
        const pending = waitForPageTask(new Promise(() => {}), controller.signal)
        controller.abort()
        await expect(pending).rejects.toHaveProperty('name', 'AbortError')
        await expect(waitForPageTask(Promise.resolve(), controller.signal)).rejects.toHaveProperty('name', 'AbortError')
    })
    it.each([false, true])('removes the anchor and revokes its URL even if click fails (%s)', async fails => {
        vi.useFakeTimers()
        const link = { click: vi.fn(() => { if (fails) throw new Error('blocked') }), remove: vi.fn() }
        vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } })
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
        if (fails) expect(() => downloadPageBlob(new Blob(['jpeg']), 'one.jpg')).toThrow('blocked')
        else downloadPageBlob(new Blob(['jpeg']), 'one.jpg')
        expect(link.download).toBe('one.jpg')
        expect(link.remove).toHaveBeenCalledOnce()
        expect(revoke).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(60000)
        expect(revoke).toHaveBeenCalledWith('blob:download')
    })
})

describe('viewer integration boundaries', () => {
    it('gates the action and hook with the existing admin permission', () => {
        expect(viewer).toContain("enabled: isAdmin && mode === 'book'")
        expect(viewer).toMatch(/\{isAdmin && \(\s*<BookPageDownloadButton/)
        expect(hook).toContain('if (!enabled || locked.current')
    })
    it('passes the actual expanded entry, index, locale and preview geometry', () => {
        expect(viewer).toContain('displayPages.map((entry, pageIndex)')
        expect(viewer).toContain('entry, styleSettings: styleWithLocale, index: pageIndex')
        expect(viewer).toContain('weddingId, width: viewerSize, height: viewerSize, locale')
        expect(hook).toContain('entry={request.entry} styleSettings={request.styleSettings}')
        expect(hook).not.toContain('expandBookPages')
        expect(hook).not.toContain('entryIdsOnPage')
    })
    it('isolates pointer, mouse, touch and keyboard actions from page turns', () => {
        for (const event of ['PointerDownCapture', 'MouseDownCapture', 'MouseUpCapture', 'TouchStartCapture', 'TouchEndCapture', 'PointerDown', 'MouseDown', 'MouseUp', 'TouchStart', 'TouchEnd', 'KeyDown', 'KeyUp']) {
            expect(button).toContain(`on${event}={stop}`)
        }
        expect(button).toContain('if (!disabled) onClick()')
        expect(button).toContain('min-h-11 min-w-11')
    })
    it('downloads locally, lazily loads capture, and prevents canvas taint', () => {
        expect(capture).toContain("import('html2canvas')")
        expect(capture).toContain('allowTaint: false')
        expect(capture).toContain('prepared.onclone(clonedDocument, clone)')
        expect(capture).not.toMatch(/uploadBytes|create-order|jsPDF/)
        expect(hook).toContain('return () => controller.abort()')
    })
})

describe('clean high-resolution capture', () => {
    function node({ src, background = 'none', text = '', id = null } = {}) {
        const attrs = new Map(id === null ? [] : [['data-page-download-node', id]])
        return {
            tagName: src ? 'IMG' : 'DIV', src, currentSrc: src,
            childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
            style: {}, computed: { backgroundImage: background, fontStyle: 'normal', fontWeight: '400', fontFamily: 'TestFont' },
            getAttribute: key => attrs.get(key) ?? null,
            setAttribute: (key, value) => attrs.set(key, value),
            removeAttribute: key => attrs.delete(key),
        }
    }
    function setup({ image = true, fontCheck = true } = {}) {
        const photo = node({ src: 'https://assets.test/photo.jpg' })
        const element = node({ background: 'url("https://assets.test/background.jpg")', text: 'שלום Hello' })
        element.ownerDocument = { fonts: { load: vi.fn().mockResolvedValue([{ status: 'loaded' }]), check: vi.fn(() => fontCheck) } }
        element.isConnected = true
        element.querySelectorAll = () => image ? [photo] : []
        element.getBoundingClientRect = () => ({ width: 300, height: 300 })
        vi.stubGlobal('getComputedStyle', item => item.computed)
        vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 })
        vi.stubGlobal('requestAnimationFrame', callback => callback())
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }))
        vi.stubGlobal('Image', class { naturalWidth = 40; naturalHeight = 60; decode() { return Promise.resolve() } })
        let n = 0
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:asset-${n++}`)
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
        const canvas = { width: 2400, height: 2400, toBlob: vi.fn(callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' }))) }
        const render = vi.fn().mockResolvedValue(canvas)
        return { element, photo, canvas, render, revoke }
    }

    it('keeps displayed geometry, renders 2400px, verifies both image and CSS assets, and releases memory', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, photo, canvas, render, revoke } = setup()
        const blob = await capturePageJpeg(element, { renderCanvas: render })
        expect(blob.type).toBe('image/jpeg')
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://assets.test/background.jpg', 'https://assets.test/photo.jpg'])
        expect(fetch.mock.calls[0][1]).toMatchObject({ mode: 'cors', credentials: 'same-origin' })
        expect(render.mock.calls[0][1]).toMatchObject({ scale: 8, width: 300, height: 300, windowWidth: 1200, windowHeight: 800, useCORS: true, allowTaint: false })
        expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95)
        expect(canvas.width).toBe(0)
        expect(canvas.height).toBe(0)
        expect(revoke).toHaveBeenCalledTimes(2)
        expect(element.getAttribute('data-page-download-node')).toBeNull()
        expect(photo.getAttribute('data-page-download-node')).toBeNull()
    })

    it('uses stable clone markers rather than child positions when pseudo nodes are inserted', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, canvas } = setup()
        const clonedPhoto = node({ src: 'https://assets.test/photo.jpg', id: '1' })
        const clone = node()
        clone.querySelector = selector => selector === '[data-page-download-node="1"]' ? clonedPhoto : null
        const renderCanvas = async (_element, options) => {
            options.onclone({}, clone)
            expect(clone.style.backgroundImage).toBe('url("blob:asset-0")')
            expect(clonedPhoto.src).toBe('blob:asset-1')
            expect(clonedPhoto.loading).toBe('eager')
            return canvas
        }
        await capturePageJpeg(element, { renderCanvas })
    })

    it('fails visibly before rendering when a source rejects CORS', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, render } = setup()
        fetch.mockRejectedValue(new TypeError('Failed to fetch'))
        await expect(capturePageJpeg(element, { renderCanvas: render })).rejects.toThrow('Failed to fetch')
        expect(render).not.toHaveBeenCalled()
        expect(element.getAttribute('data-page-download-node')).toBeNull()
    })

    it('does not accept a failed font as ready', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, render } = setup({ fontCheck: false })
        await expect(capturePageJpeg(element, { renderCanvas: render })).rejects.toThrow('font unavailable')
        expect(render).not.toHaveBeenCalled()
    })

    it('rejects null encoding and still releases resources', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, canvas, render, revoke } = setup()
        canvas.toBlob.mockImplementation(callback => callback(null))
        await expect(capturePageJpeg(element, { renderCanvas: render })).rejects.toThrow('encoding failed')
        expect(revoke).toHaveBeenCalledTimes(2)
        expect(canvas.width).toBe(0)
    })

    it('rejects a late result after cancellation and releases resources', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, canvas, revoke } = setup()
        const controller = new AbortController()
        const renderCanvas = async () => { controller.abort(); return canvas }
        await expect(capturePageJpeg(element, { signal: controller.signal, renderCanvas })).rejects.toHaveProperty('name', 'AbortError')
        expect(canvas.toBlob).not.toHaveBeenCalled()
        expect(revoke).toHaveBeenCalledTimes(2)
        expect(canvas.width).toBe(0)
    })
    it('cancels a hung render promptly and only removes its own iframe', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, canvas, revoke } = setup()
        const otherFrame = { remove: vi.fn(), contentDocument: { querySelector: () => element } }
        const ownFrame = { remove: vi.fn(), contentDocument: { querySelector: () => null } }
        const frames = [otherFrame]
        element.ownerDocument.querySelectorAll = () => frames
        const controller = new AbortController()
        let resolveRender
        let signalStarted
        const started = new Promise(resolve => { signalStarted = resolve })
        const renderCanvas = () => {
            frames.push(ownFrame)
            signalStarted()
            return new Promise(resolve => { resolveRender = resolve })
        }
        const pending = capturePageJpeg(element, { signal: controller.signal, renderCanvas })
        await started
        controller.abort()
        await expect(pending).rejects.toHaveProperty('name', 'AbortError')
        expect(ownFrame.remove).toHaveBeenCalled()
        expect(otherFrame.remove).not.toHaveBeenCalled()
        expect(revoke).toHaveBeenCalledTimes(2)
        resolveRender(canvas)
        await Promise.resolve()
        expect(canvas.width).toBe(0)
        expect(canvas.toBlob).not.toHaveBeenCalled()
    })

    it('times out an indefinitely pending renderer and releases assets', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, revoke } = setup()
        vi.useFakeTimers()
        const pending = capturePageJpeg(element, { renderCanvas: () => new Promise(() => {}) })
        const assertion = expect(pending).rejects.toThrow('timed out')
        await vi.advanceTimersByTimeAsync(30000)
        await assertion
        expect(revoke).toHaveBeenCalledTimes(2)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('excludes unrelated body content but keeps page ancestors and styles', async () => {
        const { capturePageJpeg } = await import('@/lib/bookPageDownload')
        const { element, canvas } = setup()
        const descendant = { tagName: 'IMG', contains: () => false }
        element.contains = item => item === descendant
        const ancestor = { contains: () => true }
        const unrelated = { tagName: 'DIV', contains: () => false }
        const stylesheet = { tagName: 'STYLE', contains: () => false }
        await capturePageJpeg(element, { renderCanvas: async (_element, options) => {
            expect(options.ignoreElements(element)).toBe(false)
            expect(options.ignoreElements(descendant)).toBe(false)
            expect(options.ignoreElements(ancestor)).toBe(false)
            expect(options.ignoreElements(stylesheet)).toBe(false)
            expect(options.ignoreElements(unrelated)).toBe(true)
            return canvas
        } })
    })

})
