'use client'

// /demo — a public, self-contained "experience" page to send leads (WhatsApp).
//
// It does three things on ONE link:
//   1. Explains the product simply (what it is + 3 steps + why it's special).
//   2. Lets them FLIP through a real sample greeting book (the actual
//      BookPageTemplate + flipbook, with the brand's /imgs sample photos).
//   3. Lets them TRY it — write a blessing + add a photo — and watch it drop
//      into the book live (simulated in-page; nothing is saved). This conveys
//      the guest experience end-to-end without any backend.
//
// Fully client-side + self-contained (no Firestore), so the link is fast,
// reliable, and impossible to break. OG preview lives in ./layout.js.

import { useEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { applyPresetClean } from '@/lib/bookDesignSchema'
import { resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { normalizeBlessing } from '@/lib/normalizeText'
import { QrCode, PenLine, BookHeart, Sparkles, Globe, Printer, Smartphone, Camera, Check, ChevronLeft, ChevronRight } from 'lucide-react'

const WHATSAPP = 'https://wa.link/z4a85t'

// Sample blessings (mixed Hebrew + English to show multilingual support),
// each paired with one of the brand's sample photos in /public/imgs.
const SAMPLE = [
    { id: 's1', name: 'דנה', text: 'סבא יקר, אין מילים לתאר כמה אנחנו אוהבים אותך. שתמיד תהיה בריא ושמח, ותמשיך להאיר לכולנו את הדרך.', imageUrl: '/imgs/img1.jpg' },
    { id: 's2', name: 'Yossi & Michal', text: 'Your stories and your smile light up every room. Here’s to many more years of laughter together — we love you!', imageUrl: '/imgs/img2.jpg' },
    { id: 's3', name: 'משפחת לוי', text: 'תודה על כל הארוחות, הצחוקים והחוכמה. אתה הלב הפועם של המשפחה שלנו, ואנחנו אסירי תודה על כל רגע.', imageUrl: '/imgs/img3.jpg' },
    { id: 's4', name: 'נועה', text: 'לאדם הכי טוב שאני מכירה — שתמשיך לרקוד, לשיר ולחבק חזק. אוהבת אותך עד הירח ובחזרה.', imageUrl: '/imgs/img4.jpg' },
    { id: 's5', name: 'Daniel', text: 'To the one who taught me everything about kindness and patience — happy celebration. So grateful for you.', imageUrl: '/imgs/img5.jpg' },
    { id: 's6', name: 'רוני וגיל', text: 'כל רגע איתך הוא מתנה. שתהיה לך שנה מלאה בבריאות, אושר ונחת מכל מי שאוהב אותך.', imageUrl: '/imgs/img6.jpg' },
    { id: 's7', name: 'סבתא תקווה', text: 'ביחד כבר שנים רבות והלב עוד מלא. תודה על כל האהבה — אוהבת אותך תמיד.', imageUrl: '/imgs/img7.jpg' },
    { id: 's8', name: 'אורי', text: 'פשוט תודה. על הכל. אתה הגיבור שלי, היום ותמיד.', imageUrl: '/imgs/img8.jpg' },
]

export default function DemoPage() {
    // ── Design: defaultStyle + a warm built-in preset, so the sample book
    //    looks like a real designed book. ──
    const styleSettings = useMemo(() => {
        const preset = BUILTIN_PRESETS.find(p => /פרחי גן|פסטורלי|שמפניה/.test(p.name)) || BUILTIN_PRESETS[0]
        const rp = preset ? resolvePreset(preset).values : {}
        return { ...applyPresetClean(rp), locale: 'he' }
    }, [])
    const coverStyle = useMemo(() => ({
        ...styleSettings,
        coverImage: '/imgs/Cover%20img.jpg',
        coverTitle: 'ספר הברכות',
        coverSubtitle: 'הרגעים היפים שלכם — לתמיד',
        coverTextPosition: 'bc',
        coverTextBg: 'rgba(0,0,0,0.28)',
        coverTextColor: '#ffffff',
    }), [styleSettings])

    const sampleWedding = { eventType: 'birthday', customTitle: 'ספר הברכות', locale: 'he' }

    // pages = the cover + sample blessings + anything the visitor adds.
    const [extra, setExtra] = useState([])
    const pages = useMemo(() => [...SAMPLE, ...extra], [extra])

    // Responsive square canvas for the flipbook.
    const wrapRef = useRef(null)
    const [size, setSize] = useState(320)
    useEffect(() => {
        const measure = () => {
            const w = wrapRef.current?.clientWidth || 340
            setSize(Math.max(240, Math.min(380, Math.floor(w))))
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

    // ── "Write a blessing" mini-demo ──
    const [form, setForm] = useState({ name: '', text: '' })
    const [photo, setPhoto] = useState(null) // { url }
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
        const entry = {
            id: `u${Date.now()}`,
            name: form.name.trim() || 'אורח/ת',
            text,
            imageUrl: photo?.url || null,
        }
        const nextIndex = pages.length + 1 // +1 for the cover page at index 0
        setExtra(prev => [...prev, entry])
        setForm({ name: '', text: '' })
        setPhoto(null)
        setAdded(true)
        setTimeout(() => setAdded(false), 3000)
        // Flip to the freshly added page so they SEE it land in the book.
        setTimeout(() => {
            try { flipRef.current?.pageFlip?.()?.flip(nextIndex) } catch { /* ignore */ }
        }, 250)
    }

    const card = { background: '#fffdf8', border: '1px solid #ead9b3', borderRadius: 18, boxShadow: '0 10px 30px -18px rgba(120,96,60,0.30)' }

    return (
        <div dir='rtl' style={{ minHeight: '100vh', background: 'radial-gradient(130% 90% at 50% 0%, #fbf7ef 0%, #f3ead8 60%, #efe3cc 100%)', fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', color: '#3d2e1a' }}>
            <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 18px 56px' }}>

                {/* ── Hero ── */}
                <div style={{ textAlign: 'center', marginBottom: 26 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src='/logo-wt.png' alt='Wedding Tales' style={{ height: 40, margin: '0 auto 16px', opacity: 0.9 }} />
                    <h1 style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.25, color: '#1a1410', margin: 0 }}>
                        ספר הברכות של האירוע שלכם 💛
                    </h1>
                    <p style={{ fontSize: 15.5, color: '#6b5836', lineHeight: 1.7, marginTop: 12 }}>
                        האורחים סורקים QR, כותבים ברכה ומעלים תמונה — והכל הופך ל<b>ספר מודפס ודיגיטלי</b> מרגש שנשאר לכם לכל החיים.
                    </p>
                    <p style={{ fontSize: 13, color: '#9a8763', marginTop: 8 }}>גללו למטה — אפשר לדפדף בספר לדוגמה, ואפילו להוסיף ברכה משלכם 👇</p>
                </div>

                {/* ── 3 steps ── */}
                <div style={{ ...card, padding: 18, marginBottom: 22 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#9a8763', letterSpacing: 1, marginBottom: 14 }}>איך זה עובד · 3 צעדים</div>
                    {[
                        { icon: QrCode, t: 'סורקים QR', d: 'כל אורח סורק קוד (על שולחן / שלט) — נפתח עמוד אישי, בלי אפליקציה.' },
                        { icon: PenLine, t: 'כותבים ומעלים', d: 'כותבים ברכה מכל הלב ומוסיפים תמונה. יש גם עוזר כתיבה חכם.' },
                        { icon: BookHeart, t: 'מקבלים ספר', d: 'כל הברכות והתמונות מתאחדות לספר מעוצב — מודפס ודיגיטלי לדפדוף.' },
                    ].map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? '1px solid #f2e9d6' : 'none' }}>
                            <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(180deg,#d3b46a,#b8893d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <s.icon size={20} color='#fff' />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1410' }}>{i + 1}. {s.t}</div>
                                <div style={{ fontSize: 13, color: '#6b5836', lineHeight: 1.6, marginTop: 2 }}>{s.d}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Flip the sample book ── */}
                <div style={{ ...card, padding: 18, marginBottom: 22 }}>
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1410' }}>דפדפו בספר לדוגמה</div>
                        <div style={{ fontSize: 12.5, color: '#9a8763', marginTop: 3 }}>החליקו או השתמשו בחיצים — בדיוק כמו הספר הדיגיטלי שתקבלו</div>
                    </div>
                    <div ref={wrapRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <div style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 50px -22px rgba(120,96,60,0.5), 0 0 0 1px rgba(212,184,103,0.25)' }}>
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
                                className='demo-flip'
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
                </div>

                {/* ── Try it: write a blessing ── */}
                <div style={{ ...card, padding: 18, marginBottom: 22 }}>
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1410' }}>נסו בעצמכם — הוסיפו ברכה</div>
                        <div style={{ fontSize: 12.5, color: '#9a8763', marginTop: 3 }}>כתבו, הוסיפו תמונה, ותראו אותה נכנסת לספר למעלה ✨ (הדגמה — לא נשמר)</div>
                    </div>

                    <input
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder='השם שלכם'
                        maxLength={40}
                        style={field}
                    />
                    <textarea
                        value={form.text}
                        onChange={e => setForm(f => ({ ...f, text: e.target.value.slice(0, 300) }))}
                        placeholder='כתבו ברכה מכל הלב…'
                        rows={3}
                        style={{ ...field, resize: 'vertical', lineHeight: 1.6, marginTop: 10 }}
                    />

                    <input ref={fileRef} type='file' accept='image/*' onChange={onPickPhoto} style={{ display: 'none' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                        <button onClick={() => fileRef.current?.click()} style={{ ...ghostBtn, flexShrink: 0 }}>
                            <Camera size={16} /> {photo ? 'החלפת תמונה' : 'הוספת תמונה'}
                        </button>
                        {photo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photo.url} alt='' style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', border: '1px solid #ead9b3' }} />
                        )}
                    </div>

                    <button onClick={addBlessing} style={primaryBtn}>
                        {added ? <><Check size={17} /> נוספה לספר! דפדפו למעלה</> : <><Sparkles size={17} /> הוסיפו לספר</>}
                    </button>
                </div>

                {/* ── Why it's special ── */}
                <div style={{ ...card, padding: 18, marginBottom: 22 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#9a8763', letterSpacing: 1, marginBottom: 12 }}>למה דווקא ספר ברכות כזה</div>
                    {[
                        { icon: Printer, t: 'מודפס ודיגיטלי', d: 'ספר קשיח ומודפס באיכות גבוהה — וגם גרסה דיגיטלית לדפדוף ולשיתוף.' },
                        { icon: Globe, t: 'בכל שפה', d: 'עברית, אנגלית ועוד — כל אורח כותב בשפה שלו והספר מסתדר יפה.' },
                        { icon: Smartphone, t: 'בלי אפליקציה', d: 'סריקה אחת ומתחילים. נוח, מהיר וברור לכל הגילאים.' },
                        { icon: Sparkles, t: 'עוזר כתיבה חכם', d: 'אורחים שתקועים מקבלים עזרה לכתוב ברכה אישית ומרגשת.' },
                    ].map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 0', borderTop: i ? '1px solid #f2e9d6' : 'none' }}>
                            <s.icon size={19} color='#b8893d' style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1a1410' }}>{s.t}</div>
                                <div style={{ fontSize: 13, color: '#6b5836', lineHeight: 1.6 }}>{s.d}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── CTA ── */}
                <div style={{ textAlign: 'center' }}>
                    <a
                        href={WHATSAPP}
                        target='_blank'
                        rel='noopener noreferrer'
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            width: '100%', padding: '15px 18px', borderRadius: 16, textDecoration: 'none',
                            color: '#fff', fontSize: 16, fontWeight: 800,
                            background: 'linear-gradient(180deg,#25D366,#128C7E)',
                            boxShadow: '0 16px 34px -12px rgba(18,140,126,0.5)',
                        }}
                    >
                        <svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24.044 12.045.044 5.463.044.105 5.402.103 11.985c0 2.096.547 4.142 1.588 5.945L0 24l6.304-1.654a11.9 11.9 0 0 0 5.71 1.453h.005c6.582 0 11.94-5.358 11.942-11.94 0-3.193-1.24-6.19-3.44-8.418' /></svg>
                        דברו איתנו בוואטסאפ — נשמח להכין לכם ספר
                    </a>
                    <p style={{ fontSize: 12, color: '#9a8763', marginTop: 12 }}>Wedding Tales · ספר הברכות של כל אירוע</p>
                </div>
            </div>

            <style jsx global>{`
                .demo-flip { margin: 0 auto; }
            `}</style>
        </div>
    )
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
    border: '1px solid #ddcfb0', fontWeight: 600, fontSize: 13.5, borderRadius: 11, padding: '10px 16px', cursor: 'pointer',
}
const primaryBtn = {
    marginTop: 14, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'linear-gradient(180deg,#d3b46a,#b8893d)', color: '#fff', fontWeight: 800, fontSize: 16,
    borderRadius: 13, padding: '13px 0', border: 'none', cursor: 'pointer',
}
