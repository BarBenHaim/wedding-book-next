'use client'

// AlbumScene — paints one composed page.
//
// Everything interesting already happened in albumScene.js: this
// component receives a flat, ordered list of layers with resolved
// geometry and resolved style, and draws them. It makes no design
// decisions, which is what lets the print export and the screen preview
// share a single source of truth about what a page looks like.
//
// Print shaped the markup, as it did in AlbumPage. html2canvas has no
// masks, no blur and no blend modes, so none appear here: a fade is a
// gradient div over the photo, and a colour wash is a gradient div
// behind it. Transforms it does handle, so rotation is allowed.

import { getLanguage } from '@/lib/albumLanguages'

export default function AlbumScene({
    scene,
    languageId = 'editorial',
    width = 520,
    height = 520,
    unit = 1000,
}) {
    const lang = getLanguage(languageId)
    const k = width / unit
    const layers = scene?.layers || []

    return (
        <div
            style={{
                position: 'relative',
                width,
                height,
                background: lang.paper,
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            {layers.map((L, i) => {
                if (L.type === 'paper') {
                    return <div key={i} style={{ position: 'absolute', inset: 0, ...L.style }} />
                }

                if (L.type === 'wallpaper' || L.type === 'ambient') {
                    return <div key={i} style={{ position: 'absolute', inset: 0, ...L.style }} />
                }

                if (L.type === 'ornament') {
                    return (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            key={i}
                            src={L.url}
                            alt=""
                            draggable={false}
                            style={{
                                position: 'absolute',
                                left: L.x * k,
                                top: L.y * k,
                                width: L.w * k,
                                height: L.h * k,
                                transform: L.rotate ? `rotate(${L.rotate}deg)` : undefined,
                                pointerEvents: 'none',
                            }}
                        />
                    )
                }

                if (L.type === 'photo') {
                    // The wrapper is NOT given a width. Its padding plus the
                    // photo's own box decide its size, which is the only way
                    // an asymmetric mat (a card's deeper bottom edge) comes
                    // out right without the geometry knowing about it.
                    return (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                left: (L.x - (L.framePad?.x || 0)) * k,
                                top: (L.y - (L.framePad?.y || 0)) * k,
                                transform: L.rotate ? `rotate(${L.rotate}deg)` : undefined,
                                transformOrigin: 'center center',
                                lineHeight: 0,
                                ...(L.frameStyle || {}),
                                ...(L.frameStyle ? scalePadding(L.frameStyle, k) : {}),
                            }}
                        >
                            <div style={{ position: 'relative', width: L.w * k, height: L.h * k }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={L.photo?.url}
                                    alt=""
                                    draggable={false}
                                    crossOrigin="anonymous"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        height: '100%',
                                        // fill is safe here for the same reason it is
                                        // safe in AlbumPage: the box was derived from
                                        // this photo's aspect ratio, so filling it
                                        // cannot distort. `crops` is true only for an
                                        // ambient layer, which is scenery by design.
                                        objectFit: L.crops ? 'cover' : 'fill',
                                        ...(L.photoStyle || {}),
                                    }}
                                />
                                {(L.overlays || []).map((o, j) => (
                                    <div key={j} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...o }} />
                                ))}
                            </div>
                        </div>
                    )
                }

                if (L.type === 'title') {
                    const align = L.align === 'center' ? 'center' : L.align === 'end' ? 'left' : 'right'
                    return (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                left: L.align === 'center' ? 0 : L.x * k,
                                right: L.align === 'center' ? 0 : undefined,
                                top: L.y * k,
                                transform: 'translateY(-50%)',
                                textAlign: align,
                                whiteSpace: 'nowrap',
                                ...L.style,
                                fontSize: `${parseFloat(L.style.fontSize) * k}px`,
                            }}
                        >
                            {L.text}
                        </div>
                    )
                }

                return null
            })}
        </div>
    )
}

/** Frame paddings are authored at page scale; the preview is smaller. */
function scalePadding(frameStyle, k) {
    const p = String(frameStyle.padding || '')
    if (!p) return {}
    return { padding: p.replace(/([\d.]+)px/g, (_, n) => `${(parseFloat(n) * k).toFixed(2)}px`) }
}
