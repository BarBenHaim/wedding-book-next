'use client'

// Guest-facing "help me write a blessing" assistant. Shown under the
// blessing field on the /photo page. Two modes:
//   • ideas   — a couple of quick inputs (relationship, a memory/wish, tone)
//               → 2-3 fresh drafts to pick from.
//   • improve — polishes whatever the guest already typed.
// Calls /api/blessing-assist (Claude). Themed via props so it blends into
// each event's guest page; bilingual (he default, en for everything else).

import { useState } from 'react'

const STRINGS = {
    he: {
        button: 'עזרה בכתיבת ברכה',
        title: 'עוזר הברכות',
        sub: 'נעזור לכם לכתוב משהו אישי ומרגש',
        tabIdeas: 'תנו לי רעיון',
        tabImprove: 'שפרו את שלי',
        relLabel: 'מה הקשר שלכם?',
        rel: ['חבר/ה', 'משפחה', 'קולגה', 'בן/בת זוג'],
        memLabel: 'זיכרון משותף, משהו מיוחד בהם, או מה מאחלים (לא חובה)',
        memPh: 'למשל: הטיול שלנו ביוון · תמיד גורמים לכולם לצחוק · מאחל המון בריאות',
        toneLabel: 'סגנון',
        tones: ['חם', 'שמח', 'מרגש', 'קליל'],
        generate: 'צרו לי ברכות',
        improveCta: 'שפרו את הברכה שלי',
        improveEmpty: 'כתבו קודם כמה מילים בשדה הברכה, ואני אלטש אותן.',
        useThis: 'השתמשו בזה',
        regen: 'עוד אפשרויות',
        loading: 'רגע, כותב…',
        close: 'סגירה',
        pick: 'בחרו ברכה והיא תיכנס לשדה — תמיד אפשר לערוך אחר כך',
    },
    en: {
        button: 'Help me write',
        title: 'Blessing helper',
        sub: 'We’ll help you write something personal',
        tabIdeas: 'Give me ideas',
        tabImprove: 'Improve mine',
        relLabel: 'How do you know them?',
        rel: ['Friend', 'Family', 'Colleague', 'Partner'],
        memLabel: 'A shared memory, something special about them, or a wish (optional)',
        memPh: 'e.g. our trip to Greece · always makes everyone laugh · wishing health',
        toneLabel: 'Tone',
        tones: ['Warm', 'Joyful', 'Touching', 'Light'],
        generate: 'Write blessings for me',
        improveCta: 'Improve my blessing',
        improveEmpty: 'Write a few words in the blessing field first, and I’ll polish them.',
        useThis: 'Use this',
        regen: 'More options',
        loading: 'Writing…',
        close: 'Close',
        pick: 'Pick one and it fills the field — you can always edit it after',
    },
}

