'use client'

// DuoPageLayout — two blessings sharing one page, elegantly.
//
// Rendered when the composition layer sets `entriesPerPage: 2`
// (expandBookPages pairs entries into `entry._duo = [a, b?]`). The
// page surface (background/texture/frame/padding) is IDENTICAL to the
// classic template; each half renders a compact name → photo → text
// block using the same percent system, and a slim ornament divider
// (hairline · diamond · hairline) separates the two.
//
// Proportions relative to the classic single page:
//   • photo width  = imageStyle.width × 0.62 (default 80% → ~50%)
//   • body font    = fontSizePercent × 0.82, with the same long-text
//     font-fit the classic page uses (per block, tighter target)
//   • name font    = its classic size × 0.85
// An odd tail (one entry) renders a single centered block — same
// styling, no divider.
//
// Photo frames (styleSettings.photoFrame) apply inside each block via
// the shared FramedPhoto, so frames look identical in solo and duo.

import { getBlessingText } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { pageScale } from '@/lib/pageGeometry'
import { duoFitFactor } from '@/lib/fontFit'
import FramedPhoto from '../FramedPhoto/FramedPhoto'

const detectDir = t => {
    const s = String(t || '')
    const heb = (s.match(/[֐-׿]/g) || []).length
    const lat = (s.match(/[A-Za-z]/g) || []).length
    return lat > heb ? 'ltr' : 'rtl'
}
const alignFor = (pref, dir) => (pref === 'auto' ? (dir === 'rtl' ? 'right' : 'left') : pref)

function DuoBlock({ entry, styleSettings, w, h, solo }) {
    const cleanText = getBlessingText(entry)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const blessingDir = detectDir(cleanText)
    const nameDir = detectDir(entry.name)
    const textAlign = alignFor(styleSettings.textAlign ?? 'center', blessingDir)
    const nameAlign = alignFor(styleSettings.nameAlign ?? 'center', nameDir)

    // Per-block font fit — half a page holds less, so the shrink starts
    // earlier than the classic page (tighter target), same floor.
    const fit = duoFitFactor({ textLength: (cleanText || '').length, hasImage, styleSettings })

    const baseFont = (styleSettings.fontSizePercent ?? 3) * 0.82
    const nameFont =
        (styleSettings.nameFontSizePercent ??
            (styleSettings.fontSizePercent ? styleSettings.fontSizePercent * 0.7 : 2.1)) * 0.85

    const slotW = w((styleSettings.imageStyle?.width ?? 80) * 0.62)

    return (
        <div
            className='flex flex-col items-center justify-center'
            style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', zIndex: 5 }}
        >
            {hasName && (
                <div
                    className={styleSettings.nameFontClass || styleSettings.fontClass}
                    style={{
                        fontSize: h(nameFont),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                        color: styleSettings.nameColor ?? styleSettings.fontColor,
                        opacity: 0.85,
                        marginBottom: h(0.6),
                        direction: nameDir,
                        textAlign: nameAlign,
                        maxWidth: w(styleSettings.nameMaxWidth ?? 60),
                        wordWrap: 'break-word',
                    }}
                >
                    {entry.name}
                </div>
            )}

            {hasImage && (
                <FramedPhoto
                    src={entry.imageUrl}
                    slotW={solo ? slotW * 1.2 : slotW}
                    // No-crop ("album") mode — note `fit` is already taken in
                    // this file for the font-fit factor, hence the inline
                    // read. Two blessings share this sheet, so a duo photo
                    // gets a much tighter height cap than a solo page: the
                    // half-page it lives in still has to hold its blessing.
                    fit={(styleSettings.photoFit ?? 'cover') === 'contain' ? 'contain' : 'cover'}
                    aspect={Number(entry?.imgAspect) > 0 ? Number(entry.imgAspect) : null}
                    maxSlotH={h(solo ? (hasText ? 50 : 70) : hasText ? 26 : 36)}
                    frameId={styleSettings.photoFrame}
                    frameUrl={styleSettings.photoFrameUrl}
                    frameInset={styleSettings.photoFrameInset}
                    objectPosition={entry.photoPosition || 'center'}
                    rotation={entry.photoRotation || 0}
                    photoRadius={styleSettings.imageStyle?.borderRadius ?? '12px'}
                    style={{ marginTop: h(0.4), marginBottom: h(hasText ? 1 : 0.4) }}
                />
            )}

            {hasText && (
                <div
                    style={{
                        maxWidth: w(styleSettings.textMaxWidth ?? 85),
                        direction: blessingDir,
                        textAlign,
                    }}
                >
                    <p
                        className={
                            blessingDir === 'ltr' && styleSettings.fontClassLatin
                                ? styleSettings.fontClassLatin
                                : styleSettings.fontClass
                        }
                        style={{
                            fontSize: h(baseFont * fit),
                            fontWeight: styleSettings.fontWeight,
                            color: styleSettings.fontColor,
                            lineHeight: styleSettings.textLineHeight ?? 1.4,
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                            margin: 0,
                        }}
                    >
                        {cleanText}
                    </p>
                </div>
            )}
        </div>
    )
}

export default function DuoPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const pair = Array.isArray(entry?._duo) ? entry._duo.filter(Boolean) : []
    const { w, h } = pageScale(scaledWidth, scaledHeight)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const surfaceUrl = styleSettings.backgroundUrl || resolvedTexture
    const solo = pair.length === 1

    return (
        <div
            className='relative flex flex-col items-center box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: surfaceUrl ? `url(${surfaceUrl})` : 'none',
                backgroundRepeat: 'repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: styleSettings.fontColor,
                borderRadius: w(styleSettings.borderRadius || 0),
                padding: h(styleSettings.pagePadding ?? 4),
                boxSizing: 'border-box',
            }}
        >
            {/* Page frame overlay — same as the classic template */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}

            <DuoBlock entry={pair[0] || {}} styleSettings={styleSettings} w={w} h={h} solo={solo} />

            {/* Ornament divider — hairline · diamond · hairline, in the
                book's own ink so it sits quietly on any preset. */}
            {!solo && (
                <div
                    className='flex items-center justify-center'
                    style={{ width: '72%', gap: w(2), opacity: 0.4, position: 'relative', zIndex: 5 }}
                    aria-hidden='true'
                >
                    <span
                        style={{
                            flex: 1,
                            height: 1,
                            background: `linear-gradient(to left, transparent, ${styleSettings.fontColor || '#3a2d1a'}, transparent)`,
                        }}
                    />
                    <span
                        style={{
                            width: w(1.1),
                            height: w(1.1),
                            transform: 'rotate(45deg)',
                            background: styleSettings.fontColor || '#3a2d1a',
                            flexShrink: 0,
                        }}
                    />
                    <span
                        style={{
                            flex: 1,
                            height: 1,
                            background: `linear-gradient(to right, transparent, ${styleSettings.fontColor || '#3a2d1a'}, transparent)`,
                        }}
                    />
                </div>
            )}

            {!solo && (
                <DuoBlock entry={pair[1] || {}} styleSettings={styleSettings} w={w} h={h} solo={false} />
            )}
        </div>
    )
}
