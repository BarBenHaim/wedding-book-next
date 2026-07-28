'use client'

// Interactive pricing block for /bar-mitzvah. Package radio-cards,
// add-on checkboxes, live total, and a payment CTA that hits a real
// checkout URL when one is configured — otherwise falls back to a
// pre-filled WhatsApp message so the lead never dies on this page.
//
// Prices live at the top of the file. Edit here to change them
// everywhere on the page (radio card + running total + WhatsApp fallback
// message). No CMS, no env var — this is the source of truth.
//
// To wire real payment later:
//   pass a `checkoutBase` prop (or set NEXT_PUBLIC_BAR_MITZVAH_CHECKOUT
//   in Vercel) that accepts querystring params `?pkg=<id>&addons=<csv>
//   &amount=<n>` — the CTA appends them and opens the link. Until then
//   the fallback WhatsApp text ("היי, אני רוצה להזמין…") wins.

import { useMemo, useState } from 'react'

const PACKAGES = [
    {
        id: 'digital',
        title: 'דיגיטלי בלבד',
        subtitle: 'ספר הברכות שנפתח מכל נייד',
        price: 290,
        includes: [
            'עמוד ברכות אישי לאורחים',
            'מערכת ניהול — רואים כל ברכה בזמן אמת',
            'ספר דיגיטלי לשיתוף עוד באותו לילה',
            'עיצוב אישי לאירוע',
        ],
    },
    {
        id: 'digital_plus_print',
        title: 'דיגיטלי + עותק מודפס',
        subtitle: 'ספר דיגיטלי + כריכה קשה עד הבית',
        price: 490,
        includes: [
            'כל מה שיש בחבילה הדיגיטלית',
            'ספר כריכה קשה — הדפסה יוקרתית על נייר ארכיב',
            'משלוח עד הבית',
        ],
    },
    {
        id: 'grandma',
        title: 'חבילת סבתא-סבתא',
        subtitle: 'ספר דיגיטלי + 3 עותקים מודפסים',
        price: 690,
        strike: 870, // 490 + 2× ~190 “additional print” — displays as savings
        recommended: true,
        badge: '⭐ מומלץ',
        savings: 'חוסכים ₪180',
        includes: [
            'כל מה שיש בחבילה עם ההדפסה',
            '2 עותקים מודפסים נוספים — לסבים וסבתות',
            'עדיפות בסבב ההדפסה',
        ],
    },
]

const ADDONS = [
    {
        id: 'qr_stand',
        label: 'עמדת QR באירוע — כרזה מעוצבת + מעמד אקרילי',
        note: 'האורחים סורקים ישר מהשולחן, בלי שאלות',
        price: 250,
    },
]

// Configure ONE of these to activate self-serve checkout:
//   • NEXT_PUBLIC_BAR_MITZVAH_CHECKOUT — a Meshulam / Grow / Bit URL
//     that accepts ?amount=<n>&label=<txt> at the end.
//   • checkoutBase prop passed from the server page.
// If neither is set, the CTA opens WhatsApp with the details prefilled.
const DEFAULT_WHATSAPP = 'https://wa.link/nkf9u5'

function fmt(n) {
    return `₪${n.toLocaleString('he-IL')}`
}

function buildSummary(pkg, addonIds, total) {
    const addonsPart = addonIds.length
        ? ' + תוספות: ' + addonIds.map(id => ADDONS.find(a => a.id === id)?.label || id).join(', ')
        : ''
    return `היי! אני רוצה להזמין את חבילת "${pkg.title}"${addonsPart}. סה"כ: ${fmt(total)}. שלחו לי בבקשה קישור לתשלום 🙏`
}

