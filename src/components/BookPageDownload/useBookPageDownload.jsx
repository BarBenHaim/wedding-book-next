'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import { measureAspect } from '@/lib/useImageAspect'
import { capturePageJpeg, downloadPageBlob, pageDownloadFilename, pagePhotoSources, waitForPageTask } from '@/lib/bookPageDownload'

export default function useBookPageDownload({ enabled, t }) {
    const [request, setRequest] = useState(null)
    const [message, setMessage] = useState('')
    const [error, setError] = useState(false)
    const locked = useRef(false)
    const stageRef = useRef(null)
    const translate = useRef(t)
    translate.current = t

    const downloadPage = useCallback(({ entry, styleSettings, index, weddingId, width, height, locale }) => {
        if (!enabled || locked.current || !entry || !Number.isInteger(index) || index < 0) return
        locked.current = true // synchronous: two clicks in one render cannot race
        setError(false)
        setMessage(translate.current('pageDownloadPreparing'))
        // These are immutable React state values. Keep this exact displayed
        // object, not its owner entry ID or a freshly expanded print page.
        setRequest({ entry, styleSettings, index, width, height, locale, filename: pageDownloadFilename(weddingId, index) })
    }, [enabled])

    useEffect(() => {
        if (!request) return
        if (!enabled) {
            locked.current = false
            setRequest(null)
            setMessage('')
            return
        }
        const controller = new AbortController()
        const { signal } = controller
        async function run() {
            try {
                // Legacy no-crop photos resize asynchronously. Warm their shared
                // aspect cache and let layout settle before the isolated capture.
                await waitForPageTask(Promise.all(pagePhotoSources(request.entry).map(measureAspect)), signal)
                const blob = await capturePageJpeg(stageRef.current, { signal })
                signal.throwIfAborted()
                downloadPageBlob(blob, request.filename)
                setMessage(translate.current('pageDownloadStarted'))
            } catch (err) {
                if (signal.aborted) return
                setError(true)
                setMessage(translate.current('pageDownloadError'))
            } finally {
                if (!signal.aborted) {
                    locked.current = false
                    setRequest(null)
                }
            }
        }
        run()
        // No late download or state update after leaving the viewer, switching
        // modes or losing the existing admin permission.
        return () => controller.abort()
    }, [request, enabled])

    const captureStage = enabled && request ? (
        <div
            ref={stageRef}
            aria-hidden='true'
            data-book-page-download-stage
            dir={request.locale === 'he' ? 'rtl' : 'ltr'}
            style={{ position: 'fixed', left: -100000, top: 0, width: request.width, height: request.height, overflow: 'hidden', pointerEvents: 'none' }}
        >
            <BookPageTemplate entry={request.entry} styleSettings={request.styleSettings} scaledWidth={request.width} scaledHeight={request.height} />
        </div>
    ) : null

    return { downloadPage, downloading: !!request, downloadingIndex: request?.index, message, error, captureStage }
}
