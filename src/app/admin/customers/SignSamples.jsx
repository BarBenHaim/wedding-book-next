'use client'
// The free sign samples of leads: what waits to be drawn on Lord's computer,
// what waits for his approval, and the switch of the offer.

const INK = '#3d2e1a'
const SOFT = '#7a6a52'
const LINE = '#ead9b3'

const STATUS = {
    receiving: 'התמונה בדרך',
    pending: 'מחכה לציור במחשב',
    failed: 'התמונה לא נשמרה',
    ready: 'מחכה לאישור שלך',
    sending: 'נשלח עכשיו',
}

function Action({ children, onClick, disabled, primary = false }) {
    return (
        <button
            type='button' onClick={onClick} disabled={disabled}
            className='text-[12px] font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap active:scale-95 disabled:opacity-40'
            style={primary ? { background: INK, color: '#fff', borderColor: INK } : { background: '#fff', color: INK, borderColor: '#d9c58f' }}
        >{children}</button>
    )
}

export default function SignSamples({ samples, busy, onAct }) {
    if (!samples) return null
    const on = samples.enabled === true
    const items = samples.items || []
    return (
        <section className='rounded-2xl bg-white border p-4 space-y-3' style={{ borderColor: LINE }}>
            <div className='flex flex-wrap items-center gap-3'>
                <span className='w-2.5 h-2.5 rounded-full' style={{ background: on ? '#1f7a3e' : '#b9ad98' }} />
                <b className='text-sm'>דוגמאות שלט ללידים: {on ? 'הבוט מציע' : 'כבוי'}</b>
                <span className='text-[12px] flex-1 min-w-[200px]' style={{ color: SOFT }}>הציור נעשה במחשב שלך: כתוב ל-Claude &quot;יש דוגמאות?&quot;</span>
                <Action
                    primary={!on} disabled={busy}
                    onClick={() => onAct({ op: 'sampleSwitch', enabled: !on }, on
                        ? 'להפסיק להציע דוגמאות ללידים?'
                        : 'להתחיל להציע דוגמת שלט ללידים של בר ובת מצווה?')}
                >{on ? 'כבה' : 'הפעל'}</Action>
            </div>
            {samples.items === null && <p role='alert' className='text-[12px]' style={{ color: '#b42318' }}>לא הצלחתי לקרוא את הדוגמאות. נסה לרענן.</p>}
            {items.length > 0 && (
                <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                    {items.map(item => (
                        <li key={item.id} className='rounded-xl border p-3 space-y-2' style={{ borderColor: LINE }}>
                            {item.previewUrl && (
                                <a href={item.previewUrl} target='_blank' rel='noopener noreferrer'>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.previewUrl} alt={item.status === 'ready' ? 'הדוגמה לאישור' : 'התמונה שהליד שלח'} className='w-full max-h-72 object-contain rounded-lg' style={{ background: '#f8f4ec' }} />
                                </a>
                            )}
                            <div className='text-[13px] font-bold'>{item.name || `מספר שמסתיים ב-${String(item.phone).slice(-4)}`}</div>
                            <div className='text-[12px]' style={{ color: SOFT }}>{STATUS[item.status] || item.status}</div>
                            {item.errorCode === 'SEND_FAILED' && <div className='text-[12px]' style={{ color: '#b42318' }}>השליחה נכשלה. אפשר לנסות שוב.</div>}
                            {item.status === 'ready' && !item.windowOpen && <div className='text-[12px]' style={{ color: '#b42318' }}>עברו 24 שעות מההודעה של הליד. צריך לשלוח ידנית.</div>}
                            <div className='flex flex-wrap gap-1.5'>
                                {item.status === 'ready' && item.windowOpen && (
                                    <Action primary disabled={busy} onClick={() => onAct({ op: 'sample', id: item.id, decision: 'send' }, 'לשלוח את הדוגמה הזאת לליד?')}>אשר ושלח</Action>
                                )}
                                {item.status === 'ready' && (
                                    <Action disabled={busy} onClick={() => onAct({ op: 'sample', id: item.id, decision: 'manual' }, 'שלחת את הדוגמה בעצמך? היא תוסר מהרשימה ולא תישלח שוב.')}>שלחתי ידנית</Action>
                                )}
                                <a href={`https://wa.me/${item.phone}`} target='_blank' rel='noopener noreferrer' className='text-[12px] font-bold px-3 py-1.5 rounded-lg border' style={{ borderColor: '#d9c58f' }}>וואטסאפ</a>
                                {item.status !== 'sending' && (
                                    <Action disabled={busy} onClick={() => onAct({ op: 'sample', id: item.id, decision: 'reject' }, 'לבטל את הדוגמה הזאת? היא לא תישלח.')}>בטל</Action>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
