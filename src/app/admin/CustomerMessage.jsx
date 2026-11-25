'use client'
// The quick message to a customer: the book was shipped, did it arrive, everything about the book.
// One preview, two ways out: open WhatsApp with the text written (Bar sends from his own phone, as with
// every wa.me link in the admin) or send the same words as an e-mail from the company address.
// The wording lives in src/lib/customerMessages.js and is rendered on the server (/api/admin/email,
// ops quickPreview and quickSend), so what Bar sees here is what goes out.

import { useEffect, useRef, useState } from 'react'
import { QUICK_KINDS, QUICK_TEMPLATES } from '@/lib/customerMessages'

async function call(getToken, body) {
    const token = await getToken()
    const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    return data
}

/** The row of three buttons shown in the detail panel. */
export function CustomerMessageButtons({ wedding, onOpen, suggested }) {
    return (
        <div className='pt-1'>
            <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-2'>הודעה ללקוח</p>
            <div className='flex flex-wrap gap-2'>
                {QUICK_KINDS.map(k => (
                    <button
                        key={k}
                        onClick={() => onOpen(wedding, k)}
                        className='text-[12px] font-bold px-3 py-1.5 rounded-lg border transition-colors active:scale-95'
                        style={{
                            background: k === suggested ? '#1d1648' : '#fff',
                            color: k === suggested ? '#fff' : '#1d1648',
                            borderColor: k === suggested ? '#1d1648' : '#d9c58f',
                        }}
                    >
                        {QUICK_TEMPLATES[k].label}
                    </button>
                ))}
            </div>
        </div>
    )
}

