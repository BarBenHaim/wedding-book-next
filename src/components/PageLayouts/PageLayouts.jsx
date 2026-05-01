'use client'

// PageLayouts — wedding-book page variants.
//
// Hard rules every layout in this file MUST follow:
//
//   1. Photo aspect ratio is ALWAYS 4:3 (landscape) — never cropped.
//      Reason: the upload pipeline (gallery cropper) forces 4:3, so any
//      box with a different ratio + background-size:cover would silently
//      crop the guest's photo. We enforce 4:3 on every PhotoBox so what
//      the guest framed is what the book shows.
//
//   2. Name appears at the BOTTOM of the page paired with a small gold
//      heart. This is the "memory book" signature motif — every layout
//      includes it in some form.
//
//   3. Every length flows through w()/h() — never hard pixels — so the
//      same component renders identically at the live viewer size, the
//      live print PDF, and the auto-export PDF.

import { heebo, gveretLevin, frankRuhl, davidLibre, assistant } from '@/app/fonts'

// ─── Shared helpers ──────────────────────────────────────────────────────────

const PLACEHOLDER_BG = 'linear-gradient(135deg, #e8d5a8 0%, #c9a44e 50%, #aa8840 100%)'
const GOLD = '#aa8840'
const GOLD_SOFT = 'rgba(170,136,64,0.35)'
const GOLD_FAINT = 'rgba(170,136,64,0.15)'
const INK = '#2a2318'
const CREAM = '#fdfbf5'

function makeScalers(scaledWidth, scaledHeight) {
    return {
        w: percent => (percent / 100) * scaledWidth,
        h: percent => (percent / 100) * scaledHeight,
    }
}

function Page({ children, scaledWidth, scaledHeight, background = '#ffffff' }) {
    return (
        <div
            className='relative box-border overflow-hidden'
            style={{ width: scaledWidth, height: scaledHeight, background }}
        >
            {children}
        </div>
    )
}

// PhotoBox — ALWAYS 4:3 landscape. Pass widthPx and the box auto-sizes
// its height to width × 0.75. Never accepts a height override so we
// can't accidentally violate the aspect ratio.
function PhotoBox({ src, widthPx, style, className }) {
    const heightPx = widthPx * 0.75
    return (
        <div
            className={className}
            style={{
                width: widthPx,
                height: heightPx,
                background: src ? 'url(' + src + ') center/cover no-repeat' : PLACEHOLDER_BG,
                ...style,
            }}
        />
    )
}

// Open-outline gold heart, sized in `em` so it inherits font size.
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

function NameSignature({ name, fontClass, h, color = GOLD, align = 'center', size = 2.0 }) {
    if (!name) return null
    return (
        <div
            className={fontClass}
            style={{
                fontSize: h(size),
                color,
                textAlign: align,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center',
                gap: '0.4em',
                lineHeight: 1.2,
            }}
        >
            <Heart color={color} />
            <span>{name}</span>
        </div>
    )
}

