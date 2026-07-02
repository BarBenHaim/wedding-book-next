'use client'

// /landing — the marketing landing page (app.weddingtales.co.il/landing).
//
// v3, spring 2026 — editorial/luxe redesign. Magazine-grade composition:
// massive Frank Ruhl display type, asymmetric CSS grid, paper-grain ivory
// alternating with ink bands, 1px gold hairlines, scroll-reveal +
// hero parallax (rAF, reduced-motion aware), handwritten accents in
// Gveret Levin (the same font family used for real book blessings).
//
// All content is REAL: three live customer books (dedicated landing
// tokens, issuedBy:'landing-page' in digitalTokensIssuedAt — revoke there
// without touching the family links), real spread screenshots curated by
// hand, real event dates, and pull-quotes transcribed from actual
// blessings visible in the captured spreads. No fabricated testimonials.
//   wedding rOPkVWbwurT4UjKCR5hg (שקד ודור) · birthday 6175 (ג'רי) ·
//   bar mitzvah 5483 (נועם)

import { useEffect, useMemo, useRef, useState } from 'react'
import { Assistant } from 'next/font/google'
import HTMLFlipBook from 'react-pageflip'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { normalizeBlessing } from '@/lib/normalizeText'
import { frankRuhl, gveretLevin } from '@/app/fonts'
import { Camera, Check, ChevronLeft, ChevronRight, ChevronDown, BookOpen, X, ExternalLink, Sparkles } from 'lucide-react'

// Editorial body face — pairs with Frank Ruhl display.
const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['300', '400', '600', '700'] })

const WA = 'https://wa.link/0sesxc'

// ─── The three real books ────────────────────────────────────────────
// Pull-quotes are transcribed from blessings visible in the captured
// spreads — real guests, real words.
const PORTFOLIO = [
    {
        slug: 'wedding',
        badge: 'חתונה',
        title: 'שקד ודור',
        date: 'אפריל 2026',
        stats: ['24 ברכות', '24 תמונות', 'ערב אחד'],
        quote: 'מאחלים לכם חיים מלאים באושר, חוויות טובות והמון חברים מסביב',
        quoteBy: 'משפחת ביבי, מתוך הספר',
        weddingId: 'rOPkVWbwurT4UjKCR5hg',
        token: '529b8a86-ca5d-4944-8178-c75c0420095d',
        spreads: 5,
        theme: 'ivory',
    },
    {
        slug: 'bar-mitzvah',
        badge: 'בר מצווה',
        title: 'נועם',
        date: 'יוני 2026',
        stats: ['45 ברכות', '45 תמונות', 'החברים מהשכבה ועד סבא וסבתא'],
        quote: 'מזל טוב! תמשיך להיות חבר טוב שלא מוותר על טורניר או משחק כדורגל',
        quoteBy: 'לידור, חבר — מתוך הספר',
        weddingId: '5483',
        token: '0b02382b-7d8e-40a8-804b-1c5bdd31c1ae',
        spreads: 5,
        theme: 'ink',
    },
    {
        slug: 'birthday',
        badge: 'יום הולדת 90',
        title: 'ג׳רי',
        date: 'יוני 2026',
        stats: ['31 ברכות', 'משפחה משתי יבשות', 'עברית ואנגלית'],
        quote: 'Nine decades of living honestly and faithfully — truly a lifetime to be admired',
        quoteBy: 'David, מתוך הספר',
        weddingId: '6175',
        token: 'a319b00d-7ed2-48cf-b88b-d41a98f35e05',
        spreads: 3,
        theme: 'blush',
    },
]