export default function CustomerMessageModal({ wedding, kind: firstKind, getToken, onClose, onToast }) {
    const [kind, setKind] = useState(firstKind)
    const [note, setNote] = useState('')
    const [pv, setPv] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)
    const [sentTo, setSentTo] = useState('')
    const seq = useRef(0)

    async function load(k, n) {
        const mine = ++seq.current
        setLoading(true)
        setError('')
        try {
            const data = await call(getToken, { op: 'quickPreview', weddingId: wedding.id, kind: k, note: n })
            if (mine === seq.current) setPv(data)
        } catch (err) {
            if (mine === seq.current) setError(err.message || 'לא הצלחנו לטעון את ההודעה')
        } finally {
            if (mine === seq.current) setLoading(false)
        }
    }

    useEffect(() => {
        setSentTo('')
        load(kind, note)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, wedding.id])

    async function sendMail() {
        if (!pv?.hasEmail || sending) return
        if (!window.confirm(`לשלוח מייל "${pv.subject}" אל ${pv.to}?`)) return
        setSending(true)
        setError('')
        try {
            const r = await call(getToken, { op: 'quickSend', weddingId: wedding.id, kind, note })
            if (r.ok) {
                setSentTo(pv.to)
                onToast?.({ message: `המייל נשלח אל ${pv.to}`, type: 'success' })
            } else {
                setError('המייל לא נשלח')
            }
        } catch (err) {
            setError(err.message || 'השליחה נכשלה')
        } finally {
            setSending(false)
        }
    }

    async function copyText() {
        try {
            await navigator.clipboard.writeText(pv?.text || '')
            onToast?.({ message: 'הטקסט הועתק', type: 'success' })
        } catch {
            onToast?.({ message: 'לא הצלחנו להעתיק', type: 'error' })
        }
    }

    return (
        <div className='fixed inset-0 z-[95] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6' dir='rtl' onClick={onClose}>
            <div className='bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#AA8840]/20' onClick={e => e.stopPropagation()}>
                <div className='sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[#f0e8d4] px-5 py-3.5 flex items-center justify-between'>
                    <div>
                        <h3 className='font-bold text-[#1a1410] text-sm'>הודעה ללקוח</h3>
                        <p className='text-xs text-[#a89378]'>{wedding.ownerName || wedding.ownerEmail || wedding.id}</p>
                    </div>
                    <button onClick={onClose} className='text-sm px-3 py-1.5 rounded-lg bg-[#fbf6ec] text-[#7a6a52]'>סגור</button>
                </div>

                <div className='px-5 py-4 space-y-3.5'>
                    <div className='flex flex-wrap gap-2'>
                        {QUICK_KINDS.map(k => (
                            <button
                                key={k}
                                onClick={() => setKind(k)}
                                className='text-[12px] font-bold px-3 py-1.5 rounded-lg border'
                                style={{ background: k === kind ? '#1d1648' : '#fff', color: k === kind ? '#fff' : '#1d1648', borderColor: k === kind ? '#1d1648' : '#d9c58f' }}
                            >
                                {QUICK_TEMPLATES[k].label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <label className='text-[11px] font-semibold text-[#7a6a52]'>שורה להוספה (מספר מעקב, הערה). לא חובה</label>
                        <div className='flex gap-2 mt-1'>
                            <input
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') load(kind, note) }}
                                maxLength={600}
                                placeholder='למשל: מספר מעקב 123456'
                                className='flex-1 text-sm px-3 py-2 rounded-xl border border-[#ead9b3] bg-[#fdfaf3] outline-none focus:border-[#AA8840]'
                            />
                            <button onClick={() => load(kind, note)} className='text-[12px] font-bold px-3 py-2 rounded-xl border border-[#d9c58f] bg-white text-[#1d1648]'>עדכן</button>
                        </div>
                    </div>

                    {error && <p className='text-sm text-[#b42318] font-semibold'>{error}</p>}

                    <div className='rounded-2xl border border-[#ead9b3] bg-[#fdfaf3] p-4 min-h-[140px]'>
                        {loading && !pv ? (
                            <p className='text-sm text-[#a89378]'>טוען…</p>
                        ) : pv ? (
                            <>
                                <p className='text-[11px] font-semibold text-[#7a6a52] mb-1.5'>הנושא: {pv.subject}</p>
                                <pre className='whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#1d1648] font-sans' style={{ opacity: loading ? 0.5 : 1 }}>{pv.text}</pre>
                            </>
                        ) : null}
                    </div>

                    {pv && (
                        <p className='text-[11.5px] text-[#7a6a52]'>
                            {pv.hasEmail ? `מייל אל ${pv.to}` : 'אין כתובת מייל לאירוע'} · {pv.hasPhone ? `טלפון ${pv.phone}` : 'אין מספר טלפון תקין'}
                        </p>
                    )}

                    <div className='flex flex-wrap gap-2 pt-1'>
                        {pv?.hasPhone ? (
                            <a
                                href={pv.waLink}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='text-sm font-bold px-4 py-2.5 rounded-xl border'
                                style={{ background: 'rgba(37,211,102,0.12)', color: '#1b8f4d', borderColor: 'rgba(37,211,102,0.45)' }}
                            >
                                פתח בוואטסאפ
                            </a>
                        ) : (
                            <span className='text-sm px-4 py-2.5 rounded-xl border border-[#e3ddd0] text-[#b9ad98] bg-[#f7f4ee]'>פתח בוואטסאפ</span>
                        )}
                        <button
                            onClick={sendMail}
                            disabled={!pv?.hasEmail || sending}
                            className='text-sm font-bold px-4 py-2.5 rounded-xl text-white disabled:opacity-40'
                            style={{ background: '#1d1648' }}
                        >
                            {sending ? 'שולח…' : sentTo ? 'שלח שוב במייל' : 'שלח במייל'}
                        </button>
                        <button onClick={copyText} disabled={!pv} className='text-sm font-bold px-4 py-2.5 rounded-xl border border-[#d9c58f] bg-white text-[#1d1648] disabled:opacity-40'>העתק טקסט</button>
                    </div>
                    {sentTo && <p className='text-sm font-semibold text-[#1f7a3e]'>נשלח אל {sentTo}</p>}
                </div>
            </div>
        </div>
    )
}
