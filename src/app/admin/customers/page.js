'use client'

// /admin/customers: where every customer stands and what to do next.
// Refreshes on its own every few minutes and when the tab is opened again.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIdToken, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import CustomerBoardView from './CustomerBoardView'

const REFRESH_MS = 3 * 60 * 1000

async function api(method, body) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch('/api/admin/customers', {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { providerCode: data.providerCode })
    return data
}

const SAMPLE_ERRORS = {
    WINDOW_CLOSED: 'עברו 24 שעות מההודעה של הליד. צריך לשלוח לו ידנית.',
    LEAD_CLOSED: 'השיחה עם הליד סגורה, ולכן לא נשלח.',
    SAMPLE_NOT_READY: 'הדוגמה כבר נשלחה או עוד לא מוכנה. רענן.',
    SAMPLE_NOT_FOUND: 'הדוגמה לא נמצאה. רענן.',
    SEND_FAILED: 'וואטסאפ לא קיבלה את השליחה. אפשר לנסות שוב.',
}

const DRAFT_ERRORS = {
    DRAFT_NOT_FOUND: 'הבקשה לא נמצאה. רענן.',
    DRAFT_NOT_PENDING: 'הבקשה כבר טופלה או הוחלפה בחדשה.',
    WINDOW_CLOSED: 'עברו 24 שעות מההודעה של הלקוח. ענה לו ידנית.',
    NEWER_MESSAGE: 'הלקוח כתב שוב אחרי הטיוטה. חכה לטיוטה החדשה או ענה ידנית.',
    NOTHING_TO_SEND: 'אין מה לשלוח. כתוב תשובה בתיבה.',
    SEND_FAILED: 'וואטסאפ לא קיבלה את השליחה. אפשר לנסות שוב.',
}

// Meta's answers to a test send, in words.
function testError(error) {
    if (error.providerCode === 132001) return 'התבנית עוד לא קיימת או לא אושרה ב-Meta.'
    if (error.providerCode === 131042) return 'בעיה באמצעי התשלום בחשבון הוואטסאפ ב-Meta.'
    if (error.message === 'PHONE_MISSING') return 'לא מוגדר מספר טלפון שלך במערכת.'
    return `ההודעה לא נשלחה (${error.providerCode || error.message}).`
}

function Board() {
    const [data, setData] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [updatedAt, setUpdatedAt] = useState('')

    const load = useCallback(async () => {
        setBusy(true)
        try {
            setData(await api('GET'))
            setUpdatedAt(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }))
            setError('')
        } catch (err) {
            setError(`לא הצלחנו לטעון את הלקוחות: ${err.message}. נסה לרענן.`)
        } finally {
            setBusy(false)
        }
    }, [])

    useEffect(() => {
        load()
        const timer = setInterval(load, REFRESH_MS)
        const onShow = () => { if (document.visibilityState === 'visible') load() }
        document.addEventListener('visibilitychange', onShow)
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow) }
    }, [load])

    const act = async body => {
        setBusy(true)
        setError('')
        try {
            const result = await api('POST', body)
            if (body.op === 'test') window.alert('הודעת הבדיקה נשלחה לטלפון שלך. ודא שהיא הגיעה.')
            if (body.op === 'claudeCheck') window.alert(result.check.message)
            await load()
        } catch (err) {
            // Loading clears the message, so the state is refreshed first.
            if (body.op === 'sample' || body.op === 'draft') await load()
            const words = body.op === 'draft' ? DRAFT_ERRORS[err.message] : SAMPLE_ERRORS[err.message]
            setError(body.op === 'test' ? testError(err) : words || `הפעולה לא נשמרה: ${err.message}`)
        } finally {
            setBusy(false)
        }
    }

    return <CustomerBoardView data={data} busy={busy} error={error} updatedAt={updatedAt} onAct={act} onRefresh={load} />
}

function SuperAdminGate({ children }) {
    const router = useRouter()
    const [state, setState] = useState('checking')
    useEffect(() => onAuthStateChanged(auth, user => {
        if (!user) {
            router.replace('/login')
            return
        }
        setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
    }), [router])

    if (state === 'allowed') return children
    return (
        <div dir='rtl' className='min-h-screen flex items-center justify-center text-sm text-[#7a6a52]'>
            {state === 'denied' ? 'אין לחשבון הזה גישה לעמוד.' : 'בודק הרשאה…'}
        </div>
    )
}

export default function CustomersPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <Board />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
