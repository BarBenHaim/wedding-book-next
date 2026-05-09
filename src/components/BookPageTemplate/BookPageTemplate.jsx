'use client'

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { pageScale } from '@/lib/pageGeometry'
import EntryPhoto from '../EntryPhoto/EntryPhoto'
import PolaroidPageLayout from '../PolaroidPageLayout/PolaroidPageLayout'
import ScrapbookPageLayout from '../ScrapbookPageLayout/ScrapbookPageLayout'
import NotebookPageLayout from '../NotebookPageLayout/NotebookPageLayout'
import CollagePageLayout from '../CollagePageLayout/CollagePageLayout'

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
    const passThrough = { entry, styleSettings, scaledWidth, scaledHeight }
    if (styleSettings?.template === 'polaroid') return <PolaroidPageLayout {...passThrough} />
    if (styleSettings?.template === 'scrapbook') return <ScrapbookPageLayout {...passThrough} />
    if (styleSettings?.template === 'notebook') return <NotebookPageLayout {...passThrough} />
    if (styleSettings?.template === 'collage') return <CollagePageLayout {...passThrough} />

    // ── Classic layout (default) ─────────────────────────────────────────
    // Auto-clean the blessing at display time so legacy entries with extra
    // blank lines / runs of spaces don't overflow the page. Newly submitted
    // blessings are already normalized on the way in, so this is a no-op for
    // them.
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const elementsCount = [hasName, hasText, hasImage].filter(Boolean).length
    const onlyOne = elementsCount === 1

    const { w, h } = pageScale(scaledWidth, scaledHeight)

    return (
        <div
            className={`relative flex flex-col items-center text-center box-border overflow-hidden ${
                onlyOne ? 'justify-center' : ''
            }`}
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: resolvedTexture ? `url(${resolvedTexture})` : 'none',
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

            {/* שם האורח */}
            {hasName && (
                <div
                    className={styleSettings.fontClass}
                    style={{
                        fontSize: h(
                            styleSettings.nameFontSizePercent ??
                                (styleSettings.fontSizePercent ? styleSettings.fontSizePercent * 0.7 : 2.1)
                        ),
                        color: styleSettings.fontColor,
                        opacity: 0.85,
                        marginTop: onlyOne ? 0 : h(styleSettings.nameMarginTop ?? 2),
                        marginBottom: onlyOne ? 0 : h(styleSettings.nameMarginBottom ?? 1),
                        textAlign: styleSettings.nameAlign ?? 'center',
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
                const slotW = w(styleSettings.imageStyle?.width ?? 80)
                const slotH = slotW * 0.75 // 4:3 lock
                return (
                    <EntryPhoto
                        src={entry.imageUrl}
                        maxWidth={slotW}
                        maxHeight={slotH}
                        className='relative'
                        style={{
                            borderRadius: styleSettings.imageStyle?.borderRadius ?? '12px',
                            marginTop: onlyOne ? 0 : h(styleSettings.imageMarginTop ?? 2),
                            marginBottom: onlyOne ? 0 : h(styleSettings.imageMarginBottom ?? 2),
                            alignSelf:
                                styleSettings.imageAlign === 'left'
                                    ? 'flex-start'
                                    : styleSettings.imageAlign === 'right'
                                    ? 'flex-end'
                                    : 'center',
                            zIndex: 5,
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
                        textAlign: styleSettings.textAlign ?? 'center',
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <p
                        className={styleSettings.fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSizePercent ?? 3),
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
