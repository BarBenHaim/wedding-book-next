// src/app/bar-mitzvah/page.js
//
// דף מכירה לבר מצווה — נשלח כקישור בוואטסאפ למתעניינים.
// עמוד שרת (Server Component) כדי לייצא metadata — תצוגה מקדימה
// יפה בוואטסאפ (תמונה + כותרת + תיאור) היא קריטית לקליק.
//
// כל מה שמשתנה עסקית מרוכז ב-CONFIG למטה — מחיר, קישורים, דמו.
// חלק המחירים והתשלום מרונדר בקומפוננטת client (BarMitzvahPricingClient)
// כי הוא צריך state לבחירת חבילה + תוספות + חישוב total חי.

import BarMitzvahPricingClient from './BarMitzvahPricingClient'

const CONFIG = {
    // מחיר החבילה כפי שמופיע בחנות (מוצר 5480). לעדכון — שנו רק כאן.
    price: '990',
    priceNote: 'כולל הכל — בלי הפתעות',
    // קישור הוואטסאפ הקיים שלך
    whatsapp: 'https://wa.link/nkf9u5',
    // קישור ישיר לתשלום בחנות (חבילת ספר הברכות לבר המצווה)
    checkout: 'https://weddingtales.co.il/checkout/?add-to-cart=5480',
    // קישורי דמו — אירוע הדמו החי של "איתי" (demo@weddingtales.co.il)
    demoGuest: 'https://app.weddingtales.co.il/w/4dgd5v',
    demoBook: 'https://app.weddingtales.co.il/wedding/28iAvV2jOCWFmnAPLtoy/book/b95d184c-c74a-43bf-84b0-4f01913d1419',
    // מדיה קיימת מהאתר (אותן תמונות מדף הנחיתה של החתונות)
    img: {
        book: 'https://weddingtales.co.il/wp-content/uploads/2026/05/ChatGPT-Image-May-13-2026-01_56_00-PM-1024x768.png',
        qrStand: 'https://weddingtales.co.il/wp-content/uploads/2026/06/ChatGPT-Image-Jun-4-2026-06_45_53-PM-819x1024.png',
        phone: 'https://weddingtales.co.il/wp-content/uploads/2026/05/ChatGPT-Image-May-8-2026-03_57_22-PM-1024x768.png',
        cover: 'https://weddingtales.co.il/wp-content/uploads/2025/10/Cover-img-1024x683.jpg',
    },
}

// תצוגה מקדימה בוואטסאפ — חובה כתובות אבסולוטיות
export const metadata = {
    title: 'ספר הברכות לבר המצווה | Wedding Tales',
    description:
        'האורחים סורקים QR, כותבים ברכה ומעלים תמונה — ואתם מקבלים ספר ברכות מודפס בכריכה קשה. מזכרת שנשארת לכל החיים.',
    openGraph: {
        title: 'ספר הברכות לבר המצווה | Wedding Tales',
        description:
            'כל הברכות והתמונות מהאנשים שאוהבים אותו — בספר מודפס אחד. האורחים יוצרים, אתם שומרים לנצח.',
        url: 'https://app.weddingtales.co.il/bar-mitzvah',
        siteName: 'Wedding Tales',
        images: [{ url: 'https://app.weddingtales.co.il/og/wedding-tales-book.png', width: 1200, height: 630 }],
        locale: 'he_IL',
        type: 'website',
    },
}

// ─── תוכן ────────────────────────────────────────────────────────────────────

const STEPS = [
    {
        num: '01',
        title: 'האורחים סורקים QR',
        desc: 'מעמדים מעוצבים עם שם חתן הבר מצווה מוצבים על השולחנות. סריקה אחת מהנייד — בלי אפליקציה ובלי הרשמה.',
        img: CONFIG.img.qrStand,
    },
    {
        num: '02',
        title: 'כותבים ברכה ומעלים תמונה',
        desc: 'סבא וסבתא, הדודים והחברים מהכיתה — כל אחד כותב ברכה מהלב ומצרף תמונה מהאירוע. פשוט כל כך שזה מתאים לכל גיל.',
        img: CONFIG.img.phone,
    },
    {
        num: '03',
        title: 'מקבלים ספר ברכות מודפס',
        desc: 'כל הברכות והתמונות נאספות ומעוצבות לספר יוקרתי בכריכה קשה — מזכרת אחת שתישאר איתו הרבה אחרי שהאירוע נגמר.',
        img: CONFIG.img.book,
    },
]

