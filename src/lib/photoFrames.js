// src/lib/photoFrames.js
//
// Photo-frame system — decorative treatments drawn AROUND the photo
// slot (layer 4 of the preset architecture, see bookDesignSchema.js).
//
// Two kinds of frames:
//
//   1. BUILT-IN (code-drawn) — mats, gold bands, corner flourishes,
//      arched windows, gallery-depth shadows. Pure CSS/SVG, so they
//      scale losslessly from the studio's mini previews to the
//      300-DPI print export. Adding one = a registry entry.
//   2. UPLOADED OVERLAYS — the super-admin uploads a PNG/SVG with a
//      transparent window (stored via the studio, `studio_photo_frames`
//      collection). The photo insets by `photoFrameInset` (% of slot
//      width) and the artwork stretches over the whole slot.
//
// Geometry is expressed as a PERCENT OF THE SLOT WIDTH: the framed
// photo keeps the exact footprint `imageStyle.width` defines — chrome
// eats inward, the photo shrinks inside, page composition is
// untouched.
//
// Spec fields (all optional except id/label):
//   mat        — { padPct, padBottomPct?, color|gradient, radiusPct? }
//   outerRing  — { widthPct, color } border on the mat's outer edge
//   innerRing  — { widthPct, color, gapPct? } hairline around the photo
//   shadow     — box-shadow for the whole framed block
//   photoRadiusPct — photo corner radius (% of slot width)
//   arch       — true → the window arches (top corners fully rounded)
//   extras     — { corners? {sizePct,color,strokePct}, tapes? {color},
//                  windowShadow? bool, vignette? bool }

export const PHOTO_FRAMES = [
    {
        id: 'corner-flourish',
        label: 'פינות זהב',
        mat: { padPct: 4.6, color: 'transparent' },
        photoRadiusPct: 1,
        extras: { corners: { sizePct: 13, color: '#b8893d', strokePct: 0.8 } },
    },
    {
        id: 'double-mat',
        label: 'פספרטו כפול',
        mat: { padPct: 6, color: '#ffffff', radiusPct: 0.6 },
        innerRing: { widthPct: 0.35, color: 'rgba(184,137,61,0.85)', gapPct: 2.4 },
        shadow: '0 3px 14px rgba(60,44,20,0.18)',
        photoRadiusPct: 0.3,
    },
    {
        id: 'gallery-depth',
        label: 'חלון גלריה',
        mat: { padPct: 5.4, padBottomPct: 8.6, color: '#fdfcf9', radiusPct: 0.6 },
        shadow: '0 4px 16px rgba(60,44,20,0.2)',
        photoRadiusPct: 0.3,
        extras: { windowShadow: true },
    },
    {
        id: 'gold-leaf',
        label: 'עלה זהב',
        mat: {
            padPct: 3.2,
            gradient: 'linear-gradient(135deg, #e8cc84 0%, #b8893d 38%, #dfc078 62%, #a87e2f 100%)',
            radiusPct: 1.2,
        },
        innerRing: { widthPct: 0.4, color: 'rgba(58,45,26,0.55)', gapPct: 0 },
        shadow: '0 3px 12px rgba(90,64,20,0.30)',
        photoRadiusPct: 0.5,
    },
    {
        id: 'arch',
        label: 'קשת',
        mat: { padPct: 2, color: 'transparent' },
        innerRing: { widthPct: 0.55, color: '#b8893d', gapPct: 1.4 },
        arch: true,
        photoRadiusPct: 2.5,
    },
    {
        id: 'tape-craft',
        label: 'אלבום קראפט',
        mat: { padPct: 4.4, padBottomPct: 6.2, color: '#fbf5e9', radiusPct: 0.4 },
        shadow: '0 3px 12px rgba(90,70,35,0.22)',
        photoRadiusPct: 0.3,
        extras: { tapes: { color: 'rgba(214,186,120,0.62)' } },
    },
    {
        id: 'vignette-soft',
        label: 'וינייטה רכה',
        mat: { padPct: 1.6, color: 'transparent' },
        innerRing: { widthPct: 0.35, color: 'rgba(184,137,61,0.55)', gapPct: 1 },
        photoRadiusPct: 1.6,
        extras: { vignette: true },
    },
    {
        id: 'ink-modern',
        label: 'דיו מודרני',
        mat: { padPct: 3.4, color: '#241c10', radiusPct: 1 },
        innerRing: { widthPct: 0.3, color: 'rgba(255,255,255,0.55)', gapPct: 0.9 },
        shadow: '0 3px 12px rgba(20,14,8,0.30)',
        photoRadiusPct: 0.4,
    },
]

