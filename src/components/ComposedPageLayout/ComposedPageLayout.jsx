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

function Words({ entry, styleSettings, h, w, share, hasImage, align }) {
    const cleanText = getBlessingText(entry)
    if (!entry?.name && !cleanText) return null

    const blessingDir = detectDir(cleanText)
    const nameDir = detectDir(entry.name)
    const textAlign = alignFor(styleSettings.textAlign ?? 'center', blessingDir)
    const nameAlign = alignFor(styleSettings.nameAlign ?? 'center', nameDir)

    // The same curve the classic page uses - only the target moves with
    // the slot, which is the whole point of greetingCapacity.
    const fit = slotFitFactor(blessingLength(entry), share, { hasImage, styleSettings })

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
            {entry.name && (
                <div
                    className={styleSettings.nameFontClass || styleSettings.fontClass}
                    style={{
                        fontSize: h(nameFontPercent(styleSettings, 0.85)),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                        color: styleSettings.nameColor ?? styleSettings.fontColor,
                        opacity: 0.85,
                        marginBottom: h(0.6),
                        direction: nameDir,
                        textAlign: nameAlign,
                        maxWidth: '100%',
                        wordWrap: 'break-word',
                    }}
                >
                    {entry.name}
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
                        fontSize: h(effectiveFontPercent(styleSettings, fit)),
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
                    {cleanText}
                </p>
            )}
        </div>
    )
}

function Picture({ entry, styleSettings, slotWpx, slotHpx }) {
    if (!entry?.imageUrl) return null
    return (
        <div className='flex items-center justify-center' style={{ width: '100%', height: '100%' }}>
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
        </div>
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
            {divider && <Divider at={divider.at} styleSettings={styleSettings} w={w} />}
            {divider?.second && <Divider at={divider.second} styleSettings={styleSettings} w={w} />}

            {slots.map(({ slot, entry: e }, i) => {
                const box = boxOf(slot.area)
                const slotWpx = w(slot.area[2] * 100)
                const slotHpx = h(slot.area[3] * 100)

                if (slot.kind === 'photo') {
                    return (
                        <div key={i} style={{ ...box, zIndex: 5 }}>
                            <Picture entry={e} styleSettings={styleSettings} slotWpx={slotWpx} slotHpx={slotHpx} />
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
