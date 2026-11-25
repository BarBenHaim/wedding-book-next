'use client'
// The free sign samples of leads: what waits to be drawn on Lord's computer,
// what waits for his approval, and the switch of the offer.

import Button from './BoardButton'
import c from './customers.module.css'

const STATUS = {
    receiving: 'התמונה בדרך',
    pending: 'מחכה לציור במחשב',
    failed: 'התמונה לא נשמרה',
    ready: 'מחכה לאישור שלך',
    sending: 'נשלח עכשיו',
}

export default function SignSamples({ samples, busy, onAct }) {
    if (!samples) return null
    const on = samples.enabled === true
    const items = samples.items || []
    return (
        <section className={c.card}>
            <div className={c.head}>
                <i className={c.dot} data-state={on ? 'on' : 'off'} />
                <b>דוגמאות שלט ללידים: {on ? 'הבוט מציע' : 'כבוי'}</b>
                <span>הציור נעשה במחשב שלך: כתוב ל-Claude &quot;יש דוגמאות?&quot;</span>
                <Button
                    primary={!on} disabled={busy}
                    onClick={() => onAct({ op: 'sampleSwitch', enabled: !on }, on
                        ? 'להפסיק להציע דוגמאות ללידים?'
                        : 'להתחיל להציע דוגמת שלט ללידים של בר ובת מצווה?')}
                >{on ? 'כבה' : 'הפעל'}</Button>
            </div>
            {samples.items === null && <p role='alert' className={c.late}>לא הצלחתי לקרוא את הדוגמאות. נסה לרענן.</p>}
            {items.length > 0 && (
                <ul className={c.grid}>
                    {items.map(item => (
                        <li key={item.id} className={c.item}>
                            {item.previewUrl && (
                                <a href={item.previewUrl} target='_blank' rel='noopener noreferrer'>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.previewUrl} alt={item.status === 'ready' ? 'הדוגמה לאישור' : 'התמונה שהליד שלח'} className={c.picture} />
                                </a>
                            )}
                            <b className={c.name}>{item.name || `מספר שמסתיים ב-${String(item.phone).slice(-4)}`}</b>
                            <small className={c.small}>{STATUS[item.status] || item.status}</small>
                            {item.errorCode === 'SEND_FAILED' && <small className={c.late}>השליחה נכשלה. אפשר לנסות שוב.</small>}
                            {item.status === 'ready' && !item.windowOpen && <small className={c.late}>עברו 24 שעות מההודעה של הליד. צריך לשלוח ידנית.</small>}
                            <div className={c.actions}>
                                {item.status === 'ready' && item.windowOpen && (
                                    <Button primary disabled={busy} onClick={() => onAct({ op: 'sample', id: item.id, decision: 'send' }, 'לשלוח את הדוגמה הזאת לליד?')}>אשר ושלח</Button>
                                )}
                                {item.status === 'ready' && (
                                    <Button disabled={busy} onClick={() => onAct({ op: 'sample', id: item.id, decision: 'manual' }, 'שלחת את הדוגמה בעצמך? היא תוסר מהרשימה ולא תישלח שוב.')}>שלחתי ידנית</Button>
                                )}
                                <Button href={`https://wa.me/${item.phone}`}>וואטסאפ</Button>
                                {item.status !== 'sending' && (
                                    <Button disabled={busy} onClick={() => onAct({ op: 'sample', id: item.id, decision: 'reject' }, 'לבטל את הדוגמה הזאת? היא לא תישלח.')}>בטל</Button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
