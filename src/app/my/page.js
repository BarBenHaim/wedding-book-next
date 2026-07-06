'use client'

// /my — "האירועים שלי": every event the signed-in user owns, with
// one-tap access to the portal, the guest page and the digital book.
// Client-gated (Firestore rules allow public wedding reads; the query
// is by ownerId). Middleware keeps gating portal/admin themselves.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/lib/firebaseClient'
import { EVENT_TYPE_META } from '@/lib/onboarding'

const TYPE_FALLBACK = { label: 'אירוע', emoji: '📖' }

function titleOf(w) {
    if (w.customTitle) return w.customTitle
    if ((w.eventType || 'wedding') === 'wedding') {
        const a = (w.brideNameHe || w.brideName || '').trim()
        const b = (w.groomNameHe || w.groomName || '').trim()
        if (a || b) return [a, b].filter(Boolean).join(' & ')
    }
    const c = (w.celebrantNameHe || w.celebrantName || '').trim()
    return c || 'האירוע שלי'
}

function dateOf(w) {
    if (!w.weddingDate) return ''
    try {
        const d = typeof w.weddingDate === 'string' ? new Date(w.weddingDate + 'T12:00:00') : w.weddingDate.toDate?.()
        if (!d || Number.isNaN(d.getTime())) return ''
        return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
        return ''
    }
}

function createdMillis(w) {
    try { return w.createdAt?.toMillis?.() || 0 } catch { return 0 }
}

