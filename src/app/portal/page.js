'use client'
// /portal — the customer's single entry link ("קישור אחד לכולם").
//
// One constant URL the studio sends to EVERY customer: enter the mobile
// number attached to your event → land on your portal (the management
// home: blessings count, sharing, design, everything). If the phone owns
// several events, pick one. Phone-as-credential is an intentional owner
// decision — simple like a reservation lookup.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PortalEntryPage() {
    const router = useRouter()
    const [phone, setPhone] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [events, setEvents] = useState(null)

    async function lookup(e) {
        e?.preventDefault?.()
        if (busy) return
        setErr('')
        const digits = phone.replace(/\D/g, '')
        if (digits.length < 9) {
            setErr('מספר לא תקין — הזינו את הנייד ששויך לאירוע (למשל 0521234567)')
            return
        }
        setBusy(true)
        try {
            const res = await fetch('/api/my-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json.ok) {
                setErr(res.status === 404
                    ? 'לא מצאנו אירוע עם המספר הזה — ודאו שזה הנייד שנמסר לסטודיו, או כתבו לנו בוואטסאפ'
                    : 'משהו השתבש — נסו שוב עוד רגע')
                return
            }
            if (json.events.length === 1) {
                router.push(`/wedding/${json.events[0].id}/portal`)
            } else {
                setEvents(json.events)
            }
        } catch {
            setErr('משהו השתבש — נסו שוב עוד רגע')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div dir='rtl' style={{
            minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse at top, #fdf8ee 0%, #f4ecdb 100%)',
            fontFamily: "'Heebo', system-ui, sans-serif", padding: 16,
        }}>
            <div style={{
                width: '100%', maxWidth: 420, background: 'rgba(255,253,246,0.95)',
                border: '1px solid rgba(201,164,78,0.4)', borderRadius: 26, padding: '34px 26px',
                boxShadow: '0 24px 60px -20px rgba(60,44,20,0.35)', textAlign: 'center',
            }}>
                <img src='/logo-wt.png' alt='Wedding Tales' style={{ width: 72, margin: '0 auto 10px' }} />
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#3b2a14' }}>הספר שלי</h1>
                <p style={{ margin: '8px 0 22px', fontSize: 14, lineHeight: 1.6, color: '#8a6f45' }}>
                    הזינו את מספר הנייד ששויך לאירוע — ותיכנסו ישר לעמוד הניהול שלכם
                </p>

                {!events ? (
                    <form onSubmit={lookup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <input
                            type='tel'
                            inputMode='tel'
                            autoComplete='tel'
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder='מספר נייד — למשל 0521234567'
                            style={{
                                width: '100%', boxSizing: 'border-box', padding: '14px 16px',
                                borderRadius: 14, border: '1.5px solid #ead9b3', fontSize: 17,
                                textAlign: 'center', direction: 'ltr', outline: 'none', background: '#fff',
                            }}
                        />
                        <button
                            type='submit'
                            disabled={busy}
                            style={{
                                padding: '14px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(180deg,#eed9a4,#c9a44e 55%,#a8843a)',
                                color: '#241a0d', fontWeight: 800, fontSize: 16.5, opacity: busy ? 0.7 : 1,
                            }}
                        >
                            {busy ? 'רגע…' : 'כניסה לספר שלי ←'}
                        </button>
                        {err ? <p style={{ margin: 0, fontSize: 13, color: '#b0553f', lineHeight: 1.5 }}>{err}</p> : null}
                    </form>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#5c4a2f', fontWeight: 700 }}>נמצאו כמה אירועים — לאן ניכנס?</p>
                        {events.map(ev => (
                            <button
                                key={ev.id}
                                onClick={() => router.push(`/wedding/${ev.id}/portal`)}
                                style={{
                                    padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
                                    border: '1.5px solid rgba(201,164,78,0.5)', background: '#fff',
                                    color: '#3b2a14', fontWeight: 700, fontSize: 15,
                                }}
                            >
                                {ev.title}
                            </button>
                        ))}
                    </div>
                )}

                <p style={{ margin: '20px 0 0', fontSize: 11.5, color: 'rgba(110,88,55,0.7)' }}>
                    לא מצליחים להיכנס? כתבו לנו בוואטסאפ ונעזור מיד 💛
                </p>
            </div>
        </div>
    )
}
