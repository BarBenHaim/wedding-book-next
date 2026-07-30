'use client'

// /app — the App Store acquisition funnel. One job: get an event owner
// to tap "הורידו מ־App Store".
//
//   • Cream/ivory stage that matches the app's own palette, so the real
//     screenshots read as part of the page instead of pasted onto it.
//   • Hero = headline + free-first-event badge + store button + a CSS
//     iPhone cross-fading through all five real App Store screenshots.
//   • Proof stack: how-it-works → app-in-action gallery → real printed
//     books → testimonials → FAQ → full-bleed navy closing CTA.
//   • Store links are config-driven (STORE_LINKS). Empty ⇒ the badge
//     renders as "בקרוב" instead of a dead link. ONE place to flip.
//   • Sticky store button (top bar ≥760px, bottom bar on mobile) rides
//     in after 300px so download intent is always one tap away.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

// ─── FLIP THESE WHEN THE STORES APPROVE ──────────────────────────────
// iOS is submitted and "Waiting for Review"; this is the reserved
// listing URL. Android hasn't been submitted — leave it empty and the
// Play badge stays hidden.
const STORE_LINKS = {
    ios: 'https://apps.apple.com/il/app/wedding-tales/id6791143243',
    android: '',
}
// ─────────────────────────────────────────────────────────────────────

const START = '/start'

// The five screenshots that are live on the App Store listing, resized
// to web (-sm = 440w for the phone mock, -lg = 760w for the gallery).
const SHOTS = [
    {
        id: '01_book',
        title: 'כריכה שמכילה את הזיכרון שלכם',
        body: 'תמונה אחת, השם שלכם באותיות זהב, ועיצוב שמתחלף בלחיצה. הכריכה נבנית תוך שניות — ואפשר להחליף סגנון מתי שרוצים.',
        chip: 'הכריכה',
    },
    {
        id: '02_home',
        title: 'כל הברכות במקום אחד',
        body: 'מסך הבית מראה לכם את הספר החי: כמה ברכות נכתבו, כמה תמונות עלו, ומה כדאי לעשות עכשיו. הכול בעברית, הכול ברור.',
        chip: 'מסך הבית',
    },
    {
        id: '03_blessing',
        title: 'ברכות מרגשות מהאורחים',
        body: 'כל ברכה נכנסת עם התמונה שצורפה אליה ומקבלת עמוד מעוצב משלה. אתם פשוט מדפדפים — ומתרגשים מחדש.',
        chip: 'עמוד ברכה',
    },
    {
        id: '04_create',
        title: 'יצירת ספר תוך דקות',
        body: 'בוחרים סוג אירוע — חתונה, בר/בת מצווה, יום הולדת — ואשף קצר בונה לכם את הספר. אירוע ראשון בחינם, בלי כרטיס אשראי.',
        chip: 'הקמת ספר',
    },
    {
        id: '05_manage',
        title: 'שליטה מלאה על הספר שלכם',
        body: 'רואים כל ברכה שנכנסה, מחפשים לפי שם, עורכים טעויות כתיב ומסדרים את הסדר. הספר הוא שלכם — עד הפרט האחרון.',
        chip: 'ניהול ברכות',
    },
]

const BOOKS = [
    { src: '/imgs/portfolio/wedding/cover.webp', label: 'שקד & דור · חתונה' },
    { src: '/imgs/portfolio/bar-mitzvah/cover.webp', label: 'נועם · בר מצווה' },
    { src: '/imgs/portfolio/birthday/cover.webp', label: 'ג׳רי · יום הולדת 90' },
]

// TODO: swap the two placeholder quotes for real reviews once the App
// Store listing starts collecting them. The first one is real (שקד).
const QUOTES = [
    {
        text: 'לא תיארנו לעצמנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לחתונה שוב.',
        by: 'שקד',
        role: 'התחתנה במרץ 2026',
    },
    {
        text: 'הקמתי את הספר בזמן שחיכיתי בתור. שלחתי קישור אחד לקבוצה — ותוך שעה היו לי ארבעים ברכות.',
        by: 'אורי',
        role: 'בר מצווה לנועם',
    },
    {
        text: 'סבתא בת 87 הצליחה לכתוב ברכה לבד מהטלפון. זה אומר הכול על כמה שזה פשוט.',
        by: 'מיכל',
        role: 'יום הולדת 90 לג׳רי',
    },
]

const FAQ = [
    {
        q: 'איך "אירוע ראשון בחינם" עובד?',
        a: 'פותחים ספר, מזמינים אורחים ומקבלים את הגרסה הדיגיטלית ללא עלות — בלי כרטיס אשראי ובלי תקופת ניסיון שנגמרת. הדפסה של ספר פיזי היא שירות נפרד בתשלום, רק אם תרצו.',
    },
    { q: 'כמה זמן לוקח להקים ספר?', a: 'פחות מדקה. בוחרים סוג אירוע, ממלאים שם ותאריך — והקישור לאורחים מוכן לשליחה.' },
    {
        q: 'מה קורה עם התמונות של האורחים?',
        a: 'הכול נשמר מאובטח ופרטי ב-Firebase. רק אתם והאורחים שקיבלו את הקישור רואים את הספר — אנחנו לא משתפים ולא מוכרים כלום.',
    },
    {
        q: 'האורחים צריכים להוריד את האפליקציה?',
        a: 'לא. האורחים פותחים קישור בדפדפן, כותבים ומצרפים תמונה — בלי הורדה ובלי הרשמה. האפליקציה היא בשבילכם, בעלי האירוע.',
    },
    {
        q: 'האם צריך אינטרנט?',
        a: 'כן. אם החיבור נופל לרגע, ההעלאות ממתינות בתור וממשיכות מעצמן ברגע שהוא חוזר — שום ברכה לא הולכת לאיבוד.',
    },
    { q: 'לאילו סוגי אירועים זה מתאים?', a: 'חתונה · בר מצווה · בת מצווה · יום הולדת · חינה · ברית — וכל אירוע שבא לכם לזכור.' },
]

