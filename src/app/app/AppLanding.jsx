'use client'

// /app — the APP acquisition funnel. One job: get an event owner to
// download Wedding Tales (or open a free book right now, until the
// store listings go live).
//
//   • Dark-luxury hero with a floating CSS iPhone running the app —
//     the real home hero (cover photo, live counter, gold "צפייה
//     בספר") and the liquid-glass tab bar, hand-built in CSS.
//   • Store badges are config-driven: leave STORE_LINKS empty and they
//     render as "בקרוב"; paste the real URLs when Apple/Google approve
//     and they become live download buttons. ONE place to flip.
//   • The honesty-first urgency: launch offer — the first event is
//     free, no credit card. Real portfolio books as proof.
//   • Mobile-first: sticky bottom CTA, everything thumb-reachable.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { frankRuhl } from '@/app/fonts'

// ─── FLIP THESE WHEN THE STORES APPROVE ──────────────────────────────
// Paste the live URLs (e.g. 'https://apps.apple.com/il/app/idXXXXXXX')
// and the badges turn into real download buttons automatically.
const STORE_LINKS = {
    ios: '',
    android: '',
}
// ─────────────────────────────────────────────────────────────────────

const START = '/start'

const BOOKS = [
    { src: '/imgs/portfolio/wedding/cover.webp', alt: 'הספר של שקד ודור', label: 'שקד ודור · חתונה' },
    { src: '/imgs/portfolio/bar-mitzvah/cover.webp', alt: 'הספר של נועם', label: 'נועם · בר מצווה' },
    { src: '/imgs/portfolio/birthday/cover.webp', alt: 'הספר של ג׳רי', label: 'ג׳רי · יום הולדת 90' },
]

function AppleBadge() {
    const live = !!STORE_LINKS.ios
    const inner = (
        <span className='badgeInner'>
            <svg viewBox='0 0 384 512' width='22' height='22' aria-hidden='true'>
                <path fill='currentColor' d='M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z' />
            </svg>
            <span className='badgeText'>
                <b>{live ? 'הורידו מ-' : 'בקרוב ב-'}</b>
                <strong>App Store</strong>
            </span>
        </span>
    )
    return live
        ? <a className='storeBadge live' href={STORE_LINKS.ios} target='_blank' rel='noopener noreferrer'>{inner}</a>
        : <span className='storeBadge soon'>{inner}</span>
}

function PlayBadge() {
    const live = !!STORE_LINKS.android
    const inner = (
        <span className='badgeInner'>
            <svg viewBox='0 0 512 512' width='20' height='20' aria-hidden='true'>
                <path fill='currentColor' d='M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z' />
            </svg>
            <span className='badgeText'>
                <b>{live ? 'הורידו מ-' : 'בקרוב ב-'}</b>
                <strong>Google Play</strong>
            </span>
        </span>
    )
    return live
        ? <a className='storeBadge live' href={STORE_LINKS.android} target='_blank' rel='noopener noreferrer'>{inner}</a>
        : <span className='storeBadge soon'>{inner}</span>
}