export default function MyEventsPage() {
    const router = useRouter()
    const [user, setUser] = useState(undefined) // undefined = resolving
    const [weddings, setWeddings] = useState(null)
    const [copied, setCopied] = useState('')

    useEffect(() => onAuthStateChanged(auth, u => setUser(u || null)), [])

    useEffect(() => {
        if (user === null) router.replace('/login')
    }, [user, router])

    useEffect(() => {
        if (!user) return
        let live = true
        getDocs(query(collection(db, 'weddings'), where('ownerId', '==', user.uid)))
            .then(snap => {
                if (!live) return
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                rows.sort((a, b) => createdMillis(b) - createdMillis(a))
                setWeddings(rows)
            })
            .catch(() => { if (live) setWeddings([]) })
        return () => { live = false }
    }, [user])

    const base = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), [])

    function guestLink(w) {
        return w.slug ? `${base}/w/${w.slug}?go=photo` : `${base}/wedding/${w.id}/photo`
    }
    function bookLink(w) {
        const t = Array.isArray(w.digitalTokens) && w.digitalTokens.length > 0 ? w.digitalTokens[0] : null
        return t ? `${base}/b/${t}` : null
    }
    function copy(key, text) {
        try {
            navigator.clipboard.writeText(text)
            setCopied(key)
            setTimeout(() => setCopied(''), 1500)
        } catch {}
    }
    async function logout() {
        try { await fetch('/api/logout', { method: 'POST' }) } catch {}
        try { await signOut(auth) } catch {}
        router.replace('/login')
    }

    return (
        <div className='my' dir='rtl'>
            <header className='head'>
                <img src='/logo-wt.png' alt='Wedding Tales' className='logo' />
                <h1>האירועים שלי</h1>
                <div className='headBtns'>
                    <Link href='/start' className='newBtn'>+ אירוע חדש</Link>
                    <button className='outBtn' onClick={logout}>התנתקות</button>
                </div>
            </header>

            <main className='list'>
                {(user === undefined || (user && weddings === null)) && <div className='hint'>טוענים…</div>}

                {user && Array.isArray(weddings) && weddings.length === 0 && (
                    <div className='empty'>
                        <span className='emptyEmoji'>📖</span>
                        <h2>עוד אין לכם ספר ברכות</h2>
                        <p>פותחים אחד בחינם תוך דקה — האורחים כבר ידאגו לשאר.</p>
                        <Link href='/start' className='cta'>פתחו ספר ברכות ←</Link>
                    </div>
                )}

                {user && Array.isArray(weddings) && weddings.map((w, i) => {
                    const meta = EVENT_TYPE_META[w.eventType] || TYPE_FALLBACK
                    const book = bookLink(w)
                    const guest = guestLink(w)
                    return (
                        <article className='card' key={w.id} style={{ animationDelay: `${Math.min(i * 70, 400)}ms` }}>
                            <div className='cardTop'>
                                <span className='chip'>{meta.emoji} {meta.label}</span>
                                {dateOf(w) && <span className='date'>{dateOf(w)}</span>}
                            </div>
                            <h2 className='title'>{titleOf(w)}</h2>
                            <div className='btns'>
                                <Link className='btn gold' href={`/wedding/${w.id}/portal`}>ניהול האירוע</Link>
                                {book && <a className='btn' href={book} target='_blank' rel='noopener noreferrer'>הספר הדיגיטלי</a>}
                                <button className='btn' onClick={() => copy(w.id, guest)}>
                                    {copied === w.id ? 'הקישור הועתק ✓' : 'העתקת קישור לאורחים'}
                                </button>
                            </div>
                        </article>
                    )
                })}
            </main>

            <style jsx>{`
                .my {
                    min-height: 100dvh;
                    background:
                        radial-gradient(800px 420px at 90% -60px, rgba(201, 164, 78, 0.13), transparent 60%),
                        linear-gradient(180deg, #fdfaf2, #f6efdf);
                    color: #241c10;
                    font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif;
                    padding-bottom: 60px;
                }
                .head { display: flex; align-items: center; gap: 14px; max-width: 760px; margin: 0 auto; padding: 22px 18px 8px; flex-wrap: wrap; }
                .logo { height: 38px; width: auto; }
                .head h1 { margin: 0; font-size: 22px; font-weight: 800; flex: 1; }
                .headBtns { display: flex; gap: 8px; }
                .newBtn {
                    background: linear-gradient(180deg, #d3b46a, #b8893d); color: #fff; text-decoration: none;
                    padding: 9px 16px; border-radius: 12px; font-weight: 800; font-size: 13.5px;
                    box-shadow: 0 10px 22px -10px rgba(170, 136, 64, 0.6);
                }
                .outBtn { background: none; border: 1.5px solid rgba(170, 136, 64, 0.35); color: #7c6027; border-radius: 12px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
                .list { max-width: 760px; margin: 0 auto; padding: 14px 18px 0; display: flex; flex-direction: column; gap: 14px; }
                .hint { text-align: center; color: #8a6f45; padding: 40px 0; }
                .empty {
                    text-align: center; background: rgba(255, 255, 255, 0.8); border: 1px solid rgba(201, 164, 78, 0.25);
                    border-radius: 22px; padding: 44px 22px; display: flex; flex-direction: column; align-items: center; gap: 8px;
                }
                .emptyEmoji { font-size: 44px; }
                .empty h2 { margin: 0; font-size: 20px; }
                .empty p { margin: 0 0 10px; color: #6d5a3d; font-size: 14px; }
                .cta {
                    background: linear-gradient(180deg, #d3b46a, #b8893d); color: #fff; text-decoration: none;
                    padding: 13px 26px; border-radius: 14px; font-weight: 800; font-size: 15px;
                    box-shadow: 0 14px 28px -12px rgba(170, 136, 64, 0.65);
                }
                .card {
                    background: rgba(255, 255, 255, 0.85); border: 1px solid rgba(201, 164, 78, 0.25);
                    border-radius: 20px; padding: 18px 18px 16px; box-shadow: 0 16px 40px -28px rgba(60, 44, 20, 0.4);
                    animation: cardIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                @keyframes cardIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
                .cardTop { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
                .chip {
                    background: rgba(201, 164, 78, 0.14); border: 1px solid rgba(201, 164, 78, 0.3);
                    color: #7c6027; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 700;
                }
                .date { font-size: 12px; color: #9a8665; }
                .title { margin: 10px 0 14px; font-size: 24px; font-weight: 800; }
                .btns { display: flex; flex-wrap: wrap; gap: 8px; }
                .btn {
                    border: 1.5px solid rgba(170, 136, 64, 0.35); background: #fffdf6; color: #7c6027;
                    border-radius: 12px; padding: 10px 15px; font-size: 13.5px; font-weight: 700; cursor: pointer;
                    text-decoration: none; font-family: inherit; transition: transform 0.14s ease, box-shadow 0.14s ease;
                }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px -12px rgba(60, 44, 20, 0.35); }
                .btn.gold { background: linear-gradient(180deg, #d3b46a, #b8893d); color: #fff; border-color: transparent; }
            `}</style>
        </div>
    )
}