/* ── Apple / Google marks ─────────────────────────────────────────── */

function AppleMark(props) {
    return (
        <svg viewBox='0 0 384 512' aria-hidden='true' {...props}>
            <path
                fill='currentColor'
                d='M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z'
            />
        </svg>
    )
}

/** The one button this whole page exists to get tapped. */
function StoreButton({ size = 'md', tone = 'dark', label = 'הורידו מ־' }) {
    const live = !!STORE_LINKS.ios
    const cls = `wtStore ${size} ${tone} ${live ? '' : 'soon'}`
    const inner = (
        <>
            <AppleMark className='wtStoreIcon' />
            <span className='wtStoreTxt'>
                <b>{live ? label : 'בקרוב ב־'}</b>
                <strong>App Store</strong>
            </span>
        </>
    )
    if (!live) return <span className={cls}>{inner}</span>
    return (
        <a className={cls} href={STORE_LINKS.ios} target='_blank' rel='noopener noreferrer'>
            {inner}
        </a>
    )
}

/* ── CSS iPhone ───────────────────────────────────────────────────── */

/**
 * Titanium-bezel iPhone. `children` render inside the screen so the
 * hero can stack a cross-fading carousel while the gallery drops in a
 * single still.
 */
function Phone({ children, className = '', float = false }) {
    return (
        <div className={`wtPhone ${float ? 'float' : ''} ${className}`}>
            <div className='wtPhoneBody'>
                <div className='wtPhoneScreen'>{children}</div>
                <span className='wtIsland' aria-hidden='true' />
            </div>
        </div>
    )
}

/* ── How-it-works illustrations ───────────────────────────────────── */

function IllChoose() {
    return (
        <svg viewBox='0 0 96 72' className='wtIll' aria-hidden='true'>
            <rect x='4' y='6' width='40' height='28' rx='9' fill='#fff' stroke='#e0cda1' strokeWidth='1.5' />
            <rect x='52' y='6' width='40' height='28' rx='9' fill='#b8893d' opacity='.14' stroke='#b8893d' strokeWidth='1.5' />
            <rect x='4' y='40' width='40' height='28' rx='9' fill='#fff' stroke='#e0cda1' strokeWidth='1.5' />
            <rect x='52' y='40' width='40' height='28' rx='9' fill='#fff' stroke='#e0cda1' strokeWidth='1.5' />
            {/* rings */}
            <circle cx='68' cy='19' r='6' fill='none' stroke='#b8893d' strokeWidth='2' />
            <circle cx='76' cy='19' r='6' fill='none' stroke='#8a6a2c' strokeWidth='2' />
            {/* cake */}
            <path d='M14 26h20v-8a4 4 0 0 0-4-4H18a4 4 0 0 0-4 4z' fill='none' stroke='#c9a44e' strokeWidth='1.8' />
            <path d='M24 14v-4' stroke='#c9a44e' strokeWidth='1.8' strokeLinecap='round' />
            {/* scroll */}
            <rect x='16' y='48' width='16' height='14' rx='2' fill='none' stroke='#c9a44e' strokeWidth='1.8' />
            <path d='M12 48v14M36 48v14' stroke='#c9a44e' strokeWidth='2.4' strokeLinecap='round' />
            {/* crown */}
            <path d='M62 60l2-14 4 6 4-8 4 8 4-6 2 14z' fill='none' stroke='#c9a44e' strokeWidth='1.8' strokeLinejoin='round' />
        </svg>
    )
}

function IllShare() {
    return (
        <svg viewBox='0 0 96 72' className='wtIll' aria-hidden='true'>
            <path
                d='M10 12h56a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H30l-14 10V50h-6a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8z'
                fill='#25d366'
                opacity='.13'
                stroke='#25d366'
                strokeWidth='1.6'
            />
            <rect x='18' y='23' width='40' height='6' rx='3' fill='#25d366' opacity='.45' />
            <rect x='30' y='34' width='28' height='6' rx='3' fill='#25d366' opacity='.28' />
            <rect x='62' y='40' width='30' height='30' rx='7' fill='#fff' stroke='#b8893d' strokeWidth='1.6' />
            <rect x='68' y='46' width='7' height='7' rx='1.6' fill='#b8893d' />
            <rect x='79' y='46' width='7' height='7' rx='1.6' fill='#b8893d' opacity='.5' />
            <rect x='68' y='57' width='7' height='7' rx='1.6' fill='#b8893d' opacity='.5' />
            <rect x='79' y='57' width='7' height='7' rx='1.6' fill='#b8893d' />
        </svg>
    )
}

function IllBook() {
    return (
        <svg viewBox='0 0 96 72' className='wtIll' aria-hidden='true'>
            <path d='M20 8h50a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H20z' fill='#fff' stroke='#e0cda1' strokeWidth='1.6' />
            <path d='M20 8h-4a6 6 0 0 0-6 6v46a6 6 0 0 0 6 6h4z' fill='#b8893d' opacity='.85' />
            <path d='M14 20h2M14 28h2M14 36h2' stroke='#f6e6c2' strokeWidth='1.6' strokeLinecap='round' />
            <rect x='30' y='18' width='36' height='22' rx='3' fill='#f6ecd8' stroke='#e0cda1' strokeWidth='1.2' />
            <circle cx='41' cy='27' r='4' fill='#e6c887' />
            <path d='M31 39l9-8 7 6 6-5 13 7v1H31z' fill='#dcc79a' />
            <path d='M30 48h36M30 55h24' stroke='#d9c69c' strokeWidth='2' strokeLinecap='round' />
            <path d='M80 12l1.6 4.4L86 18l-4.4 1.6L80 24l-1.6-4.4L74 18l4.4-1.6z' fill='#e6c887' />
        </svg>
    )
}

