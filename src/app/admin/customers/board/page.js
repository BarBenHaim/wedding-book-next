'use client'

// /admin/customers/board: the message switches, the test send, the week's
// messages and the approvals. The daily list is /admin/customers.
// Refreshes on its own every few minutes and when the tab is opened again.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import SuperAdminOnly from '../../ui/SuperAdminGate'
import { useAdmin } from '../../ui/Shell'
import CustomerBoardView from '../CustomerBoardView'

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
    const router = useRouter()

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

    // A change made in the bot window shows here at once.
    const { onRefresh } = useAdmin()
    useEffect(() => onRefresh(load), [onRefresh, load])

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

    // A name opens that person on the list.
    const open = row => router.push(`/admin/customers?id=${encodeURIComponent(row.id)}`)
    return <CustomerBoardView data={data} busy={busy} error={error} updatedAt={updatedAt} onAct={act} onRefresh={load} onOpen={open} />
}

export default function CustomerBoardPage() {
    return (
        <SuperAdminOnly>
            <Board />
        </SuperAdminOnly>
    )
}