const SAMPLE = [
    { id: 's1', name: 'דנה', text: 'סבא יקר, אין מילים לתאר כמה אנחנו אוהבים אותך. שתמיד תהיה בריא ושמח, ותמשיך להאיר לכולנו את הדרך.', imageUrl: '/imgs/img1.jpg' },
    { id: 's2', name: 'Yossi & Michal', text: 'Your stories and your smile light up every room. Here’s to many more years of laughter together — we love you!', imageUrl: '/imgs/img2.jpg' },
    { id: 's3', name: 'משפחת לוי', text: 'תודה על כל הארוחות, הצחוקים והחוכמה. אתם הלב הפועם של המשפחה שלנו, ואנחנו אסירי תודה על כל רגע.', imageUrl: '/imgs/img3.jpg' },
    { id: 's4', name: 'נועה', text: 'לאדם הכי טוב שאני מכירה — שתמשיך לרקוד, לשיר ולחבק חזק. אוהבת אותך עד הירח ובחזרה.', imageUrl: '/imgs/img4.jpg' },
    { id: 's5', name: 'Daniel', text: 'To the one who taught me everything about kindness and patience — so grateful for you, today and always.', imageUrl: '/imgs/img5.jpg' },
    { id: 's6', name: 'רוני וגיל', text: 'כל רגע איתכם הוא מתנה. שתהיה לכם שנה מלאה בבריאות, אושר ונחת מכל מי שאוהב אתכם.', imageUrl: '/imgs/img6.jpg' },
    { id: 's7', name: 'סבתא תקווה', text: 'ביחד כבר שנים רבות והלב עוד מלא. תודה על כל האהבה — אוהבת אתכם תמיד.', imageUrl: '/imgs/img7.jpg' },
    { id: 's8', name: 'אורי', text: 'פשוט תודה. על הכל. אתם הגיבורים שלי, היום ותמיד.', imageUrl: '/imgs/img8.jpg' },
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

// ─── One art-directed section per book ───────────────────────────────
function BookStory({ book, index }) {
    const [live, setLive] = useState(false)
    const frames = useMemo(
        () => [`/imgs/portfolio/${book.slug}/cover.webp`, ...Array.from({ length: book.spreads }, (_, i) => `/imgs/portfolio/${book.slug}/spread-${i + 1}.webp`)],
        [book]
    )
    const ink = book.theme === 'ink'
    const blush = book.theme === 'blush'

    return (
        <section
            className={`bookStory obs ${ink ? 'inkband' : ''}`}
            style={{
                background: ink
                    ? 'linear-gradient(180deg, #191410 0%, #14100b 100%)'
                    : blush
                        ? 'linear-gradient(180deg, #f6ebe2 0%, #f3e3d8 100%)'
                        : 'transparent',
                color: ink ? '#f3e9d2' : '#1c1712',
                padding: ink || blush ? 'clamp(56px, 9vw, 110px) 0' : 'clamp(30px, 5vw, 60px) 0',
                position: 'relative',
            }}
        >
            {(ink || blush) && <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, pointerEvents: 'none' }} />}
            <div className='shell'>
                <div className={`storyGrid ${index % 2 ? 'flip' : ''}`}>
                    {/* Cover — the object itself */}
                    <div className='storyCover obs'>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={frames[0]} alt={`הכריכה של ${book.title}`} loading='lazy' className='coverImg' />
                        <p className={`${gveretLevin.className} handnote`} style={{ color: ink ? 'rgba(243,233,210,0.75)' : '#8a6d45' }}>
                            הספר של {book.title} · {book.date}
                        </p>
                    </div>

                    {/* Text column */}
                    <div className='storyText'>
                        <p className='overline' style={{ color: ink ? '#cfa860' : '#a8843a' }}>{book.badge} · {book.date}</p>
                        <h3 className={`${frankRuhl.className} storyTitle`}>{book.title}</h3>
                        <ul className='statList' style={{ borderColor: ink ? 'rgba(207,168,96,0.35)' : 'rgba(168,132,58,0.35)' }}>
                            {book.stats.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                        <blockquote className={`${frankRuhl.className} pull`} style={{ color: ink ? '#e9dab3' : '#4a3a25' }}>
                            ”{book.quote}“
                            <cite className={assistant.className}>{book.quoteBy}</cite>
                        </blockquote>
                        <div className='storyActions'>
                            <button onClick={() => setLive(v => !v)} className='btn btnSolid' style={ink ? { background: '#e2c377', color: '#1a1208' } : undefined}>
                                {live ? <><X size={16} /> סגירת הספר</> : <><BookOpen size={16} /> לדפדף בספר — כאן</>}
                            </button>
                            <a href={`/b/${book.token}`} target='_blank' rel='noopener noreferrer' className='btn btnGhost' style={ink ? { color: '#e9dab3', borderColor: 'rgba(233,218,179,0.5)' } : undefined}>
                                <ExternalLink size={15} /> מסך מלא
                            </a>
                        </div>
                    </div>
                </div>

                {/* Filmstrip — the real spreads */}
                <div className='filmstrip' aria-label={`עמודים מתוך הספר של ${book.title}`}>
                    {frames.slice(1).map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={src} src={src} alt={`כפולה ${i + 1} מתוך הספר של ${book.title}`} loading='lazy' className='frame' />
                    ))}
                </div>

                {/* Live embed — the ACTUAL digital book */}
                {live && (
                    <div className='embedWrap'>
                        <iframe
                            src={`/wedding/${book.weddingId}/book/${book.token}?embed=1`}
                            title={`ספר הברכות של ${book.title}`}
                            style={{ display: 'block', width: '100%', height: 'min(80vh, 680px)', border: 'none' }}
                            loading='lazy'
                            allowFullScreen
                        />
                    </div>
                )}
            </div>
        </section>
    )
}

