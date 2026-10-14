// Download one already-expanded viewer page. This is deliberately independent
// of print pagination/numbering and never uploads or submits a print order.
export const PAGE_DOWNLOAD_PIXELS = 2400
export const PAGE_DOWNLOAD_QUALITY = 0.95
const ASSET_TIMEOUT_MS = 15000
const RENDER_TIMEOUT_MS = 30000
const CSS_IMAGE_PROPERTIES = ['backgroundImage', 'borderImageSource', 'maskImage', 'webkitMaskImage']
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g

export function pageDownloadFilename(weddingId, index) {
    const id = String(weddingId || 'book').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'book'
    // Viewer array order, NOT the separately numbered Picabook print order.
    return `${id}-viewer-page-${String(index + 1).padStart(4, '0')}.jpg`
}

export function pagePhotoSources(page) {
    const entries = page?._duo || page?._photoPair || page?._composed?.entries || [page]
    return [...new Set(entries.map(entry => entry?.imageUrl).filter(Boolean))]
}

export function cssImageUrls(value = '') {
    return [...value.matchAll(CSS_URL)].map(match => match[1] ?? match[2] ?? match[3]).filter(Boolean)
}

export function waitForPageTask(promise, signal, timeoutMs = ASSET_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const abort = () => finish(reject, new DOMException('Page download cancelled', 'AbortError'))
        const timer = setTimeout(() => finish(reject, new Error('Page asset timed out')), timeoutMs)
        const finish = (settle, value) => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', abort)
            settle(value)
        }
        if (signal?.aborted) return abort()
        signal?.addEventListener('abort', abort, { once: true })
        Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error))
    })
}

async function settleLayout(signal) {
    await waitForPageTask(new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), signal)
}

async function waitForFonts(element, signal) {
    const fonts = element.ownerDocument.fonts
    if (!fonts) return
    const used = new Map()
    for (const node of [element, ...element.querySelectorAll('*')]) {
        const text = [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').trim()
        if (!text) continue
        const style = getComputedStyle(node)
        const font = `${style.fontStyle} ${style.fontWeight} 16px ${style.fontFamily}`
        used.set(font, (used.get(font) || '') + text)
    }
    // fonts.ready also resolves on font failure. Load/check only the faces and
    // glyphs actually used by this page so a failed font cannot silently export.
    await waitForPageTask(Promise.all([...used].map(async ([font, text]) => {
        const faces = await fonts.load(font, text)
        if (faces.some(face => face.status !== 'loaded') || !fonts.check(font, text)) {
            throw new Error('Page font unavailable')
        }
    })), signal)
}

async function prepareAssets(element, signal) {
    const nodes = [element, ...element.querySelectorAll('*')]
    const urls = new Set()
    // html2canvas inserts pseudo-element nodes into its clone, so descendant
    // positions are not stable. Mark only this hidden capture tree for mapping.
    const previousIds = nodes.map(node => node.getAttribute('data-page-download-node'))
    nodes.forEach((node, index) => node.setAttribute('data-page-download-node', String(index)))
    const styles = nodes.map(node => {
        if (node.tagName === 'IMG') {
            const src = node.currentSrc || node.src
            if (src) urls.add(src)
        }
        const computed = getComputedStyle(node)
        return Object.fromEntries(CSS_IMAGE_PROPERTIES.map(property => {
            const value = computed[property] || ''
            cssImageUrls(value).forEach(url => urls.add(url))
            return [property, value]
        }))
    })
    const replacements = new Map()
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal?.aborted) abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, ASSET_TIMEOUT_MS)
    const cleanup = () => {
        controller.abort()
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        replacements.forEach(url => URL.revokeObjectURL(url))
        nodes.forEach((node, index) => {
            if (previousIds[index] === null) node.removeAttribute('data-page-download-node')
            else node.setAttribute('data-page-download-node', previousIds[index])
        })
    }
    try {
        // Fetch the assets the rendered page actually uses, including CSS
        // backgrounds (EntryPhoto's normal rendering path), textures and frames.
        // CORS failures are errors, not a successful JPG with missing photos.
        await Promise.all([...urls].map(async src => {
            const response = await fetch(src, { mode: 'cors', credentials: 'same-origin', signal: controller.signal })
            if (!response.ok) throw new Error('Page image unavailable')
            const blob = await response.blob()
            controller.signal.throwIfAborted()
            const url = URL.createObjectURL(blob)
            replacements.set(src, url)
            const image = new Image()
            image.src = url
            await waitForPageTask(image.decode(), controller.signal)
            if (!image.naturalWidth || !image.naturalHeight) throw new Error('Page image is empty')
        }))
        clearTimeout(timer)
        return {
            cleanup,
            onclone(_document, clone) {
                // Use the verified bytes in the clone. A second request can
                // silently fail in html2canvas, especially same-origin redirects
                // to Storage. Blob URLs also avoid tainting the canvas.
                nodes.forEach((node, index) => {
                    const target = index === 0 ? clone : clone.querySelector(`[data-page-download-node="${index}"]`)
                    if (!target) return
                    if (node.tagName === 'IMG') {
                        const url = replacements.get(node.currentSrc || node.src)
                        if (url) {
                            target.removeAttribute('srcset')
                            target.src = url
                            target.loading = 'eager'
                        }
                    }
                    for (const [property, value] of Object.entries(styles[index])) {
                        if (!cssImageUrls(value).length) continue
                        target.style[property] = value.replace(CSS_URL, (match, quoted, single, bare) => {
                            const url = replacements.get(quoted ?? single ?? bare)
                            return url ? `url("${url}")` : match
                        })
                    }
                })
            },
        }
    } catch (error) {
        cleanup()
        // Distinguish a user/navigation cancellation from our asset deadline.
        if (!signal?.aborted && error?.name === 'AbortError') throw new Error('Page asset timed out')
        throw error
    }
}