export function resolvePhotoFrame(id) {
    if (!id) return null
    return PHOTO_FRAMES.find(f => f.id === id) || null
}

// Concrete pixel geometry for a BUILT-IN frame at a given slot width.
// Returns null for none/unknown — callers fall back to the bare photo.
export function photoFrameGeometry(id, slotW) {
    const spec = resolvePhotoFrame(id)
    if (!spec || !Number.isFinite(slotW) || slotW <= 0) return null
    const pct = x => (slotW * (x || 0)) / 100

    const matPad = pct(spec.mat?.padPct)
    const matPadBottom = pct(spec.mat?.padBottomPct ?? spec.mat?.padPct)
    const outerW = pct(spec.outerRing?.widthPct)
    const innerW = pct(spec.innerRing?.widthPct)
    const innerGap = pct(spec.innerRing?.gapPct)

    const chrome = outerW + matPad + innerGap + innerW
    const photoW = Math.max(10, slotW - 2 * chrome)
    const photoH = photoW * 0.75 // the book's 4:3 lock

    const photoRadius = pct(spec.photoRadiusPct)
    // Arched window: the top corners become half the photo width — a
    // full arch — while the bottom keeps the regular radius.
    const archRadius = spec.arch
        ? `${photoW / 2}px ${photoW / 2}px ${photoRadius}px ${photoRadius}px`
        : null

    return {
        spec,
        photoW,
        photoH,
        matStyle: {
            width: slotW,
            background: spec.mat?.gradient || spec.mat?.color || 'transparent',
            borderRadius: pct(spec.mat?.radiusPct),
            border: outerW > 0 ? `${outerW}px solid ${spec.outerRing.color}` : 'none',
            boxShadow: spec.shadow || 'none',
            paddingTop: matPad,
            paddingBottom: matPadBottom,
            paddingLeft: matPad,
            paddingRight: matPad,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            boxSizing: 'border-box',
            position: 'relative',
        },
        innerStyle: {
            border: innerW > 0 ? `${innerW}px solid ${spec.innerRing.color}` : 'none',
            padding: innerGap,
            borderRadius: archRadius || photoRadius + innerGap,
            boxSizing: 'border-box',
            lineHeight: 0,
            position: 'relative',
        },
        photoRadius: archRadius || photoRadius,
        extras: spec.extras || null,
        corner: spec.extras?.corners
            ? { size: pct(spec.extras.corners.sizePct), stroke: Math.max(1, pct(spec.extras.corners.strokePct)), color: spec.extras.corners.color }
            : null,
    }
}

// Uploaded-overlay geometry — the photo insets by `insetPct` per side
// and the artwork stretches across the full slot (over the photo).
export function photoOverlayGeometry(slotW, insetPct = 6) {
    if (!Number.isFinite(slotW) || slotW <= 0) return null
    const inset = (slotW * (Number.isFinite(insetPct) ? insetPct : 6)) / 100
    const photoW = Math.max(10, slotW - 2 * inset)
    return {
        inset,
        photoW,
        photoH: photoW * 0.75,
        slotH: (slotW - 2 * inset) * 0.75 + 2 * inset,
    }
}
