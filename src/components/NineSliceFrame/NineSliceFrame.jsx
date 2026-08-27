'use client'

// Eight <img> elements, not one line of CSS.
//
// `border-image` does exactly this and is one property. It is also not
// implemented by html2canvas, which is what turns the book into a PDF —
// so a border-image frame would look perfect on every screen and be
// missing from the printed book. That is the wrong failure: the frame
// exists FOR the printed book.
//
// So each of the eight pieces is a clipping box with the whole source
// image inside it, scaled and offset so the right cell lands in view.
// html2canvas renders <img> inside overflow:hidden faithfully, and the
// geometry (see lib/nineSlice.js) is entirely proportional, so nothing
// here depends on the uploaded file's pixel dimensions.

import { nineSlicePieces } from '@/lib/nineSlice'

export default function NineSliceFrame({ src, width, height, slicePct, borderPx, radius = 0 }) {
    const geo = nineSlicePieces({ boxW: width, boxH: height, slicePct, borderPx })
    if (!src || !geo) return null

    return (
        <div
            aria-hidden='true'
            style={{
                position: 'absolute',
                inset: 0,
                // The frame is decoration over a photo the guest may want
                // to tap; it must never be the thing that gets the tap.
                pointerEvents: 'none',
                borderRadius: radius || undefined,
                overflow: radius ? 'hidden' : undefined,
            }}
        >
            {geo.pieces.map(p => (
                <div
                    key={p.key}
                    style={{
                        position: 'absolute',
                        left: p.x,
                        top: p.y,
                        width: p.w,
                        height: p.h,
                        overflow: 'hidden',
                    }}
                >
                    <img
                        src={src}
                        alt=''
                        draggable={false}
                        style={{
                            position: 'absolute',
                            left: p.imgX,
                            top: p.imgY,
                            width: p.imgW,
                            height: p.imgH,
                            // Tailwind's preflight sets img{max-width:100%},
                            // which would silently shrink every piece back
                            // to its clipping box and show the wrong cell.
                            maxWidth: 'none',
                            maxHeight: 'none',
                        }}
                    />
                </div>
            ))}
        </div>
    )
}
