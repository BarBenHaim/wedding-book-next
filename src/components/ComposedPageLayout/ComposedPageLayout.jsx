'use client'

// ComposedPageLayout — a page the planner composed, rather than a
// template an entry was poured into.
//
// Rendered when expandBookPages runs in `composition: 'smart'` mode:
// greetingPlan returns pages carrying several entries and the slots
// they fill, and the page object arrives here as `entry._composed`.
//
// ── Why absolute positioning, when every other layout is flexbox ─────
//
// The other layouts describe ONE arrangement, so flow works: name, then
// photo, then text, stacked. A composed page has no single flow - a
// rough puts a card top-left, a photograph top-right and a blessing
// across the foot, and only coordinates can say that. The planner
// already speaks in [x, y, w, h] normalised to the page, so the
// translation here is one multiplication and no layout guessing.
//
// ── What is NOT allowed here ─────────────────────────────────────────
//
// The printed book is html2canvas + jsPDF. mask-image, filter: blur and
// blend modes all render on screen and vanish in the PDF, which means
// the book someone approves is not the book that prints. Nothing below
// uses any of them - the same rule albumTreatments is built around.
//
// ── The photograph is fitted, never cropped ──────────────────────────
//
// A slot is a region of the page a picture MAY occupy, not a hole it
// must fill. FramedPhoto in `contain` mode does that, and it is handed
// the measured aspect so it can size itself without loading pixels -
// which matters because the PDF pass renders before images decode.

import { getBlessingText } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { pageScale } from '@/lib/pageGeometry'
import { nameFontPercent, effectiveFontPercent } from '@/lib/fontFit'
import { slotFitFactor, blessingLength } from '@/lib/greetingCapacity'
import { textAreaOf } from '@/lib/greetingScoring'
import { resolveTreatment } from '@/lib/albumTreatments'
import { pageFrameUrl, ornamentUrl } from '@/lib/albumOrnaments'
import FramedPhoto from '../FramedPhoto/FramedPhoto'

const detectDir = t => {
    const s = String(t || '')
    const heb = (s.match(/[֐-׿]/g) || []).length
    const lat = (s.match(/[A-Za-z]/g) || []).length
    return lat > heb ? 'ltr' : 'rtl'
}
const alignFor = (pref, dir) => (pref === 'auto' ? (dir === 'rtl' ? 'right' : 'left') : pref)

/** A slot's [x, y, w, h] as CSS percentages of the page. */
function boxOf(area) {
    const [x, y, w, h] = area
    return {
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        boxSizing: 'border-box',
    }
}

