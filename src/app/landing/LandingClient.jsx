'use client'

// /landing — the marketing landing page (app.weddingtales.co.il/landing).
//
// v4, summer 2026 — "the page IS a book". The whole landing reads like
// the object it sells: a gold reading-ribbon tracks scroll progress,
// the three real customer books are presented as CHAPTERS (פרק ראשון /
// שני / שלישי) with art-directed spreads, page-number folios mark the
// sections, and handwritten margin notes use Gveret Levin — the same
// face real guests' blessings render in. Conversion layer: hero CTA
// pair, per-chapter live-book embeds, an interactive "write a blessing"
// demo, a single-price statement, and a sticky WhatsApp bar that
// appears once the reader is past the hero (mobile + desktop pill).
//
// All content is REAL: three live customer books (dedicated landing
// tokens, issuedBy:'landing-page' in digitalTokensIssuedAt — revoke
// there without touching the family links), real spread screenshots,
// real event dates, and pull-quotes transcribed from actual blessings
// visible in the captured spreads. No fabricated testimonials.
//   bar mitzvah 5483 (נועם) · birthday 6175 (ג׳רי) ·
//   wedding rOPkVWbwurT4UjKCR5hg (דור ושקד)

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Assistant, Heebo } from 'next/font/google'
import { buildGuestPageTheme } from '@/lib/guestPageTheme'
import heMessages from '@/i18n/messages/he.json'
import { normalizeBlessing } from '@/lib/normalizeText'
import { gveretLevin } from '@/app/fonts'
import { Camera, Check, ChevronDown, BookOpen, Sparkles } from 'lucide-react'

const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['300', '400', '600', '700'] })
// Display face — Heebo Black for the big statements (replaced Frank Ruhl
// per Bar's request, spring 2026). Local instance so we get the 900
// weight without touching the app-wide fonts.js registry.
const heeboDisplay = Heebo({ subsets: ['hebrew', 'latin'], weight: ['700', '900'] })

const WA = 'https://wa.link/0sesxc'

// ─── The three real books, presented as chapters ─────────────────────
// Order follows the owner's brief: Noam → Jerry → Dor & Shaked.
// This is the built-in DEFAULT set — the super-admin can override the
// whole list from /admin/landing (saved to site_config/landing and
// passed down by the server page as the `chapters` prop).
export const DEFAULT_CHAPTERS = [
    {
        slug: 'bar-mitzvah',
        chapter: 'פרק ראשון',
        n: '01',
        badge: 'בר מצווה',
        title: 'נועם',
        date: 'יוני 2026',
        story: 'ארבעים וחמישה חברים מהשכבה, המדריכים מהתנועה, הדודים, סבא וסבתא — כולם נכנסו לספר אחד. הטלפונים יתחלפו והתמונות יתפזרו; הספר הזה יחכה על המדף גם כשנועם יתגייס.',
        stats: ['45 ברכות', '45 תמונות', 'מהשכבה ועד סבא וסבתא'],
        quote: 'מזל טוב! תמשיך להיות חבר טוב שלא מוותר על טורניר או משחק כדורגל',
        quoteBy: 'לידור, חבר — מתוך הספר',
        weddingId: '5483',
        token: '0b02382b-7d8e-40a8-804b-1c5bdd31c1ae',
        spreads: 5,
        theme: 'ivory',
    },
    {
        slug: 'birthday',
        chapter: 'פרק שני',
        n: '02',
        badge: 'יום הולדת 90',
        title: 'ג׳רי',
        date: 'יוני 2026',
        story: 'משפחה על פני שתי יבשות, ברכות בעברית ובאנגלית, ותשעים שנות חיים שנפגשו על אותו נייר. הנכדים כתבו מעבר לים, החברים כתבו מהשולחן — ולג׳רי נשאר ספר שמחזיק את כולם.',
        stats: ['31 ברכות', 'משפחה משתי יבשות', 'עברית ואנגלית'],
        quote: 'Nine decades of living honestly and faithfully — truly a lifetime to be admired',
        quoteBy: 'David, מתוך הספר',
        weddingId: '6175',
        token: 'a319b00d-7ed2-48cf-b88b-d41a98f35e05',
        spreads: 3,
        theme: 'ink',
    },
    {
        slug: 'wedding',
        chapter: 'פרק שלישי',
        n: '03',
        badge: 'חתונה',
        title: 'דור ושקד',
        date: 'אפריל 2026',
        story: 'בין החופה לריקודים, האורחים כתבו להם ספר שלם. למחרת בבוקר, כשהאולם כבר עמד ריק, הערב כולו חיכה להם — כתוב, מצולם, ומסודר לפי האנשים שהם הכי אוהבים.',
        stats: ['24 ברכות', '24 תמונות', 'ערב אחד'],
        quote: 'מאחלים לכם חיים מלאים באושר, חוויות טובות והמון חברים מסביב',
        quoteBy: 'משפחת ביבי, מתוך הספר',
        weddingId: 'rOPkVWbwurT4UjKCR5hg',
        token: '529b8a86-ca5d-4944-8178-c75c0420095d',
        spreads: 5,
        theme: 'blush',
    },
]

// Image resolution — explicit URLs (set in /admin/landing for new
// projects) win; otherwise the chapter's built-in static image set.
const coverSrc = b => b.coverUrl || `/imgs/portfolio/${b.slug}/cover.webp`
const spreadSrcs = b =>
    Array.isArray(b.spreadUrls) && b.spreadUrls.length > 0
        ? b.spreadUrls
        : Array.from({ length: b.spreads || 0 }, (_, i) => `/imgs/portfolio/${b.slug}/spread-${i + 1}.webp`)

// Marquee strip — one continuous ribbon of real spreads from all three
// books (duplicated in the DOM for a seamless CSS loop).
const MARQUEE = [
    '/imgs/portfolio/bar-mitzvah/spread-1.webp',
    '/imgs/portfolio/wedding/spread-2.webp',
    '/imgs/portfolio/birthday/spread-1.webp',
    '/imgs/portfolio/bar-mitzvah/spread-3.webp',
    '/imgs/portfolio/wedding/spread-4.webp',
    '/imgs/portfolio/birthday/spread-2.webp',
    '/imgs/portfolio/wedding/spread-1.webp',
    '/imgs/portfolio/bar-mitzvah/spread-5.webp',
]

const FAQ = [
    { q: 'מה בדיוק מקבלים?', a: 'ספר מודפס בכריכה קשה על נייר ארכיב, ספר דיגיטלי לדפדוף ולשיתוף, וגישה למערכת לניהול הברכות ובחירת העיצוב.' },
    { q: 'כמה זמן עד שהספר אצלכם?', a: 'כ־4 שבועות מאישור העיצוב הסופי. הספר הדיגיטלי מוכן מיד — עוד באותו ערב מדפדפים בברכות.' },
    { q: 'אפשר להוסיף ברכות אחרי האירוע?', a: 'כן. הקישור נשאר פעיל — מי שפספס מוסיף ברכה גם בימים שאחרי, עד שסוגרים את הספר להדפסה.' },
    { q: 'האורחים המבוגרים יסתדרו?', a: 'כן. סריקת ה־QR פותחת עמוד פשוט בדפדפן — בלי אפליקציה, בלי הרשמה. דווקא מהדור המבוגר מגיעות הברכות הכי מרגשות.' },
    { q: 'ואם לא כולם ישתתפו?', a: 'גם השתתפות חלקית עושה ספר מלא ומרגש. אנחנו עוזרים עם שילוט ותזכורות, ואפשר להשלים ברכות אחרי האירוע.' },
    { q: 'האירוע נדחה — מה עכשיו?', a: 'שום דבר לא הולך לאיבוד. הקישור והמערכת נשארים פעילים ופשוט מתואמים מחדש. לא משלמים פעמיים.' },
]