const STEPS = [
    {
        n: '1',
        t: 'בוחרים אירוע ומקימים ספר',
        p: 'חתונה, בר/בת מצווה, יום הולדת. בוחרים עיצוב — והספר הדיגיטלי שלכם באוויר. חינם.',
        Ill: IllChoose,
    },
    {
        n: '2',
        t: 'שולחים קישור לאורחים',
        p: 'קישור אחד בוואטסאפ או QR על השולחן. האורחים כותבים ומצרפים תמונה — בלי אפליקציה ובלי הרשמה.',
        Ill: IllShare,
    },
    {
        n: '3',
        t: 'מקבלים ספר מעוצב',
        p: 'כל ברכה נכנסת אליכם בזמן אמת ומקבלת עמוד. מדפדפים בטלפון — ואם תרצו, מדפיסים בכריכה קשה.',
        Ill: IllBook,
    },
]

/* ── Page ─────────────────────────────────────────────────────────── */

export default function AppLanding() {
    const [shot, setShot] = useState(0)
    const [stuck, setStuck] = useState(false)
    const pausedRef = useRef(false)
    const year = useMemo(() => new Date().getFullYear(), [])

    // Scroll-reveal for every [data-rv] block.
    useEffect(() => {
        const els = Array.from(document.querySelectorAll('.wtapp [data-rv]'))
        if (typeof IntersectionObserver === 'undefined') {
            els.forEach(el => el.classList.add('rvIn'))
            return
        }
        const io = new IntersectionObserver(
            entries =>
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        e.target.classList.add('rvIn')
                        io.unobserve(e.target)
                    }
                }),
            { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
        )
        els.forEach(el => io.observe(el))
        return () => io.disconnect()
    }, [])

    // Sticky store CTA after the fold.
    useEffect(() => {
        const onScroll = () => setStuck(window.scrollY > 300)
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    // Hero carousel — auto-advance unless the visitor is interacting or
    // has asked for reduced motion.
    useEffect(() => {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (reduced) return
        const t = setInterval(() => {
            if (!pausedRef.current && !document.hidden) setShot(v => (v + 1) % SHOTS.length)
        }, 3600)
        return () => clearInterval(t)
    }, [])

    const pause = useCallback(() => {
        pausedRef.current = true
    }, [])
    const resume = useCallback(() => {
        pausedRef.current = false
    }, [])

    const active = SHOTS[shot]

    return (
        <div className='wtapp' dir='rtl'>
            {/* ═══ STICKY TOP BAR (desktop) ═══ */}
            <div className={`wtTopBar ${stuck ? 'on' : ''}`}>
                <div className='wtTopIn'>
                    <img src='/logo-wt.png' alt='Wedding Tales' />
                    <span className='wtTopFree'>🎁 אירוע ראשון חינם</span>
                    <StoreButton size='sm' tone='dark' label='הורידו מ־' />
                </div>
            </div>

            {/* ═══ HERO ═══ */}
            <header className='wtHero'>
                <span className='wtGlowA' aria-hidden='true' />
                <span className='wtGlowB' aria-hidden='true' />
                <span className='wtSpark s1' aria-hidden='true' />
                <span className='wtSpark s2' aria-hidden='true' />
                <span className='wtSpark s3' aria-hidden='true' />
                <span className='wtSpark s4' aria-hidden='true' />
                <span className='wtSpark s5' aria-hidden='true' />

                <div className='wtHeroGrid'>
                    <div className='wtHeroCopy'>
                        <img src='/logo-wt.png' alt='Wedding Tales' className='wtLogo' />

                        <span className='wtFreePill'>
                            <i>🎁</i> אירוע ראשון — <b>חינם</b>
                        </span>

                        <h1 className='wtH1'>
                            כל ברכה. כל תמונה.
                            <br />
                            <em>כל רגע — בספר אחד.</em>
                        </h1>

                        <p className='wtSub'>
                            האורחים סורקים, כותבים מהלב ומצרפים תמונה — ואתם רואים את הספר מתמלא בזמן
                            אמת, ישר מהטלפון. בסוף הערב יש לכם ספר מעוצב שנשאר לכל החיים.
                        </p>

                        <div className='wtHeroCta'>
                            <StoreButton size='lg' tone='dark' />
                            <Link href={START} className='wtGhost'>
                                או פתחו ספר מהדפדפן ←
                            </Link>
                        </div>

                        <ul className='wtMicro'>
                            <li>בלי כרטיס אשראי</li>
                            <li>מוכן תוך דקה</li>
                            <li>עברית מלאה</li>
                        </ul>
                    </div>

                    <div
                        className='wtHeroPhone'
                        onMouseEnter={pause}
                        onMouseLeave={resume}
                        onTouchStart={pause}
                        onTouchEnd={resume}
                    >
                        <Phone float>
                            {SHOTS.map((s, i) => (
                                <img
                                    key={s.id}
                                    src={`/app-screenshots/${s.id}-sm.webp`}
                                    alt={s.title}
                                    className={`wtSlide ${i === shot ? 'on' : ''}`}
                                    loading={i === 0 ? 'eager' : 'lazy'}
                                    fetchPriority={i === 0 ? 'high' : 'low'}
                                />
                            ))}
                        </Phone>

                        {/* live-blessing toast, desktop flourish */}
                        <div className='wtToast' aria-hidden='true'>
                            <span className='wtToastDot' />
                            <span>
                                <b>ברכה חדשה</b>
                                <i>אופיר לוי צירף תמונה 💛</i>
                            </span>
                        </div>

                        <div className='wtDots' role='tablist' aria-label='מסכי האפליקציה'>
                            {SHOTS.map((s, i) => (
                                <button
                                    key={s.id}
                                    type='button'
                                    role='tab'
                                    aria-selected={i === shot}
                                    aria-label={s.chip}
                                    className={i === shot ? 'on' : ''}
                                    onClick={() => setShot(i)}
                                />
                            ))}
                        </div>
                        <span className='wtShotChip' key={active.id}>
                            {active.chip}
                        </span>
                    </div>
                </div>

                <div className='wtProof'>
                    <span>
                        <b>+60</b> אירועים
                    </span>
                    <i />
                    <span>
                        <b>אלפי</b> ברכות ותמונות
                    </span>
                    <i />
                    <span>
                        <b>דקה</b> ואתם באוויר
                    </span>
                </div>
            </header>

            {/* ═══ HOW ═══ */}
            <section className='wtSection wtHow'>
                <h2 className='wtH2' data-rv>
                    שלושה צעדים. זה הכול.
                </h2>
                <p className='wtH2sub' data-rv>
                    מהרגע שהורדתם את האפליקציה ועד הברכה הראשונה — פחות מדקה
                </p>
                <div className='wtSteps'>
                    {STEPS.map(({ n, t, p, Ill }, i) => (
                        <article className='wtStep' key={n} data-rv style={{ transitionDelay: `${i * 90}ms` }}>
                            <Ill />
                            <span className='wtStepNum'>{n}</span>
                            <h3>{t}</h3>
                            <p>{p}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* ═══ APP IN ACTION ═══ */}
            <section className='wtSection wtGallery'>
                <h2 className='wtH2' data-rv>
                    ככה זה נראה מבפנים
                </h2>
                <p className='wtH2sub' data-rv>
                    צילומי מסך אמיתיים מהאפליקציה — לא הדמיות
                </p>

                {SHOTS.map((s, i) => (
                    <div className={`wtRow ${i % 2 ? 'alt' : ''}`} key={s.id} data-rv>
                        <div className='wtRowPhone'>
                            <Phone>
                                <img src={`/app-screenshots/${s.id}-lg.webp`} alt={s.title} loading='lazy' />
                            </Phone>
                        </div>
                        <div className='wtRowTxt'>
                            <span className='wtRowChip'>{s.chip}</span>
                            <h3>{s.title}</h3>
                            <p>{s.body}</p>
                        </div>
                    </div>
                ))}
            </section>

            {/* ═══ REAL BOOKS ═══ */}
            <section className='wtSection wtBooks' data-rv>
                <h2 className='wtH2'>ספרים אמיתיים שנוצרו עם Wedding Tales</h2>
                <p className='wtH2sub'>לקוחות אמיתיים. ברכות אמיתיות. ספרים שיושבים היום בסלון.</p>
                <div className='wtBookRow'>
                    {BOOKS.map((b, i) => (
                        <figure key={b.src} style={{ transitionDelay: `${i * 90}ms` }}>
                            <img src={b.src} alt={b.label} loading='lazy' />
                            <figcaption>{b.label}</figcaption>
                        </figure>
                    ))}
                </div>
            </section>

            {/* ═══ QUOTES ═══ */}
            <section className='wtSection wtQuotes'>
                <h2 className='wtH2' data-rv>
                    מה אומרים אחרי האירוע
                </h2>
                <div className='wtQuoteRow'>
                    {QUOTES.map((q, i) => (
                        <blockquote key={q.by} data-rv style={{ transitionDelay: `${i * 90}ms` }}>
                            <span className='wtStars'>★★★★★</span>
                            <p>{q.text}</p>
                            <footer>
                                <b>{q.by}</b>
                                <span>{q.role}</span>
                            </footer>
                        </blockquote>
                    ))}
                </div>
            </section>

            {/* ═══ FAQ ═══ */}
            <section className='wtSection wtFaq'>
                <h2 className='wtH2' data-rv>
                    שאלות שנשאלנו
                </h2>
                <div className='wtFaqList'>
                    {FAQ.map(f => (
                        <details key={f.q} data-rv>
                            <summary>{f.q}</summary>
                            <p>{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ═══ FINAL CTA ═══ */}
            <section className='wtFinal'>
                <span className='wtFinalGlow' aria-hidden='true' />
                <div className='wtFinalIn' data-rv>
                    <span className='wtFinalPill'>🎁 מבצע השקה</span>
                    <h2>
                        אירוע ראשון — <em>חינם.</em>
                        <br />
                        תורידו את האפליקציה עכשיו.
                    </h2>
                    <p>הערב יעבור. הברכות יישארו.</p>
                    <StoreButton size='lg' tone='light' />
                    <Link href={START} className='wtFinalGhost'>
                        או פתחו את הספר בדפדפן ←
                    </Link>
                </div>
            </section>

            <footer className='wtFoot'>
                <span>© {year} Wedding Tales</span>
                <span className='dot'>·</span>
                <Link href='/privacy'>פרטיות</Link>
                <span className='dot'>·</span>
                <Link href='/terms'>תנאים</Link>
                <span className='dot'>·</span>
                <Link href='/landing'>הספר המודפס</Link>
            </footer>

            {/* ═══ STICKY BOTTOM (mobile) ═══ */}
            <div className={`wtBottomBar ${stuck ? 'on' : ''}`}>
                <span className='wtBottomTxt'>
                    🎁 אירוע ראשון
                    <b>חינם</b>
                </span>
                <StoreButton size='sm' tone='dark' label='הורידו מ־' />
            </div>

            <style jsx global>{`
                .wtapp {
                    --cream: #faf5eb;
                    --paper: #fffdf8;
                    --ink: #1a1410;
                    --muted: #6f5d46;
                    --gold: #b8893d;
                    --gold-lt: #e6c887;
                    --gold-dp: #8a6a2c;
                    --navy: #151a2b;
                    --line: rgba(184, 137, 61, 0.22);

                    min-height: 100dvh;
                    color: var(--ink);
                    background: linear-gradient(180deg, #fffdf8 0%, var(--cream) 22%, #f7f0e1 100%);
                    font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif;
                    overflow-x: hidden;
                    -webkit-font-smoothing: antialiased;
                }
                .wtapp * {
                    box-sizing: border-box;
                }

                /* ── reveal ── */
                .wtapp [data-rv] {
                    opacity: 0;
                    transform: translateY(24px);
                    transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .wtapp [data-rv].rvIn {
                    opacity: 1;
                    transform: none;
                }
                @media (prefers-reduced-motion: reduce) {
                    .wtapp [data-rv] {
                        opacity: 1;
                        transform: none;
                        transition: none;
                    }
                }

                /* ── store button ── */
                .wtapp .wtStore {
                    display: inline-flex;
                    align-items: center;
                    gap: 11px;
                    border-radius: 15px;
                    padding: 12px 22px;
                    text-decoration: none;
                    background: #101010;
                    color: #fff;
                    border: 1px solid #101010;
                    box-shadow: 0 18px 34px -16px rgba(26, 20, 16, 0.75);
                    transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
                    white-space: nowrap;
                }
                .wtapp .wtStore:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 24px 40px -16px rgba(26, 20, 16, 0.6);
                }
                .wtapp .wtStore:active {
                    transform: scale(0.98);
                }
                .wtapp .wtStore.light {
                    background: #fffdf8;
                    color: #101010;
                    border-color: #fffdf8;
                    box-shadow: 0 20px 44px -16px rgba(0, 0, 0, 0.6);
                }
                .wtapp .wtStore.soon {
                    opacity: 0.7;
                    cursor: default;
                    box-shadow: none;
                }
                .wtapp .wtStoreIcon {
                    width: 24px;
                    height: 24px;
                    flex: none;
                }
                .wtapp .wtStoreTxt {
                    display: flex;
                    flex-direction: column;
                    line-height: 1.1;
                    text-align: start;
                }
                .wtapp .wtStoreTxt b {
                    font-size: 10.5px;
                    font-weight: 500;
                    opacity: 0.82;
                }
                .wtapp .wtStoreTxt strong {
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: -0.01em;
                }
                .wtapp .wtStore.sm {
                    padding: 9px 16px;
                    border-radius: 12px;
                    gap: 8px;
                }
                .wtapp .wtStore.sm .wtStoreIcon {
                    width: 19px;
                    height: 19px;
                }
                .wtapp .wtStore.sm .wtStoreTxt b {
                    font-size: 9px;
                }
                .wtapp .wtStore.sm .wtStoreTxt strong {
                    font-size: 13.5px;
                }
                .wtapp .wtStore.lg {
                    padding: 15px 30px;
                    border-radius: 17px;
                }
                .wtapp .wtStore.lg .wtStoreIcon {
                    width: 28px;
                    height: 28px;
                }
                .wtapp .wtStore.lg .wtStoreTxt strong {
                    font-size: 19px;
                }

                /* ── sticky bars ── */
                .wtapp .wtTopBar {
                    position: fixed;
                    inset-inline: 0;
                    top: 0;
                    z-index: 60;
                    background: rgba(255, 253, 248, 0.86);
                    backdrop-filter: blur(14px);
                    border-bottom: 1px solid var(--line);
                    transform: translateY(-110%);
                    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .wtapp .wtTopBar.on {
                    transform: none;
                }
                .wtapp .wtTopIn {
                    max-width: 1120px;
                    margin: 0 auto;
                    padding: 9px 20px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }
                .wtapp .wtTopIn img {
                    height: 32px;
                    width: auto;
                }
                .wtapp .wtTopFree {
                    margin-inline-end: auto;
                    font-size: 13.5px;
                    font-weight: 700;
                    color: var(--gold-dp);
                }
                @media (max-width: 759px) {
                    .wtapp .wtTopBar {
                        display: none;
                    }
                }

                .wtapp .wtBottomBar {
                    position: fixed;
                    inset-inline: 0;
                    bottom: 0;
                    z-index: 60;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
                    background: rgba(255, 253, 248, 0.94);
                    backdrop-filter: blur(14px);
                    border-top: 1px solid var(--line);
                    transform: translateY(120%);
                    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .wtapp .wtBottomBar.on {
                    transform: none;
                }
                .wtapp .wtBottomTxt {
                    display: flex;
                    flex-direction: column;
                    font-size: 12px;
                    color: var(--muted);
                    line-height: 1.25;
                }
                .wtapp .wtBottomTxt b {
                    font-size: 15px;
                    color: var(--gold-dp);
                }
                @media (min-width: 760px) {
                    .wtapp .wtBottomBar {
                        display: none;
                    }
                }

                /* ── hero ── */
                .wtapp .wtHero {
                    position: relative;
                    padding: 30px 20px 34px;
                    overflow: hidden;
                }
                .wtapp .wtGlowA,
                .wtapp .wtGlowB {
                    position: absolute;
                    border-radius: 50%;
                    filter: blur(80px);
                    pointer-events: none;
                }
                .wtapp .wtGlowA {
                    width: 560px;
                    height: 560px;
                    background: rgba(230, 200, 135, 0.55);
                    top: -220px;
                    inset-inline-end: -160px;
                }
                .wtapp .wtGlowB {
                    width: 460px;
                    height: 460px;
                    background: rgba(226, 178, 205, 0.32);
                    top: 26%;
                    inset-inline-start: -180px;
                }
                .wtapp .wtSpark {
                    position: absolute;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--gold-lt);
                    opacity: 0.55;
                    animation: wtTwinkle 5s ease-in-out infinite;
                    pointer-events: none;
                }
                .wtapp .wtSpark.s1 {
                    top: 14%;
                    inset-inline-start: 9%;
                }
                .wtapp .wtSpark.s2 {
                    top: 26%;
                    inset-inline-end: 12%;
                    animation-delay: 1.1s;
                }
                .wtapp .wtSpark.s3 {
                    top: 58%;
                    inset-inline-start: 5%;
                    animation-delay: 2.2s;
                }
                .wtapp .wtSpark.s4 {
                    top: 72%;
                    inset-inline-end: 7%;
                    animation-delay: 3.1s;
                }
                .wtapp .wtSpark.s5 {
                    top: 40%;
                    inset-inline-start: 46%;
                    animation-delay: 1.7s;
                }
                @keyframes wtTwinkle {
                    0%,
                    100% {
                        opacity: 0.15;
                        transform: scale(0.7);
                    }
                    50% {
                        opacity: 0.75;
                        transform: scale(1.4);
                    }
                }

                .wtapp .wtHeroGrid {
                    position: relative;
                    z-index: 1;
                    max-width: 1120px;
                    margin: 0 auto;
                    display: grid;
                    gap: 18px;
                    text-align: center;
                    justify-items: center;
                }
                .wtapp .wtLogo {
                    height: 52px;
                    width: auto;
                    margin-bottom: 4px;
                }
                .wtapp .wtFreePill {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    border-radius: 999px;
                    padding: 8px 18px;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--gold-dp);
                    background: linear-gradient(180deg, rgba(255, 253, 248, 0.95), rgba(246, 236, 216, 0.9));
                    border: 1.5px solid rgba(184, 137, 61, 0.45);
                    box-shadow: 0 10px 26px -14px rgba(138, 106, 44, 0.7);
                    animation: wtPulse 3s ease-in-out infinite;
                }
                .wtapp .wtFreePill b {
                    font-weight: 800;
                    color: var(--gold);
                }
                .wtapp .wtFreePill i {
                    font-style: normal;
                }
                @keyframes wtPulse {
                    0%,
                    100% {
                        box-shadow: 0 10px 26px -14px rgba(138, 106, 44, 0.7);
                    }
                    50% {
                        box-shadow: 0 10px 30px -8px rgba(184, 137, 61, 0.45);
                    }
                }

                .wtapp .wtH1 {
                    margin: 4px 0 0;
                    font-size: clamp(31px, 8vw, 58px);
                    font-weight: 800;
                    line-height: 1.16;
                    letter-spacing: -0.02em;
                }
                .wtapp .wtH1 em {
                    font-style: normal;
                    background: linear-gradient(94deg, #8a6a2c, #d9ad55 45%, #b8893d);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                }
                .wtapp .wtSub {
                    margin: 0;
                    max-width: 540px;
                    font-size: clamp(15px, 3.9vw, 17.5px);
                    line-height: 1.8;
                    color: var(--muted);
                }
                .wtapp .wtHeroCta {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }
                .wtapp .wtGhost {
                    font-size: 14.5px;
                    font-weight: 600;
                    color: var(--gold-dp);
                    text-decoration: none;
                    border-bottom: 1.5px solid rgba(184, 137, 61, 0.4);
                    padding-bottom: 2px;
                    transition: color 0.15s ease, border-color 0.15s ease;
                }
                .wtapp .wtGhost:hover {
                    color: var(--gold);
                    border-color: var(--gold);
                }
                .wtapp .wtMicro {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 8px 18px;
                    list-style: none;
                    margin: 2px 0 0;
                    padding: 0;
                    font-size: 12.5px;
                    color: rgba(111, 93, 70, 0.8);
                }
                .wtapp .wtMicro li::before {
                    content: '✓ ';
                    color: var(--gold);
                    font-weight: 800;
                }

                /* ── phone ── */
                .wtapp .wtPhone {
                    position: relative;
                    width: 100%;
                    max-width: 268px;
                    margin-inline: auto;
                }
                .wtapp .wtPhoneBody {
                    position: relative;
                    border-radius: 44px;
                    padding: 9px;
                    background: linear-gradient(150deg, #f0ece4 0%, #b9b2a6 18%, #6d6760 44%, #cfc9be 68%, #8b857c 100%);
                    box-shadow: 0 42px 70px -34px rgba(60, 44, 22, 0.65), 0 4px 14px -6px rgba(60, 44, 22, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.7);
                }
                .wtapp .wtPhoneScreen {
                    position: relative;
                    border-radius: 36px;
                    overflow: hidden;
                    background: #f6efe2;
                    aspect-ratio: 1290 / 2796;
                }
                .wtapp .wtPhoneScreen img {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }
                .wtapp .wtIsland {
                    position: absolute;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 29%;
                    height: 21px;
                    border-radius: 12px;
                    background: #0b0b0d;
                    z-index: 3;
                }
                .wtapp .wtPhone.float .wtPhoneBody {
                    animation: wtFloat 7s ease-in-out infinite;
                }
                @keyframes wtFloat {
                    0%,
                    100% {
                        transform: translateY(0) rotate(-1.1deg);
                    }
                    50% {
                        transform: translateY(-14px) rotate(1.1deg);
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    .wtapp .wtPhone.float .wtPhoneBody {
                        animation: none;
                    }
                    .wtapp .wtSpark,
                    .wtapp .wtFreePill {
                        animation: none;
                    }
                }

                .wtapp .wtHeroPhone {
                    position: relative;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    margin-top: 6px;
                }
                .wtapp .wtSlide {
                    opacity: 0;
                    transform: scale(1.03);
                    transition: opacity 0.8s ease, transform 1.4s ease;
                }
                .wtapp .wtSlide.on {
                    opacity: 1;
                    transform: none;
                }
                .wtapp .wtDots {
                    display: flex;
                    gap: 7px;
                    margin-top: 18px;
                }
                .wtapp .wtDots button {
                    width: 8px;
                    height: 8px;
                    padding: 0;
                    border: none;
                    border-radius: 999px;
                    background: rgba(184, 137, 61, 0.3);
                    cursor: pointer;
                    transition: width 0.3s ease, background 0.3s ease;
                }
                .wtapp .wtDots button.on {
                    width: 24px;
                    background: var(--gold);
                }
                .wtapp .wtShotChip {
                    margin-top: 10px;
                    font-size: 12.5px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                    color: var(--gold-dp);
                    background: rgba(255, 253, 248, 0.8);
                    border: 1px solid var(--line);
                    border-radius: 999px;
                    padding: 5px 14px;
                    animation: wtChipIn 0.5s ease both;
                }
                @keyframes wtChipIn {
                    from {
                        opacity: 0;
                        transform: translateY(6px);
                    }
                }
                .wtapp .wtToast {
                    display: none;
                }

                .wtapp .wtProof {
                    position: relative;
                    z-index: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 10px 16px;
                    margin: 30px auto 0;
                    font-size: 13px;
                    color: var(--muted);
                }
                .wtapp .wtProof b {
                    color: var(--gold-dp);
                    font-weight: 800;
                    font-size: 15px;
                }
                .wtapp .wtProof i {
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: rgba(184, 137, 61, 0.45);
                }

                /* ── sections ── */
                .wtapp .wtSection {
                    position: relative;
                    max-width: 1080px;
                    margin: 0 auto;
                    padding: 56px 20px 8px;
                }
                .wtapp .wtH2 {
                    margin: 0 0 6px;
                    text-align: center;
                    font-size: clamp(23px, 5.4vw, 36px);
                    font-weight: 800;
                    letter-spacing: -0.015em;
                }
                .wtapp .wtH2sub {
                    margin: 0 auto 30px;
                    text-align: center;
                    font-size: 14.5px;
                    color: var(--muted);
                    max-width: 520px;
                }

                /* ── how ── */
                .wtapp .wtSteps {
                    display: grid;
                    gap: 14px;
                }
                @media (min-width: 760px) {
                    .wtapp .wtSteps {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }
                .wtapp .wtStep {
                    position: relative;
                    background: linear-gradient(180deg, var(--paper), rgba(255, 253, 248, 0.6));
                    border: 1px solid var(--line);
                    border-radius: 22px;
                    padding: 22px 20px 20px;
                    text-align: start;
                    box-shadow: 0 20px 40px -32px rgba(60, 44, 22, 0.6);
                }
                .wtapp .wtStep:hover {
                    border-color: rgba(184, 137, 61, 0.5);
                }
                .wtapp .wtIll {
                    width: 96px;
                    height: 72px;
                    display: block;
                    margin-bottom: 12px;
                }
                .wtapp .wtStepNum {
                    position: absolute;
                    top: 18px;
                    inset-inline-end: 18px;
                    display: grid;
                    place-items: center;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    background: linear-gradient(180deg, #e9cd92, var(--gold));
                    color: #2b1f0d;
                    font-weight: 800;
                    font-size: 14px;
                }
                .wtapp .wtStep h3 {
                    margin: 0 0 6px;
                    font-size: 18px;
                    font-weight: 800;
                }
                .wtapp .wtStep p {
                    margin: 0;
                    font-size: 14px;
                    line-height: 1.75;
                    color: var(--muted);
                }

                /* ── gallery ── */
                .wtapp .wtRow {
                    display: grid;
                    gap: 20px;
                    align-items: center;
                    justify-items: center;
                    padding: 26px 0;
                }
                .wtapp .wtRowPhone {
                    width: 100%;
                    max-width: 250px;
                }
                .wtapp .wtRowTxt {
                    text-align: center;
                    max-width: 460px;
                }
                .wtapp .wtRowChip {
                    display: inline-block;
                    font-size: 11.5px;
                    font-weight: 800;
                    letter-spacing: 0.09em;
                    color: var(--gold-dp);
                    background: rgba(184, 137, 61, 0.1);
                    border-radius: 999px;
                    padding: 5px 13px;
                    margin-bottom: 10px;
                }
                .wtapp .wtRowTxt h3 {
                    margin: 0 0 8px;
                    font-size: clamp(20px, 5vw, 27px);
                    font-weight: 800;
                    letter-spacing: -0.015em;
                }
                .wtapp .wtRowTxt p {
                    margin: 0;
                    font-size: 15px;
                    line-height: 1.85;
                    color: var(--muted);
                }
                @media (min-width: 860px) {
                    .wtapp .wtRow {
                        grid-template-columns: 300px 1fr;
                        gap: 56px;
                        padding: 34px 0;
                    }
                    .wtapp .wtRow.alt {
                        grid-template-columns: 1fr 300px;
                    }
                    .wtapp .wtRow.alt .wtRowPhone {
                        order: 2;
                    }
                    .wtapp .wtRowPhone {
                        max-width: 300px;
                    }
                    .wtapp .wtRowTxt {
                        text-align: start;
                    }
                }

                /* ── books ── */
                .wtapp .wtBooks {
                    padding-top: 60px;
                }
                .wtapp .wtBookRow {
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 16px;
                }
                .wtapp .wtBookRow figure {
                    margin: 0;
                    text-align: center;
                    transition: transform 0.25s ease;
                }
                .wtapp .wtBookRow figure:hover {
                    transform: translateY(-6px) rotate(-1deg);
                }
                .wtapp .wtBookRow img {
                    width: clamp(140px, 27vw, 200px);
                    aspect-ratio: 1;
                    object-fit: cover;
                    border-radius: 8px;
                    border: 5px solid #fff;
                    box-shadow: 0 26px 44px -22px rgba(60, 44, 22, 0.6);
                }
                .wtapp .wtBookRow figcaption {
                    margin-top: 9px;
                    font-size: 12.5px;
                    color: var(--muted);
                }

                /* ── quotes ── */
                .wtapp .wtQuotes {
                    padding-top: 60px;
                }
                .wtapp .wtQuoteRow {
                    display: grid;
                    gap: 14px;
                }
                @media (min-width: 760px) {
                    .wtapp .wtQuoteRow {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }
                .wtapp .wtQuoteRow blockquote {
                    margin: 0;
                    background: var(--paper);
                    border: 1px solid var(--line);
                    border-radius: 20px;
                    padding: 20px;
                    box-shadow: 0 20px 40px -34px rgba(60, 44, 22, 0.7);
                }
                .wtapp .wtStars {
                    color: var(--gold);
                    font-size: 14px;
                    letter-spacing: 2px;
                }
                .wtapp .wtQuoteRow p {
                    margin: 10px 0 14px;
                    font-size: 15px;
                    line-height: 1.8;
                }
                .wtapp .wtQuoteRow footer {
                    display: flex;
                    flex-direction: column;
                    font-size: 12.5px;
                    color: var(--muted);
                }
                .wtapp .wtQuoteRow footer b {
                    font-size: 14px;
                    color: var(--ink);
                }

                /* ── faq ── */
                .wtapp .wtFaq {
                    padding-top: 60px;
                    max-width: 720px;
                }
                .wtapp .wtFaqList {
                    display: grid;
                    gap: 10px;
                }
                .wtapp .wtFaqList details {
                    background: var(--paper);
                    border: 1px solid var(--line);
                    border-radius: 16px;
                    padding: 15px 18px;
                }
                .wtapp .wtFaqList summary {
                    cursor: pointer;
                    list-style: none;
                    font-size: 15.5px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }
                .wtapp .wtFaqList summary::-webkit-details-marker {
                    display: none;
                }
                .wtapp .wtFaqList summary::after {
                    content: '+';
                    color: var(--gold);
                    font-size: 21px;
                    font-weight: 700;
                    line-height: 1;
                    flex: none;
                }
                .wtapp .wtFaqList details[open] summary::after {
                    content: '−';
                }
                .wtapp .wtFaqList p {
                    margin: 11px 0 0;
                    font-size: 14px;
                    line-height: 1.8;
                    color: var(--muted);
                }

                /* ── final ── */
                .wtapp .wtFinal {
                    position: relative;
                    margin-top: 64px;
                    padding: 62px 20px 66px;
                    background: linear-gradient(160deg, #1b2237 0%, var(--navy) 55%, #0f1320 100%);
                    overflow: hidden;
                    text-align: center;
                }
                .wtapp .wtFinalGlow {
                    position: absolute;
                    width: 620px;
                    height: 620px;
                    border-radius: 50%;
                    top: -320px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: radial-gradient(closest-side, rgba(230, 200, 135, 0.3), transparent 70%);
                    pointer-events: none;
                }
                .wtapp .wtFinalIn {
                    position: relative;
                    z-index: 1;
                    max-width: 620px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 14px;
                }
                .wtapp .wtFinalPill {
                    font-size: 12.5px;
                    font-weight: 700;
                    color: #f0dcae;
                    border: 1px solid rgba(230, 200, 135, 0.45);
                    border-radius: 999px;
                    padding: 6px 16px;
                }
                .wtapp .wtFinal h2 {
                    margin: 0;
                    color: #fdf8ec;
                    font-size: clamp(26px, 6.4vw, 42px);
                    font-weight: 800;
                    line-height: 1.28;
                    letter-spacing: -0.02em;
                }
                .wtapp .wtFinal h2 em {
                    font-style: normal;
                    background: linear-gradient(94deg, #e6c887, #fbeec6 50%, #c9a44e);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                }
                .wtapp .wtFinal p {
                    margin: 0 0 6px;
                    font-size: 15px;
                    color: rgba(253, 248, 236, 0.66);
                }
                .wtapp .wtFinalGhost {
                    font-size: 14px;
                    color: rgba(253, 248, 236, 0.75);
                    text-decoration: none;
                    border-bottom: 1px solid rgba(253, 248, 236, 0.35);
                    padding-bottom: 2px;
                }
                .wtapp .wtFinalGhost:hover {
                    color: #f0dcae;
                    border-color: #f0dcae;
                }

                .wtapp .wtFoot {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 22px 16px 110px;
                    font-size: 12.5px;
                    color: rgba(111, 93, 70, 0.7);
                    background: #f2e9d8;
                }
                .wtapp .wtFoot a {
                    color: var(--gold-dp);
                    text-decoration: none;
                }
                .wtapp .wtFoot .dot {
                    opacity: 0.5;
                }
                @media (min-width: 760px) {
                    .wtapp .wtFoot {
                        padding-bottom: 30px;
                    }
                }

                /* ── desktop hero: two columns ── */
                @media (min-width: 900px) {
                    .wtapp .wtHero {
                        padding: 46px 24px 40px;
                    }
                    .wtapp .wtHeroGrid {
                        grid-template-columns: 1fr minmax(300px, 400px);
                        gap: 40px;
                        align-items: center;
                        text-align: start;
                        justify-items: stretch;
                    }
                    .wtapp .wtHeroCopy {
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 18px;
                    }
                    .wtapp .wtHeroCopy .wtLogo {
                        height: 58px;
                        margin: 0;
                    }
                    .wtapp .wtH1 {
                        margin: 0;
                    }
                    .wtapp .wtSub {
                        max-width: 480px;
                    }
                    .wtapp .wtHeroCta {
                        flex-direction: row;
                        align-items: center;
                        gap: 22px;
                    }
                    .wtapp .wtMicro {
                        justify-content: flex-start;
                    }
                    .wtapp .wtPhone {
                        max-width: 310px;
                    }
                    .wtapp .wtHeroPhone {
                        margin-top: 0;
                    }
                    /* live toast beside the phone */
                    .wtapp .wtToast {
                        position: absolute;
                        top: 20%;
                        inset-inline-start: -46px;
                        z-index: 4;
                        display: flex;
                        align-items: center;
                        gap: 9px;
                        background: rgba(255, 253, 248, 0.94);
                        border: 1px solid var(--line);
                        border-radius: 15px;
                        padding: 10px 14px;
                        box-shadow: 0 22px 40px -22px rgba(60, 44, 22, 0.6);
                        backdrop-filter: blur(8px);
                        animation: wtToastIn 6s ease-in-out infinite;
                    }
                    .wtapp .wtToast span {
                        display: flex;
                        flex-direction: column;
                        text-align: start;
                    }
                    .wtapp .wtToast b {
                        font-size: 13px;
                        font-weight: 800;
                    }
                    .wtapp .wtToast i {
                        font-style: normal;
                        font-size: 11.5px;
                        color: var(--muted);
                    }
                    .wtapp .wtToastDot {
                        width: 9px;
                        height: 9px;
                        border-radius: 50%;
                        background: #46c46e;
                        box-shadow: 0 0 0 4px rgba(70, 196, 110, 0.18);
                        flex: none;
                    }
                    @keyframes wtToastIn {
                        0%,
                        12% {
                            opacity: 0;
                            transform: translateY(10px) scale(0.94);
                        }
                        22%,
                        76% {
                            opacity: 1;
                            transform: none;
                        }
                        90%,
                        100% {
                            opacity: 0;
                            transform: translateY(-8px) scale(0.97);
                        }
                    }
                    .wtapp .wtProof {
                        margin-top: 40px;
                        font-size: 14px;
                        gap: 12px 22px;
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    .wtapp .wtToast {
                        animation: none;
                    }
                }
            `}</style>
        </div>
    )
}
