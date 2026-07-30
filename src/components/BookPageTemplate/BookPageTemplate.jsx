'use client'

import { getBlessingText } from '@/lib/normalizeText'
import { resolveActiveTemplate } from '@/lib/presetFilters'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { pageScale } from '@/lib/pageGeometry'
import FramedPhoto from '../FramedPhoto/FramedPhoto'
import PolaroidPageLayout from '../PolaroidPageLayout/PolaroidPageLayout'
import ScrapbookPageLayout from '../ScrapbookPageLayout/ScrapbookPageLayout'
import NotebookPageLayout from '../NotebookPageLayout/NotebookPageLayout'
import CollagePageLayout from '../CollagePageLayout/CollagePageLayout'
import DuoPageLayout from '../DuoPageLayout/DuoPageLayout'

export default function BookPageTemplate({ entry, styleSettings, scaledWidth, scaledHeight }) {
    // ── Layout dispatcher ────────────────────────────────────────────────
    // Branch on `styleSettings.template` BEFORE any classic-template logic.
    // Keep ACTIVE templates here; retired layouts stay on disk as orphan
    // code (no import, no branch) so they can be re-enabled later if the
    // user changes their mind.
    //
    // Active templates: polaroid, scrapbook, notebook, collage. Anything
    // else (incl. legacy values that may live in older Firestore docs)
    // falls through to the classic renderer below.
    //
    // Retired (orphan files, no import):
    //   editorial, diptych, locket, story, minimal, hero, fullbleed,
    //   ketubah, stamp, confetti, poster — pruned in the spring 2026
    //   curation pass after side-by-side review.
    // Spread-alignment divider leaf (produced by expandBookPages padToSpread):
    // a slim, intentional blank page with a faint centered ornament on the
    // book's own background. Keeps a split blessing's text + photo facing on a
    // single open spread. Rendered uniformly for every template.
    if (entry?._divider) {
        const dividerSurface = styleSettings.backgroundUrl || resolveTextureUrl(styleSettings.texture)
        const { w: dw } = pageScale(scaledWidth, scaledHeight)
        return (
            <div
                className='flex items-center justify-center'
                style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: styleSettings.backgroundColor || '#fdfaf3',
                    backgroundImage: dividerSurface ? `url(${dividerSurface})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'repeat',
                }}
            >
                <svg viewBox='0 0 24 24' width={dw(7)} height={dw(7)} fill={styleSettings.fontColor || '#c9a44e'} style={{ opacity: 0.22 }}>
                    <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                </svg>
            </div>
        )
    }

    // ── Duo composition — two blessings on one page ──────────────────
    // Produced by expandBookPages when the preset's composition layer
    // sets entriesPerPage: 2. Renders on the same page surface with an
    // ornament divider between the two blocks (see DuoPageLayout).
    if (entry?._duo) {
        return (
            <DuoPageLayout
                entry={entry}
                styleSettings={styleSettings}
                scaledWidth={scaledWidth}
                scaledHeight={scaledHeight}
            />
        )
    }

    // ── Blessing-page template override ──────────────────────────────
    // `styleSettings.blessingTemplate` lets the studio pick a SEPARATE
    // layout for blessing-only pages — i.e. the text page of an
    // auto-split entry (_split === 'text') and any entry that has no
    // photo at all. The photo page / combined pages keep the book's
    // main `template`. Unset (or 'inherit') → same template everywhere,
    // exactly the pre-feature behavior. Logic in presetFilters.js.
    const activeTemplate = resolveActiveTemplate(entry, styleSettings)

    const passThrough = {
        entry,
        styleSettings:
            activeTemplate === styleSettings?.template
                ? styleSettings
                : { ...styleSettings, template: activeTemplate },
        scaledWidth,
        scaledHeight,
    }
    if (activeTemplate === 'polaroid') return <PolaroidPageLayout {...passThrough} />
    if (activeTemplate === 'scrapbook') return <ScrapbookPageLayout {...passThrough} />
    if (activeTemplate === 'notebook') return <NotebookPageLayout {...passThrough} />
    if (activeTemplate === 'collage') return <CollagePageLayout {...passThrough} />

    // ── Classic layout (default) ─────────────────────────────────────────
    // getBlessingText collapses whitespace to one line by default, but if
    // entry.preserveLineBreaks is true the admin opted this entry into
    // keep-as-typed mode and we return the raw stored text (the templates
    // already use white-space: pre-line so \n characters render).
    const cleanText = getBlessingText(entry)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    // Spring 2026: the studio collapsed frames + textures + page bgs
    // into one "background" gallery, written to the unified
    // `backgroundUrl` field. We still honor texture/frame for legacy
    // presets, but if backgroundUrl is set it takes precedence as the
    // page surface. Frames continue to render as a separate overlay
    // (see below) so legacy frame-as-overlay presets stay visually
    // intact.
    const surfaceUrl = styleSettings.backgroundUrl || resolvedTexture
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)
    // Per-event max blessing length can now be up to 1200 chars. The page
    // is fixed-height + overflow-hidden, so long text would clip — shrink
    // the body font as the blessing grows, more when a photo shares the
    // slot, so it always fits and stays readable.
    const _blessingLen = (cleanText || '').length
    // `fontFitTarget` is the length beyond which the body font starts to
    // shrink; `fontMinFactor` is the readable floor it never goes below.
    // Both are tunable per-preset from the studio so the owner can balance
    // text size against the photo (a long blessing + photo no longer
    // collapses to an unreadable size).
    const _fitTarget = Number.isFinite(styleSettings.fontFitTarget)
        ? styleSettings.fontFitTarget
        : (hasImage ? 230 : 360)
    const _minFactor = Number.isFinite(styleSettings.fontMinFactor) ? styleSettings.fontMinFactor : 0.62
    const fontFitFactor = Math.max(_minFactor, Math.min(1, Math.sqrt(_fitTarget / Math.max(_blessingLen, _fitTarget))))

    // Per-blessing text direction — detect the dominant script so a Hebrew
    // blessing flows RTL and an English one LTR. Critical for mixed books
    // (some guests write Hebrew, some English) so punctuation/wrapping and
    // alignment land correctly on EACH blessing independently.
    const detectDir = t => {
        const s = String(t || '')
        const heb = (s.match(/[֐-׿]/g) || []).length
        const lat = (s.match(/[A-Za-z]/g) || []).length
        return lat > heb ? 'ltr' : 'rtl'
    }
    const blessingDir = detectDir(cleanText)
    const nameDir = detectDir(entry.name)
    // Alignment preset: 'auto' follows each blessing's language (Hebrew →
    // right, English → left); 'right' | 'center' | 'left' force it regardless
    // of language. Default stays 'center' so existing books look unchanged.
    const _alignFor = (pref, dir) =>
        pref === 'auto' ? (dir === 'rtl' ? 'right' : 'left') : pref
    const resolvedTextAlign = _alignFor(styleSettings.textAlign ?? 'center', blessingDir)
    const resolvedNameAlign = _alignFor(styleSettings.nameAlign ?? 'center', nameDir)

    const elementsCount = [hasName, hasText, hasImage].filter(Boolean).length
    const onlyOne = elementsCount === 1
    // Vertical anchoring: TOP-ANCHORED so the studio's spacing sliders
    // (nameMarginTop / imageMarginTop / textMarginTop) are literal
    // distances from the top of the page (after pagePadding) — 0 means
    // "starts at the very top". Deterministic, preset-author-controlled.
    // ONLY photo-less pages (blessing-text pages, the auto-split text
    // page) center vertically. A page WITH a photo — including photo-
    // only album/split pages — always obeys the preset's margins, so
    // the photo lands exactly inside framed presets' photo window
    // instead of drifting to the vertical center.
    const centerBlock = !hasImage

    const { w, h } = pageScale(scaledWidth, scaledHeight)

    // ── Smart-album pair page: two PORTRAIT photos side by side ──────
    // Each column sizes to its own aspect (contain — zero crop) inside
    // the page surface. Produced by bookPages photoLayout 'smart'.
    if (entry?._photoPair) {
        const pad = w(styleSettings.pagePadding ?? 4)
        const gap = w(3)
        const colW = (scaledWidth - pad * 2 - gap) / 2
        const maxColH = scaledHeight - pad * 2
        return (
            <div
                className='relative flex items-center box-border overflow-hidden'
                style={{
                    width: '100%',
                    height: '100%',
                    // inline (not the utility class) — the spacing-contract
                    // guard reserves that class for centerBlock alone.
                    justifyContent: 'center',
                    backgroundColor: styleSettings.backgroundColor,
                    backgroundImage: surfaceUrl ? `url(${surfaceUrl})` : 'none',
                    backgroundRepeat: 'repeat',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    padding: pad,
                    gap,
                }}
            >
                {styleSettings.frame && (
                    <img
                        src={styleSettings.frame}
                        alt=''
                        crossOrigin='anonymous'
                        className='absolute inset-0 w-full h-full pointer-events-none'
                        style={{ zIndex: 10, objectFit: 'cover' }}
                    />
                )}
                {entry._photoPair.map(p => {
                    const a = Number(p?.imgAspect) > 0 ? Number(p.imgAspect) : 0.75
                    let cw = colW
                    let ch = cw / a
                    if (ch > maxColH) { ch = maxColH; cw = ch * a }
                    return (
                        <FramedPhoto
                            key={p.id}
                            src={p.imageUrl}
                            fit='contain'
                            slotW={cw}
                            slotH={ch}
                            objectPosition={p.photoPosition || 'center'}
                            rotation={p.photoRotation || 0}
                            photoRadius={styleSettings.imageStyle?.borderRadius ?? '12px'}
                            style={{ zIndex: 5, position: 'relative' }}
                        />
                    )
                })}
            </div>
        )
    }

    return (
        <div
            className={`relative flex flex-col items-center text-center box-border overflow-hidden ${
                centerBlock ? 'justify-center' : ''
            }`}
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
            {/* מסגרת */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}

            {/* שם האורח — honors nameFontClass (independent font for
                the guest name) when set; falls back to the body
                fontClass so legacy weddings render unchanged. */}
            {hasName && (
                <div
                    className={styleSettings.nameFontClass || styleSettings.fontClass}
                    style={{
                        fontSize: h(
                            styleSettings.nameFontSizePercent ??
                                (styleSettings.fontSizePercent ? styleSettings.fontSizePercent * 0.7 : 2.1)
                        ),
                        // fontWeight is applied numerically (300/400/500/600/700)
                        // so next/font/local picks the closest available weight
                        // file. nameFontWeight overrides; falls back to fontWeight,
                        // then to undefined (=> font's natural weight per its file).
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                        // Guest-name color is independent: nameColor wins, then
                        // fontColor (body color) as a fallback. Lets the studio
                        // give the name a distinct accent without recolouring
                        // the blessing copy.
                        color: styleSettings.nameColor ?? styleSettings.fontColor,
                        opacity: 0.85,
                        marginTop: onlyOne ? 0 : h(styleSettings.nameMarginTop ?? 1),
                        marginBottom: onlyOne ? 0 : h(styleSettings.nameMarginBottom ?? 1),
                        direction: nameDir,
                        textAlign: resolvedNameAlign,
                        maxWidth: w(styleSettings.nameMaxWidth ?? 60),
                        wordWrap: 'break-word',
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    {entry.name}
                </div>
            )}

            {/* תמונה — locked to 4:3 (the cropper's output aspect
                AND every other layout's slot aspect). Width comes
                from the user's preset (imageStyle.width % of page);
                height is computed so the slot is exactly 4:3. The
                photo fills the slot via objectFit: cover so EVERY
                page in the book reads as a uniform landscape entry.
                Legacy portrait uploads (pre-cropper) get a small
                centre-crop — uniformity > preserving every pixel
                of a single edge case. */}
            {hasImage && (() => {
                // On a dedicated split photo page, show the photo large so it
                // fills the page nicely (it's the only thing there). Otherwise
                // use the preset's image width. The preset's photoFrame (layer
                // 4 — mats / gold rings, see src/lib/photoFrames.js) wraps the
                // photo without changing its footprint on the page.
                const isSplitPhoto = entry?._split === 'photo'
                const baseW = styleSettings.imageStyle?.width ?? 80
                // Smart-album sizing: with a measured aspect + contain, the
                // slot follows the photo EXACTLY (no crop, no letterbox).
                // Wide pages start bigger; too-tall slots shrink to fit.
                const photoFit = styleSettings.photoFit ?? 'cover'
                const aspect = Number(entry?.imgAspect) > 0 ? Number(entry.imgAspect) : null
                let slotW = w(isSplitPhoto || entry?._photo === 'wide' ? Math.max(90, baseW) : baseW)
                let slotH = null
                if (photoFit === 'contain' && aspect) {
                    const maxH = scaledHeight * (entry?._photo === 'tall' ? 0.86 : 0.8)
                    slotH = slotW / aspect
                    if (slotH > maxH) { slotH = maxH; slotW = slotH * aspect }
                }
                return (
                    <FramedPhoto
                        src={entry.imageUrl}
                        fit={photoFit}
                        slotW={slotW}
                        slotH={slotH}
                        frameId={styleSettings.photoFrame}
                        frameUrl={styleSettings.photoFrameUrl}
                        frameInset={styleSettings.photoFrameInset}
                        objectPosition={entry.photoPosition || 'center'}
                        rotation={entry.photoRotation || 0}
                        photoRadius={styleSettings.imageStyle?.borderRadius ?? '12px'}
                        style={{
                            marginTop: onlyOne ? 0 : h(styleSettings.imageMarginTop ?? 2),
                            marginBottom: onlyOne ? 0 : h(styleSettings.imageMarginBottom ?? 2),
                            alignSelf:
                                styleSettings.imageAlign === 'left'
                                    ? 'flex-start'
                                    : styleSettings.imageAlign === 'right'
                                    ? 'flex-end'
                                    : 'center',
                            zIndex: 5,
                            position: 'relative',
                        }}
                    />
                )
            })()}

            {/* טקסט */}
            {hasText && (
                <div
                    style={{
                        maxWidth: w(styleSettings.textMaxWidth ?? 85),
                        marginTop: onlyOne ? 0 : h(styleSettings.textMarginTop ?? 0),
                        direction: blessingDir,
                        textAlign: resolvedTextAlign,
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <p
                        className={blessingDir === 'ltr' && styleSettings.fontClassLatin ? styleSettings.fontClassLatin : styleSettings.fontClass}
                        style={{
                            fontSize: h((styleSettings.fontSizePercent ?? 3) * fontFitFactor),
                            // See fontWeight comment on the name block above —
                            // same fallback chain. The body text uses fontWeight
                            // directly (no body-specific override field).
                            fontWeight: styleSettings.fontWeight,
                            color: styleSettings.fontColor,
                            lineHeight: styleSettings.textLineHeight ?? 1.5,
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                        }}
                    >
                        {cleanText}
                    </p>
                </div>
            )}
        </div>
    )
}