/** Where a block sits inside its own slot. */
const justifyFor = align => (align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center')

/**
 * The guest's name, set the way the rough asked for.
 *
 * 'rule'   flanked by hairlines - the most formal, and what a keepsake
 *          page wants when the name is the only heading it has.
 * 'spaced' letter-spaced small caps. Quieter, for pages where the
 *          picture or the opening letter is already carrying the weight.
 * default  plain, exactly as every other layout sets it.
 */
function GuestName({ name, styleSettings, h, w, style, dir, align }) {
    if (!name) return null
    const ink = styleSettings.nameColor ?? styleSettings.fontColor ?? '#3a2d1a'
    const size = h(nameFontPercent(styleSettings, style === 'spaced' ? 0.78 : 0.85))
    const label = (
        <span
            className={styleSettings.nameFontClass || styleSettings.fontClass}
            style={{
                fontSize: size,
                fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                color: ink,
                opacity: style === 'spaced' ? 0.72 : 0.85,
                letterSpacing: style === 'spaced' ? '0.18em' : undefined,
                direction: dir,
                whiteSpace: 'nowrap',
            }}
        >
            {name}
        </span>
    )
    if (style !== 'rule') {
        return <div style={{ marginBottom: h(0.8), textAlign: align, maxWidth: '100%' }}>{label}</div>
    }
    const hair = { flex: 1, height: 1, background: ink, opacity: 0.28, minWidth: w(2) }
    return (
        <div
            className='flex items-center'
            style={{ width: '82%', gap: w(2.2), marginBottom: h(1.1) }}
        >
            <span style={hair} />
            {label}
            <span style={hair} />
        </div>
    )
}

function Words({ entry, styleSettings, h, w, share, hasImage, align, typography = {} }) {
    const cleanText = getBlessingText(entry)
    if (!entry?.name && !cleanText) return null

    const blessingDir = detectDir(cleanText)
    const nameDir = detectDir(entry.name)
    const textAlign = alignFor(styleSettings.textAlign ?? 'center', blessingDir)
    const nameAlign = alignFor(styleSettings.nameAlign ?? 'center', nameDir)

    // The same curve the classic page uses - only the target moves with
    // the slot, which is the whole point of greetingCapacity.
    // Same scale the scorer used - see greetingCapacity. If these two
    // ever disagree the gate is measuring a different page from the one
    // on the paper.
    const fit = slotFitFactor(blessingLength(entry), share, {
        hasImage, styleSettings, scale: typography.scale ?? 1,
    })

    return (
        <div
            className='flex flex-col'
            style={{
                width: '100%',
                height: '100%',
                justifyContent: justifyFor(align),
                alignItems: textAlign === 'right' ? 'flex-end' : textAlign === 'left' ? 'flex-start' : 'center',
                overflow: 'hidden',
            }}
        >
            <GuestName
                name={entry.name}
                styleSettings={styleSettings}
                h={h}
                w={w}
                style={typography.nameStyle}
                dir={nameDir}
                align={nameAlign}
            />
            {/* A quotation mark set large and quiet. Decoration that says
                what the page is - somebody's words - without a caption. */}
            {typography.quote && cleanText && (
                <div
                    aria-hidden='true'
                    style={{
                        fontSize: h(typography.quote === 'large' ? 9 : 6),
                        lineHeight: 0.7,
                        color: styleSettings.accentColor || styleSettings.nameColor || styleSettings.fontColor,
                        opacity: 0.16,
                        marginBottom: h(-0.4),
                        fontFamily: 'Georgia, serif',
                    }}
                >
                    &rdquo;
                </div>
            )}
            {cleanText && (
                <p
                    className={
                        blessingDir === 'ltr' && styleSettings.fontClassLatin
                            ? styleSettings.fontClassLatin
                            : styleSettings.fontClass
                    }
                    style={{
                        fontSize: h(effectiveFontPercent(styleSettings, fit, typography.scale ?? 1)),
                        fontWeight: styleSettings.fontWeight,
                        color: styleSettings.fontColor,
                        lineHeight: styleSettings.textLineHeight ?? 1.4,
                        direction: blessingDir,
                        textAlign,
                        whiteSpace: 'pre-line',
                        wordWrap: 'break-word',
                        maxWidth: '100%',
                        margin: 0,
                    }}
                >
                    {/* An oversized opening letter. Hebrew has no capitals,
                        so this is the only way a blessing can open with a
                        flourish - and it is inline rather than floated,
                        because html2canvas rasterises floats unevenly. */}
                    {typography.initial && cleanText.length > 1 ? (
                        <>
                            <span
                                style={{
                                    fontSize: '1.9em',
                                    lineHeight: 0.9,
                                    fontWeight: 700,
                                    color: styleSettings.accentColor || styleSettings.nameColor || styleSettings.fontColor,
                                    marginInlineEnd: '0.04em',
                                    verticalAlign: '-0.12em',
                                }}
                            >
                                {cleanText.slice(0, 1)}
                            </span>
                            {cleanText.slice(1)}
                        </>
                    ) : cleanText}
                </p>
            )}
        </div>
    )
}

function Picture({ entry, styleSettings, slotWpx, slotHpx, slot = {}, pageW }) {
    if (!entry?.imageUrl) return null
    // How the photograph meets the paper. albumTreatments returns pure
    // style descriptors and builds every fade as a gradient OVERLAY
    // rather than a mask, precisely so it survives html2canvas.
    const t = resolveTreatment(slot.treatment || 'plain', {
        paper: styleSettings.backgroundColor || '#fdfaf3',
        ink: styleSettings.fontColor || '#3a2d1a',
        accent: styleSettings.accentColor || styleSettings.nameColor || '#aa8840',
        fade: slot.fade || 'right',
        fadeDepth: slot.fadeDepth ?? 0.42,
        scale: (pageW || 1000) / 1000,
    })
    const tilt = Number.isFinite(slot.rotate) ? slot.rotate : 0
    return (
        <div
            className='flex items-center justify-center'
            style={{
                width: '100%',
                height: '100%',
                transform: tilt ? `rotate(${tilt}deg)` : undefined,
            }}
        >
          <div style={{ position: 'relative', ...(t.frame || {}) }}>
            <FramedPhoto
                src={entry.imageUrl}
                slotW={slotWpx}
                // Always contain. A composed page puts pictures at sizes the
                // planner chose from their measured shape; cropping here
                // would silently undo that choice.
                fit='contain'
                aspect={Number(entry?.imgAspect) > 0 ? Number(entry.imgAspect) : null}
                maxSlotH={slotHpx}
                frameId={styleSettings.photoFrame}
                frameUrl={styleSettings.photoFrameUrl}
                frameSlice={styleSettings.photoFrameSlice}
                frameInset={styleSettings.photoFrameInset}
                objectPosition={entry.photoPosition || 'center'}
                rotation={entry.photoRotation || 0}
                photoRadius={styleSettings.imageStyle?.borderRadius ?? '12px'}
            />
            {t.overlays.map((o, i) => (
                <div
                    key={i}
                    aria-hidden='true'
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...o }}
                />
            ))}
          </div>
        </div>
    )
}

/**
 * A drawn page edge, from the album's own frame set.
 *
 * These are SVG data URLs, so they rasterise into the PDF like any other
 * image. A CSS border could not do brackets or a double rule at these
 * proportions without four more elements.
 */
