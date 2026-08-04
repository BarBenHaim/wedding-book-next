// src/components/FramedPhoto/FramedPhoto.jsx
//
// EntryPhoto + the preset's photo-frame treatment (layer 4 of the
// preset architecture). Three modes:
//
//   • bare        — no frame: EntryPhoto exactly as before.
//   • built-in    — code-drawn mats/rings/ornaments (photoFrame id,
//                   registry in src/lib/photoFrames.js) incl. corner
//                   flourishes, arch windows, gallery depth, tapes.
//   • overlay     — an uploaded PNG/SVG with a transparent window
//                   (photoFrameUrl): the photo insets by
//                   photoFrameInset% and the artwork stretches over
//                   the full slot.
//
// In every mode the FOOTPRINT stays the slot width the layout allotted
// (imageStyle.width): chrome eats inward, so page composition —
// margins, centering — is untouched. Shared by the classic template
// and the DuoPageLayout; plain CSS/SVG, so print renders identically.

'use client'

import EntryPhoto from '../EntryPhoto/EntryPhoto'
import { photoFrameGeometry, photoOverlayGeometry } from '@/lib/photoFrames'
import useImageAspect from '@/lib/useImageAspect'

// One gold corner flourish — an L-bracket with a soft curl. Rendered
// four times (rotated) for the 'corner-flourish' frame.
function Corner({ size, stroke, color, rotate, pos }) {
    return (
        <svg
            viewBox='0 0 24 24'
            width={size}
            height={size}
            style={{ position: 'absolute', ...pos, transform: `rotate(${rotate}deg)`, pointerEvents: 'none' }}
        >
            <path
                d='M2 14 L2 5 Q2 2 5 2 L14 2'
                fill='none'
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap='round'
            />
            <path
                d='M5.5 8.5 Q4 6 6.5 5 Q9 4.2 8.5 6.8'
                fill='none'
                stroke={color}
                strokeWidth={Math.max(0.8, stroke * 0.7)}
                strokeLinecap='round'
                opacity='0.85'
            />
        </svg>
    )
}

