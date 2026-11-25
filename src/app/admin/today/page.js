'use client'

// /admin/today: what waits for Lord right now, in one screen. Reads
// /api/admin/today; approvals go through /api/admin/customers, which owns the
// send rules.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { adminApi as call } from '../ui/api'
import { useAdmin } from '../ui/Shell'
import TodayView from './TodayView'
import { REFUSALS } from './TaskWindow'

const REFRESH_MS = 3 * 60 * 1000

function Screen() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    // Kept apart from loading: a refresh in the middle of an action must not
    // turn the buttons back on.
    const [acting, setActing] = useState(false)
    const running = useRef(false)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setData(await call('/api/admin/today'))
            setError('')
        } catch (err) {
            setError(`לא הצלחנו לטעון: ${err.message}. נסה לרענן.`)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
        const timer = setInterval(load, REFRESH_MS)
        const onShow = () => { if (document.visibilityState === 'visible') load() }
        document.addEventListener('visibilitychange', onShow)
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow) }
    }, [load])

    // A change made in the bot window shows here at once.
    const { onRefresh } = useAdmin()
    useEffect(() => onRefresh(load), [onRefresh, load])

    // One action at a time, asked first when it has a question.
    const act = async (body, question, url = '/api/admin/customers', method = 'POST', failed = 'הפעולה לא נשמרה') => {
        if (running.current || (question && !window.confirm(question))) return false
        running.current = true
        setActing(true)
        try {
            await call(url, body, method)
            await load()
            return true
        } catch (err) {
            // Loading clears the message, so the state is refreshed first.
            await load()
            setError(REFUSALS[err.message] || `${failed}: ${err.message}`)
            return false
        } finally {
            running.current = false
            setActing(false)
        }
    }

    const approve = task => {
        const sample = task.kind === 'sample'
        return act(
            sample ? { op: 'sample', id: task.id, decision: 'send' } : { op: 'draft', number: task.id, decision: 'send' },
            sample ? 'לשלוח את הדוגמה הזאת לליד?' : `לשלוח את התשובה?\n\n${task.detail}`,
            '/api/admin/customers', 'POST', 'לא נשלח',
        )
    }
    const busy = loading || acting

    return <TodayView data={data} busy={busy} error={error} onApprove={approve} onRefresh={load} onAct={act} api={call} />
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