function PageFrame({ kind, styleSettings }) {
    if (!kind) return null
    const url = pageFrameUrl(kind, {
        color: styleSettings.fontColor || '#3a2d1a',
    })
    if (!url) return null
    return (
        <img
            src={url}
            alt=''
            aria-hidden='true'
            className='absolute top-0 left-0 w-full h-full pointer-events-none'
            style={{ zIndex: 4, opacity: 0.5 }}
        />
    )
}

/** A single ornament, placed by the rough at a point on the page. */
function Ornament({ spec, styleSettings, pageW }) {
    const url = ornamentUrl(spec.name, {
        color: styleSettings.accentColor || styleSettings.nameColor || '#aa8840',
        seed: spec.seed ?? 1,
    })
    if (!url) return null
    const size = `${(spec.size ?? 0.2) * 100}%`
    return (
        <img
            src={url}
            alt=''
            aria-hidden='true'
            style={{
                position: 'absolute',
                left: `${spec.at[0] * 100}%`,
                top: `${spec.at[1] * 100}%`,
                width: size,
                transform: `translate(-50%, -50%) rotate(${spec.rotate ?? 0}deg)`,
                opacity: spec.opacity ?? 0.7,
                zIndex: spec.above ? 8 : 2,
                pointerEvents: 'none',
            }}
        />
    )
}

/** A hairline the recipe asked for, in the book's own ink. */
function Divider({ at, styleSettings, w }) {
    return (
        <div
            aria-hidden='true'
            style={{
                position: 'absolute',
                left: '14%',
                width: '72%',
                top: `${at * 100}%`,
                height: 1,
                opacity: 0.35,
                background: `linear-gradient(to right, transparent, ${styleSettings.fontColor || '#3a2d1a'}, transparent)`,
                zIndex: 5,
            }}
        />
    )
}

export default function ComposedPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const page = entry?._composed
    const { w, h } = pageScale(scaledWidth, scaledHeight)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const surfaceUrl = styleSettings.backgroundUrl || resolvedTexture

    const slots = Array.isArray(page?.slots) ? page.slots.filter(s => s?.entry) : []
    const divider = page?.recipe?.divider
    const typography = page?.recipe?.typography || {}

    return (
        <div
            className='relative box-border overflow-hidden'
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
                boxSizing: 'border-box',
            }}
        >
            {/* Ornaments first, so the words and pictures sit on top of
                them; an ornament marked `above` opts back over the lot. */}
            {(page?.recipe?.ornaments || []).map((o, i) => (
                <Ornament key={`o${i}`} spec={o} styleSettings={styleSettings} pageW={scaledWidth} />
            ))}
            <PageFrame kind={page?.recipe?.pageFrame} styleSettings={styleSettings} />

            {divider && <Divider at={divider.at} styleSettings={styleSettings} w={w} />}
            {divider?.second && <Divider at={divider.second} styleSettings={styleSettings} w={w} />}

            {slots.map(({ slot, entry: e }, i) => {
                const box = boxOf(slot.area)
                const slotWpx = w(slot.area[2] * 100)
                const slotHpx = h(slot.area[3] * 100)

                if (slot.kind === 'photo') {
                    return (
                        <div key={i} style={{ ...box, zIndex: 5 }}>
                            <Picture entry={e} styleSettings={styleSettings} slotWpx={slotWpx} slotHpx={slotHpx} slot={slot} pageW={scaledWidth} />
                        </div>
                    )
                }

                if (slot.kind === 'blessing') {
                    return (
                        <div key={i} style={{ ...box, zIndex: 5 }}>
                            <Words
                                entry={e}
                                styleSettings={styleSettings}
                                h={h}
                                w={w}
                                share={textAreaOf(slot)}
                                hasImage={false}
                                align={slot.align}
                                typography={typography}
                            />
                        </div>
                    )
                }

                // card — one guest's picture above their own words. The split
                // is the recipe's `textShare`, which is also what the scorer
                // measured this blessing's readability against, so what
                // renders and what was scored cannot drift apart.
                const share = slot.textShare ?? 0.4
                return (
                    <div key={i} style={{ ...box, zIndex: 5 }}>
                        <div style={{ height: `${(1 - share) * 100}%`, width: '100%' }}>
                            <Picture
                                entry={e}
                                styleSettings={styleSettings}
                                slotWpx={slotWpx}
                                slotHpx={slotHpx * (1 - share)}
                                slot={slot}
                                pageW={scaledWidth}
                            />
                        </div>
                        <div style={{ height: `${share * 100}%`, width: '100%' }}>
                            <Words
                                entry={e}
                                styleSettings={styleSettings}
                                h={h}
                                w={w}
                                share={textAreaOf(slot)}
                                hasImage
                                align={slot.align}
                                typography={typography}
                            />
                        </div>
                    </div>
                )
            })}

            {/* Page frame overlay — last, above everything, exactly as the
                classic template and the duo page do it. */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}
        </div>
    )
}
