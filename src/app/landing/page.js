'use client'

// /landing — the full marketing landing page (app.weddingtales.co.il/landing).
//
// Spring 2026 rewrite: the page now leads with REAL portfolio — three live
// customer books (see PORTFOLIO below), each linking to its actual public
// digital book via a dedicated landing token, plus transparent pricing.
// The live flip-a-book + add-a-blessing demo from the previous version is
// kept (it converts) and sits right after the portfolio.
//
// Portfolio access tokens were minted specifically for this page with
// issuedBy:'landing-page' in each wedding's digitalTokensIssuedAt audit
// array — revoke them there without touching the couples' own links:
//   wedding rOPkVWbwurT4UjKCR5hg (שקד ודור), birthday 6175 (ג'רי),
//   bar mitzvah 5483 (נועם).
//
// Static screenshots live in /public/imgs/portfolio/{slug}/ — captured from
// the production books, so the cards show the real product. Self-contained +
// client-side (no Firestore) so the page stays fast and unbreakable.
// OG preview lives in ./layout.js.

import { useEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { normalizeBlessing } from '@/lib/normalizeText'
import { frankRuhl } from '@/app/fonts'
import {
    QrCode, PenLine, BookHeart, Sparkles, Globe, Printer, Smartphone, Camera,
    Check, ChevronLeft, ChevronRight, Star, ChevronDown, BookOpen, MessageCircle,
} from 'lucide-react'

const WA = 'https://wa.link/0sesxc'

// ─── Real customer books (the portfolio) ────────────────────────────
const PORTFOLIO = [
    {
        slug: 'wedding',
        badge: 'חתונה',
        title: 'שקד ודור',
        sub: 'ספר הברכות של החתונה',
        count: 24,
        href: '/b/529b8a86-ca5d-4944-8178-c75c0420095d',
        accent: '#b8893d',
    },
    {
        slug: 'bar-mitzvah',
        badge: 'בר מצווה',
        title: 'נועם',
        sub: 'ספר הברכות של בר המצווה',
        count: 45,
        href: '/b/0b02382b-7d8e-40a8-804b-1c5bdd31c1ae',
        accent: '#7aa4d6',
    },
    {
        slug: 'birthday',
        badge: 'יום הולדת 90',
        title: 'ג׳רי',
        sub: 'ספר ברכות ליום הולדת',
        count: 31,
        href: '/b/a319b00d-7ed2-48cf-b88b-d41a98f35e05',
        accent: '#c98a9a',
    },
]

// Demo blessings for the interactive flipbook (not a real book).
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
    { q: 'מה בדיוק מקבלים?', a: 'ספר מודפס יוקרתי בכריכה קשה על נייר ארכיב איכותי, ספר דיגיטלי לדפדוף ולשיתוף עם כל האורחים, וגישה למערכת לניהול הברכות ובחירת העיצוב.' },
    { q: 'כמה זמן לוקח עד שהספר מגיע?', a: 'כ־4 שבועות מרגע שאישרתם את העיצוב הסופי. הספר הדיגיטלי זמין מיד — עוד באותו ערב אפשר לדפדף בברכות ולשתף עם המשפחה.' },
    { q: 'אפשר להוסיף ברכות גם אחרי האירוע?', a: 'בהחלט. הקישור נשאר פעיל גם אחרי האירוע, כך שמי שפספס — סבתא, חברים מחו"ל, קולגות — יכול להוסיף ברכה עד שסוגרים את הספר להדפסה.' },
    { q: 'חלק מהאורחים שלנו מבוגרים — זה מתאים גם להם?', a: 'בהחלט. סריקת ה‑QR פותחת עמוד פשוט בדפדפן, בלי הורדת אפליקציה ובלי הרשמה. אפשר גם לעזור ולהקריא — ודווקא מהדור המבוגר מגיעות חלק מהברכות הכי מרגשות.' },
    { q: 'מה אם לא כל האורחים ישתתפו?', a: 'גם השתתפות חלקית מספיקה לספר מלא ומרגש. אנחנו עוזרים עם שילוט, תזכורות ועיצוב שמזמין השתתפות — ותמיד אפשר להוסיף ברכות גם אחרי האירוע.' },
    { q: 'מה קורה אם האירוע נדחה?', a: 'אין שום בעיה — הקישור והמערכת שלכם נשארים פעילים, ופשוט נתאם מחדש לתאריך החדש. לא משלמים פעמיים.' },
]

const GALLERY = ['/imgs/img9.jpg', '/imgs/img10.jpg', '/imgs/img11.jpg', '/imgs/img12.jpg', '/imgs/img13.jpg', '/imgs/img14.jpg', '/imgs/img15.jpg', '/imgs/img16.jpg']

