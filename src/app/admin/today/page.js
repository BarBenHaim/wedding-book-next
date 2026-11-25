'use client'

// /admin/today: what waits for Lord right now, in one screen. Reads
// /api/admin/today; approvals go through /api/admin/customers, which owns the
// send rules.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIdToken, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import TodayView from './TodayView'

const REFRESH_MS = 3 * 60 * 1000
const REFUSALS = {
    WINDOW_CLOSED: 'עברו 24 שעות מההודעה. צריך לענות ידנית.',
    NEWER_MESSAGE: 'נכתבה הודעה חדשה אחרי הטיוטה. חכה לטיוטה החדשה.',
    DRAFT_NOT_PENDING: 'הבקשה כבר טופלה.',
    SAMPLE_NOT_READY: 'הדוגמה כבר נשלחה או עוד לא מוכנה.',
    LEAD_CLOSED: 'השיחה סגורה, ולכן לא נשלח.',
    SEND_FAILED: 'וואטסאפ לא קיבלה את השליחה. אפשר לנסות שוב.',
}

async function call(url, body) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
}

function Screen() {
    const [data, setData] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setBusy(true)
        try {
            setData(await call('/api/admin/today'))
            setError('')
        } catch (err) {
            setError(`לא הצלחנו לטעון: ${err.message}. נסה לרענן.`)
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

    const approve = async task => {
        const sample = task.kind === 'sample'
        const question = sample ? 'לשלוח את הדוגמה הזאת לליד?' : `לשלוח את התשובה?\n\n${task.detail}`
        if (!window.confirm(question)) return
        setBusy(true)
        try {
            await call('/api/admin/customers', sample
                ? { op: 'sample', id: task.id, decision: 'send' }
                : { op: 'draft', number: task.id, decision: 'send' })
            await load()
        } catch (err) {
            // Loading clears the message, so the state is refreshed first.
            await load()
            setError(REFUSALS[err.message] || `לא נשלח: ${err.message}`)
        } finally {
            setBusy(false)
        }
    }

    return <TodayView data={data} busy={busy} error={error} onApprove={approve} onRefresh={load} />
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

export default function TodayPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <Screen />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