export default function BlessingAssist({
    weddingId,
    draft = '',
    onUse,
    locale = 'he',
    theme = {},
}) {
    const t = STRINGS[locale === 'he' ? 'he' : 'en']
    const dir = locale === 'he' ? 'rtl' : 'ltr'
    const accent = theme.accent || '#c9a44e'
    const titleColor = theme.title || '#1a1410'
    const subColor = theme.sub || '#7a6a52'
    const inputBg = theme.inputBg || '#fbf6ec'
    const inputBorder = theme.inputBorder || '#ead9b3'
    const textColor = theme.text || '#1a1410'

    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState('ideas')
    const [relationship, setRelationship] = useState('')
    const [memory, setMemory] = useState('')
    const [tone, setTone] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [results, setResults] = useState([])

    async function run(mode) {
        setLoading(true)
        setError('')
        setResults([])
        try {
            const res = await fetch('/api/blessing-assist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId, locale, mode, draft, relationship, memory, tone }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'שגיאה')
            const list = Array.isArray(data.suggestions) ? data.suggestions.filter(Boolean) : []
            if (!list.length) throw new Error('לא התקבלו הצעות, נסו שוב.')
            setResults(list)
        } catch (e) {
            setError(e?.message || 'שגיאה בעוזר הכתיבה.')
        } finally {
            setLoading(false)
        }
    }

    function pick(text) {
        onUse?.(text)
        setOpen(false)
        setResults([])
    }

    const chip = (label, active, onClick) => (
        <button
            key={label}
            type='button'
            onClick={onClick}
            className='px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all'
            style={{
                background: active ? accent : 'transparent',
                color: active ? '#fff' : textColor,
                border: `1px solid ${active ? accent : inputBorder}`,
            }}
        >
            {label}
        </button>
    )

    return (
        <>
            <button
                type='button'
                onClick={() => { setOpen(true); setResults([]); setError('') }}
                className='inline-flex items-center gap-1.5 mt-1.5 text-[12.5px] font-bold transition-opacity hover:opacity-80'
                style={{ color: accent }}
            >
                <svg viewBox='0 0 24 24' className='w-[15px] h-[15px]' fill='currentColor'>
                    <path d='M12 2l1.9 4.8L19 8.7l-4.1 3.2L16 17l-4-2.8L8 17l1.1-5.1L5 8.7l5.1-1.9L12 2z' />
                </svg>
                {t.button}
            </button>

            {open && (
                <div
                    dir={dir}
                    className='fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4'
                    onClick={() => setOpen(false)}
                >
                    <div
                        className='bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-auto'
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className='sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between'>
                            <div>
                                <h3 className='text-[17px] font-black' style={{ color: titleColor }}>{t.title}</h3>
                                <p className='text-[12px]' style={{ color: subColor }}>{t.sub}</p>
                            </div>
                            <button onClick={() => setOpen(false)} className='text-gray-400 hover:text-gray-700 text-2xl leading-none -mt-1'>×</button>
                        </div>

                        {/* Tabs */}
                        <div className='flex gap-2 px-5 pt-3'>
                            {[['ideas', t.tabIdeas], ['improve', t.tabImprove]].map(([id, label]) => (
                                <button
                                    key={id}
                                    onClick={() => { setTab(id); setResults([]); setError('') }}
                                    className='flex-1 py-2 rounded-xl text-[13px] font-bold transition-all'
                                    style={{
                                        background: tab === id ? accent : '#f4f1ea',
                                        color: tab === id ? '#fff' : titleColor,
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className='px-5 py-4'>
                            {/* Inputs */}
                            {tab === 'ideas' ? (
                                <div className='space-y-3.5'>
                                    <div>
                                        <p className='text-[12.5px] font-semibold mb-1.5' style={{ color: titleColor }}>{t.relLabel}</p>
                                        <div className='flex flex-wrap gap-1.5'>
                                            {t.rel.map(r => chip(r, relationship === r, () => setRelationship(relationship === r ? '' : r)))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className='text-[12.5px] font-semibold mb-1.5' style={{ color: titleColor }}>{t.memLabel}</p>
                                        <textarea
                                            value={memory}
                                            onChange={e => setMemory(e.target.value)}
                                            placeholder={t.memPh}
                                            maxLength={300}
                                            className='w-full rounded-xl outline-none resize-none leading-snug text-[15px] p-3'
                                            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor, height: '70px' }}
                                        />
                                    </div>
                                    <div>
                                        <p className='text-[12.5px] font-semibold mb-1.5' style={{ color: titleColor }}>{t.toneLabel}</p>
                                        <div className='flex flex-wrap gap-1.5'>
                                            {t.tones.map(tn => chip(tn, tone === tn, () => setTone(tone === tn ? '' : tn)))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => run('ideas')}
                                        disabled={loading}
                                        className='w-full py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-60'
                                        style={{ background: accent }}
                                    >
                                        {loading ? t.loading : t.generate}
                                    </button>
                                </div>
                            ) : (
                                <div className='space-y-3'>
                                    {draft.trim().length < 2 ? (
                                        <p className='text-[13px] text-center py-3' style={{ color: subColor }}>{t.improveEmpty}</p>
                                    ) : (
                                        <>
                                            <div className='rounded-xl p-3 text-[13px]' style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}>
                                                {draft}
                                            </div>
                                            <button
                                                onClick={() => run('improve')}
                                                disabled={loading}
                                                className='w-full py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-60'
                                                style={{ background: accent }}
                                            >
                                                {loading ? t.loading : t.improveCta}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {error && (
                                <p className='mt-3 text-[12.5px] text-center' style={{ color: '#b3582e' }}>{error}</p>
                            )}

                            {/* Results */}
                            {results.length > 0 && (
                                <div className='mt-4 space-y-2.5'>
                                    <p className='text-[11.5px] text-center' style={{ color: subColor }}>{t.pick}</p>
                                    {results.map((s, i) => (
                                        <div key={i} className='rounded-xl p-3' style={{ background: '#fff', border: `1px solid ${inputBorder}` }}>
                                            <p className='text-[14px] leading-relaxed mb-2.5' style={{ color: textColor }}>{s}</p>
                                            <button
                                                onClick={() => pick(s)}
                                                className='w-full py-2 rounded-lg text-[13px] font-bold'
                                                style={{ background: accent, color: '#fff' }}
                                            >
                                                {t.useThis}
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => run(tab)}
                                        disabled={loading}
                                        className='w-full py-2 rounded-lg text-[12.5px] font-semibold disabled:opacity-60'
                                        style={{ color: accent, border: `1px solid ${inputBorder}` }}
                                    >
                                        {loading ? t.loading : t.regen}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