export default function FramedPhoto({
    src,
    slotW, // full footprint width in px (imageStyle.width resolved)
    slotH = null, // explicit slot height (smart album: slotW / imgAspect)
    frameId = null,
    frameUrl = null,
    frameInset = 6,
    objectPosition = 'center',
    rotation = 0,
    photoRadius = '12px', // bare-photo fallback radius
    fit = 'cover', // 'contain' = album mode, never crop (taller slot)
    // No-crop sizing inputs. `aspect` is the entry's stored imgAspect when
    // it has one; legacy entries pass null and the real aspect is measured
    // from the bitmap (see useImageAspect). `maxSlotH` caps how tall a
    // portrait photo may grow before it is scaled down to fit the page.
    aspect = null,
    maxSlotH = null,
    style = {},
    placeholder = false, // picker previews: a gradient block instead of <img>
}) {
    // ── No-crop ("album") sizing ──────────────────────────────────────
    // With fit='contain' the photo is never cropped regardless of what we
    // know about it. Resolving the aspect lets the SLOT match the photo,
    // so a portrait photo gets a portrait-shaped frame instead of sitting
    // in a 4:3 window with empty bars on both sides. Until the aspect is
    // known (or if it never resolves) we fall back to the previous
    // behaviour, which still shows the whole photo.
    const noCrop = fit === 'contain'
    // Rotation swaps which edge is "wide": a 90°/270° photo shows its
    // stored aspect inverted, so the slot must invert too or a rotated
    // portrait would be framed as a landscape.
    const rot = (((Number(rotation) || 0) % 360) + 360) % 360
    const measured = useImageAspect(placeholder ? null : src, aspect, noCrop)
    const effAspect = measured ? (rot === 90 || rot === 270 ? 1 / measured : measured) : null

    // Slot geometry: an explicit slotH from the caller always wins (the
    // smart-album pair page computes its own column boxes). Otherwise
    // derive it from the resolved aspect, shrinking the width when a tall
    // photo would overflow maxSlotH so the photo stays fully on the page.
    let boxW = slotW
    let boxH = slotH
    if (noCrop && boxH == null && effAspect) {
        boxH = boxW / effAspect
        if (Number.isFinite(maxSlotH) && maxSlotH > 0 && boxH > maxSlotH) {
            boxH = maxSlotH
            boxW = boxH * effAspect
        }
    }
    // The window aspect handed to the frame geometry helpers. Cover keeps
    // the 4:3 lock; contain follows the photo (or 4:3 until measured).
    const windowAspect = noCrop && effAspect ? effAspect : 4 / 3

    const photoEl = (w, h, radius) =>
        placeholder ? (
            <div
                style={{
                    width: w,
                    height: h,
                    borderRadius: radius,
                    background: 'linear-gradient(135deg, #d8cdbb 0%, #b9ab93 100%)',
                }}
            />
        ) : (
            <EntryPhoto
                src={src}
                // Without this the framed + overlay modes always cropped:
                // `fit` was honoured only on the bare path, so turning
                // no-crop on had no effect on any preset with a photo frame.
                fit={fit}
                maxWidth={w}
                maxHeight={h}
                objectPosition={objectPosition}
                rotation={rotation}
                className='relative'
                style={{ borderRadius: radius }}
            />
        )

    // ── Uploaded overlay frame — wins when present ────────────────────
    if (frameUrl) {
        const geo = photoOverlayGeometry(boxW, frameInset, windowAspect)
        return (
            <div style={{ width: boxW, height: geo.slotH, position: 'relative', ...style }}>
                <div style={{ position: 'absolute', top: geo.inset, left: geo.inset }}>
                    {photoEl(geo.photoW, geo.photoH, Math.max(2, geo.inset * 0.3))}
                </div>
                <img
                    src={frameUrl}
                    alt=''
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        objectFit: 'fill',
                    }}
                />
            </div>
        )
    }

    const geo = photoFrameGeometry(frameId, boxW, windowAspect)

    // ── Bare photo — unchanged classic behavior ───────────────────────
    if (!geo) {
        return (
            <EntryPhoto
                src={src}
                fit={fit}
                maxWidth={boxW}
                maxHeight={boxH ?? boxW * (fit === 'contain' ? 1.15 : 0.75)}
                objectPosition={objectPosition}
                rotation={rotation}
                className='relative'
                style={{ borderRadius: photoRadius, ...style }}
            />
        )
    }

    // ── Built-in frame ────────────────────────────────────────────────
    const ex = geo.extras || {}
    return (
        <div style={{ ...geo.matStyle, ...style }}>
            <div style={geo.innerStyle}>
                <div style={{ position: 'relative', lineHeight: 0 }}>
                    {photoEl(geo.photoW, geo.photoH, geo.photoRadius)}

                    {/* Gallery-depth: a cut-mat inner shadow over the window */}
                    {ex.windowShadow && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                borderRadius: geo.photoRadius,
                                boxShadow: 'inset 0 2px 7px rgba(40,28,10,0.4), inset 0 0 2px rgba(40,28,10,0.32)',
                                pointerEvents: 'none',
                            }}
                        />
                    )}

                    {/* Soft vignette inside the photo edges */}
                    {ex.vignette && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                borderRadius: geo.photoRadius,
                                background:
                                    'radial-gradient(ellipse 78% 78% at 50% 48%, rgba(0,0,0,0) 62%, rgba(40,28,10,0.32) 100%)',
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Corner flourishes — four rotated gold brackets */}
            {geo.corner && (
                <>
                    <Corner size={geo.corner.size} stroke={geo.corner.stroke} color={geo.corner.color} rotate={0} pos={{ top: 0, left: 0 }} />
                    <Corner size={geo.corner.size} stroke={geo.corner.stroke} color={geo.corner.color} rotate={90} pos={{ top: 0, right: 0 }} />
                    <Corner size={geo.corner.size} stroke={geo.corner.stroke} color={geo.corner.color} rotate={270} pos={{ bottom: 0, left: 0 }} />
                    <Corner size={geo.corner.size} stroke={geo.corner.stroke} color={geo.corner.color} rotate={180} pos={{ bottom: 0, right: 0 }} />
                </>
            )}

            {/* Washi tapes over the top corners (craft album) */}
            {ex.tapes && (
                <>
                    <div
                        style={{
                            position: 'absolute',
                            top: -Math.max(3, boxW * 0.012),
                            left: boxW * 0.1,
                            width: boxW * 0.2,
                            height: Math.max(8, boxW * 0.055),
                            background: ex.tapes.color,
                            transform: 'rotate(-8deg)',
                            borderRadius: 1,
                            boxShadow: '0 1px 3px rgba(60,44,20,0.18)',
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: -Math.max(3, boxW * 0.012),
                            right: boxW * 0.1,
                            width: boxW * 0.2,
                            height: Math.max(8, boxW * 0.055),
                            background: ex.tapes.color,
                            transform: 'rotate(7deg)',
                            borderRadius: 1,
                            boxShadow: '0 1px 3px rgba(60,44,20,0.18)',
                            pointerEvents: 'none',
                        }}
                    />
                </>
            )}
        </div>
    )
}
