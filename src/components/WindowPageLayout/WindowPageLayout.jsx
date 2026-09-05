'use client'

// WindowPageLayout — the photo fills the page, a shape is laid over it.
//
// The layout Lord asked for: a full-bleed photograph with a cut-out
// shape on top, so the picture is seen through an arch, a circle, a leaf
// — whatever the uploaded artwork opens onto. Everything outside the
// opening is the artwork; everything inside it is the photo.
//
// ── Why this one DOES need transparency ──────────────────────────────
//
// The uploaded photo frames elsewhere in this app are nine-sliced, and
// nine-slice needs no alpha at all because the middle is never drawn.
// This is the opposite case and the distinction matters when someone
// prepares artwork: here the middle IS drawn, over the photo, and the
// opening has to be genuinely transparent for the photograph to show
// through. A JPEG cannot do it. PNG or WebP with alpha, or SVG.
//
// ── The page, not a slot ─────────────────────────────────────────────
//
// Every other template composes inside the page's padding. This one
// deliberately ignores it: the whole point is that the photo runs to the
// trim edge and the artwork defines where the page appears to end. The
// preset's own background still paints underneath, so an overlay with
// soft edges blends into the book rather than sitting on white.

import EntryPhoto from '../EntryPhoto/EntryPhoto'
import { pageScale } from '@/lib/pageGeometry'
import { getBlessingText } from '@/lib/normalizeText'

export default function WindowPageLayout({
    entry = {},
    styleSettings = {},
    scaledWidth,
    scaledHeight,
}) {
    const { w, h } = pageScale(scaledWidth, scaledHeight)
    const overlay = styleSettings.windowOverlayUrl || null
    const hasImage = Boolean(entry.imageUrl)

    // The name is optional here and off by default. On a split entry the
    // blessing — and with it the signature — lives on the facing page,
    // and printing the name twice is how a spread starts looking like a
    // mistake rather than a design.
    const showName = Boolean(styleSettings.windowShowName && entry.name)

    return (
        <div
            style={{
                width: scaledWidth,
                height: scaledHeight,
                position: 'relative',
                overflow: 'hidden',
                background: styleSettings.backgroundColor || '#ffffff',
            }}
        >
            {hasImage && (
                <div style={{ position: 'absolute', inset: 0 }}>
                    <EntryPhoto
                        src={entry.imageUrl}
                        // Always cover: a full-bleed page with letterbox
                        // bars is not a full-bleed page. The shape on top
                        // is what decides how much of the photo is seen,
                        // so cropping here is the design, not a loss.
                        fit='cover'
                        maxWidth={scaledWidth}
                        maxHeight={scaledHeight}
                        objectPosition={entry.photoPosition || 'center'}
                        rotation={entry.photoRotation || 0}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            )}

            {overlay && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={overlay}
                    alt=''
                    draggable={false}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        // `fill`, not cover: the artwork is authored to
                        // the page and its edges must land ON the page
                        // edges. `cover` would crop the shape off-centre
                        // the moment the book format changes.
                        objectFit: 'fill',
                        pointerEvents: 'none',
                        zIndex: 2,
                    }}
                />
            )}

            {showName && (
                <div
                    className={styleSettings.nameFontClass || styleSettings.fontClass}
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: h(styleSettings.windowNameBottom ?? 6),
                        textAlign: 'center',
                        zIndex: 3,
                        color: styleSettings.windowNameColor || styleSettings.nameColor || styleSettings.fontColor,
                        fontSize: h(styleSettings.nameFontSizePercent ?? 2.1),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                    }}
                >
                    {entry.name}
                </div>
            )}

            {/* A page with no photo would otherwise be the artwork over
                nothing. Showing the blessing keeps the entry readable
                instead of silently blank — the case where a guest wrote
                but never uploaded. */}
            {!hasImage && getBlessingText(entry) && (
                <div
                    className={styleSettings.fontClass}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: w(styleSettings.pagePadding ?? 8),
                        textAlign: 'center',
                        color: styleSettings.fontColor,
                        fontSize: h(styleSettings.fontSizePercent ?? 3),
                        lineHeight: styleSettings.textLineHeight ?? 1.5,
                        whiteSpace: 'pre-line',
                    }}
                >
                    {getBlessingText(entry)}
                </div>
            )}
        </div>
    )
}
