'use client'

// /landing — the full marketing landing page, hosted on the app's own domain
// (app.weddingtales.co.il/landing). Combines the proven copy from the public
// marketing site with what was missing there: it SHOWS the product (a real
// rendered book + a gallery of real photos), lets visitors EXPERIENCE it
// (flip a sample book + add a blessing live), and only then asks for contact.
//
// Self-contained + client-side (no Firestore) so it's fast and unbreakable.
// OG preview lives in ./layout.js. Brand photos come from /public/imgs.

import { useEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { normalizeBlessing } from '@/lib/normalizeText'
import {
    QrCode, PenLine, BookHeart, Sparkles, Globe, Printer, Smartphone, Camera,
    Check, ChevronLeft, ChevronRight, Star, ChevronDown,
} from 'lucide-react'

const WA = 'https://wa.link/0sesxc'

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
    { q: 'מה קורה אם האירוע נדחה?', a: 'אין שום בעיה — הקישור והמערכת שלכם נשארים פעילים, ופשוט נתאם מחדש לתאריך החדש. לא משלמים פעמיים.' },
    { q: 'חלק מהאורחים שלנו מבוגרים — זה מתאים גם להם?', a: 'בהחלט. סריקת ה‑QR פותחת עמוד פשוט בדפדפן, בלי הורדת אפליקציה ובלי הרשמה. אפשר גם לעזור ולהקריא — ודווקא מהדור המבוגר מגיעות חלק מהברכות הכי מרגשות.' },
    { q: 'מה בדיוק מקבלים?', a: 'ספר מודפס יוקרתי בכריכה קשה על נייר ארכיב איכותי, ספר דיגיטלי לדפדוף ולשיתוף עם כל האורחים, וגישה למערכת לניהול הברכות ובחירת העיצוב.' },
    { q: 'מה אם לא כל האורחים ישתתפו?', a: 'גם השתתפות חלקית מספיקה לספר מלא ומרגש. אנחנו עוזרים עם שילוט, תזכורות ועיצוב שמזמין השתתפות — ותמיד אפשר להוסיף ברכות גם אחרי האירוע.' },
]

