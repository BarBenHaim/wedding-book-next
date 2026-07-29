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

import EntryPhoto from '../EntryPhoto/EntryPhoto'
import { photoFrameGeometry, photoOverlayGeometry } from '@/lib/photoFrames'

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
    style = {},
    placeholder = false, // picker previews: a gradient block instead of <img>
}) {
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
        const geo = photoOverlayGeometry(slotW, frameInset)
        return (
            <div style={{ width: slotW, height: geo.slotH, position: 'relative', ...style }}>
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

    const geo = photoFrameGeometry(frameId, slotW)

    // ── Bare photo — unchanged classic behavior ───────────────────────
    if (!geo) {
        return (
            <EntryPhoto
                src={src}
                fit={fit}
                maxWidth={slotW}
                maxHeight={slotH ?? slotW * (fit === 'contain' ? 1.15 : 0.75)}
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
                            top: -Math.max(3, slotW * 0.012),
                            left: slotW * 0.1,
                            width: slotW * 0.2,
                            height: Math.max(8, slotW * 0.055),
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
                            top: -Math.max(3, slotW * 0.012),
                            right: slotW * 0.1,
                            width: slotW * 0.2,
                            height: Math.max(8, slotW * 0.055),
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