const PACKAGE_ITEMS = [
    'מעמדי QR אקריליים מעוצבים עם שם חתן הבר מצווה',
    'עמוד ברכות אישי לאורחים — נפתח מכל נייד, בלי אפליקציה',
    'מערכת ניהול אישית — רואים כל ברכה בזמן אמת ומאשרים לפני הדפסה',
    'עיצוב ייחודי ומותאם אישית לאירוע שלכם',
    'ספר ברכות מודפס בכריכה קשה עם כל הברכות והתמונות',
]

const FEATURES = [
    {
        title: 'בלי אפליקציה',
        desc: 'האורחים נכנסים מקישור או QR — בלי הורדות ובלי הרשמות. גם סבא וסבתא מסתדרים לבד.',
    },
    {
        title: 'שליטה מלאה אצלכם',
        desc: 'רואים כל ברכה שנכנסת בזמן אמת, ויכולים להסיר כל תוכן לפני שהספר יוצא להדפסה.',
    },
    {
        title: 'הדפסה יוקרתית',
        desc: 'כריכה קשה, נייר איכותי ועיצוב מקצועי — ספר שמרגיש כמו מתנה, לא כמו אלבום מהיר.',
    },
    {
        title: 'גם מי שפספס משלים',
        desc: 'הקישור נשאר פתוח גם אחרי האירוע — מי שלא הספיק לברך מוסיף ברכה מהבית.',
    },
]

const FAQ = [
    {
        q: 'מה בדיוק מקבלים?',
        a: 'מרגע הסגירה אתם מקבלים גישה למערכת האישית שלכם — בוחרים את עיצוב הספר מתוך קולקציית סגנונות, רואים בזמן אמת כמה אורחים בירכו ומה הם כתבו, ויכולים להסיר כל תוכן שלא מתאים לפני ההדפסה. בסוף מגיע אליכם ספר מודפס בכריכה קשה.',
    },
    {
        q: 'חלק מהאורחים שלנו מבוגרים, זה מתאים גם להם?',
        a: 'ברור! המערכת כל כך פשוטה מצד האורחים — סריקה, כתיבה, שליחה — שאין שום מגבלת גיל. מהניסיון שלנו, דווקא הסבים והסבתות כותבים את הברכות הכי מרגשות.',
    },
    {
        q: 'מה אם לא כל האורחים ישתתפו?',
        a: 'זה ממש בסדר. האנשים הקרובים ביותר ידאגו לברך מהלב, ומי שלא הספיק באירוע — יכול להשלים ברכה מהבית גם אחרי. בסוף נשארים עם ספר מלא באנשים שבאמת חשובים.',
    },
    {
        q: 'מה קורה אם האירוע נדחה?',
        a: 'אין שום בעיה — ניתן לשנות את התאריך בצורה חופשית, בלי עלות נוספת.',
    },
]

// ─── עמוד ────────────────────────────────────────────────────────────────────

function WhatsAppButton({ children, secondary = false }) {
    return (
        <a
            href={CONFIG.whatsapp}
            target='_blank'
            rel='noopener noreferrer'
            className={
                secondary
                    ? 'inline-block rounded-2xl border-2 border-[#AA8840] px-7 py-3.5 font-bold text-[#AA8840] transition hover:bg-[#AA8840] hover:text-white'
                    : 'inline-block rounded-2xl bg-gradient-to-b from-[#25D366] to-[#1da851] px-7 py-3.5 font-bold text-white shadow-lg shadow-green-600/20 transition hover:scale-[1.02]'
            }>
            {children}
        </a>
    )
}