// ── The floating iPhone, running the app (pure CSS) ──────────────────
function PhoneMock() {
    return (
        <div className='phoneWrap' aria-hidden='true'>
            <div className='phoneGlow' />
            <div className='phone'>
                <div className='phoneNotch' />
                <div className='phoneScreen'>
                    {/* mini app: home hero */}
                    <div className='pTop'>
                        <span className='pBrand'>Wedding Tales</span>
                    </div>
                    <div className='pHero'>
                        <img src='/imgs/portfolio/wedding/cover.webp' alt='' />
                        <div className='pHeroShade' />
                        <span className='pBadge'>חתונה</span>
                        <div className='pHeroBottom'>
                            <b className={frankRuhl.className}>שקד & דור</b>
                            <span className='pLive'><i />‏24 ברכות · 24 תמונות</span>
                            <span className='pCta'>📖 צפייה בספר</span>
                        </div>
                    </div>
                    {/* mini blessing card */}
                    <div className='pCard'>
                        <span className='pCardTitle'>הברכה האחרונה</span>
                        <span className='pCardText'>”מאחלים לכם חיים מלאים באושר…“ — משפחת ביבי</span>
                    </div>
                    {/* liquid glass tab bar */}
                    <div className='pTabs'>
                        <span className='pLens' />
                        <i>🏠</i><i>💛</i><i>📖</i><i>✨</i><i>🔗</i>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function AppLanding() {
    const [stuck, setStuck] = useState(false)
    const heroRef = useRef(null)

    useEffect(() => {
        const el = heroRef.current
        if (!el || typeof IntersectionObserver === 'undefined') return
        const ob = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0.05 })
        ob.observe(el)
        return () => ob.disconnect()
    }, [])

    const year = useMemo(() => new Date().getFullYear(), [])

    return (
        <div className='al' dir='rtl'>
            {/* ═══ HERO ═══ */}
            <header className='hero' ref={heroRef}>
                <div className='heroGlowA' /><div className='heroGlowB' />
                <i className='star st1' /><i className='star st2' /><i className='star st3' /><i className='star st4' />

                <img src='/logo-wt.png' alt='Wedding Tales' className='logo' />

                <div className='launchRibbon'>🎁 מבצע השקה · האירוע הראשון חינם לגמרי</div>

                <h1 className='h1'>
                    כל הברכות מהאירוע שלכם.
                    <br />
                    <em>בספר אחד. בכיס.</em>
                </h1>
                <p className='sub'>
                    האורחים סורקים, כותבים ומעלים תמונות — ואתם רואים את ספר הברכות
                    מתמלא לכם ביד, בזמן אמת. פותחים בחינם, בלי כרטיס אשראי, מוכן תוך דקה.
                </p>

                <div className='heroCtas'>
                    <Link href={START} className='cta big'>פתחו ספר ברכות בחינם ←</Link>
                    <div className='badges'>
                        <AppleBadge />
                        <PlayBadge />
                    </div>
                </div>

                <PhoneMock />

                <div className='heroProof'>
                    <span><b>+60</b> אירועים</span>
                    <i />
                    <span><b>אלפי</b> ברכות ותמונות</span>
                    <i />
                    <span><b>דקה</b> ואתם באוויר</span>
                </div>
            </header>

            {/* ═══ HOW ═══ */}
            <section className='how'>
                <h2 className='h2'>ככה זה עובד</h2>
                <div className='steps'>
                    <div className='step'>
                        <span className='stepNum'>1</span>
                        <b>פותחים ספר</b>
                        <p>בוחרים סוג אירוע ועיצוב — והספר הדיגיטלי שלכם באוויר. חינם.</p>
                    </div>
                    <div className='step'>
                        <span className='stepNum'>2</span>
                        <b>האורחים מברכים</b>
                        <p>שולחים קישור אחד. כל אורח כותב מהלב ומצרף תמונה — בלי אפליקציה ובלי הרשמה.</p>
                    </div>
                    <div className='step'>
                        <span className='stepNum'>3</span>
                        <b>אתם מתרגשים</b>
                        <p>כל ברכה מופיעה אצלכם ברגע שהיא נכתבת. מדפדפים בספר — ואם רוצים, מדפיסים אותו.</p>
                    </div>
                </div>
            </section>

            {/* ═══ REAL BOOKS ═══ */}
            <section className='books'>
                <h2 className='h2'>ספרים אמיתיים שנפתחו אצלנו</h2>
                <p className='h2sub'>לא הדמיות — ברכות ותמונות שאורחים באמת העלו</p>
                <div className='bookRow'>
                    {BOOKS.map((b, i) => (
                        <figure className='bookFig' key={b.src} style={{ animationDelay: `${i * 0.12}s` }}>
                            <img src={b.src} alt={b.alt} loading='lazy' />
                            <figcaption>{b.label}</figcaption>
                        </figure>
                    ))}
                </div>
            </section>

            {/* ═══ FREE VS MORE ═══ */}
            <section className='free'>
                <div className='freeCard'>
                    <span className='freeTag'>מה מקבלים בחינם</span>
                    <ul>
                        <li>עמוד ברכות מעוצב לאורחים</li>
                        <li>ספר דיגיטלי חי + החלפת עיצובים</li>
                        <li>התראה על כל ברכה חדשה</li>
                        <li>שיתוף בקישור ובוואטסאפ</li>
                    </ul>
                    <Link href={START} className='cta'>מתחילים בחינם ←</Link>
                    <p className='freeMore'>
                        ובהמשך, אם תרצו: עמדת QR מעוצבת לאולם, כריכה אישית — ואפילו
                        <b> ספר כריכה קשה מודפס עד הבית</b>.
                    </p>
                </div>
            </section>

            {/* ═══ QUOTE ═══ */}
            <section className='quote'>
                <p className={`q ${frankRuhl.className}`}>
                    ”לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו,
                    והרגשנו כאילו חזרנו לחתונה שוב.“
                </p>
                <span className='qBy'>— שקד, התחתנה במרץ 2026</span>
            </section>

            {/* ═══ FAQ ═══ */}
            <section className='faq'>
                <h2 className='h2'>שאלות קצרות</h2>
                <details>
                    <summary>זה באמת חינם?</summary>
                    <p>כן. האירוע הראשון חינם לגמרי — עמוד אורחים, ספר דיגיטלי והתראות. בלי כרטיס אשראי. משלמים רק אם תרצו תוספות פיזיות כמו עמדת QR מודפסת או ספר כרוך.</p>
                </details>
                <details>
                    <summary>האורחים צריכים להוריד משהו?</summary>
                    <p>לא. האורחים פותחים קישור בדפדפן, כותבים ומצרפים תמונה — בלי אפליקציה ובלי הרשמה. גם סבתא מסתדרת 🙂</p>
                </details>
                <details>
                    <summary>מתי האפליקציה בחנויות?</summary>
                    <p>ממש בקרוב — היא בביקורת של אפל וגוגל ממש עכשיו. בינתיים הכול עובד מצוין מהדפדפן בטלפון, ומי שפותח ספר היום יקבל את האפליקציה ברגע שתעלה.</p>
                </details>
            </section>

            {/* ═══ FINAL CTA ═══ */}
            <section className='final'>
                <h2 className='finalH'>הערב יעבור.<br /><em>הברכות יישארו.</em></h2>
                <Link href={START} className='cta big'>פתחו ספר ברכות בחינם 🎁</Link>
                <div className='badges'>
                    <AppleBadge />
                    <PlayBadge />
                </div>
                <p className='finalNote'>אירוע ראשון חינם · בלי כרטיס אשראי · מוכן תוך דקה</p>
            </section>

            <footer className='foot'>
                <span>© {year} Wedding Tales</span>
                <span className='dot'>·</span>
                <Link href='/privacy'>פרטיות</Link>
                <span className='dot'>·</span>
                <Link href='/terms'>תנאים</Link>
            </footer>

            {/* Sticky mobile CTA */}
            <div className={`sticky ${stuck ? 'on' : ''}`}>
                <span className='stickyTxt'>🎁 האירוע הראשון חינם</span>
                <Link href={START} className='cta stickyBtn'>פתחו ספר ←</Link>
            </div>

            <style jsx>{`
                .al {
                    min-height: 100dvh; color: #f3e9d2; overflow: hidden;
                    background: linear-gradient(180deg, #191007 0%, #241a10 40%, #1b130a 100%);
                    font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif;
                }

                /* ── hero ── */
                .hero { position: relative; text-align: center; padding: 34px 20px 26px; overflow: hidden; }
                .heroGlowA, .heroGlowB { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
                .heroGlowA { width: 420px; height: 420px; background: rgba(201, 164, 78, 0.2); top: -160px; inset-inline-start: -120px; }
                .heroGlowB { width: 380px; height: 380px; background: rgba(178, 94, 140, 0.12); top: 30%; inset-inline-end: -140px; }
                .star { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #e2c377; opacity: 0.5; animation: twinkle 4s ease-in-out infinite; }
                .st1 { top: 12%; inset-inline-start: 12%; } .st2 { top: 22%; inset-inline-end: 16%; animation-delay: 1s; }
                .st3 { top: 48%; inset-inline-start: 8%; animation-delay: 2s; } .st4 { top: 38%; inset-inline-end: 8%; animation-delay: 3s; }
                @keyframes twinkle { 0%, 100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.4); } }

                .logo { height: 46px; width: auto; margin-bottom: 14px; }
                .launchRibbon {
                    display: inline-block; margin: 0 auto 16px;
                    background: rgba(226, 195, 119, 0.12); border: 1px solid rgba(226, 195, 119, 0.45);
                    color: #ecd9a8; border-radius: 999px; padding: 8px 18px; font-size: 13.5px; font-weight: 700;
                    animation: ribbonPulse 2.6s ease-in-out infinite;
                }
                @keyframes ribbonPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(226, 195, 119, 0.25); } 50% { box-shadow: 0 0 24px 2px rgba(226, 195, 119, 0.18); } }

                .h1 { margin: 0 0 10px; font-size: clamp(30px, 7.4vw, 46px); font-weight: 800; line-height: 1.25; letter-spacing: -0.01em; }
                .h1 em {
                    font-style: normal;
                    background: linear-gradient(92deg, #e2c377, #f4dfae 50%, #c9a44e);
                    -webkit-background-clip: text; background-clip: text; color: transparent;
                }
                .sub { margin: 0 auto 20px; max-width: 560px; font-size: 15.5px; line-height: 1.8; color: rgba(243, 233, 210, 0.78); }

                .heroCtas { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-bottom: 8px; }
                .badges { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

                /* ── phone ── */
                .phoneWrap { position: relative; width: 250px; margin: 26px auto 8px; }
                .phoneGlow {
                    position: absolute; inset: -30px -40px; border-radius: 50%;
                    background: radial-gradient(closest-side, rgba(226, 195, 119, 0.22), transparent 70%);
                    filter: blur(10px);
                }
                .phone {
                    position: relative; border-radius: 38px; padding: 10px;
                    background: linear-gradient(180deg, #3a3a3c, #1c1c1e);
                    box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.18);
                    animation: phoneFloat 6s ease-in-out infinite;
                }
                @keyframes phoneFloat { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-12px) rotate(1deg); } }
                .phoneNotch {
                    position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
                    width: 86px; height: 22px; border-radius: 12px; background: #000; z-index: 3;
                }
                .phoneScreen {
                    border-radius: 30px; overflow: hidden; background: linear-gradient(180deg, #fdfaf2, #f6efdf);
                    padding: 34px 10px 10px; display: flex; flex-direction: column; gap: 8px; min-height: 430px;
                    position: relative;
                }
                .pTop { text-align: center; }
                .pBrand { font-size: 9px; letter-spacing: 0.18em; font-weight: 800; color: rgba(90, 70, 35, 0.7); }
                .pHero { position: relative; border-radius: 18px; overflow: hidden; height: 210px; }
                .pHero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
                .pHeroShade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,7,4,0.1), rgba(10,7,4,0.05) 40%, rgba(10,7,4,0.8)); }
                .pBadge {
                    position: absolute; top: 8px; inset-inline-start: 8px;
                    background: rgba(20, 14, 8, 0.6); border: 1px solid rgba(226, 195, 119, 0.5);
                    color: #f3e9d2; font-size: 8.5px; font-weight: 800; border-radius: 999px; padding: 3px 8px;
                }
                .pHeroBottom { position: absolute; bottom: 0; inset-inline: 0; padding: 10px; display: flex; flex-direction: column; gap: 4px; text-align: right; }
                .pHeroBottom b { color: #fff; font-size: 17px; }
                .pLive { display: flex; align-items: center; gap: 4px; color: rgba(243, 233, 210, 0.9); font-size: 9px; font-weight: 600; flex-direction: row-reverse; justify-content: flex-end; }
                .pLive i { width: 5px; height: 5px; border-radius: 3px; background: #5ad27f; display: inline-block; animation: twinkle 2s ease-in-out infinite; }
                .pCta {
                    margin-top: 4px; text-align: center; background: linear-gradient(180deg, #ecd08a, #b8893d);
                    color: #241a0d; font-size: 11px; font-weight: 800; border-radius: 9px; padding: 8px;
                }
                .pCard {
                    background: rgba(255, 255, 255, 0.85); border: 1px solid rgba(201, 164, 78, 0.3);
                    border-radius: 13px; padding: 8px 10px; text-align: right;
                }
                .pCardTitle { display: block; font-size: 8px; letter-spacing: 0.1em; color: #a89378; font-weight: 800; margin-bottom: 3px; }
                .pCardText { font-size: 9.5px; color: #4a3c26; line-height: 1.5; }
                .pTabs {
                    position: relative; margin-top: auto; display: flex; justify-content: space-around; align-items: center;
                    background: rgba(253, 249, 239, 0.85); border: 1px solid rgba(201, 164, 78, 0.35);
                    border-radius: 16px 16px 22px 22px; padding: 8px 4px; backdrop-filter: blur(6px);
                }
                .pTabs i { font-style: normal; font-size: 13px; opacity: 0.85; position: relative; z-index: 1; }
                .pLens {
                    position: absolute; top: 4px; bottom: 4px; inset-inline-start: 7%; width: 17%;
                    border-radius: 12px; background: rgba(255, 255, 255, 0.85);
                    border: 1px solid rgba(255, 255, 255, 0.95); box-shadow: 0 4px 10px -4px rgba(138, 99, 32, 0.5);
                    animation: lensSlide 7s ease-in-out infinite;
                }
                @keyframes lensSlide {
                    0%, 22% { inset-inline-start: 7%; }
                    30%, 47% { inset-inline-start: 26%; }
                    55%, 72% { inset-inline-start: 45%; }
                    80%, 100% { inset-inline-start: 7%; }
                }

                .heroProof {
                    display: flex; align-items: center; justify-content: center; gap: 14px;
                    margin-top: 20px; font-size: 12.5px; color: rgba(243, 233, 210, 0.7);
                }
                .heroProof b { color: #e2c377; font-weight: 800; }
                .heroProof i { width: 3px; height: 3px; border-radius: 2px; background: rgba(226, 195, 119, 0.5); }

                /* ── shared ── */
                .h2 { margin: 0 0 6px; font-size: clamp(22px, 5vw, 30px); font-weight: 800; text-align: center; }
                .h2sub { margin: 0 0 22px; text-align: center; font-size: 13.5px; color: rgba(243, 233, 210, 0.65); }
                .cta {
                    position: relative; overflow: hidden; display: inline-block; text-decoration: none; text-align: center;
                    background: linear-gradient(180deg, #ecd08a, #b8893d); color: #241a0d;
                    border-radius: 15px; padding: 14px 26px; font-size: 16px; font-weight: 800;
                    box-shadow: 0 16px 34px -14px rgba(201, 164, 78, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.4);
                    transition: transform 0.16s ease, filter 0.16s ease;
                }
                .cta:hover { transform: translateY(-2px); filter: brightness(1.05); }
                .cta:active { transform: scale(0.98); }
                .cta.big { padding: 16px 34px; font-size: 17.5px; }

                :global(.storeBadge) {
                    display: inline-flex; align-items: center; border-radius: 13px; padding: 9px 16px;
                    border: 1.5px solid rgba(243, 233, 210, 0.35); color: #f3e9d2; text-decoration: none;
                    background: rgba(255, 255, 255, 0.05); transition: transform 0.15s ease, border-color 0.15s ease;
                }
                :global(.storeBadge.live:hover) { transform: translateY(-2px); border-color: #e2c377; }
                :global(.storeBadge.soon) { opacity: 0.75; }
                :global(.badgeInner) { display: inline-flex; align-items: center; gap: 10px; direction: ltr; }
                :global(.badgeText) { display: flex; flex-direction: column; text-align: left; line-height: 1.15; }
                :global(.badgeText b) { font-size: 9.5px; font-weight: 600; opacity: 0.8; }
                :global(.badgeText strong) { font-size: 14.5px; font-weight: 800; }

                /* ── how ── */
                .how { padding: 40px 20px 8px; max-width: 860px; margin: 0 auto; }
                .steps { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 18px; }
                @media (min-width: 700px) { .steps { grid-template-columns: repeat(3, 1fr); } }
                .step {
                    background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(226, 195, 119, 0.22);
                    border-radius: 18px; padding: 18px; text-align: right;
                    transition: transform 0.18s ease, border-color 0.18s ease;
                }
                .step:hover { transform: translateY(-3px); border-color: rgba(226, 195, 119, 0.5); }
                .stepNum {
                    display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
                    background: linear-gradient(180deg, #ecd08a, #b8893d); color: #241a0d; font-weight: 800; font-size: 14px;
                    margin-bottom: 8px;
                }
                .step b { display: block; font-size: 16.5px; margin-bottom: 4px; }
                .step p { margin: 0; font-size: 13.5px; line-height: 1.7; color: rgba(243, 233, 210, 0.72); }

                /* ── books ── */
                .books { padding: 42px 20px 10px; }
                .bookRow { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
                .bookFig {
                    margin: 0; text-align: center; animation: bookIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                @keyframes bookIn { from { opacity: 0; transform: translateY(20px) scale(0.94); } }
                .bookFig img {
                    width: 150px; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px;
                    border: 3px solid rgba(255, 255, 255, 0.92);
                    box-shadow: 0 22px 40px -18px rgba(0, 0, 0, 0.65);
                    transition: transform 0.2s ease;
                }
                .bookFig:hover img { transform: translateY(-5px) rotate(-1deg); }
                .bookFig figcaption { margin-top: 8px; font-size: 11.5px; color: rgba(243, 233, 210, 0.65); }

                /* ── free ── */
                .free { padding: 40px 20px 8px; }
                .freeCard {
                    max-width: 520px; margin: 0 auto; text-align: center;
                    background: linear-gradient(180deg, rgba(255, 253, 246, 0.07), rgba(226, 195, 119, 0.05));
                    border: 1.5px solid rgba(226, 195, 119, 0.4); border-radius: 24px; padding: 26px 22px;
                }
                .freeTag {
                    display: inline-block; background: linear-gradient(180deg, #ecd08a, #c9a44e); color: #241a0d;
                    font-size: 12.5px; font-weight: 800; border-radius: 999px; padding: 6px 16px; margin-bottom: 14px;
                }
                .freeCard ul { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 9px; text-align: right; }
                .freeCard li { font-size: 14.5px; color: rgba(243, 233, 210, 0.9); padding-inline-start: 4px; }
                .freeCard li::before { content: '✓  '; color: #e2c377; font-weight: 800; }
                .freeMore { margin: 14px 0 0; font-size: 12.5px; line-height: 1.7; color: rgba(243, 233, 210, 0.6); }
                .freeMore b { color: rgba(243, 233, 210, 0.85); }

                /* ── quote ── */
                .quote { padding: 44px 24px 10px; text-align: center; max-width: 640px; margin: 0 auto; }
                .q { margin: 0 0 10px; font-size: clamp(18px, 4.6vw, 24px); line-height: 1.7; color: #f4dfae; }
                .qBy { font-size: 12.5px; color: rgba(243, 233, 210, 0.55); }

                /* ── faq ── */
                .faq { padding: 40px 20px 8px; max-width: 640px; margin: 0 auto; }
                .faq details {
                    background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(226, 195, 119, 0.2);
                    border-radius: 14px; padding: 14px 16px; margin-top: 10px;
                }
                .faq summary { cursor: pointer; font-size: 15px; font-weight: 700; list-style: none; }
                .faq summary::-webkit-details-marker { display: none; }
                .faq summary::after { content: '+'; float: left; color: #e2c377; font-weight: 800; }
                .faq details[open] summary::after { content: '−'; }
                .faq p { margin: 10px 0 0; font-size: 13.5px; line-height: 1.75; color: rgba(243, 233, 210, 0.72); }

                /* ── final ── */
                .final { padding: 52px 20px 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
                .finalH { margin: 0; font-size: clamp(26px, 6.4vw, 38px); font-weight: 800; line-height: 1.3; }
                .finalH em {
                    font-style: normal;
                    background: linear-gradient(92deg, #e2c377, #f4dfae 50%, #c9a44e);
                    -webkit-background-clip: text; background-clip: text; color: transparent;
                }
                .finalNote { margin: 0; font-size: 12.5px; color: rgba(243, 233, 210, 0.6); }

                .foot {
                    display: flex; justify-content: center; align-items: center; gap: 8px;
                    padding: 18px 16px 100px; font-size: 12px; color: rgba(243, 233, 210, 0.45);
                }
                .foot :global(a) { color: rgba(243, 233, 210, 0.6); text-decoration: none; }
                .dot { opacity: 0.5; }

                /* ── sticky mobile CTA ── */
                .sticky {
                    position: fixed; bottom: 0; inset-inline: 0; z-index: 40;
                    display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    background: rgba(20, 13, 7, 0.92); backdrop-filter: blur(12px);
                    border-top: 1px solid rgba(226, 195, 119, 0.35);
                    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
                    transform: translateY(110%); transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .sticky.on { transform: translateY(0); }
                .stickyTxt { font-size: 13.5px; font-weight: 700; color: #f3e9d2; }
                .stickyBtn { padding: 11px 20px; font-size: 14.5px; border-radius: 12px; }

                @media (min-width: 760px) {
                    .sticky { display: none; }
                }
            `}</style>
        </div>
    )
}