// Paper-grain overlay (SVG turbulence, data URI — no network).
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`

// Small folio marker — "page number" chrome that carries the book
// metaphor through the scroll. Purely decorative (aria-hidden).
function Folio({ n, label, dark = false }) {
    return (
        <div className='folio' aria-hidden style={{ color: dark ? 'rgba(226,195,119,0.85)' : '#a8843a' }}>
            <span className='folioRule' style={{ background: dark ? 'rgba(226,195,119,0.4)' : 'rgba(168,132,58,0.4)' }} />
            <span className='folioTxt'>עמ׳ {n} · {label}</span>
            <span className='folioRule' style={{ background: dark ? 'rgba(226,195,119,0.4)' : 'rgba(168,132,58,0.4)' }} />
        </div>
    )
}

// ─── One art-directed chapter per book ───────────────────────────────
function Chapter({ book }) {
    const frames = useMemo(() => [coverSrc(book), ...spreadSrcs(book)], [book])
    const ink = book.theme === 'ink'
    const blush = book.theme === 'blush'

    return (
        <section
            className='chapter obs'
            style={{
                background: ink
                    ? 'linear-gradient(180deg, #191410 0%, #14100b 100%)'
                    : blush
                        ? 'linear-gradient(180deg, #f6ebe2 0%, #f2e2d6 100%)'
                        : 'transparent',
                color: ink ? '#f3e9d2' : '#1c1712',
            }}
        >
            {(ink || blush) && <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, pointerEvents: 'none' }} />}

            {/* Ghost chapter numeral bleeding off the margin */}
            <span className={`${heeboDisplay.className} ghostN`} aria-hidden style={{ color: ink ? 'rgba(226,195,119,0.07)' : 'rgba(168,132,58,0.09)' }}>
                {book.n}
            </span>

            <div className='shell chapterInner'>
                <div className='chGrid'>
                    {/* The object itself — cover with a stacked "back cover" */}
                    <div className='chCoverWrap obs'>
                        <div className='chCoverStack'>
                            <span className='chCoverBack' aria-hidden style={{ background: ink ? '#26200f' : '#e4d3ae' }} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={frames[0]} alt={`הכריכה של ${book.title}`} loading='lazy' className='chCoverImg' />
                        </div>
                        <p className={`${gveretLevin.className} handnote`} style={{ color: ink ? 'rgba(243,233,210,0.72)' : '#8a6d45', textAlign: 'center' }}>
                            הספר של {book.title} · {book.date}
                        </p>
                    </div>

                    {/* Chapter text */}
                    <div className='chText'>
                        <p className='overline' style={{ color: ink ? '#cfa860' : '#a8843a' }}>
                            {book.chapter} · {book.badge} · {book.date}
                        </p>
                        <h3 className={`${heeboDisplay.className} chTitle`}>{book.title}</h3>
                        <p className='chStory'>{book.story}</p>
                        <ul className='statList' style={{ borderColor: ink ? 'rgba(207,168,96,0.35)' : 'rgba(168,132,58,0.35)' }}>
                            {book.stats.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                        <blockquote className={`${heeboDisplay.className} pull`} style={{ color: ink ? '#e9dab3' : '#4a3a25' }}>
                            ”{book.quote}“
                            <cite className={assistant.className}>{book.quoteBy}</cite>
                        </blockquote>
                    </div>
                </div>

                {/* The real spreads — drag/scroll filmstrip */}
                <div className='filmstrip' aria-label={`עמודים מתוך הספר של ${book.title}`}>
                    {frames.slice(1).map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={src} src={src} alt={`כפולה ${i + 1} מתוך הספר של ${book.title}`} loading='lazy' className='frame' />
                    ))}
                </div>
            </div>
        </section>
    )
}

// ─── Guest-form replica ──────────────────────────────────────────────
// A faithful, non-submitting copy of the REAL guest blessing form —
// the same palette module the production page uses
// (lib/guestPageTheme), the same background, card, inputs and button,
// driven by the same wedding-doc fields (eventType / designVariant /
// guestDesign / names / custom form copy). What visitors see here IS
// the page their guests get. Submissions stay local: the blessing
// drops into the demo book on the right, nothing is saved.
function GuestFormReplica({ wedding, form, setForm, photo, onPickPhoto, fileRef, onSubmit, added }) {
    const eventType = wedding?.eventType || 'wedding'
    const { theme, isPoker, isRomantic } = buildGuestPageTheme({
        eventType,
        designVariant: wedding?.designVariant || '',
        guestDesign: wedding?.guestDesign || null,
    })
    const tp = heMessages.photo

    // Headline — same resolution order as the real page: Hebrew-script
    // names first, then the original fields, then the generic default.
    const bride = (wedding?.brideNameHe || wedding?.brideName || '').trim()
    const groom = (wedding?.groomNameHe || wedding?.groomName || '').trim()
    const celebrant = (wedding?.celebrantNameHe || wedding?.celebrantName || '').trim()
    let pageTitle = tp.pageTitleWedding
    if (isRomantic) pageTitle = tp.pageTitleRomantic
    else if (eventType === 'wedding') {
        if (bride && groom) pageTitle = tp.pageTitleWithCouple.replace('{first}', bride).replace('{second}', groom)
        else if (bride || groom) pageTitle = tp.pageTitleWithName.replace('{name}', bride || groom)
    } else if (celebrant) pageTitle = tp.pageTitleWithName.replace('{name}', celebrant)

    // Form copy — the couple's admin overrides win, then the variant
    // copy, then the default — exactly like PhotoApp.
    const nameLabel = (wedding?.customNameLabel || '').trim() || (isRomantic ? tp.nameLabelRomantic : tp.nameLabel)
    const namePlaceholder = (wedding?.customNamePlaceholder || '').trim() || (isRomantic ? tp.namePlaceholderRomantic : tp.namePlaceholder)
    const blessingLabel = (wedding?.customBlessingLabel || '').trim() || (isRomantic ? tp.blessingLabelRomantic : tp.blessingLabel)
    const blessingPlaceholder = (wedding?.customBlessingPlaceholder || '').trim() || (isRomantic ? tp.blessingPlaceholderRomantic : tp.blessingPlaceholder)
    const subtitle = isRomantic ? tp.pageSubtitleRomantic : tp.pageSubtitle
    const maxChars = Number(wedding?.blessingMaxChars) || 210

    return (
        <div
            className='replicaPage'
            style={{
                backgroundColor: theme.pageBg,
                backgroundImage: theme.pageBgImage,
                backgroundSize: theme.pageBgSize,
                backgroundPosition: theme.pageBgPosition,
                backgroundRepeat: theme.pageBgRepeat,
            }}
        >
            <div style={{ width: '100%', maxWidth: '26rem', position: 'relative', zIndex: 1 }}>
                {/* ── Title block — same ornaments as the real page ── */}
                <div style={{ textAlign: 'center', marginBottom: 26, position: 'relative' }}>
                    {isRomantic && (
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute',
                                inset: -30,
                                background: [
                                    'radial-gradient(ellipse 65% 55% at 32% 38%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%)',
                                    'radial-gradient(ellipse 70% 45% at 68% 60%, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0) 70%)',
                                    'radial-gradient(ellipse 55% 50% at 50% 25%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)',
                                ].join(', '),
                                filter: 'blur(10px)',
                                zIndex: 0,
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    {theme.showCrown && (
                        <svg viewBox='0 0 64 28' style={{ width: 58, height: 26, margin: '0 auto 6px' }} fill={theme.accentColor}>
                            <path d='M4 22 L8 9 L16 17 L24 6 L32 14 L40 6 L48 17 L56 9 L60 22 Z' />
                            <rect x='4' y='23' width='56' height='3.5' rx='0.5' />
                            <circle cx='32' cy='12' r='1.7' fill='#7d1414' />
                        </svg>
                    )}
                    {!isRomantic && (
                        <svg viewBox='0 0 24 24' style={{ width: 20, height: 20, margin: '0 auto 14px', display: 'block' }} fill={theme.accentColor}>
                            <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                        </svg>
                    )}
                    <h2
                        style={{
                            color: isPoker ? undefined : theme.titleColor,
                            fontSize: isRomantic ? 34 : 26,
                            fontWeight: 700,
                            lineHeight: 1.15,
                            margin: '0 0 8px',
                            position: 'relative',
                            zIndex: 1,
                            ...(isPoker
                                ? {
                                      backgroundImage: 'linear-gradient(180deg, #fde9b3 0%, #d4af37 50%, #a8843a 100%)',
                                      WebkitBackgroundClip: 'text',
                                      backgroundClip: 'text',
                                      WebkitTextFillColor: 'transparent',
                                      color: 'transparent',
                                  }
                                : {}),
                            ...(isRomantic ? { textShadow: '0 1px 6px rgba(0,0,0,0.45)' } : {}),
                        }}
                    >
                        {pageTitle}
                    </h2>
                    <p
                        style={{
                            color: theme.subtitleColor,
                            fontSize: 13.5,
                            lineHeight: 1.6,
                            margin: 0,
                            position: 'relative',
                            zIndex: 1,
                            ...(isRomantic ? { textShadow: '0 1px 5px rgba(0,0,0,0.4)' } : {}),
                        }}
                    >
                        {subtitle}
                    </p>
                </div>

                {/* ── Form card — 1:1 with the production card ── */}
                <div
                    style={{
                        borderRadius: 22,
                        padding: '20px',
                        background: theme.cardBg,
                        backgroundSize: isRomantic ? '100% 100%' : undefined,
                        boxShadow: theme.cardShadow,
                        border: theme.cardBorder,
                        overflow: isRomantic ? 'visible' : 'hidden',
                        position: 'relative',
                    }}
                >
                    <div style={{ position: 'relative', zIndex: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span style={{ color: theme.cardLabelColor, fontSize: 14, fontWeight: 700 }}>{nameLabel}</span>
                            <svg viewBox='0 0 24 24' style={{ width: 20, height: 20, flexShrink: 0 }} fill='none' stroke={isRomantic ? theme.cardLabelColor : theme.accentColor} strokeWidth={1.8}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z' />
                            </svg>
                        </div>
                        <input
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder={namePlaceholder}
                            maxLength={40}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                borderRadius: 12,
                                outline: 'none',
                                background: theme.inputBg,
                                border: `1px solid ${theme.inputBorder}`,
                                padding: '12px 16px',
                                color: theme.inputTextColor,
                                fontSize: 16,
                                fontFamily: 'inherit',
                            }}
                            onFocus={e => (e.currentTarget.style.borderColor = theme.inputFocusBorder)}
                            onBlur={e => (e.currentTarget.style.borderColor = theme.inputBorder)}
                        />
                    </div>

                    {/* Divider — heart (spade on poker), same as production */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '20px 0' }}>
                        <span style={{ display: 'block', height: 1, flex: 1, background: `linear-gradient(to left, transparent, ${theme.dividerLine}, transparent)` }} />
                        <svg viewBox='0 0 24 24' style={{ width: 12, height: 12, flexShrink: 0 }} fill={theme.accentColor}>
                            {isPoker ? (
                                <path d='M12 2 C 14.5 5.5, 19 8, 19 13 C 19 16, 16.5 18, 14 17.4 L 14.8 21 L 9.2 21 L 10 17.4 C 7.5 18, 5 16, 5 13 C 5 8, 9.5 5.5, 12 2 Z' />
                            ) : (
                                <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                            )}
                        </svg>
                        <span style={{ display: 'block', height: 1, flex: 1, background: `linear-gradient(to right, transparent, ${theme.dividerLine}, transparent)` }} />
                    </div>

                    <div style={{ position: 'relative', zIndex: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span style={{ color: theme.cardLabelColor, fontSize: 14, fontWeight: 700 }}>{blessingLabel}</span>
                            <span style={{ color: theme.cardCounterColor, fontSize: 12 }}>
                                {tp.charCount.replace('{used}', String(form.text.length)).replace('{max}', String(maxChars))}
                            </span>
                        </div>
                        <textarea
                            value={form.text}
                            onChange={e => setForm(f => ({ ...f, text: e.target.value.slice(0, maxChars) }))}
                            placeholder={blessingPlaceholder}
                            rows={4}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                borderRadius: 12,
                                outline: 'none',
                                resize: 'none',
                                background: theme.inputBg,
                                border: `1px solid ${theme.inputBorder}`,
                                padding: '12px 16px',
                                color: theme.inputTextColor,
                                fontSize: 16,
                                lineHeight: 1.6,
                                fontFamily: 'inherit',
                            }}
                            onFocus={e => (e.currentTarget.style.borderColor = theme.inputFocusBorder)}
                            onBlur={e => (e.currentTarget.style.borderColor = theme.inputBorder)}
                        />
                    </div>
                </div>

                {/* Photo + submit — production button styling (gradient +
                    shadow from the theme), local-only behavior. */}
                <input ref={fileRef} type='file' accept='image/*' onChange={onPickPhoto} style={{ display: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                    <button
                        type='button'
                        onClick={() => fileRef.current?.click()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 18px',
                            borderRadius: 999,
                            fontSize: 13.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: 'transparent',
                            color: isRomantic || isPoker ? theme.titleColor : theme.cardLabelColor,
                            border: `1px solid ${theme.inputBorder}`,
                            fontFamily: 'inherit',
                            textShadow: isRomantic ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
                        }}
                    >
                        <Camera size={15} /> {photo ? 'החלפת תמונה' : 'הוספת תמונה'}
                    </button>
                    {photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.url} alt='' style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', border: `1px solid ${theme.inputBorder}` }} />
                    )}
                </div>
                <button
                    type='button'
                    onClick={onSubmit}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 9,
                        width: '100%',
                        marginTop: 14,
                        padding: '15px 26px',
                        borderRadius: 999,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#ffffff',
                        background: theme.buttonGradient,
                        boxShadow: theme.buttonShadow,
                        fontFamily: 'inherit',
                    }}
                >
                    {added ? <><Check size={17} /> נוספה לספר! דפדפו</> : <><Sparkles size={17} /> הוסיפו לספר</>}
                </button>
                <p
                    style={{
                        textAlign: 'center',
                        fontSize: 11.5,
                        marginTop: 12,
                        marginBottom: 0,
                        color: theme.trustText,
                        textShadow: isRomantic ? '0 1px 4px rgba(0,0,0,0.35)' : 'none',
                    }}
                >
                    הדגמה בלבד — שום דבר לא נשמר
                </p>
            </div>
        </div>
    )
}

export default function LandingClient({ liveWedding = null, chapters: chaptersProp = null }) {
    // Showcased projects — admin-managed list when one is saved,
    // otherwise the built-in trio. Hero covers + the marquee ribbon
    // derive from the ACTIVE list so swapped projects flow everywhere.
    const chapters = Array.isArray(chaptersProp) && chaptersProp.length > 0 ? chaptersProp : DEFAULT_CHAPTERS
    const heroCovers = useMemo(() => {
        if (!chaptersProp) {
            // Built-in composition: wedding cover largest, then bar
            // mitzvah, then birthday — preserved exactly.
            return [
                '/imgs/portfolio/wedding/cover.webp',
                '/imgs/portfolio/bar-mitzvah/cover.webp',
                '/imgs/portfolio/birthday/cover.webp',
            ]
        }
        const covers = chapters.map(coverSrc)
        while (covers.length < 3) covers.push(covers[covers.length - 1] || '/imgs/portfolio/wedding/cover.webp')
        return covers.slice(0, 3)
    }, [chaptersProp, chapters])
    const marquee = useMemo(() => {
        if (!chaptersProp) return MARQUEE
        const all = chapters.flatMap(spreadSrcs)
        return all.length > 0 ? all.slice(0, 10) : MARQUEE
    }, [chaptersProp, chapters])
    // ── LIVE design sync ─────────────────────────────────────────────
    // `liveWedding` arrives from the SERVER (app/landing/page.js reads
    // Dor & Shaked's wedding doc with the Admin SDK, ISR-revalidated
    // every 5 minutes) — so the demo book + the guest-form replica are
    // baked into the HTML with the couple's real, current design.
    // Change their preset in the studio → the landing follows within
    // minutes, no client fetch, no flicker. When the server fetch
    // fails we fall back to a hand-copied snapshot of the same design.

    // Scroll-reveal: .obs elements get .in when they enter the viewport.
    useEffect(() => {
        const els = document.querySelectorAll('.obs')
        const io = new IntersectionObserver(
            entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }),
            { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
        )
        els.forEach(el => io.observe(el))
        return () => io.disconnect()
    }, [])

    // Hide the global Header + Footer on this route — same pattern as
    // /wedding/[id]/book/[token] — so the landing is fully immersive.
    useEffect(() => {
        const header = document.querySelector('body > header')
        const footer = document.querySelector('body > footer')
        const prevHeader = header?.style.display
        const prevFooter = footer?.style.display
        if (header) header.style.display = 'none'
        if (footer) footer.style.display = 'none'
        return () => {
            if (header) header.style.display = prevHeader || ''
            if (footer) footer.style.display = prevFooter || ''
        }
    }, [])

    // Reading ribbon (scroll progress) + sticky CTA visibility + hero
    // parallax — one rAF-throttled scroll listener drives all three.
    const [ctaVisible, setCtaVisible] = useState(false)
    // Portal target for the sticky CTA. Rendering the CTA under
    // document.body via createPortal guarantees no transformed ancestor
    // (a .obs entrance transition, an animation, a stacking context
    // opened by contain/filter/backdrop-filter anywhere in the tree)
    // can re-parent position:fixed away from the viewport. This was the
    // "sometimes jumps to the middle" bug — a mid-page transform on
    // an ancestor briefly turned .stickyCta into an absolute-in-parent.
    const [portalReady, setPortalReady] = useState(false)
    useEffect(() => { setPortalReady(true) }, [])
    const heroRef = useRef(null)
    const ribbonRef = useRef(null)
    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        let raf = 0
        const onScroll = () => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const doc = document.documentElement
                const max = Math.max(1, doc.scrollHeight - window.innerHeight)
                if (ribbonRef.current) ribbonRef.current.style.transform = `scaleX(${Math.min(1, window.scrollY / max)})`
                setCtaVisible(window.scrollY > window.innerHeight * 0.85)
                if (!reduced && heroRef.current) heroRef.current.style.setProperty('--py', String(Math.min(window.scrollY, 720)))
            })
        }
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
    }, [])

    const [form, setForm] = useState({ name: '', text: '' })
    const [photo, setPhoto] = useState(null)
    const [added, setAdded] = useState(false)
    const fileRef = useRef(null)
    const onPickPhoto = e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        if (photo?.url) URL.revokeObjectURL(photo.url)
        setPhoto({ url: URL.createObjectURL(f) })
    }
    // Demo submit — no network. The form clears and shows a brief
    // "added" confirmation so the interaction feels real; nothing else
    // needs to happen now that the flipbook preview is gone.
    const addBlessing = () => {
        const text = normalizeBlessing(form.text)
        if (!text && !photo) return
        setForm({ name: '', text: '' })
        setPhoto(null)
        setAdded(true)
        setTimeout(() => setAdded(false), 3000)
    }

    const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    return (
        <div dir='rtl' className={assistant.className} style={{ minHeight: '100vh', background: '#f8f2e7', color: '#1c1712', overflowX: 'hidden', paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>

            {/* Reading ribbon — gold progress bar, the book's bookmark */}
            <div className='ribbon' aria-hidden><span ref={ribbonRef} className='ribbonFill' /></div>

            {/* ═══════════ HERO — the cover of this "book" ═══════════ */}
            <header ref={heroRef} className='hero' style={{ backgroundImage: GRAIN }}>
                <div className='heroFrame' aria-hidden />
                <div className='shell heroGrid'>
                    <div className='heroText'>
                        <p className='overline obs' style={{ color: '#a8843a' }}>Wedding Tales · ספרי ברכות מאירועים אמיתיים</p>
                        <h1 className={`${heeboDisplay.className} heroTitle obs`}>
                            את הספר הזה
                            <br />
                            <em>כותבים האורחים שלכם.</em>
                        </h1>
                        <p className='heroSub obs'>
                            QR על השולחן, תמונה מהטלפון וכמה מילים מהלב — ובבוקר שאחרי
                            יש לכם ספר. כזה שפותחים בסלון גם בעוד עשרים שנה.
                        </p>
                        <div className='heroCtas obs'>
                            <button onClick={() => scrollTo('chapters')} className='btn btnSolid big'>
                                <BookOpen size={18} /> דפדפו בספרים אמיתיים
                            </button>
                            <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGhost big'>
                                <WaIcon /> דברו איתנו
                            </a>
                        </div>
                        <p className='heroPrice obs'>
                            1,290 ₪ · מחיר אחד, הכול כלול · ספר דיגיטלי עוד באותו ערב · <a href='#pricing' onClick={e => { e.preventDefault(); scrollTo('pricing') }} style={{ color: '#a8843a' }}>מה מקבלים ←</a>
                        </p>
                    </div>

                    {/* Fan of real covers (from the active chapter set), parallax drift */}
                    <div className='heroArt' aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={heroCovers[0]} alt='' className='ha ha1' fetchPriority='high' onClick={() => scrollTo('chapters')} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={heroCovers[1]} alt='' className='ha ha2' loading='lazy' onClick={() => scrollTo('chapters')} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={heroCovers[2]} alt='' className='ha ha3' loading='lazy' onClick={() => scrollTo('chapters')} />
                        <p className={`${gveretLevin.className} handnote haNote`}>ספרים אמיתיים של לקוחות ↓</p>
                    </div>
                </div>
                <span className='vertCaption' aria-hidden>מהדורה אישית · קיץ 2026</span>
            </header>

            {/* ═══════════ MARQUEE — a ribbon of real spreads ═══════════ */}
            <section className='marquee' aria-label='עמודים אמיתיים מתוך ספרי לקוחות'>
                <div className='marqueeTrack'>
                    {[...marquee, ...marquee].map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={`${src}-${i}`} src={src} alt='' loading='lazy' className='mFrame' aria-hidden={i >= marquee.length} />
                    ))}
                </div>
                <p className={`${gveretLevin.className} handnote`} style={{ textAlign: 'center', color: '#8a6d45', marginTop: 14 }}>
                    עמודים אמיתיים, מתוך הספרים שתפגשו עוד רגע
                </p>
            </section>

            {/* ═══════════ STAT BAND — ink ═══════════ */}
            <section className='statBand' style={{ backgroundImage: GRAIN }}>
                <div className='shell statRow obs'>
                    {[
                        ['+60', 'אירועים'],
                        ['אלפי', 'ברכות ותמונות'],
                        ['4', 'שבועות עד ספר בבית'],
                    ].map(([n, l], i) => (
                        <div key={i} className='stat'>
                            <span className={`${heeboDisplay.className} statN`}>{n}</span>
                            <span className='statL'>{l}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══════════ HOW — three beats ═══════════ */}
            <section className='how'>
                <div className='shell'>
                    <Folio n='02' label='איך זה עובד' />
                    <div className='howGrid'>
                        {[
                            ['01', 'סורקים', 'קוד QR על השולחן פותח עמוד אישי בדפדפן. בלי אפליקציה, בלי הרשמה — מהנכד ועד סבתא.'],
                            ['02', 'כותבים', 'תמונה מהערב וכמה מילים מהלב. דקה אחת, באמצע הריקודים.'],
                            ['03', 'נשאר לתמיד', 'ספר דיגיטלי עוד באותו לילה. ספר כריכה קשה על נייר ארכיב — עד הבית.'],
                        ].map(([n, t, d], i) => (
                            <div key={i} className='howItem obs' style={{ transitionDelay: `${i * 90}ms` }}>
                                <span className={`${heeboDisplay.className} howN`}>{n}</span>
                                <h3 className={`${heeboDisplay.className} howT`}>{t}</h3>
                                <p className='howD'>{d}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════ CHAPTERS — the three real books ═══════════ */}
            <div id='chapters' style={{ scrollMarginTop: 8 }}>
                <div className='shell'>
                    <div className='hairline' />
                    <div className='sectionHead obs'>
                        <p className='overline' style={{ color: '#a8843a' }}>תוכן העניינים</p>
                        <h2 className={`${heeboDisplay.className} sectionTitle`}>
                            שלושה אירועים.
                            <br />
                            <em>שלושה ספרים אמיתיים.</em>
                        </h2>
                        <p className='sectionSub'>
                            בלי הדמיות ובלי סטוק. כל ברכה, תמונה ועמוד שתראו כאן הועלו על ידי
                            אורחים אמיתיים — ואפשר לפתוח ולדפדף בספר המלא.
                        </p>
                    </div>
                </div>
                {chapters.map((b, i) => <Chapter key={`${b.slug}-${b.weddingId || i}`} book={b} />)}
            </div>

            {/* ═══════════ TRY IT ═══════════ */}
            <section id='demo' className='demo'>
                <div className='shell'>
                    <div className='hairline' />
                    <div className='sectionHead obs'>
                        <p className='overline' style={{ color: '#a8843a' }}>נסו בעצמכם</p>
                        <h2 className={`${heeboDisplay.className} sectionTitle`}>ככה זה מרגיש לאורחים שלכם</h2>
                        <p className='sectionSub'>
                            {liveWedding ? `זה בדיוק העמוד שאורחיהם של ${(() => {
                                const b = (liveWedding.brideNameHe || liveWedding.brideName || '').trim()
                                const g = (liveWedding.groomNameHe || liveWedding.groomName || '').trim()
                                const c = (liveWedding.celebrantNameHe || liveWedding.celebrantName || '').trim()
                                if (b && g) return `${b} ו${g}`
                                return c || b || g || 'הזוג'
                            })()} רואים כשסורקים את ה-QR — אחד לאחד, אותו רקע, אותו כרטיס, אותם טקסטים. כתבו ברכה, צרפו תמונה — הדגמה בלבד, שום דבר לא נשמר.` : 'זה בדיוק העמוד שהאורחים שלכם רואים כשסורקים את ה-QR — אותו רקע, אותו כרטיס, אותם טקסטים. כתבו ברכה, צרפו תמונה — הדגמה בלבד, שום דבר לא נשמר.'}
                        </p>
                    </div>
                    <div className='demoSolo obs'>
                        <GuestFormReplica
                            wedding={liveWedding}
                            form={form}
                            setForm={setForm}
                            photo={photo}
                            onPickPhoto={onPickPhoto}
                            fileRef={fileRef}
                            onSubmit={addBlessing}
                            added={added}
                        />
                    </div>
                </div>
            </section>

            {/* ═══════════ PRICE + INCLUDED — one conversion block ═══════════ */}
            <section id='pricing' className='priceBand' style={{ backgroundImage: GRAIN, scrollMarginTop: 8 }}>
                <div className='shell priceGrid'>
                    <div className='obs'>
                        <p className='overline' style={{ color: '#cfa860' }}>מחיר אחד. אפס אותיות קטנות.</p>
                        <div className='priceLine'>
                            <span className={`${heeboDisplay.className} priceN`}>1,290</span>
                            <span className={`${heeboDisplay.className} priceCur`}>₪</span>
                        </div>
                        <p className={`${gveretLevin.className} priceAccent`}>מחיר אחד. אין תוספות. אין הפתעות.</p>
                        <p className='priceNote'>מהקמת העמוד ועד הספר המודפס אצלכם בבית — הכול בפנים:</p>
                        <ol className='inclList'>
                            {[
                                'עמוד אישי מעוצב + QR לאירוע',
                                'מערכת ניהול — אתם בוחרים מה נכנס ואיך זה נראה',
                                'ספר דיגיטלי לשיתוף, מוכן עוד בערב האירוע',
                                'ספר כריכה קשה על נייר ארכיב — עד הבית',
                            ].map((t, i) => (
                                <li key={i}>
                                    <span className={`${heeboDisplay.className} inclN`}>{String(i + 1).padStart(2, '0')}</span>
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ol>
                        <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGold big' style={{ maxWidth: 380, marginTop: 26 }}>
                            <WaIcon /> אני רוצה ספר כזה — דברו איתי
                        </a>
                    </div>
                    <figure className='priceFig obs' aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src='/imgs/portfolio/wedding/spread-2.webp' alt='' loading='lazy' />
                        <figcaption className={gveretLevin.className}>עמודים אמיתיים, מתוך ספרי הלקוחות</figcaption>
                    </figure>
                </div>
            </section>

            {/* ═══════════ TESTIMONIAL — one, real ═══════════ */}
            <section className='testi'>
                <div className='shell obs' style={{ textAlign: 'center', maxWidth: 720 }}>
                    <p className={`${heeboDisplay.className} testiQ`}>
                        ”לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לחתונה שוב.“
                    </p>
                    <p className='testiBy'>
                        שקד · התחתנה במרץ 2026 · <a href={`/b/${DEFAULT_CHAPTERS[2].token}`} target='_blank' rel='noopener noreferrer' style={{ color: '#a8843a', display: 'inline-block', padding: '12px 6px', margin: '-12px -6px' }}>הספר שלה בפרק השלישי</a>
                    </p>
                </div>
            </section>

            {/* ═══════════ FAQ ═══════════ */}
            <section className='faq'>
                <div className='shell' style={{ maxWidth: 680 }}>
                    <div className='hairline' />
                    <h2 className={`${heeboDisplay.className} sectionTitle obs`} style={{ textAlign: 'center' }}>שאלות ששואלים אותנו</h2>
                    <div className='obs'>
                        {FAQ.map((f, i) => (
                            <details key={i} className='faqItem'>
                                <summary>
                                    <span className={`${heeboDisplay.className} faqN`} aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                                    <span className={`${heeboDisplay.className} faqQ`}>{f.q}</span>
                                    <span className='faqChev' aria-hidden><ChevronDown size={15} /></span>
                                </summary>
                                <p>{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════ FINAL CTA — the back cover ═══════════ */}
            <section className='finale' style={{ backgroundImage: GRAIN }}>
                <div className='shell obs' style={{ textAlign: 'center' }}>
                    <p className={`${gveretLevin.className}`} style={{ fontSize: 20, color: 'rgba(243,233,210,0.7)', margin: '0 0 10px' }}>— הכריכה האחורית —</p>
                    <h2 className={`${heeboDisplay.className} finaleT`}>
                        האירוע הבא שלכם
                        <br />
                        <em>שווה ספר.</em>
                    </h2>
                    <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGold big' style={{ maxWidth: 400, marginInline: 'auto', marginTop: 26 }}>
                        <WaIcon /> דברו איתנו בוואטסאפ
                    </a>
                    <p className={gveretLevin.className} style={{ fontSize: 19, color: 'rgba(243,233,210,0.75)', marginTop: 16 }}>כותבים לנו — ועונים לכם אישית</p>
                    <p style={{ fontSize: 13, color: 'rgba(243,233,210,0.68)', marginTop: 20 }}>© {new Date().getFullYear()} Wedding Tales · מזכרת לכל החיים</p>
                </div>
            </section>

            {/* ═══════════ STICKY CTA — portalled to <body> so no
                transformed ancestor can re-parent it mid-page. */}
            {portalReady && createPortal(
                <div className={`stickyCta ${ctaVisible ? 'on' : ''}`} role='complementary' aria-label='יצירת קשר' dir='rtl'>
                    <span className='stickyTxt'><strong>ספר ברכות מהאירוע שלכם</strong> · 1,290 ₪ הכול כלול</span>
                    <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGold stickyBtn'>
                        <WaIcon /> דברו איתנו
                    </a>
                </div>,
                document.body,
            )}

            <style jsx global>{`
                details > summary::-webkit-details-marker { display: none; }
                .shell { max-width: 1160px; margin: 0 auto; padding-inline: clamp(18px, 4vw, 48px); }
                .hairline { height: 1px; background: linear-gradient(90deg, transparent, #c9a44e 20%, #c9a44e 80%, transparent); opacity: 0.55; margin: clamp(40px, 7vw, 84px) 0 clamp(28px, 4vw, 48px); }
                .overline { font-size: 13px; font-weight: 700; letter-spacing: 0.22em; margin: 0 0 14px; }
                .heroPrice { font-size: 14px; color: #6b5836; margin: 16px 2px 0; font-weight: 600; transition-delay: 200ms; }
                :focus-visible { outline: 2px solid #b8893d; outline-offset: 3px; border-radius: 4px; }

                /* Reading ribbon — scroll progress as a gold bookmark */
                .ribbon { position: fixed; top: 0; inset-inline: 0; height: 3px; z-index: 60; background: rgba(201,164,78,0.14); }
                .ribbonFill { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: right; background: linear-gradient(90deg, #b8893d, #e2c377); }

                /* Folio — decorative "page number" chrome */
                .folio { display: flex; align-items: center; gap: 14px; margin: clamp(36px, 6vw, 70px) 0 clamp(22px, 3vw, 36px); }
                .folioRule { height: 1px; flex: 1; }
                .folioTxt { font-size: 11.5px; font-weight: 700; letter-spacing: 0.26em; white-space: nowrap; }

                /* Scroll reveal */
                .obs { opacity: 0; transform: translateY(22px); transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1); }
                .obs.in { opacity: 1; transform: none; }

                /* Buttons */
                .btn { display: inline-flex; align-items: center; justify-content: center; gap: 9px; border-radius: 999px; font-weight: 700; font-size: 15px; padding: 13px 26px; cursor: pointer; text-decoration: none; border: none; transition: transform 0.22s ease, box-shadow 0.22s ease; }
                .btn:hover { transform: translateY(-2px); }
                .btn.big { padding: 16px 30px; font-size: 16px; width: 100%; }
                .btn.sm { padding: 10px 18px; font-size: 13.5px; }
                .btnSolid { background: #1c1712; color: #f0e2bd; box-shadow: 0 16px 34px -16px rgba(28,23,18,0.55); }
                .btnGold { background: linear-gradient(180deg, #e2c377, #b8893d); color: #1a1208; box-shadow: 0 18px 40px -14px rgba(211,180,106,0.5); }
                .btnGhost { background: transparent; color: #6b5836; border: 1px solid #c9a44e; }
                .field { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid #c9a44e; border-radius: 0; padding: 13px 4px; font-size: 15.5px; color: #3a2f1e; background: transparent; outline: none; font-family: inherit; }
                .field::placeholder { color: #a08c62; }

                /* HERO — framed like a hard cover */
                .hero { position: relative; padding: clamp(52px, 8vw, 112px) 0 clamp(44px, 6vw, 92px); overflow: hidden; }
                .heroFrame { position: absolute; inset: clamp(10px, 1.6vw, 22px); border: 1px solid rgba(201,164,78,0.45); border-radius: 3px; pointer-events: none; }
                .heroFrame::after { content: ''; position: absolute; inset: 5px; border: 1px solid rgba(201,164,78,0.22); border-radius: 2px; }
                .heroGrid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; position: relative; }
                .heroTitle { font-size: clamp(44px, 9.6vw, 102px); font-weight: 900; line-height: 1.06; margin: 0; letter-spacing: -0.02em; }
                .heroTitle em { font-style: normal; background: linear-gradient(100deg, #8a6320, #c9a44e 45%, #e8cf8f 60%, #b8893d); -webkit-background-clip: text; background-clip: text; color: transparent; }
                .heroSub { font-size: clamp(16px, 2.4vw, 19px); font-weight: 300; color: #574733; line-height: 1.8; margin: 22px 0 0; max-width: 460px; }
                .heroSub, .heroCtas { transition-delay: 140ms; }
                .heroCtas { display: flex; flex-direction: column; gap: 10px; margin-top: 30px; max-width: 380px; }
                .heroArt { position: relative; height: clamp(300px, 56vw, 470px); }
                .ha { position: absolute; aspect-ratio: 1; object-fit: cover; border-radius: 6px; cursor: pointer; box-shadow: 0 40px 80px -30px rgba(60,44,20,0.55), 0 0 0 1px rgba(180,148,90,0.35); transition: transform 0.3s ease; }
                .ha:hover { transform: scale(1.03) rotate(0deg) !important; z-index: 5; }
                .ha1 { width: clamp(200px, 38vw, 330px); inset-inline-start: 6%; top: 4%; transform: rotate(-4deg) translateY(calc(var(--py, 0) * -0.05px)); z-index: 3; }
                .ha2 { width: clamp(150px, 28vw, 245px); inset-inline-start: 48%; top: 22%; transform: rotate(5deg) translateY(calc(var(--py, 0) * -0.11px)); z-index: 2; }
                .ha3 { width: clamp(120px, 23vw, 195px); inset-inline-start: 30%; top: 56%; transform: rotate(-2deg) translateY(calc(var(--py, 0) * -0.17px)); z-index: 4; }
                .haNote { position: absolute; bottom: -4%; inset-inline-start: 8%; font-size: 19px; color: #8a6d45; margin: 0; transform: rotate(-3deg); }
                .handnote { font-size: 18px; margin: 12px 4px 0; }
                .vertCaption { position: absolute; top: 120px; inset-inline-end: 26px; writing-mode: vertical-rl; font-size: 11px; letter-spacing: 0.34em; color: #b09a6b; display: none; }

                /* MARQUEE — seamless ribbon of real spreads */
                .marquee { padding: clamp(26px, 4vw, 44px) 0 clamp(30px, 4vw, 48px); overflow: hidden; }
                .marqueeTrack { display: flex; gap: 16px; width: max-content; animation: marquee 48s linear infinite; }
                .marquee:hover .marqueeTrack { animation-play-state: paused; }
                .mFrame { height: clamp(120px, 17vw, 190px); width: auto; border-radius: 7px; background: #fff; box-shadow: 0 18px 38px -18px rgba(60,44,20,0.45), 0 0 0 1px rgba(180,148,90,0.3); }
                @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(50%); } }

                /* STAT BAND */
                .statBand { background-color: #171310; color: #f3e9d2; padding: clamp(34px, 5vw, 54px) 0; }
                .statRow { display: flex; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
                .stat { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 90px; }
                .statN { font-size: clamp(32px, 5.6vw, 50px); font-weight: 700; color: #e2c377; line-height: 1; font-variant-numeric: tabular-nums; }
                .statL { font-size: 11.5px; font-weight: 700; color: rgba(243,233,210,0.66); letter-spacing: 0.22em; margin-top: 3px; }

                /* HOW */
                .how { padding: clamp(20px, 4vw, 56px) 0 clamp(20px, 3vw, 40px); }
                .howGrid { display: grid; grid-template-columns: 1fr; gap: 34px; }
                .howItem { border-top: 1px solid rgba(168,132,58,0.4); padding-top: 18px; }
                .howN { font-size: 15px; color: #a8843a; letter-spacing: 0.18em; font-weight: 700; }
                .howT { font-size: clamp(24px, 3.6vw, 32px); font-weight: 700; margin: 8px 0 6px; }
                .howD { font-size: 15px; font-weight: 300; color: #574733; line-height: 1.75; margin: 0; max-width: 340px; }

                /* SECTION HEADS */
                .sectionHead { max-width: 640px; margin-bottom: clamp(28px, 4vw, 46px); }
                .sectionTitle { font-size: clamp(30px, 5.6vw, 52px); font-weight: 700; line-height: 1.14; margin: 0; }
                .sectionTitle em { font-style: normal; color: #b8893d; }
                .sectionSub { font-size: 15.5px; font-weight: 300; color: #574733; line-height: 1.75; margin: 14px 0 0; }

                /* CHAPTER */
                .chapter { position: relative; padding: clamp(48px, 8vw, 104px) 0; overflow: hidden; }
                .chapterInner { position: relative; }
                .ghostN { position: absolute; top: clamp(-30px, -3vw, -14px); inset-inline-end: -0.06em; font-size: clamp(180px, 30vw, 380px); font-weight: 900; line-height: 1; pointer-events: none; user-select: none; }
                .chGrid { display: grid; grid-template-columns: 1fr; gap: 30px; align-items: center; position: relative; }
                .chCoverWrap { max-width: 460px; }
                .chCoverStack { position: relative; }
                .chCoverBack { position: absolute; inset: 0; border-radius: 6px; transform: rotate(2.4deg) translate(6px, 8px); box-shadow: 0 24px 50px -26px rgba(50,36,16,0.5); }
                .chCoverImg { position: relative; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; box-shadow: 0 40px 90px -34px rgba(50,36,16,0.65), 0 0 0 1px rgba(180,148,90,0.35); }
                .chTitle { font-size: clamp(38px, 6.8vw, 64px); font-weight: 900; line-height: 1.05; margin: 0 0 12px; letter-spacing: -0.02em; }
                .chStory { font-size: clamp(15px, 2.1vw, 16.5px); font-weight: 300; line-height: 1.85; margin: 0 0 18px; max-width: 480px; opacity: 0.92; }
                .statList { list-style: none; display: flex; flex-wrap: wrap; gap: 0 18px; padding: 12px 0; margin: 0 0 18px; border-top: 1px solid; border-bottom: 1px solid; font-size: 13.5px; letter-spacing: 0.04em; }
                .statList li + li::before { content: '·'; margin-inline-end: 18px; opacity: 0.5; }
                .pull { font-size: clamp(18px, 2.8vw, 23px); font-weight: 600; line-height: 1.65; margin: 0 0 22px; padding: 0; }
                .pull cite { display: block; font-size: 12.5px; font-style: normal; font-weight: 600; letter-spacing: 0.1em; opacity: 0.65; margin-top: 10px; }
                .chActions { display: flex; gap: 10px; flex-wrap: wrap; }
                .filmstrip { display: flex; gap: 14px; overflow-x: auto; padding: clamp(20px, 3vw, 34px) 4px 14px; scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: #c9a44e transparent; overscroll-behavior-x: contain; }
                .filmstrip::-webkit-scrollbar { height: 5px; }
                .filmstrip::-webkit-scrollbar-thumb { background: #c9a44e; border-radius: 3px; }
                .frame { height: clamp(210px, 30vw, 320px); width: auto; border-radius: 8px; flex-shrink: 0; scroll-snap-align: center; background: #fff; box-shadow: 0 22px 46px -20px rgba(60,44,20,0.5), 0 0 0 1px rgba(180,148,90,0.3); transition: transform 0.28s ease, box-shadow 0.28s ease; }
                .frame:hover { transform: translateY(-8px) rotate(-0.6deg); box-shadow: 0 34px 60px -22px rgba(60,44,20,0.62), 0 0 0 1px rgba(180,148,90,0.45); }
                .embedWrap { margin-top: 18px; border-radius: 14px; overflow: hidden; border: 1px solid #c9a44e; box-shadow: 0 30px 70px -30px rgba(50,36,16,0.6); background: #14100c; }

                /* DEMO */
                .demo { padding-bottom: clamp(20px, 3vw, 40px); }
                /* Post-flipbook-removal: the section is just the guest-form
                   replica. Cap its width and centre it so it doesn't stretch
                   full-page on desktop and stays visually anchored. */
                .demoSolo { display: flex; justify-content: center; }
                .demoSolo > * { width: 100%; max-width: 460px; }
                /* The guest-page replica — a framed cutout of the real
                   guest form, backgrounds and all. */
                .replicaPage { display: flex; justify-content: center; border-radius: 18px; overflow: hidden; padding: 30px 18px 26px; border: 1px solid rgba(180,148,90,0.35); box-shadow: 0 30px 64px -30px rgba(60,44,20,0.45), 0 0 0 1px rgba(255,255,255,0.25) inset; }

                /* PRICE + INCLUDED */
                .priceBand { background-color: #171310; color: #f3e9d2; padding: clamp(56px, 9vw, 110px) 0; margin-top: clamp(48px, 8vw, 96px); }
                .priceGrid { display: grid; grid-template-columns: 1fr; gap: 38px; align-items: center; }
                .priceLine { display: flex; align-items: baseline; gap: 12px; }
                .priceN { font-size: clamp(84px, 15vw, 150px); font-weight: 900; line-height: 0.95; color: #f3e9d2; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
                .priceCur { font-size: clamp(30px, 5vw, 48px); color: #cfa860; font-weight: 700; }
                .priceAccent { font-size: clamp(18px, 3vw, 22px); color: #e2c377; margin: 10px 0 0; }
                .priceNote { font-size: 15.5px; font-weight: 300; color: rgba(243,233,210,0.75); line-height: 1.75; margin: 16px 0 8px; max-width: 380px; }
                .inclList { list-style: none; margin: 0; padding: 0; max-width: 440px; }
                .inclList li { display: flex; gap: 18px; align-items: baseline; padding: 14px 2px; border-bottom: 1px solid rgba(226,195,119,0.22); font-size: 16px; font-weight: 300; color: rgba(243,233,210,0.92); line-height: 1.6; }
                .inclN { font-size: 24px; font-weight: 700; color: #cfa860; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; min-width: 34px; line-height: 1; transform: translateY(2px); }
                .priceFig { margin: 0; }
                .priceFig img { width: 100%; border-radius: 10px; box-shadow: 0 34px 70px -26px rgba(0,0,0,0.7), 0 0 0 1px rgba(207,168,96,0.4); }
                .priceFig figcaption { font-size: 17px; color: rgba(243,233,210,0.65); margin-top: 12px; text-align: center; }

                /* TESTIMONIAL */
                .testi { padding: clamp(56px, 9vw, 100px) 0 clamp(20px, 3vw, 30px); }
                .testiQ { font-size: clamp(21px, 3.6vw, 30px); font-weight: 700; line-height: 1.7; color: #3a2f1e; margin: 0; }
                .testiBy { font-size: 13px; color: #8a744d; margin-top: 16px; font-weight: 600; }

                /* FAQ — a designed conversation, not a list of boxes */
                .faqItem { border-bottom: 1px solid rgba(168,132,58,0.28); }
                .faqItem summary { cursor: pointer; list-style: none; display: flex; align-items: baseline; gap: 14px; padding: 20px 2px; }
                .faqN { font-size: 13px; font-weight: 700; color: #b8935a; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; flex-shrink: 0; transform: translateY(-1px); }
                .faqQ { flex: 1; font-size: clamp(18px, 2.6vw, 21px); font-weight: 700; color: #1c1712; line-height: 1.4; letter-spacing: -0.01em; }
                .faqChev { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; border: 1px solid #cfae6e; color: #a8843a; display: flex; align-items: center; justify-content: center; align-self: center; transition: transform 0.25s ease, background 0.25s ease; }
                details[open] .faqChev { transform: rotate(180deg); background: rgba(201,164,78,0.14); }
                .faqItem p { font-size: 15.5px; font-weight: 400; color: #574733; line-height: 1.85; padding: 2px 2px 20px; margin: 0 30px 0 0; max-width: 520px; border-inline-start: 2px solid rgba(201,164,78,0.45); padding-inline-start: 16px; }

                /* FINALE */
                .finale { background-color: #171310; color: #f3e9d2; padding: clamp(64px, 10vw, 120px) 0 clamp(84px, 12vw, 140px); margin-top: clamp(48px, 8vw, 96px); }
                .finaleT { font-size: clamp(34px, 7vw, 64px); font-weight: 900; line-height: 1.12; margin: 0; letter-spacing: -0.02em; }
                .finaleT em { font-style: normal; color: #e2c377; }

                /* STICKY CTA */
                /* Sticky CTA is portalled to <body> (see createPortal above)
                   so it never sits inside a transformed ancestor. Kept as
                   global CSS (via <style jsx global>) so the portalled node
                   still picks up the rules. */
                .stickyCta { position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 10px clamp(14px, 4vw, 28px) calc(10px + env(safe-area-inset-bottom, 0px)); background: rgba(23,19,16,0.92); backdrop-filter: blur(10px); border-top: 1px solid rgba(226,195,119,0.35); transform: translateY(110%); transition: transform 0.35s cubic-bezier(0.22,1,0.36,1); will-change: transform; pointer-events: none; }
                .stickyCta.on { transform: translateY(0); pointer-events: auto; }
                .stickyTxt { font-size: 13.5px; color: rgba(243,233,210,0.9); font-weight: 400; }
                .stickyTxt strong { font-weight: 700; }
                .stickyBtn { padding: 11px 22px; font-size: 14px; flex-shrink: 0; }

                /* ≥ 760px — the editorial grid opens up */
                @media (min-width: 760px) {
                    .heroGrid { grid-template-columns: 6fr 5fr; gap: 20px; }
                    .heroCtas { flex-direction: row; }
                    .heroCtas .btn { width: auto; flex: 1; }
                    .vertCaption { display: block; }
                    .howGrid { grid-template-columns: repeat(3, 1fr); }
                    .chGrid { grid-template-columns: 5fr 6fr; gap: clamp(30px, 5vw, 70px); }
                    .chapter:nth-of-type(even) .chGrid { direction: ltr; }
                    .chapter:nth-of-type(even) .chGrid > * { direction: rtl; }
                    .priceGrid { grid-template-columns: 6fr 5fr; }
                }
                @media (max-width: 560px) {
                    .stickyTxt { display: none; }
                    .stickyBtn { width: 100%; justify-content: center; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .obs { opacity: 1; transform: none; transition: none; }
                    .ha, .frame, .btn, .stickyCta { transition: none; }
                    .marqueeTrack { animation: none; flex-wrap: wrap; width: auto; }
                }
            `}</style>
        </div>
    )
}

function WaIcon() {
    return (
        <svg viewBox='0 0 24 24' width='19' height='19' fill='currentColor' aria-hidden='true'>
            <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24.044 12.045.044 5.463.044.105 5.402.103 11.985c0 2.096.547 4.142 1.588 5.945L0 24l6.304-1.654a11.9 11.9 0 0 0 5.71 1.453h.005c6.582 0 11.94-5.358 11.942-11.94 0-3.193-1.24-6.19-3.44-8.418' />
        </svg>
    )
}