export async function capturePageJpeg(element, { signal, renderCanvas } = {}) {
    if (!element?.isConnected) throw new Error('Page capture unavailable')
    let prepared
    let canvas
    let finished = false
    const document = element.ownerDocument
    const ownedFrames = new Set()
    const captureFrames = () => [...(document.querySelectorAll?.('iframe.html2canvas-container') || [])]
    // Track iframe identity, not markers in cloned content: a parallel PDF
    // clones the entire page too and would contain the same hidden stage.
    const cleanCaptureFrames = () => ownedFrames.forEach(frame => frame.remove())
    const releaseCanvas = result => { if (result) result.width = result.height = 0 }
    try {
        await waitForFonts(element, signal)
        prepared = await prepareAssets(element, signal)
        await settleLayout(signal)
        signal?.throwIfAborted()
        const { width, height } = element.getBoundingClientRect()
        if (!(width > 0 && height > 0)) throw new Error('Page capture is empty')
        const html2canvas = renderCanvas || (await waitForPageTask(import('html2canvas'), signal, RENDER_TIMEOUT_MS)).default
        signal?.throwIfAborted()
        const framesBefore = new Set(captureFrames())
        const render = Promise.resolve(html2canvas(element, {
            scale: PAGE_DOWNLOAD_PIXELS / Math.max(width, height),
            width,
            height,
            // Preserve the viewport/media queries of the page being viewed.
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            imageTimeout: ASSET_TIMEOUT_MS,
            onclone: (clonedDocument, clone) => {
                const frame = clonedDocument.defaultView?.frameElement
                if (frame?.classList.contains('html2canvas-container')) ownedFrames.add(frame)
                prepared.onclone(clonedDocument, clone)
            },
            // html2canvas clones the whole document and waits for all cloned
            // images/fonts before onclone. Strip unrelated body branches so a
            // stalled photo elsewhere in the book cannot block this page.
            ignoreElements: node => !(
                node === element || node.contains(element) || element.contains(node) ||
                node === document.head || document.head?.contains(node) ||
                node.tagName === 'STYLE' || node.tagName === 'LINK'
            ),
        }))
        // Creation is synchronous before html2canvas first yields. No other
        // export can interleave here, even if it is already running.
        captureFrames().forEach(frame => { if (!framesBefore.has(frame)) ownedFrames.add(frame) })
        // Rendering itself cannot be cancelled by html2canvas. Stop awaiting it
        // promptly on exit/deadline, clean the clone, and free any late result.
        render.then(result => {
            if (finished) { releaseCanvas(result); cleanCaptureFrames() }
            else canvas = result
        }, () => { if (finished) cleanCaptureFrames() })
        canvas = await waitForPageTask(render, signal, RENDER_TIMEOUT_MS)
        signal?.throwIfAborted()
        const blob = await waitForPageTask(new Promise((resolve, reject) => {
            canvas.toBlob(value => value ? resolve(value) : reject(new Error('Page image encoding failed')), 'image/jpeg', PAGE_DOWNLOAD_QUALITY)
        }), signal)
        if (!blob.size) throw new Error('Page image is empty')
        return blob
    } finally {
        finished = true
        prepared?.cleanup()
        cleanCaptureFrames()
        // Release a multi-megapixel canvas promptly on memory-limited phones.
        releaseCanvas(canvas)
    }
}

export function downloadPageBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    try {
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
    } finally {
        link.remove()
        // WebKit can still be consuming the URL after click() returns.
        setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
}
