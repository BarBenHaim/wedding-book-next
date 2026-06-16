'use client'

// NotebookPageLayout
//
// Production wedding-book layout — the "Notebook" template.
//
// Sister to StoryPageLayout, but the card is styled like a page torn from
// a wedding journal — subtle horizontal "ruled lines" running across it
// and a soft gold left-margin rule (like the red margin on a school
// notebook, but in gold). Handwritten font for the blessing.
//
// Design intent:
//   • Modern interpretation of an old-school memory book entry.
//   • The ruled-line background is a CSS gradient — no asset needed,
//     stays sharp at any zoom, prints crisp.
//   • Gold margin rule on the left side anchors the eye and gives the
//     card character without being loud.
//   • Text always flows from the TOP of the card — no vertical centering.
//     Short blessings sit on the first ruled line; long blessings flow
//     downward. The rest of the card shows empty ruled lines, like a
//     real notebook page with one entry.
//
// Used by BookPageTemplate when styleSettings.template === 'notebook'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { gveretLevin } from '@/app/fonts'
import { pageScale } from '@/lib/pageGeometry'
import EntryPhoto from '../EntryPhoto/EntryPhoto'

const GOLD = '#aa8941'
const INK = '#1a1410'

function Heart({ color = GOLD, filled = false }) {
    return (
        <svg
            viewBox='0 0 24 24'
            style={{
                width: '0.95em',
                height: '0.95em',
                display: 'inline-block',
                verticalAlign: '-0.12em',
                flexShrink: 0,
            }}
        >
            <path
                d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
                fill={filled ? color : 'none'}
                stroke={color}
                strokeWidth={2}
                strokeLinejoin='round'
            />
        </svg>
    )
}

export default function NotebookPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const { w, h } = pageScale(scaledWidth, scaledHeight)

    // Photo sits at the top of the page in a 4:3 strip. Capped at 75%
    // page width so a 1920-px-wide camera capture (the ceiling for
    // getUserMedia on most phones) prints at ~300 DPI on the 8.5" trim
    // — a full-bleed (100%) strip needed 2551 px and was always
    // upscaling. The strip stays full-width visually via centering, just
    // a few mm short of the side edges so the inset reads as deliberate
    // "notebook page with a tipped-in photo" rather than "stretched
    // bitmap". 4:3 still enforced via height = width × 0.75.
    const photoWidth = w(75)
    const photoHeight = photoWidth * 0.75

    // Ruled-line spacing scales with the card's text size so the lines
    // line up with the baselines of the handwritten blessing. h(7.5) per
    // ruled row keeps the spacing comfortable for cursive Hebrew.
    const ruleHeight = h(7)

    const textColor = styleSettings.fontColor || INK
    // Notebook is opinionated about the font — handwritten Hebrew gives it
    // the journal feel. Falls back to whatever the preset chose if the
    // user explicitly overrides via DesignControls.
    const fontClass = styleSettings.fontClass || gveretLevin.className
    // Independent name font, falls back to the body fontClass
    // (matches the classic renderer). Set via the studio's
    // guest-name-font picker.
    const nameFontClass = styleSettings.nameFontClass || fontClass

    // Direction support: the gold margin rule sits on the START side of
    // the reading direction (right for Hebrew, left for English). Setting
    // dir on the card lets CSS logical properties below resolve correctly.
    const dir = styleSettings.locale === 'en' || styleSettings.locale === 'es' || styleSettings.locale === 'it' ? 'ltr' : 'rtl'

    return (
        <div
            className='relative box-border overflow-hidden'
            dir={dir}
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#f7f1e3',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 0, // page itself has no padding — photo bleeds to the
                // top + side edges; the card inside applies its
                // own horizontal margin to stay readable.
            }}
        >
            {/* Photo — full-bleed top + sides, natural aspect via
                shared <EntryPhoto>. */}
            {hasImage && (
                <EntryPhoto
                    src={entry.imageUrl}
                    maxWidth={photoWidth}
                    maxHeight={photoHeight}
                    objectPosition={entry.photoPosition || 'center'}
                    style={{ flexShrink: 0, zIndex: 1 }}
                />
            )}

            {/* Notebook card — ruled lines as a CSS background, gold
                left-margin rule. Now that the page wrapper has no padding,
                the card supplies its own outer margin so it doesn't slam
                into the page edges. Top margin gives a small gap from
                the full-bleed photo above. */}
            <div
                style={{
                    width: w(100),
                    flex: 1,
                    background:
                        'repeating-linear-gradient(' +
                        'to bottom, #ffffff 0 ' +
                        (ruleHeight - 1) +
                        'px, rgba(170,136,64,0.13) ' +
                        (ruleHeight - 1) +
                        'px ' +
                        ruleHeight +
                        'px)',
                    borderRadius: w(0),
                    border: '1px solid rgba(170,136,64,0.35)',
                    padding: h(3) + 'px ' + w(4) + 'px ' + h(3) + 'px ' + w(8) + 'px',
                    margin: 0,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 0,
                    zIndex: 2,
                    overflow: 'hidden',
                }}
            >
                {/* Gold left-margin rule — sits on the START edge of the
                    reading direction. insetInlineStart resolves to the
                    right side in Hebrew, the left side in English/Spanish/
                    Italian, so the same code renders correctly in either. */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        insetInlineStart: w(5.5),
                        width: 1.5,
                        background: 'rgba(170,136,64,0.5)',
                    }}
                />

                {/* Blessing — flows from the top of the card. No vertical
                    centering, no negative marginTop. If the blessing is
                    short, it sits on the first ruled line; the rest of
                    the card shows empty ruled lines below. */}
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSizePercent ?? 3.0),
                        // Layout honors fontWeight from the preset;
                        // falls back to the font file natural weight.
                        fontWeight: styleSettings.fontWeight,
                            lineHeight: ruleHeight + 'px',
                            // Text aligns to the START of the line in the
                            // current reading direction — same side as the
                            // gold margin rule, mimicking real notebook
                            // pages where you write from the margin in.
                            textAlign: 'start',
                            color: textColor,
                            // Logical margins: 18px gap on the start side
                            // (so text doesn't slam the gold margin rule),
                            // -10px top to nudge the first line up onto
                            // the first ruled row.
                            marginTop: -10,
                            marginInlineStart: 18,
                            marginInlineEnd: 0,
                            marginBottom: 0,
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                            position: 'relative',
                            zIndex: 1,
                        }}
                    >
                        {cleanText}
                    </p>
                )}

                {hasName && (
                    <div
                        className={nameFontClass}
                        style={{
                            marginTop: h(0),
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4em',
                            fontSize: h(styleSettings.nameFontSizePercent ?? 2.6),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                            color: styleSettings.nameColor ?? styleSettings.fontColor ?? GOLD,
                            justifyContent: 'flex-end',
                            position: 'relative',
                            zIndex: 1,
                        }}
                    >
                        <Heart filled />
                        <span>{entry.name}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