export default function BarMitzvahPricingClient({ checkoutBase = '', whatsappUrl = DEFAULT_WHATSAPP }) {
    const [pkgId, setPkgId] = useState('grandma') // "recommended" pre-selected
    const [addons, setAddons] = useState([])
    const pkg = PACKAGES.find(p => p.id === pkgId) || PACKAGES[0]

    const total = useMemo(() => {
        return pkg.price + addons.reduce((sum, id) => sum + (ADDONS.find(a => a.id === id)?.price || 0), 0)
    }, [pkg.price, addons])

    // Real checkout when a base URL is provided (via env or prop); WhatsApp
    // fallback otherwise. Both open in the same tab — this is the primary
    // conversion action.
    const checkoutHref = useMemo(() => {
        const base = checkoutBase || process.env.NEXT_PUBLIC_BAR_MITZVAH_CHECKOUT || ''
        if (base) {
            const qs = new URLSearchParams({
                pkg: pkg.id,
                addons: addons.join(','),
                amount: String(total),
                label: pkg.title,
            })
            const sep = base.includes('?') ? '&' : '?'
            return `${base}${sep}${qs.toString()}`
        }
        return `${whatsappUrl}?text=${encodeURIComponent(buildSummary(pkg, addons, total))}`
    }, [pkg, addons, total, checkoutBase, whatsappUrl])
    const isWhatsApp = !checkoutHref.startsWith(process.env.NEXT_PUBLIC_BAR_MITZVAH_CHECKOUT || 'https://__never__')

    return (
        <section className='mx-auto max-w-5xl px-5 py-14' id='pricing'>
            <div className='rounded-3xl border border-[#AA8840]/25 bg-white p-6 shadow-xl shadow-blue-900/5 sm:p-10'>
                <div className='text-center'>
                    <p className='text-sm font-bold tracking-wide text-[#AA8840]'>בחרו חבילה</p>
                    <h2 className='mt-1 text-2xl font-[800] text-[#1a2540] sm:text-4xl'>מחיר קבוע. בלי אותיות קטנות.</h2>
                    <p className='mt-2 text-[#49577a]'>כולם כוללים את מערכת הניהול, העיצוב האישי והתמיכה עד ליום האירוע.</p>
                </div>

                {/* Package radio cards */}
                <fieldset className='mt-8 grid gap-4 sm:grid-cols-3'>
                    <legend className='sr-only'>בחרו חבילה</legend>
                    {PACKAGES.map(p => {
                        const on = pkgId === p.id
                        return (
                            <label
                                key={p.id}
                                className={`relative flex cursor-pointer flex-col rounded-3xl border-2 bg-white p-5 text-right transition-all ${
                                    on
                                        ? 'border-[#AA8840] shadow-lg shadow-[#AA8840]/15 -translate-y-0.5'
                                        : 'border-[#2b4a7a]/12 hover:border-[#AA8840]/50'
                                }`}
                            >
                                <input
                                    type='radio'
                                    name='pkg'
                                    value={p.id}
                                    checked={on}
                                    onChange={() => setPkgId(p.id)}
                                    className='sr-only'
                                />
                                {p.recommended && (
                                    <span className='absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-[#d3b46a] to-[#b8893d] px-3 py-1 text-[11px] font-bold text-white shadow'>
                                        {p.badge}
                                    </span>
                                )}
                                <h3 className='text-base font-[800] text-[#1a2540]'>{p.title}</h3>
                                <p className='mt-1 text-[13px] text-[#49577a]'>{p.subtitle}</p>
                                <div className='mt-4 flex items-baseline gap-2'>
                                    <span className='text-3xl font-[800] text-[#1a2540]'>{fmt(p.price)}</span>
                                    {p.strike && <span className='text-sm text-[#49577a] line-through decoration-2'>{fmt(p.strike)}</span>}
                                </div>
                                {p.savings && <p className='mt-1 text-[12px] font-bold text-[#25863d]'>{p.savings}</p>}
                                <ul className='mt-4 space-y-1.5 text-[13px] text-[#49577a]'>
                                    {p.includes.map(i => (
                                        <li key={i} className='flex items-start gap-1.5'>
                                            <span className='mt-0.5 font-bold text-[#AA8840]'>✓</span>
                                            <span>{i}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div
                                    className={`mt-4 rounded-xl border-2 py-2 text-center text-[12px] font-bold transition-colors ${
                                        on
                                            ? 'border-[#AA8840] bg-[#AA8840] text-white'
                                            : 'border-[#2b4a7a]/15 text-[#2b4a7a]'
                                    }`}
                                >
                                    {on ? 'נבחר ✓' : 'בחירה'}
                                </div>
                            </label>
                        )
                    })}
                </fieldset>

                {/* Add-ons */}
                {ADDONS.length > 0 && (
                    <div className='mt-8'>
                        <p className='text-sm font-bold text-[#1a2540]'>תוספות אופציונליות</p>
                        <div className='mt-3 space-y-2'>
                            {ADDONS.map(a => {
                                const on = addons.includes(a.id)
                                return (
                                    <label
                                        key={a.id}
                                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                                            on ? 'border-[#AA8840] bg-[#fdf9ef]' : 'border-[#2b4a7a]/15 bg-white hover:border-[#AA8840]/40'
                                        }`}
                                    >
                                        <input
                                            type='checkbox'
                                            checked={on}
                                            onChange={() =>
                                                setAddons(prev => (on ? prev.filter(id => id !== a.id) : [...prev, a.id]))
                                            }
                                            className='mt-1 h-4 w-4 accent-[#AA8840]'
                                        />
                                        <div className='flex-1'>
                                            <div className='flex items-baseline justify-between gap-3'>
                                                <p className='font-bold text-[#1a2540]'>{a.label}</p>
                                                <p className='shrink-0 font-bold text-[#AA8840]'>+ {fmt(a.price)}</p>
                                            </div>
                                            <p className='mt-0.5 text-[13px] text-[#49577a]'>{a.note}</p>
                                        </div>
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Total + CTA */}
                <div className='mt-8 rounded-2xl bg-[#1a2540] p-6 text-center text-white sm:p-8'>
                    <p className='text-sm text-white/70'>סה"כ לתשלום</p>
                    <p className='mt-1 text-4xl font-[800] text-white sm:text-5xl'>{fmt(total)}</p>
                    <p className='mt-1 text-[13px] text-white/60'>מחיר סופי — בלי מע"מ נוסף ובלי הפתעות</p>

                    <a
                        href={checkoutHref}
                        target={isWhatsApp ? '_blank' : '_self'}
                        rel='noopener noreferrer'
                        className='mt-5 inline-block rounded-2xl bg-gradient-to-b from-[#d3b46a] to-[#b8893d] px-8 py-4 text-base font-[800] text-white shadow-lg shadow-yellow-700/20 transition hover:scale-[1.02]'
                    >
                        {isWhatsApp ? '📱 סגירת ההזמנה בוואטסאפ ←' : '💳 לתשלום מאובטח ←'}
                    </a>

                    <div className='mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-white/70'>
                        <span className='inline-flex items-center gap-1.5'>
                            <svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='2'>
                                <circle cx='12' cy='12' r='9' opacity='0.5' />
                                <path d='M8 12.5l3 3 5-6' strokeLinecap='round' strokeLinejoin='round' />
                            </svg>
                            הספר הדיגיטלי מוכן תוך 3 ימי עסקים
                        </span>
                        <span className='inline-flex items-center gap-1.5'>
                            <svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='2'>
                                <path d='M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z' strokeLinecap='round' strokeLinejoin='round' />
                            </svg>
                            אחריות מלאה — לא מרוצים, כספכם חזרה
                        </span>
                        <span className='inline-flex items-center gap-1.5'>
                            <svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='2'>
                                <rect x='4' y='11' width='16' height='9' rx='2' /><path d='M8 11V7a4 4 0 018 0v4' strokeLinecap='round' />
                            </svg>
                            תשלום מאובטח
                        </span>
                    </div>
                </div>
            </div>
        </section>
    )
}