export default function BarMitzvahPage() {
    return (
        <div className='min-h-screen w-full bg-gradient-to-b from-white via-[#f7faff] to-[#e7f0fb] font-sans text-right'>
            {/* ═══ Hero ═══ */}
            <section className='relative mx-auto max-w-5xl px-5 pt-14 pb-10 text-center sm:pt-20'>
                <div className='pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[rgba(170,136,64,0.08)] blur-3xl' />
                <img src='/logo-wt.png' alt='Wedding Tales' className='mx-auto mb-6 h-14 w-auto sm:h-16' />
                <p className='mb-3 text-sm font-semibold tracking-wide text-[#2b4a7a]'>ספר הברכות לבר המצווה</p>
                <h1 className='mx-auto max-w-3xl text-3xl font-[800] leading-tight text-[#1a2540] sm:text-5xl'>
                    ספר שהאורחים שלכם יוצרים{' '}
                    <span className='bg-gradient-to-r from-[#AA8840] to-[#c9a44e] bg-clip-text text-transparent'>בזמן אמת</span>
                </h1>
                <p className='mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#49577a] sm:text-lg'>
                    לא עוד מתנה שנשכחת במגירה. כל הברכות, התמונות והאנשים שאוהבים אותו — נאספים באירוע עצמו והופכים
                    לספר מודפס בכריכה קשה, שיישאר איתו לכל החיים.
                </p>
                <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
                    <WhatsAppButton>דברו איתנו בוואטסאפ</WhatsAppButton>
                    <a
                        href='#how'
                        className='inline-block rounded-2xl border border-[#2b4a7a]/30 px-7 py-3.5 font-bold text-[#2b4a7a] transition hover:border-[#2b4a7a]'>
                        איך זה עובד?
                    </a>
                </div>
                <img
                    src={CONFIG.img.book}
                    alt='ספר ברכות מודפס'
                    className='mx-auto mt-10 w-full max-w-2xl rounded-3xl shadow-2xl shadow-blue-900/20'
                />
            </section>

            {/* ═══ How it works ═══ */}
            <section id='how' className='mx-auto max-w-5xl px-5 py-14'>
                <h2 className='text-center text-2xl font-[800] text-[#1a2540] sm:text-4xl'>איך זה עובד?</h2>
                <p className='mt-2 text-center text-[#49577a]'>שלושה שלבים פשוטים — והזיכרונות נשארים לנצח</p>
                <div className='mt-10 grid gap-6 sm:grid-cols-3'>
                    {STEPS.map((s) => (
                        <div key={s.num} className='rounded-3xl border border-[#2b4a7a]/10 bg-white/80 p-6 shadow-sm'>
                            <img src={s.img} alt={s.title} className='mb-5 h-44 w-full rounded-2xl object-cover' />
                            <span className='text-sm font-bold text-[#AA8840]'>{s.num}</span>
                            <h3 className='mt-1 text-lg font-bold text-[#1a2540]'>{s.title}</h3>
                            <p className='mt-2 text-sm leading-relaxed text-[#49577a]'>{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══ Demo ═══ */}
            {(CONFIG.demoGuest || CONFIG.demoBook) && (
                <section className='mx-auto max-w-5xl px-5 py-6'>
                    <div className='rounded-3xl bg-[#1a2540] px-6 py-10 text-center text-white'>
                        <h2 className='text-2xl font-[800] sm:text-3xl'>רוצים לנסות בעצמכם? 👇</h2>
                        <p className='mx-auto mt-2 max-w-xl text-white/70'>
                            פתחנו אירוע הדגמה אמיתי — היכנסו, כתבו ברכה כמו אורח, ודפדפו בספר שנוצר.
                        </p>
                        <div className='mt-6 flex flex-wrap justify-center gap-3'>
                            {CONFIG.demoGuest && (
                                <a
                                    href={CONFIG.demoGuest}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='rounded-2xl bg-white px-6 py-3 font-bold text-[#1a2540] transition hover:scale-[1.02]'>
                                    לכתוב ברכה כמו אורח
                                </a>
                            )}
                            {CONFIG.demoBook && (
                                <a
                                    href={CONFIG.demoBook}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='rounded-2xl border-2 border-[#c9a44e] px-6 py-3 font-bold text-[#c9a44e] transition hover:bg-[#c9a44e] hover:text-[#1a2540]'>
                                    לדפדף בספר לדוגמה
                                </a>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* ═══ Package + Price (interactive) ═══ */}
            <BarMitzvahPricingClient whatsappUrl={CONFIG.whatsapp} />

            {/* ═══ What's included — a quiet reminder under the pricing ═══ */}
            <section className='mx-auto max-w-3xl px-5 pb-6 -mt-4'>
                <div className='rounded-2xl border border-[#2b4a7a]/10 bg-white/70 p-5 text-center'>
                    <p className='text-sm font-bold text-[#1a2540]'>בכל חבילה כלול:</p>
                    <ul className='mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-[#49577a]'>
                        {PACKAGE_ITEMS.map((item, i) => (
                            <li key={item} className='inline-flex items-center gap-1.5'>
                                <span className='text-[#AA8840]'>✓</span>
                                <span>{item}</span>
                                {i < PACKAGE_ITEMS.length - 1 && <span className='text-[#2b4a7a]/25'>·</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ═══ Why ═══ */}
            <section className='mx-auto max-w-5xl px-5 py-8'>
                <h2 className='text-center text-2xl font-[800] text-[#1a2540] sm:text-4xl'>למה הורים אוהבים את זה?</h2>
                <div className='mt-8 grid gap-5 sm:grid-cols-2'>
                    {FEATURES.map((f) => (
                        <div key={f.title} className='rounded-3xl border border-[#2b4a7a]/10 bg-white/70 p-6'>
                            <h3 className='font-bold text-[#1a2540]'>{f.title}</h3>
                            <p className='mt-1.5 text-sm leading-relaxed text-[#49577a]'>{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══ Testimonial ═══ */}
            {/* TODO: כשתהיה עדות מלקוח בר מצווה — החליפו כאן. בינתיים עדות אמיתית מחתונה. */}
            <section className='mx-auto max-w-3xl px-5 py-12 text-center'>
                <p className='text-xl font-semibold leading-relaxed text-[#1a2540] sm:text-2xl'>
                    ״לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לאירוע שוב. יצא לנו ספר
                    מהמם.״
                </p>
                <p className='mt-3 text-sm text-[#49577a]'>שקד — לקוחת Wedding Tales, מרץ 2026</p>
            </section>

            {/* ═══ FAQ ═══ */}
            <section className='mx-auto max-w-3xl px-5 py-10'>
                <h2 className='text-center text-2xl font-[800] text-[#1a2540] sm:text-3xl'>שאלות נפוצות</h2>
                <div className='mt-7 space-y-3'>
                    {FAQ.map((f) => (
                        <details key={f.q} className='group rounded-2xl border border-[#2b4a7a]/15 bg-white/80 p-5'>
                            <summary className='cursor-pointer list-none font-bold text-[#1a2540] marker:content-none'>
                                {f.q}
                            </summary>
                            <p className='mt-3 text-sm leading-relaxed text-[#49577a]'>{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ═══ Bottom CTA ═══ */}
            <section className='px-5 pb-20 pt-8 text-center'>
                <h2 className='text-2xl font-[800] text-[#1a2540] sm:text-4xl'>הספר של הבר מצווה שלכם מחכה</h2>
                <p className='mx-auto mt-3 max-w-xl text-[#49577a]'>
                    שלחו הודעה, נבדוק זמינות לתאריך שלכם ונשלח לכם דוגמה — בלי התחייבות.
                </p>
                <div className='mt-7'>
                    <WhatsAppButton>בדקו זמינות לתאריך שלכם</WhatsAppButton>
                </div>
            </section>
        </div>
    )
}
