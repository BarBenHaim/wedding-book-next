'use client'
// The list of people and the actions on it. Reads /api/admin/people again every
// few minutes, when the tab is opened and after every action.

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../ui/api'
import { useAdmin } from '../ui/Shell'
import { REFUSALS } from '../today/TaskWindow'

const REFRESH_MS = 3 * 60 * 1000

export default function usePeople() {
    const [data, setData] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [updatedAt, setUpdatedAt] = useState('')

    const load = useCallback(async () => {
        setBusy(true)
        try {
            setData(await adminApi('/api/admin/people'))
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

    // One action, asked first when it has a question. Marks and approvals go to
    // the customer board's route; lead actions pass their own.
    const act = useCallback(async (body, question, url = '/api/admin/customers', method = 'POST') => {
        if (question && !window.confirm(question)) return false
        setBusy(true)
        setError('')
        try {
            await adminApi(url, body, method)
            await load()
            return true
        } catch (err) {
            // Loading clears the message, so the state is refreshed first.
            await load()
            setError(REFUSALS[err.message] || `הפעולה לא נשמרה: ${err.message}`)
            return false
        } finally {
            setBusy(false)
        }
    }, [load])

    return { data, busy, error, updatedAt, load, act }
}