const GALLERY = ['/imgs/img9.jpg', '/imgs/img10.jpg', '/imgs/img11.jpg', '/imgs/img12.jpg', '/imgs/img13.jpg', '/imgs/img14.jpg', '/imgs/img15.jpg', '/imgs/img16.jpg']

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

    const scrollToDemo = () => {
        document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const card = { background: '#fffdf8', border: '1px solid #ead9b3', borderRadius: 20, boxShadow: '0 12px 34px -20px rgba(120,96,60,0.30)' }
    const sectionTitle = { fontSize: 22, fontWeight: 800, color: '#1a1410', textAlign: 'center', margin: 0 }

    return (
        <div dir='rtl' style={{ minHeight: '100vh', background: 'radial-gradient(140% 80% at 50% 0%, #fbf7ef 0%, #f4ecda 55%, #efe3cc 100%)', fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', color: '#3d2e1a' }}>
            <div style={{ maxWidth: 620, margin: '0 auto', padding: '26px 18px 60px' }}>

                {/* ───────── HERO ───────── */}
                <header style={{ textAlign: 'center', marginBottom: 30 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src='/logo-wt.png' alt='Wedding Tales' style={{ height: 42, margin: '0 auto 18px', opacity: 0.92 }} />
                    <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, color: '#1a1410', margin: 0 }}>
                        ספר שהאורחים שלכם<br />יוצרים <span style={{ color: '#b8893d', fontStyle: 'italic' }}>בזמן אמת</span>
                    </h1>
                    <p style={{ fontSize: 16, color: '#6b5836', lineHeight: 1.7, marginTop: 14, maxWidth: 460, marginInline: 'auto' }}>
                        האורחים מעלים תמונה וכותבים ברכה בזמן האירוע, ואתם מקבלים <b>ספר מודפס ודיגיטלי</b> שנשאר למזכרת.
                    </p>
                    <p style={{ fontSize: 13.5, color: '#9a8763', marginTop: 10, fontWeight: 600 }}>מתאים לחתונות · בר/בת מצווה · ימי הולדת</p>

                    {/* Book mockup — a real rendered cover, tilted like a book on a shelf */}
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0 6px' }}>
                        <div style={{ width: 230, height: 230, borderRadius: 12, overflow: 'hidden', transform: 'rotate(-3deg)', boxShadow: '0 26px 50px -20px rgba(120,96,60,0.55), 0 0 0 1px rgba(212,184,103,0.3)' }}>
                            <BookCoverTemplate wedding={sampleWedding} styleSettings={coverStyle} scaledWidth={230} scaledHeight={230} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, maxWidth: 380, marginInline: 'auto' }}>
                        <button onClick={scrollToDemo} style={{ ...primaryBtn, fontSize: 16.5 }}>
                            <Sparkles size={18} /> ראו דוגמה חיה ונסו בעצמכם
                        </button>
                        <a href={WA} target='_blank' rel='noopener noreferrer' style={waBtn}>
                            <WaIcon /> דברו איתנו בוואטסאפ
                        </a>
                    </div>
                </header>

                {/* ───────── HOW IT WORKS ───────── */}
                <section style={{ ...card, padding: 20, marginBottom: 24 }}>
                    <h2 style={sectionTitle}>איך זה עובד?</h2>
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

                {/* ───────── LIVE SAMPLE (flip + add) ───────── */}
                <section id='demo' style={{ ...card, padding: 20, marginBottom: 24, scrollMarginTop: 16 }}>
                    <h2 style={sectionTitle}>דפדפו בספר לדוגמה</h2>
                    <p style={{ fontSize: 13, color: '#9a8763', textAlign: 'center', marginTop: 6 }}>החליקו או השתמשו בחיצים — בדיוק כמו הספר הדיגיטלי שתקבלו</p>

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

                    {/* Try it */}
                    <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed #e3d6ba' }}>
                        <h3 style={{ fontSize: 16.5, fontWeight: 800, color: '#1a1410', textAlign: 'center', margin: 0 }}>נסו בעצמכם — הוסיפו ברכה</h3>
                        <p style={{ fontSize: 12.5, color: '#9a8763', textAlign: 'center', marginTop: 5 }}>כתבו, הוסיפו תמונה, ותראו אותה נכנסת לספר למעלה ✨ (הדגמה — לא נשמר)</p>
                        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='השם שלכם' maxLength={40} style={{ ...field, marginTop: 12 }} />
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

                {/* ───────── GALLERY ───────── */}
                <section style={{ marginBottom: 24 }}>
                    <h2 style={{ ...sectionTitle, marginBottom: 4 }}>רגעים מתוך ספרים אמיתיים</h2>
                    <p style={{ fontSize: 13, color: '#9a8763', textAlign: 'center', marginBottom: 14 }}>ככה זה נראה — התמונות והברכות של האורחים, על נייר</p>
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 2px 10px', scrollSnapType: 'x mandatory' }}>
                        {GALLERY.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt='' loading='lazy' style={{ width: 168, height: 210, objectFit: 'cover', borderRadius: 14, flexShrink: 0, scrollSnapAlign: 'center', boxShadow: '0 14px 30px -18px rgba(120,96,60,0.5)', border: '1px solid rgba(212,184,103,0.25)' }} />
                        ))}
                    </div>
                </section>

                {/* ───────── WHAT'S INCLUDED ───────── */}
                <section style={{ ...card, padding: 20, marginBottom: 24 }}>
                    <h2 style={sectionTitle}>מה כלול בחבילה</h2>
                    <div style={{ marginTop: 14 }}>
                        {[
                            { icon: Sparkles, t: 'עיצוב מותאם אישית', d: 'עם השם והתמונה של החוגג/ת, בסגנון שמתאים לאירוע שלכם.' },
                            { icon: Printer, t: 'ספר מודפס ויוקרתי', d: 'כריכה קשה על נייר ארכיב איכותי — מזכרת שנשארת לדורות.' },
                            { icon: Smartphone, t: 'ספר דיגיטלי לשיתוף', d: 'גרסה דיגיטלית יפהפייה לדפדוף ולשליחה לכל האורחים.' },
                            { icon: Globe, t: 'מערכת ניהול ובחירת עיצוב', d: 'גישה מלאה לניהול הברכות, סידור הספר ובחירת העיצוב.' },
                        ].map((s, i) => (
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
                </section>

                {/* ───────── TESTIMONIAL ───────── */}
                <section style={{ ...card, padding: 24, marginBottom: 24, textAlign: 'center', background: 'linear-gradient(180deg,#fffdf8,#fbf3e3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 10 }}>
                        {[0, 1, 2, 3, 4].map(i => <Star key={i} size={17} fill='#d3b46a' color='#d3b46a' />)}
                    </div>
                    <p style={{ fontSize: 17, fontWeight: 600, color: '#3d2e1a', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                        ”לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לחתונה שוב. יצא לנו ספר מהמם.“
                    </p>
                    <p style={{ fontSize: 13, color: '#9a8763', marginTop: 12, fontWeight: 700 }}>שקד · התחתנה במרץ 2026</p>
                </section>

                {/* ───────── FAQ ───────── */}
                <section style={{ ...card, padding: 12, marginBottom: 24 }}>
                    <h2 style={{ ...sectionTitle, padding: '8px 0 4px' }}>השאלות שלכם</h2>
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
                    <h2 style={{ ...sectionTitle, fontSize: 24 }}>רוצים לראות איך הספר שלכם ייראה?</h2>
                    <p style={{ fontSize: 15, color: '#6b5836', lineHeight: 1.7, marginTop: 10, maxWidth: 440, marginInline: 'auto' }}>
                        השאירו פרטים ונשלח לכם דוגמה, הסבר קצר ופירוט על החבילות שלנו.
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