// ─── 1. CENTERED ─────────────────────────────────────────────────────────────
function CenteredLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background={CREAM}>
            <div
                className={davidLibre.className}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(7),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    color: INK,
                }}
            >
                <PhotoBox
                    src={entry.imageUrl}
                    widthPx={w(75)}
                    style={{
                        borderRadius: w(1),
                        boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                        marginBottom: h(4),
                    }}
                />
                {entry.text && (
                    <p
                        style={{
                            fontSize: h(2.6),
                            lineHeight: 1.6,
                            textAlign: 'center',
                            maxWidth: w(82),
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}
                <NameSignature name={entry.name} fontClass={gveretLevin.className} h={h} size={2.6} />
            </div>
        </Page>
    )
}

// ─── 2. POLAROID ─────────────────────────────────────────────────────────────
function PolaroidLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    const matSide = w(2.5)
    const matBottom = w(7)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background='#fcfaf6'>
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(6),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <div
                    style={{
                        background: '#ffffff',
                        padding: matSide + 'px ' + matSide + 'px ' + matBottom + 'px ' + matSide + 'px',
                        boxShadow: '0 8px 22px rgba(0,0,0,0.13)',
                        transform: 'rotate(-2.5deg)',
                        marginBottom: h(4),
                    }}
                >
                    <PhotoBox src={entry.imageUrl} widthPx={w(58)} />
                </div>

                {entry.text && (
                    <p
                        className={gveretLevin.className}
                        style={{
                            fontSize: h(3.2),
                            lineHeight: 1.5,
                            color: '#3d2e1a',
                            textAlign: 'center',
                            maxWidth: w(82),
                            margin: 0,
                            marginBottom: h(2),
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}

                <NameSignature
                    name={entry.name}
                    fontClass={gveretLevin.className}
                    h={h}
                    size={2.8}
                />
            </div>
        </Page>
    )
}

// ─── 3. MEMENTO ──────────────────────────────────────────────────────────────
function MementoLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background='#fefcf6'>
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(7),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        marginBottom: h(4),
                    }}
                >
                    <PhotoBox src={entry.imageUrl} widthPx={w(70)} />
                    <div
                        style={{
                            position: 'absolute',
                            top: -h(1.5),
                            left: -w(2),
                            width: w(8),
                            height: h(2),
                            background: 'rgba(170,136,64,0.30)',
                            transform: 'rotate(-25deg)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: -h(1.5),
                            right: -w(2),
                            width: w(8),
                            height: h(2),
                            background: 'rgba(170,136,64,0.30)',
                            transform: 'rotate(25deg)',
                        }}
                    />
                </div>

                {entry.text && (
                    <p
                        className={gveretLevin.className}
                        style={{
                            fontSize: h(2.9),
                            lineHeight: 1.55,
                            color: '#3d2e1a',
                            textAlign: 'center',
                            maxWidth: w(85),
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}

                {entry.name && (
                    <div
                        className={gveretLevin.className}
                        style={{
                            fontSize: h(2.6),
                            color: GOLD,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3em',
                            transform: 'rotate(-2deg)',
                        }}
                    >
                        <span>באהבה,</span>
                        <span style={{ fontWeight: 600 }}>{entry.name}</span>
                        <Heart filled />
                    </div>
                )}
            </div>
        </Page>
    )
}

// ─── 4. LOCKET ───────────────────────────────────────────────────────────────
function LocketLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background={CREAM}>
            <div
                className={frankRuhl.className}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(7),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    color: INK,
                }}
            >
                <div
                    style={{
                        padding: w(0.8),
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, ' + GOLD + ' 0%, #d4b867 50%, ' + GOLD + ' 100%)',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                        marginBottom: h(3),
                    }}
                >
                    <PhotoBox
                        src={entry.imageUrl}
                        widthPx={w(56)}
                        style={{ borderRadius: '50%' }}
                    />
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: w(2),
                        marginBottom: h(3),
                    }}
                >
                    <div style={{ width: w(8), height: 1, background: GOLD_SOFT }} />
                    <Heart filled />
                    <div style={{ width: w(8), height: 1, background: GOLD_SOFT }} />
                </div>

                {entry.text && (
                    <p
                        style={{
                            fontSize: h(2.5),
                            lineHeight: 1.6,
                            textAlign: 'center',
                            maxWidth: w(82),
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}

                {entry.name && (
                    <div
                        style={{
                            fontSize: h(2.2),
                            color: GOLD,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                            letterSpacing: '0.04em',
                        }}
                    >
                        <Heart />
                        <span>{entry.name}</span>
                        <Heart />
                    </div>
                )}
            </div>
        </Page>
    )
}

// ─── 5. SCRAPBOOK ────────────────────────────────────────────────────────────
function ScrapbookLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background='#fbf6e9'>
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(7),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        background: '#fff',
                        padding: w(1.5),
                        boxShadow: '0 6px 16px rgba(0,0,0,0.10)',
                        transform: 'rotate(1.5deg)',
                        marginBottom: h(4),
                    }}
                >
                    <PhotoBox src={entry.imageUrl} widthPx={w(65)} />
                </div>

                {entry.text && (
                    <p
                        className={gveretLevin.className}
                        style={{
                            fontSize: h(2.9),
                            lineHeight: 1.55,
                            color: '#3d2e1a',
                            textAlign: 'center',
                            maxWidth: w(82),
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}

                {entry.name && (
                    <div
                        className={gveretLevin.className}
                        style={{
                            position: 'absolute',
                            bottom: h(5),
                            left: w(7),
                            fontSize: h(2.6),
                            color: GOLD,
                            transform: 'rotate(-3deg)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3em',
                        }}
                    >
                        <Heart filled />
                        <span>{entry.name}</span>
                    </div>
                )}
            </div>
        </Page>
    )
}

// ─── 6. LETTER ───────────────────────────────────────────────────────────────
function LetterLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background='#fffdf6'>
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(7),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    color: INK,
                }}
            >
                <PhotoBox
                    src={entry.imageUrl}
                    widthPx={w(70)}
                    style={{
                        boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
                        marginBottom: h(3),
                    }}
                />

                <div
                    style={{
                        width: w(50),
                        marginBottom: h(3),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                    }}
                >
                    <div style={{ height: 1, background: GOLD_SOFT }} />
                    <div style={{ height: 1, background: GOLD_FAINT }} />
                </div>

                {entry.text && (
                    <p
                        className={davidLibre.className}
                        style={{
                            fontSize: h(2.5),
                            lineHeight: 1.7,
                            textAlign: 'center',
                            maxWidth: w(85),
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}

                {entry.name && (
                    <div
                        className={gveretLevin.className}
                        style={{
                            fontSize: h(2.6),
                            color: GOLD,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4em',
                            marginTop: h(2),
                        }}
                    >
                        <span>באהבה,</span>
                        <span style={{ fontWeight: 600 }}>{entry.name}</span>
                        <Heart />
                    </div>
                )}
            </div>
        </Page>
    )
}

// ─── 7. FRAMED ───────────────────────────────────────────────────────────────
function FramedLayout({ entry, scaledWidth, scaledHeight }) {
    const { w, h } = makeScalers(scaledWidth, scaledHeight)
    return (
        <Page scaledWidth={scaledWidth} scaledHeight={scaledHeight} background={CREAM}>
            <div
                style={{
                    position: 'absolute',
                    inset: w(3),
                    border: '1px solid ' + GOLD_SOFT,
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: w(4),
                    border: '1px solid ' + GOLD_FAINT,
                    pointerEvents: 'none',
                }}
            />

            <div
                className={davidLibre.className}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: h(8),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    color: INK,
                }}
            >
                <PhotoBox
                    src={entry.imageUrl}
                    widthPx={w(74)}
                    style={{
                        boxShadow: '0 5px 15px rgba(0,0,0,0.10)',
                        marginBottom: h(4),
                    }}
                />

                {entry.text && (
                    <p
                        style={{
                            fontSize: h(2.4),
                            lineHeight: 1.65,
                            textAlign: 'center',
                            maxWidth: w(80),
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {entry.text}
                    </p>
                )}

                <div
                    style={{
                        width: w(20),
                        height: 1,
                        background: GOLD_SOFT,
                        marginBottom: h(2),
                    }}
                />
                <NameSignature
                    name={entry.name}
                    fontClass={assistant.className}
                    h={h}
                    size={1.8}
                />
            </div>
        </Page>
    )
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const LAYOUTS = [
    {
        id: 'centered',
        label: 'מרכזי קלאסי',
        description: 'תמונה במרכז, ברכה למטה, ושם עם לב זהוב בתחתית בכתב יד. הברירת-מחדל הנקייה — עובדת לכל סוג ברכה.',
        Component: CenteredLayout,
    },
    {
        id: 'polaroid',
        label: 'פולארויד',
        description: 'תמונה במסגרת לבנה עבה כמו פולארויד אמיתי, מוטה -2.5°. הברכה בכתב יד מתחת, חתימה עם לב למטה.',
        Component: PolaroidLayout,
    },
    {
        id: 'memento',
        label: 'מזכרת',
        description: 'תמונה עם פסי וושי-טייפ זהובים בפינות, ברכה כתובה בכתב יד, וחתימה "באהבה, [שם] ♥" מוטה — כמו דף ביומן.',
        Component: MementoLayout,
    },
    {
        id: 'locket',
        label: 'מדליון',
        description: 'תמונה אובלית במסגרת זהב מתכתי, ברכה אלגנטית בפרנק רוהל, שם בין שני לבבות זהובים למטה — מבט פורטרט יוקרתי.',
        Component: LocketLayout,
    },
    {
        id: 'scrapbook',
        label: 'סקרפבוק',
        description: 'תמונה "מודבקת" בזווית 1.5° על דף בז׳, ברכה מתחת, חתימה אישית בפינה שמאל-תחתון מוטה. אווירה של ספר זיכרונות.',
        Component: ScrapbookLayout,
    },
    {
        id: 'letter',
        label: 'מכתב',
        description: 'תמונה למעלה, פס זהב כפול דק מפריד, ברכה כגוף המכתב, וחתימה "באהבה, [שם] ♡" כסיום אישי.',
        Component: LetterLayout,
    },
    {
        id: 'framed',
        label: 'במסגרת זהב',
        description: 'מסגרת זהב כפולה דקה סביב כל העמוד, תמונה למעלה, ברכה במרכז, ושם בתחתית מתחת לקו זהב — מראה אלבום קלאסי.',
        Component: FramedLayout,
    },
]

export default LAYOUTS