export default function LandingPage() {
    const styleSettings = useMemo(() => {
        const preset = BUILTIN_PRESETS.find(p => /פרחי גן|פסטורלי|שמפניה/.test(p.name)) || BUILTIN_PRESETS[0]
        const rp = preset ? resolvePreset(preset).values : {}
        return { ...defaultStyle, ...rp, locale: 'he' }
    }, [])
    const coverStyle = useMemo(() => ({
        ...styleSettings,
        coverImage: '/imgs/Cover%20img.jpg',
        coverTitle: 'ספר הברכות',
        coverSubtitle: 'הרגעים היפים שלכם — לתמיד',
        coverTextPosition: 'bc',
        coverTextBg: 'rgba(0,0,0,0.30)',
        coverTextColor: '#ffffff',
    }), [styleSettings])
    const sampleWedding = { eventType: 'birthday', customTitle: 'ספר הברכות', locale: 'he' }

    const [extra, setExtra] = useState([])
    const pages = useMemo(() => [...SAMPLE, ...extra], [extra])

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

    // Hero parallax — covers drift at different speeds (rAF-throttled).
    const heroRef = useRef(null)
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const el = heroRef.current
        if (!el) return
        let raf = 0
        const onScroll = () => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => el.style.setProperty('--py', String(Math.min(window.scrollY, 720))))
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
    }, [])

    const wrapRef = useRef(null)
    const [size, setSize] = useState(320)
    useEffect(() => {
        const measure = () => {
            const w = wrapRef.current?.clientWidth || 340
            setSize(Math.max(240, Math.min(420, Math.floor(w))))
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    const flipRef = useRef(null)
    const flip = dir => {
        try {
            const pf = flipRef.current?.pageFlip?.()
            if (!pf) return
            dir === 'next' ? pf.flipNext() : pf.flipPrev()
        } catch { /* ignore */ }
    }

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
    const addBlessing = () => {
        const text = normalizeBlessing(form.text)
        if (!text && !photo) return
        const entry = { id: `u${Date.now()}`, name: form.name.trim() || 'אורח/ת', text, imageUrl: photo?.url || null }
        const nextIndex = pages.length + 1
        setExtra(prev => [...prev, entry])
        setForm({ name: '', text: '' })
        setPhoto(null)
        setAdded(true)
        setTimeout(() => setAdded(false), 3000)
        setTimeout(() => { try { flipRef.current?.pageFlip?.()?.flip(nextIndex) } catch { /* ignore */ } }, 260)
    }

    const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    return (
        <div dir='rtl' className={assistant.className} style={{ minHeight: '100vh', background: '#faf5eb', color: '#1c1712', overflowX: 'hidden' }}>

            {/* ═══════════ HERO — editorial, ivory, diagonal overlap ═══════════ */}
            <header ref={heroRef} className='hero' style={{ backgroundImage: GRAIN }}>
                <div className='shell heroGrid'>
                    <div className='heroText'>
                        <p className='overline obs' style={{ color: '#a8843a' }}>ספרי ברכות בעבודה אישית · Wedding Tales</p>
                        <h1 className={`${frankRuhl.className} heroTitle obs`}>
                            הערב יעבור.
                            <br />
                            <em>הספר יישאר.</em>
                        </h1>
                        <p className='heroSub obs'>
                            האורחים סורקים, מצלמים וכותבים מהלב — בזמן האירוע.
                            אצלכם נשאר ספר בכריכה קשה, מלא באנשים שאתם אוהבים.
                        </p>
                        <div className='heroCtas obs'>
                            <button onClick={() => scrollTo('portfolio')} className='btn btnSolid big'>
                                <BookOpen size={18} /> דפדפו בספרים אמיתיים
                            </button>
                            <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGhost big'>
                                <WaIcon /> דברו איתנו
                            </a>
                        </div>
                    </div>

                    {/* Overlapping covers, parallax drift */}
                    <div className='heroArt' aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src='/imgs/portfolio/wedding/cover.webp' alt='' className='ha ha1' fetchPriority='high' onClick={() => scrollTo('portfolio')} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src='/imgs/portfolio/bar-mitzvah/cover.webp' alt='' className='ha ha2' loading='lazy' onClick={() => scrollTo('portfolio')} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src='/imgs/portfolio/birthday/cover.webp' alt='' className='ha ha3' loading='lazy' onClick={() => scrollTo('portfolio')} />
                        <p className={`${gveretLevin.className} handnote haNote`}>ספרים אמיתיים של לקוחות ↓</p>
                    </div>
                </div>

                {/* Vertical editorial caption */}
                <span className='vertCaption' aria-hidden>מהדורה אישית · אביב 2026</span>
            </header>

            {/* ═══════════ STAT BAND — ink ═══════════ */}
            {/* Numbers: 60+ events is real (migrated customer base); blessings
                count is an order-of-magnitude estimate — swap when analytics
                aggregation lands. */}
            <section className='statBand' style={{ backgroundImage: GRAIN }}>
                <div className='shell statRow obs'>
                    {[
                        ['+60', 'אירועים'],
                        ['אלפי', 'ברכות ותמונות'],
                        ['4', 'שבועות עד ספר בבית'],
                    ].map(([n, l], i) => (
                        <div key={i} className='stat'>
                            <span className={`${frankRuhl.className} statN`}>{n}</span>
                            <span className='statL'>{l}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══════════ HOW — three numbered editorial beats ═══════════ */}
            <section className='how'>
                <div className='shell'>
                    <div className='howGrid'>
                        {[
                            ['01', 'סורקים', 'קוד QR על השולחן פותח עמוד אישי. בלי אפליקציה, בלי הרשמה — גם סבתא מסתדרת.'],
                            ['02', 'מברכים', 'תמונה מהטלפון וכמה מילים מהלב. דקה אחת, באמצע הריקודים.'],
                            ['03', 'נשאר לתמיד', 'ספר דיגיטלי עוד באותו ערב. ספר כריכה קשה — אצלכם בבית.'],
                        ].map(([n, t, d], i) => (
                            <div key={i} className='howItem obs' style={{ transitionDelay: `${i * 90}ms` }}>
                                <span className={`${frankRuhl.className} howN`}>{n}</span>
                                <h3 className={`${frankRuhl.className} howT`}>{t}</h3>
                                <p className='howD'>{d}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════ PORTFOLIO ═══════════ */}
            <div id='portfolio' style={{ scrollMarginTop: 8 }}>
                <div className='shell'>
                    <div className='hairline' />
                    <div className='sectionHead obs'>
                        <p className='overline' style={{ color: '#a8843a' }}>מהארכיון</p>
                        <h2 className={`${frankRuhl.className} sectionTitle`}>
                            שלושה ספרים. שלושה סיפורים.
                            <br />
                            <em>הכול אמיתי.</em>
                        </h2>
                        <p className='sectionSub'>
                            לא הדמיות — הברכות והתמונות שהאורחים באמת העלו. דפדפו כאן, או פתחו את הספר המלא.
                        </p>
                    </div>
                </div>
                {PORTFOLIO.map((b, i) => <BookStory key={b.slug} book={b} index={i} />)}
            </div>

            {/* ═══════════ TRY IT ═══════════ */}
            <section id='demo' className='demo'>
                <div className='shell'>
                    <div className='hairline' />
                    <div className='sectionHead obs'>
                        <p className='overline' style={{ color: '#a8843a' }}>נסו בעצמכם</p>
                        <h2 className={`${frankRuhl.className} sectionTitle`}>ככה זה מרגיש לאורחים</h2>
                        <p className='sectionSub'>כתבו ברכה, צרפו תמונה — ותראו אותה נכנסת לספר. הדגמה בלבד, שום דבר לא נשמר.</p>
                    </div>
                    <div className='demoGrid obs'>
                        <div>
                            <div ref={wrapRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <div className='flipShadow' style={{ width: size, height: size }}>
                                    <HTMLFlipBook
                                        key={`flip-${pages.length}-${size}`}
                                        ref={flipRef}
                                        width={size}
                                        height={size}
                                        size='fixed'
                                        usePortrait
                                        showCover
                                        mobileScrollSupport
                                        drawShadow
                                        maxShadowOpacity={0.3}
                                        useMouseEvents
                                        flippingTime={700}
                                        className='landing-flip'
                                    >
                                        <div style={{ width: size, height: size, background: '#fff' }}>
                                            <BookCoverTemplate wedding={sampleWedding} styleSettings={coverStyle} scaledWidth={size} scaledHeight={size} />
                                        </div>
                                        {pages.map(entry => (
                                            <div key={entry.id} style={{ width: size, height: size, background: '#fff' }}>
                                                <BookPageTemplate entry={entry} styleSettings={styleSettings} scaledWidth={size} scaledHeight={size} />
                                            </div>
                                        ))}
                                    </HTMLFlipBook>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                                <button onClick={() => flip('prev')} aria-label='הקודם' className='navBtn'><ChevronRight size={20} /></button>
                                <button onClick={() => flip('next')} aria-label='הבא' className='navBtn'><ChevronLeft size={20} /></button>
                            </div>
                        </div>
                        <div className='demoForm'>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='השם שלכם' maxLength={40} className='field' />
                            <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value.slice(0, 300) }))} placeholder='כתבו ברכה מכל הלב…' rows={4} className='field' style={{ resize: 'vertical', lineHeight: 1.6, marginTop: 10 }} />
                            <input ref={fileRef} type='file' accept='image/*' onChange={onPickPhoto} style={{ display: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                                <button onClick={() => fileRef.current?.click()} className='btn btnGhost sm'><Camera size={16} /> {photo ? 'החלפת תמונה' : 'הוספת תמונה'}</button>
                                {photo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={photo.url} alt='' style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', border: '1px solid #d3bd8a' }} />
                                )}
                            </div>
                            <button onClick={addBlessing} className='btn btnSolid' style={{ width: '100%', marginTop: 14 }}>
                                {added ? <><Check size={17} /> נוספה לספר! דפדפו</> : <><Sparkles size={17} /> הוסיפו לספר</>}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════ INCLUDED — numbered, no cards ═══════════ */}
            <section className='included'>
                <div className='shell'>
                    <div className='hairline' />
                    <div className='inclGrid'>
                        <div className='obs'>
                            <p className='overline' style={{ color: '#a8843a' }}>מה כלול</p>
                            <h2 className={`${frankRuhl.className} sectionTitle`}>הכול. <em>באמת.</em></h2>
                        </div>
                        <ol className='inclList obs'>
                            {[
                                'עמוד אישי מעוצב + QR לאירוע',
                                'מערכת ניהול — אתם בוחרים מה נכנס ואיך זה נראה',
                                'ספר דיגיטלי לשיתוף, מוכן עוד בערב האירוע',
                                'ספר כריכה קשה על נייר ארכיב — עד הבית',
                            ].map((t, i) => (
                                <li key={i}>
                                    <span className={`${frankRuhl.className} inclN`}>{String(i + 1).padStart(2, '0')}</span>
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </section>

            {/* ═══════════ PRICE — a graphic statement on ink ═══════════ */}
            <section id='pricing' className='priceBand' style={{ backgroundImage: GRAIN, scrollMarginTop: 8 }}>
                <div className='shell priceGrid'>
                    <div className='obs'>
                        <p className='overline' style={{ color: '#cfa860' }}>מחיר אחד. בלי הפתעות.</p>
                        <div className='priceLine'>
                            <span className={`${frankRuhl.className} priceN`}>1,290</span>
                            <span className={`${frankRuhl.className} priceCur`}>₪</span>
                        </div>
                        <p className='priceNote'>הכול כלול — מהקמת העמוד ועד הספר המודפס אצלכם בבית.</p>
                        <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGold big' style={{ maxWidth: 380 }}>
                            <WaIcon /> אני רוצה ספר כזה — דברו איתי
                        </a>
                    </div>
                    <figure className='priceFig obs' aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src='/imgs/portfolio/wedding/spread-2.webp' alt='' loading='lazy' />
                        <figcaption className={gveretLevin.className}>עמודים אמיתיים, מתוך הספר של שקד ודור</figcaption>
                    </figure>
                </div>
            </section>

            {/* ═══════════ TESTIMONIAL — one, real ═══════════ */}
            <section className='testi'>
                <div className='shell obs' style={{ textAlign: 'center', maxWidth: 720 }}>
                    <p className={`${frankRuhl.className} testiQ`}>
                        ”לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לחתונה שוב.“
                    </p>
                    <p className='testiBy'>
                        שקד · התחתנה במרץ 2026 · <a href={`/b/${PORTFOLIO[0].token}`} target='_blank' rel='noopener noreferrer' style={{ color: '#a8843a' }}>הספר שלה למעלה</a>
                    </p>
                </div>
            </section>

            {/* ═══════════ FAQ — conversational ═══════════ */}
            <section className='faq'>
                <div className='shell' style={{ maxWidth: 680 }}>
                    <div className='hairline' />
                    <h2 className={`${frankRuhl.className} sectionTitle obs`} style={{ textAlign: 'center' }}>שאלות ששואלים אותנו</h2>
                    <div className='obs'>
                        {FAQ.map((f, i) => (
                            <details key={i} className='faqItem'>
                                <summary>
                                    <span className={frankRuhl.className}>{f.q}</span>
                                    <ChevronDown size={18} color='#a8843a' style={{ flexShrink: 0 }} />
                                </summary>
                                <p>{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════ FINAL CTA ═══════════ */}
            <section className='finale' style={{ backgroundImage: GRAIN }}>
                <div className='shell obs' style={{ textAlign: 'center' }}>
                    <h2 className={`${frankRuhl.className} finaleT`}>
                        רוצים ספר כזה
                        <br />
                        <em>מהאירוע שלכם?</em>
                    </h2>
                    <a href={WA} target='_blank' rel='noopener noreferrer' className='btn btnGold big' style={{ maxWidth: 400, marginInline: 'auto', marginTop: 26 }}>
                        <WaIcon /> דברו איתנו בוואטסאפ
                    </a>
                    <p style={{ fontSize: 12.5, color: 'rgba(243,233,210,0.5)', marginTop: 26 }}>© {new Date().getFullYear()} Wedding Tales · מזכרת לכל החיים</p>
                </div>
            </section>

            <style jsx global>{`
                .landing-flip { margin: 0 auto; }
                details > summary::-webkit-details-marker { display: none; }
                .shell { max-width: 1160px; margin: 0 auto; padding-inline: clamp(18px, 4vw, 48px); }
                .hairline { height: 1px; background: linear-gradient(90deg, transparent, #c9a44e 20%, #c9a44e 80%, transparent); opacity: 0.55; margin: clamp(40px, 7vw, 84px) 0 clamp(28px, 4vw, 48px); }
                .overline { font-size: 12.5px; font-weight: 700; letter-spacing: 0.22em; margin: 0 0 14px; }

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
                .navBtn { width: 46px; height: 46px; border-radius: 50%; border: 1px solid #c9a44e; background: transparent; color: #a8843a; display: flex; align-items: center; justify-content: center; cursor: pointer; }
                .field { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid #c9a44e; border-radius: 0; padding: 13px 4px; font-size: 15.5px; color: #3a2f1e; background: transparent; outline: none; font-family: inherit; }
                .field::placeholder { color: #a08c62; }

                /* HERO */
                .hero { position: relative; padding: clamp(48px, 8vw, 110px) 0 clamp(40px, 6vw, 90px); overflow: hidden; }
                .heroGrid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
                .heroTitle { font-size: clamp(46px, 10vw, 108px); font-weight: 700; line-height: 1.04; margin: 0; letter-spacing: -0.01em; }
                .heroTitle em { font-style: normal; color: #b8893d; }
                .heroSub { font-size: clamp(16px, 2.4vw, 19px); font-weight: 300; color: #574733; line-height: 1.8; margin: 22px 0 0; max-width: 440px; }
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
                .vertCaption { position: absolute; top: 120px; inset-inline-end: 14px; writing-mode: vertical-rl; font-size: 11px; letter-spacing: 0.34em; color: #b09a6b; display: none; }

                /* STAT BAND */
                .statBand { background-color: #171310; color: #f3e9d2; padding: clamp(34px, 5vw, 54px) 0; }
                .statRow { display: flex; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
                .stat { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 90px; }
                .statN { font-size: clamp(30px, 5.4vw, 48px); font-weight: 700; color: #e2c377; line-height: 1; }
                .statL { font-size: 13px; color: rgba(243,233,210,0.72); letter-spacing: 0.06em; }

                /* HOW */
                .how { padding: clamp(48px, 8vw, 100px) 0 clamp(20px, 3vw, 40px); }
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

                /* BOOK STORY */
                .storyGrid { display: grid; grid-template-columns: 1fr; gap: 30px; align-items: center; }
                .storyCover { max-width: 460px; }
                .coverImg { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; box-shadow: 0 40px 90px -34px rgba(50,36,16,0.65), 0 0 0 1px rgba(180,148,90,0.35); }
                .storyTitle { font-size: clamp(36px, 6.4vw, 60px); font-weight: 700; line-height: 1.05; margin: 0 0 14px; }
                .statList { list-style: none; display: flex; flex-wrap: wrap; gap: 0 18px; padding: 12px 0; margin: 0 0 18px; border-top: 1px solid; border-bottom: 1px solid; font-size: 13.5px; letter-spacing: 0.04em; }
                .statList li + li::before { content: '·'; margin-inline-end: 18px; opacity: 0.5; }
                .pull { font-size: clamp(18px, 2.8vw, 23px); font-weight: 600; font-style: italic; line-height: 1.65; margin: 0 0 22px; padding: 0; }
                .pull cite { display: block; font-size: 12.5px; font-style: normal; font-weight: 600; letter-spacing: 0.1em; opacity: 0.65; margin-top: 10px; }
                .storyActions { display: flex; gap: 10px; flex-wrap: wrap; }
                .filmstrip { display: flex; gap: 14px; overflow-x: auto; padding: clamp(20px, 3vw, 34px) 4px 14px; scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: #c9a44e transparent; }
                .filmstrip::-webkit-scrollbar { height: 5px; }
                .filmstrip::-webkit-scrollbar-thumb { background: #c9a44e; border-radius: 3px; }
                .frame { height: clamp(210px, 30vw, 320px); width: auto; border-radius: 8px; flex-shrink: 0; scroll-snap-align: center; background: #fff; box-shadow: 0 22px 46px -20px rgba(60,44,20,0.5), 0 0 0 1px rgba(180,148,90,0.3); transition: transform 0.28s ease, box-shadow 0.28s ease; }
                .frame:hover { transform: translateY(-8px) rotate(-0.6deg); box-shadow: 0 34px 60px -22px rgba(60,44,20,0.62), 0 0 0 1px rgba(180,148,90,0.45); }
                .embedWrap { margin-top: 18px; border-radius: 14px; overflow: hidden; border: 1px solid #c9a44e; box-shadow: 0 30px 70px -30px rgba(50,36,16,0.6); background: #14100c; }

                /* DEMO */
                .demo { padding-bottom: clamp(20px, 3vw, 40px); }
                .demoGrid { display: grid; grid-template-columns: 1fr; gap: 34px; align-items: center; }
                .flipShadow { border-radius: 10px; overflow: hidden; box-shadow: 0 34px 80px -30px rgba(60,44,20,0.6), 0 0 0 1px rgba(180,148,90,0.3); }

                /* INCLUDED */
                .inclGrid { display: grid; grid-template-columns: 1fr; gap: 26px; }
                .inclList { list-style: none; margin: 0; padding: 0; }
                .inclList li { display: flex; gap: 18px; align-items: baseline; padding: 17px 2px; border-bottom: 1px solid rgba(168,132,58,0.3); font-size: 16px; font-weight: 400; color: #3a2f1e; }
                .inclN { font-size: 14px; font-weight: 700; color: #a8843a; letter-spacing: 0.14em; }

                /* PRICE BAND */
                .priceBand { background-color: #171310; color: #f3e9d2; padding: clamp(56px, 9vw, 110px) 0; margin-top: clamp(48px, 8vw, 96px); }
                .priceGrid { display: grid; grid-template-columns: 1fr; gap: 38px; align-items: center; }
                .priceLine { display: flex; align-items: baseline; gap: 12px; }
                .priceN { font-size: clamp(84px, 15vw, 150px); font-weight: 700; line-height: 0.95; color: #f3e9d2; letter-spacing: -0.02em; }
                .priceCur { font-size: clamp(30px, 5vw, 48px); color: #cfa860; font-weight: 700; }
                .priceNote { font-size: 15.5px; font-weight: 300; color: rgba(243,233,210,0.75); line-height: 1.75; margin: 16px 0 26px; max-width: 380px; }
                .priceFig { margin: 0; }
                .priceFig img { width: 100%; border-radius: 10px; box-shadow: 0 34px 70px -26px rgba(0,0,0,0.7), 0 0 0 1px rgba(207,168,96,0.4); }
                .priceFig figcaption { font-size: 17px; color: rgba(243,233,210,0.65); margin-top: 12px; text-align: center; }

                /* TESTIMONIAL */
                .testi { padding: clamp(56px, 9vw, 100px) 0 clamp(20px, 3vw, 30px); }
                .testiQ { font-size: clamp(21px, 3.6vw, 30px); font-weight: 600; font-style: italic; line-height: 1.7; color: #3a2f1e; margin: 0; }
                .testiBy { font-size: 13px; color: #8a744d; margin-top: 16px; font-weight: 600; }

                /* FAQ */
                .faqItem { border-bottom: 1px solid rgba(168,132,58,0.3); }
                .faqItem summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 2px; font-size: 17.5px; font-weight: 700; color: #1c1712; }
                .faqItem p { font-size: 14.5px; font-weight: 300; color: #574733; line-height: 1.8; padding: 0 2px 18px; margin: 0; max-width: 560px; }

                /* FINALE */
                .finale { background-color: #171310; color: #f3e9d2; padding: clamp(64px, 10vw, 120px) 0; margin-top: clamp(48px, 8vw, 96px); }
                .finaleT { font-size: clamp(34px, 7vw, 64px); font-weight: 700; line-height: 1.12; margin: 0; }
                .finaleT em { font-style: normal; color: #e2c377; }

                /* ≥ 760px — the editorial grid opens up */
                @media (min-width: 760px) {
                    .heroGrid { grid-template-columns: 6fr 5fr; gap: 20px; }
                    .heroCtas { flex-direction: row; }
                    .heroCtas .btn { width: auto; flex: 1; }
                    .vertCaption { display: block; }
                    .howGrid { grid-template-columns: repeat(3, 1fr); }
                    .storyGrid { grid-template-columns: 5fr 6fr; gap: clamp(30px, 5vw, 70px); }
                    .storyGrid.flip { direction: ltr; }
                    .storyGrid.flip > * { direction: rtl; }
                    .demoGrid { grid-template-columns: 1fr 1fr; }
                    .inclGrid { grid-template-columns: 4fr 7fr; }
                    .priceGrid { grid-template-columns: 6fr 5fr; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .obs { opacity: 1; transform: none; transition: none; }
                    .ha, .frame, .btn { transition: none; }
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