const INCLUDED = [
    { icon: Printer, t: 'ספר מודפס בכריכה קשה', d: 'נייר ארכיב איכותי, עיצוב אישי — מזכרת שנשארת לדורות.' },
    { icon: Smartphone, t: 'ספר דיגיטלי לשיתוף', d: 'גרסה דיגיטלית יפהפייה לדפדוף ולשליחה לכל האורחים — זמינה כבר בערב האירוע.' },
    { icon: Sparkles, t: 'עיצוב מותאם אישית', d: 'עם השם והתמונה של החוגגים, בסגנון שמתאים בדיוק לאירוע שלכם.' },
    { icon: Globe, t: 'מערכת ניהול ובחירת עיצוב', d: 'גישה מלאה לניהול הברכות, סידור הספר ובחירת העיצוב.' },
]

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

    // Responsive square flip canvas.
    const wrapRef = useRef(null)
    const [size, setSize] = useState(320)
    useEffect(() => {
        const measure = () => {
            const w = wrapRef.current?.clientWidth || 340
            setSize(Math.max(240, Math.min(400, Math.floor(w))))
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
        const nextIndex = pages.length + 1 // +1 for the cover
        setExtra(prev => [...prev, entry])
        setForm({ name: '', text: '' })
        setPhoto(null)
        setAdded(true)
        setTimeout(() => setAdded(false), 3000)
        setTimeout(() => { try { flipRef.current?.pageFlip?.()?.flip(nextIndex) } catch { /* ignore */ } }, 260)
    }

    const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    const card = { background: '#fffdf8', border: '1px solid #ead9b3', borderRadius: 20, boxShadow: '0 12px 34px -20px rgba(120,96,60,0.30)' }
    const sectionTitle = { fontSize: 24, fontWeight: 700, color: '#1a1410', textAlign: 'center', margin: 0, letterSpacing: '-0.01em' }
    const kicker = { fontSize: 12.5, fontWeight: 800, color: '#b8893d', textAlign: 'center', letterSpacing: '0.14em', margin: '0 0 8px' }

    return (
        <div dir='rtl' style={{ minHeight: '100vh', background: 'radial-gradient(140% 80% at 50% 0%, #fbf7ef 0%, #f4ecda 55%, #efe3cc 100%)', fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', color: '#3d2e1a', overflowX: 'hidden' }}>
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 18px 60px' }}>

                {/* ───────── HERO ───────── */}
                <header style={{ textAlign: 'center', marginBottom: 34 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src='/logo-wt.png' alt='Wedding Tales' style={{ height: 42, margin: '0 auto 20px', opacity: 0.92 }} />
                    <h1 className={frankRuhl.className} style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.22, color: '#1a1410', margin: 0 }}>
                        כל האורחים מברכים.<br />אתם מקבלים <span style={{ color: '#b8893d' }}>ספר.</span>
                    </h1>
                    <p style={{ fontSize: 16, color: '#6b5836', lineHeight: 1.7, marginTop: 14, maxWidth: 470, marginInline: 'auto' }}>
                        האורחים סורקים QR, מעלים תמונה וכותבים ברכה בזמן האירוע — ואתם מקבלים
                        <b> ספר מודפס בכריכה קשה</b> וספר דיגיטלי שנשארים לכל החיים.
                    </p>
                    <p style={{ fontSize: 13.5, color: '#9a8763', marginTop: 10, fontWeight: 600 }}>חתונות · בר/בת מצווה · ימי הולדת</p>

                    {/* Fan of the three REAL covers */}
                    <div className='coverFan' aria-hidden style={{ position: 'relative', height: 250, margin: '30px auto 4px', maxWidth: 480 }}>
                        {PORTFOLIO.map((b, i) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                key={b.slug}
                                src={`/imgs/portfolio/${b.slug}/cover.webp`}
                                alt={b.title}
                                onClick={() => scrollTo('portfolio')}
                                style={{
                                    position: 'absolute',
                                    insetInlineStart: `${[4, 30, 56][i]}%`,
                                    top: [16, 0, 16][i],
                                    width: 190, height: 190, objectFit: 'cover',
                                    borderRadius: 10, cursor: 'pointer',
                                    transform: `rotate(${[-7, 0, 7][i]}deg)`,
                                    zIndex: i === 1 ? 2 : 1,
                                    boxShadow: '0 24px 44px -18px rgba(96,72,40,0.55), 0 0 0 1px rgba(212,184,103,0.35)',
                                    transition: 'transform .25s ease',
                                }}
                            />
                        ))}
                    </div>
                    <p style={{ fontSize: 12.5, color: '#9a8763', margin: '10px 0 0' }}>שלושה ספרים אמיתיים של לקוחות — דפדפו בהם למטה ↓</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, maxWidth: 390, marginInline: 'auto' }}>
                        <button onClick={() => scrollTo('portfolio')} style={{ ...primaryBtn, fontSize: 16.5 }}>
                            <BookOpen size={18} /> דפדפו בספרים אמיתיים
                        </button>
                        <a href={WA} target='_blank' rel='noopener noreferrer' style={waBtn}>
                            <WaIcon /> דברו איתנו בוואטסאפ
                        </a>
                    </div>
                </header>

                {/* ───────── HOW IT WORKS ───────── */}
                <section style={{ ...card, padding: 20, marginBottom: 26 }}>
                    <h2 className={frankRuhl.className} style={sectionTitle}>איך זה עובד?</h2>
                    <div style={{ marginTop: 16 }}>
                        {[
                            { icon: QrCode, t: 'המשפחה והחברים סורקים QR', d: 'קוד על השולחן / השלט פותח עמוד אישי — בלי אפליקציה ובלי הרשמה.' },
                            { icon: PenLine, t: 'מעלים תמונה וכותבים ברכה', d: 'רגע אישי מכל הלב, עם עוזר כתיבה חכם למי שצריך השראה.' },
                            { icon: BookHeart, t: 'מקבלים ספר ברכות יוקרתי', d: 'הכל מתאחד לספר מעוצב — מודפס בכריכה קשה וגם דיגיטלי לדפדוף.' },
                        ].map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 0', borderTop: i ? '1px solid #f2e9d6' : 'none' }}>
                                <div style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(180deg,#d3b46a,#b8893d)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    <s.icon size={21} color='#fff' />
                                    <span style={{ position: 'absolute', top: -7, insetInlineStart: -7, width: 22, height: 22, borderRadius: '50%', background: '#1a1410', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{`0${i + 1}`}</span>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15.5, color: '#1a1410' }}>{s.t}</div>
                                    <div style={{ fontSize: 13.5, color: '#6b5836', lineHeight: 1.6, marginTop: 2 }}>{s.d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ───────── PORTFOLIO — real books ───────── */}
                <section id='portfolio' style={{ marginBottom: 26, scrollMarginTop: 16 }}>
                    <p style={kicker}>עבודות אמיתיות</p>
                    <h2 className={frankRuhl.className} style={sectionTitle}>ספרים של לקוחות — פתוחים לדפדוף</h2>
                    <p style={{ fontSize: 13.5, color: '#9a8763', textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
                        לא הדמיות ולא דוגמאות סטודיו. שלושה ספרים אמיתיים, עם הברכות והתמונות שהאורחים העלו.
                    </p>
                    <div className='portfolioGrid' style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18, marginTop: 18 }}>
                        {PORTFOLIO.map(b => (
                            <article key={b.slug} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ position: 'relative' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`/imgs/portfolio/${b.slug}/cover.webp`} alt={`הכריכה של ${b.title}`} loading='lazy' style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                                    <span style={{ position: 'absolute', top: 12, insetInlineStart: 12, background: 'rgba(26,20,16,0.82)', color: '#f5ead2', fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 999, letterSpacing: '0.04em' }}>{b.badge}</span>
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/imgs/portfolio/${b.slug}/spread-1.webp`} alt={`עמודים מתוך הספר של ${b.title}`} loading='lazy' style={{ width: '100%', display: 'block', borderTop: '1px solid #f2e9d6' }} />
                                <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1 }}>
                                    <div className={frankRuhl.className} style={{ fontSize: 20, fontWeight: 800, color: '#1a1410' }}>{b.title}</div>
                                    <div style={{ fontSize: 13, color: '#9a8763' }}>{b.sub} · <b style={{ color: '#6b5836' }}>{b.count} ברכות מהאורחים</b></div>
                                    <a href={b.href} target='_blank' rel='noopener noreferrer' style={{ ...primaryBtn, marginTop: 12, textDecoration: 'none', fontSize: 15 }}>
                                        <BookOpen size={17} /> דפדפו בספר האמיתי
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* ───────── LIVE SAMPLE (flip + add) ───────── */}
                <section id='demo' style={{ ...card, padding: 20, marginBottom: 26, scrollMarginTop: 16 }}>
                    <h2 className={frankRuhl.className} style={sectionTitle}>נסו בעצמכם — הוסיפו ברכה</h2>
                    <p style={{ fontSize: 13, color: '#9a8763', textAlign: 'center', marginTop: 6 }}>ככה זה מרגיש לאורחים: כתבו ברכה, הוסיפו תמונה, ותראו אותה נכנסת לספר (הדגמה — לא נשמר)</p>

                    <div ref={wrapRef} style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: 12 }}>
                        <div style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', boxShadow: '0 22px 54px -22px rgba(120,96,60,0.55), 0 0 0 1px rgba(212,184,103,0.25)' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                        <button onClick={() => flip('prev')} aria-label='הקודם' style={navBtn}><ChevronRight size={20} /></button>
                        <button onClick={() => flip('next')} aria-label='הבא' style={navBtn}><ChevronLeft size={20} /></button>
                    </div>

                    <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed #e3d6ba' }}>
                        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='השם שלכם' maxLength={40} style={{ ...field, marginTop: 2 }} />
                        <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value.slice(0, 300) }))} placeholder='כתבו ברכה מכל הלב…' rows={3} style={{ ...field, resize: 'vertical', lineHeight: 1.6, marginTop: 10 }} />
                        <input ref={fileRef} type='file' accept='image/*' onChange={onPickPhoto} style={{ display: 'none' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                            <button onClick={() => fileRef.current?.click()} style={ghostBtn}><Camera size={16} /> {photo ? 'החלפת תמונה' : 'הוספת תמונה'}</button>
                            {photo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photo.url} alt='' style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', border: '1px solid #ead9b3' }} />
                            )}
                        </div>
                        <button onClick={addBlessing} style={{ ...primaryBtn, marginTop: 14 }}>
                            {added ? <><Check size={17} /> נוספה לספר! דפדפו למעלה</> : <><Sparkles size={17} /> הוסיפו לספר</>}
                        </button>
                    </div>
                </section>

                {/* ───────── GALLERY — the printed product ───────── */}
                <section style={{ marginBottom: 26 }}>
                    <h2 className={frankRuhl.className} style={{ ...sectionTitle, marginBottom: 4 }}>וככה זה נראה מודפס</h2>
                    <p style={{ fontSize: 13, color: '#9a8763', textAlign: 'center', marginBottom: 14 }}>כריכה קשה, נייר ארכיב — התמונות והברכות של האורחים, על נייר</p>
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 2px 10px', scrollSnapType: 'x mandatory' }}>
                        {GALLERY.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt='' loading='lazy' style={{ width: 168, height: 210, objectFit: 'cover', borderRadius: 14, flexShrink: 0, scrollSnapAlign: 'center', boxShadow: '0 14px 30px -18px rgba(120,96,60,0.5)', border: '1px solid rgba(212,184,103,0.25)' }} />
                        ))}
                    </div>
                </section>

                {/* ───────── PRICING ───────── */}
                <section id='pricing' style={{ ...card, padding: 24, marginBottom: 26, textAlign: 'center', background: 'linear-gradient(180deg,#fffdf8,#faf1de)', border: '1px solid #d9c48e', scrollMarginTop: 16 }}>
                    <p style={kicker}>מחיר אחד, בלי הפתעות</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
                        <span className={frankRuhl.className} style={{ fontSize: 46, fontWeight: 800, color: '#1a1410', lineHeight: 1 }}>1,290</span>
                        <span style={{ fontSize: 22, fontWeight: 700, color: '#b8893d' }}>₪</span>
                    </div>
                    <p style={{ fontSize: 13.5, color: '#9a8763', margin: '6px 0 16px' }}>הכול כלול — מהקמת העמוד ועד הספר המודפס אצלכם בבית</p>
                    <div style={{ textAlign: 'right', maxWidth: 420, marginInline: 'auto' }}>
                        {INCLUDED.map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? '1px solid #f2e9d6' : 'none' }}>
                                <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'rgba(184,137,61,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Check size={16} color='#b8893d' />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1410' }}>{s.t}</div>
                                    <div style={{ fontSize: 13.5, color: '#6b5836', lineHeight: 1.6 }}>{s.d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <a href={WA} target='_blank' rel='noopener noreferrer' style={{ ...waBtn, maxWidth: 380, marginInline: 'auto', marginTop: 18 }}>
                        <MessageCircle size={19} /> אני רוצה ספר כזה — דברו איתי
                    </a>
                </section>

                {/* ───────── TESTIMONIAL ───────── */}
                <section style={{ ...card, padding: 24, marginBottom: 26, textAlign: 'center', background: 'linear-gradient(180deg,#fffdf8,#fbf3e3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 10 }}>
                        {[0, 1, 2, 3, 4].map(i => <Star key={i} size={17} fill='#d3b46a' color='#d3b46a' />)}
                    </div>
                    <p className={frankRuhl.className} style={{ fontSize: 18, fontWeight: 600, color: '#3d2e1a', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                        ”לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לחתונה שוב. יצא לנו ספר מהמם.“
                    </p>
                    <p style={{ fontSize: 13, color: '#9a8763', marginTop: 12, fontWeight: 700 }}>שקד · התחתנה במרץ 2026 · <a href={PORTFOLIO[0].href} target='_blank' rel='noopener noreferrer' style={{ color: '#b8893d' }}>הספר שלה למעלה ↑</a></p>
                </section>

                {/* ───────── FAQ ───────── */}
                <section style={{ ...card, padding: 12, marginBottom: 26 }}>
                    <h2 className={frankRuhl.className} style={{ ...sectionTitle, padding: '8px 0 4px' }}>השאלות שלכם</h2>
                    {FAQ.map((f, i) => (
                        <details key={i} style={{ borderTop: '1px solid #f2e9d6', padding: '4px 8px' }}>
                            <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 4px', fontSize: 15, fontWeight: 700, color: '#1a1410' }}>
                                {f.q}
                                <ChevronDown size={18} color='#b8893d' style={{ flexShrink: 0 }} />
                            </summary>
                            <p style={{ fontSize: 13.5, color: '#6b5836', lineHeight: 1.7, padding: '0 4px 14px' }}>{f.a}</p>
                        </details>
                    ))}
                </section>

                {/* ───────── FINAL CTA ───────── */}
                <section style={{ textAlign: 'center' }}>
                    <h2 className={frankRuhl.className} style={{ ...sectionTitle, fontSize: 26 }}>רוצים ספר כזה מהאירוע שלכם?</h2>
                    <p style={{ fontSize: 15, color: '#6b5836', lineHeight: 1.7, marginTop: 10, maxWidth: 440, marginInline: 'auto' }}>
                        ספרו לנו על האירוע ונחזור אליכם עם כל הפרטים — בלי לחץ ובלי ספאם.
                    </p>
                    <a href={WA} target='_blank' rel='noopener noreferrer' style={{ ...waBtn, maxWidth: 420, marginInline: 'auto', marginTop: 18, fontSize: 16.5 }}>
                        <WaIcon /> דברו איתנו בוואטסאפ
                    </a>
                    <p style={{ fontSize: 12, color: '#9a8763', marginTop: 16 }}>© {new Date().getFullYear()} Wedding Tales · מזכרת לכל החיים</p>
                </section>
            </div>

            <style jsx global>{`
                .landing-flip { margin: 0 auto; }
                details > summary::-webkit-details-marker { display: none; }
                .coverFan img:hover { transform: rotate(0deg) scale(1.04) !important; z-index: 3 !important; }
                @media (min-width: 700px) {
                    .portfolioGrid { grid-template-columns: repeat(3, 1fr) !important; }
                }
            `}</style>
        </div>
    )
}

function WaIcon() {
    return (
        <svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor' aria-hidden='true'>
            <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24.044 12.045.044 5.463.044.105 5.402.103 11.985c0 2.096.547 4.142 1.588 5.945L0 24l6.304-1.654a11.9 11.9 0 0 0 5.71 1.453h.005c6.582 0 11.94-5.358 11.942-11.94 0-3.193-1.24-6.19-3.44-8.418' />
        </svg>
    )
}

const primaryBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
    background: 'linear-gradient(180deg,#d3b46a,#b8893d)', color: '#fff', fontWeight: 800, fontSize: 16,
    borderRadius: 14, padding: '14px 0', border: 'none', cursor: 'pointer',
    boxShadow: '0 14px 30px -12px rgba(170,136,64,0.5)',
}
const waBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
    padding: '14px 18px', borderRadius: 14, textDecoration: 'none', color: '#fff', fontSize: 16, fontWeight: 800,
    background: 'linear-gradient(180deg,#25D366,#128C7E)', boxShadow: '0 14px 30px -12px rgba(18,140,126,0.5)',
}
const navBtn = {
    width: 44, height: 44, borderRadius: 12, border: '1px solid #ead9b3', background: '#fffdf8',
    color: '#b8893d', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
const field = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #e0d4ba', borderRadius: 12,
    padding: '11px 13px', fontSize: 15, color: '#4a3f2c', background: '#fff', outline: 'none',
}
const ghostBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 7, background: '#efe6d4', color: '#6b5836',
    border: '1px solid #ddcfb0', fontWeight: 600, fontSize: 13.5, borderRadius: 11, padding: '10px 16px', cursor: 'pointer', flexShrink: 0,
}
