'use client'

// AlbumPage — draws one planned album page.
//
// The component is deliberately dumb. Every rectangle was decided by
// albumLayout.js in abstract units, and all this does is scale those
// units to the box it was given and paint them. That separation is what
// lets the same plan drive the screen preview and the print export: two
// different render passes, one source of geometry, no chance of them
// disagreeing about where a photograph goes.
//
// Print constraints shaped the markup. html2canvas rasterises this for
// the PDF, and it does not implement filters, blend modes or transforms
// faithfully — so there are none here. Plain absolutely-positioned
// <img> elements with object-fit: fill, which is safe precisely BECAUSE
// the box was already solved to the photo's own aspect ratio: filling a
// box that is already the right shape cannot distort anything.

import { getAlbumPreset } from '@/lib/albumPresets'

export default function AlbumPage({
    page,
    presetId = 'magazine',
    width = 520,
    height = 520,
    unit = 1000,
    pageNumber = null,
    showFolio = true,
}) {
    const preset = getAlbumPreset(presetId)
    // The engine works in `unit`-wide abstract space; everything below
    // is that space mapped onto the box this component was handed.
    const k = width / unit
    const ky = height / (unit * (height / width) || unit)
    void ky

    const items = page?.items || []

    return (
        <div
            style={{
                position: 'relative',
                width,
                height,
                background: preset.pageBg,
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            {items.map((it, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    key={it.photo?.id || i}
                    src={it.photo?.url}
                    alt=''
                    draggable={false}
                    crossOrigin='anonymous'
                    style={{
                        position: 'absolute',
                        left: it.x * k,
                        top: it.y * k,
                        width: it.width * k,
                        height: it.height * k,
                        // fill, not cover: the box IS the photo's aspect
                        // ratio, so there is nothing to crop and nothing
                        // to letterbox. cover here would silently start
                        // cropping the moment a rounding error crept in.
                        objectFit: 'fill',
                        display: 'block',
                        borderRadius: preset.photo.radius,
                        border: preset.photo.border || 'none',
                        boxShadow: preset.photo.shadow === 'none' ? 'none' : preset.photo.shadow,
                        background: preset.pageBg,
                    }}
                />
            ))}

            {showFolio && preset.folio.show && pageNumber != null && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: height * 0.035,
                        textAlign: 'center',
                        color: preset.muted,
                        fontSize: Math.max(7, height * (preset.folio.size / 100)),
                        letterSpacing: preset.folio.letterSpacing,
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {pageNumber}
                </div>
            )}
        </div>
    )
}
