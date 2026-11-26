'use client'

// /admin/customers, the home screen: what waits for an approval, then one list
// of people, leads and books together (rules: lib/people.js). The bot and the
// month's spend sit in the heading. The message switches live on
// /admin/customers/board.

import { useCallback, useEffect, useState } from 'react'
import { Coins, MessageCircle } from 'lucide-react'
import SuperAdminOnly from '../ui/SuperAdminGate'
import { adminApi } from '../ui/api'
import { useAdmin } from '../ui/Shell'
import k from '../ui/kit.module.css'
import { dollars } from '../today/SpendWindow'
import TaskWindow from '../today/TaskWindow'
import PeopleView from './PeopleView'
import PersonWindow from './PersonWindow'
import Waiting, { approval } from './Waiting'
import { markQuestion } from './personParts'
import usePeople from './usePeople'

const REFRESH_MS = 3 * 60 * 1000

// The approvals, the bot and the spend. One unread read must not blank the list
// of people, so it is fetched apart from it.
function useDay() {
    const [day, setDay] = useState(null)
    const [dayError, setDayError] = useState('')
    const loadDay = useCallback(async () => {
        try {
            setDay(await adminApi('/api/admin/today'))
            setDayError('')
        } catch (err) {
            setDayError(`לא הצלחנו לקרוא את מה שממתין לאישור: ${err.message}.`)
        }
    }, [])
    useEffect(() => {
        loadDay()
        const timer = setInterval(loadDay, REFRESH_MS)
        return () => clearInterval(timer)
    }, [loadDay])
    const { onRefresh } = useAdmin()
    useEffect(() => onRefresh(loadDay), [onRefresh, loadDay])
    return { day, dayError, loadDay }
}

function Home() {
    const { data, busy, error, updatedAt, load, act } = usePeople()
    const { day, dayError, loadDay } = useDay()
    const { openBot, openSpend } = useAdmin()
    // The key of the person whose window is open, and the task whose window is.
    const [opened, setOpened] = useState('')
    const [task, setTask] = useState(null)
    // ?key= or ?id= (a book) opens a person, for links from other screens.
    useEffect(() => {
        const query = new URLSearchParams(window.location.search)
        const id = query.get('id')
        setOpened(query.get('key') || (id ? `b:${id}` : ''))
    }, [])
    const row = data?.rows?.find(item => item.key === opened)
    // After an action both reads are taken again.
    const doing = async (...args) => {
        const done = await act(...args)
        await loadDay()
        return done
    }
    const mark = (item, field) => doing({ op: 'mark', weddingId: item.weddingId, field, on: true }, markQuestion(item, field))
    const approve = item => { const { body, question } = approval(item); return doing(body, question) }
    const refresh = () => { load(); loadDay() }
    const open = item => (item.kind === 'claude' ? openBot('state') : setTask(item))

    return (
        <>
            <PeopleView
                data={data} busy={busy} error={error || dayError} updatedAt={updatedAt} onRefresh={refresh}
                onOpen={item => setOpened(item.key)} onMark={mark}
                chips={<>
                    {day?.bot && (
                        <button type='button' className={k.glass} onClick={() => openBot('state')}>
                            <MessageCircle size={14} />{day.bot.enabled ? 'הבוט פעיל' : 'הבוט כבוי'}
                        </button>
                    )}
                    {day?.spend && (
                        <button type='button' className={k.glass} onClick={() => openSpend()}>
                            <Coins size={14} /><span dir='ltr'>{dollars(day.spend.month)}</span> החודש
                        </button>
                    )}
                </>}
                above={<Waiting tasks={day?.waiting} busy={busy} onApprove={approve} onOpen={open} />}
            />
            {task && <TaskWindow task={task} api={adminApi} onChanged={() => { load(); loadDay() }} onClose={() => setTask(null)} />}
            {row && (
                <PersonWindow
                    key={row.key} row={row} drafts={data.drafts} samples={data.samples} busy={busy} error={error}
                    act={doing} api={adminApi} onClose={() => setOpened('')}
                />
            )}
        </>
    )
}

export default function CustomersPage() {
    return (
        <SuperAdminOnly>
            <Home />
        </SuperAdminOnly>
    )
}
