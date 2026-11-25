'use client'

// /admin/customers: one list of people, leads and books together. Rules:
// lib/people.js. The message switches live on /admin/customers/board.

import { useEffect, useState } from 'react'
import SuperAdminOnly from '../ui/SuperAdminGate'
import { adminApi } from '../ui/api'
import PeopleView from './PeopleView'
import PersonWindow from './PersonWindow'
import { markQuestion } from './personParts'
import usePeople from './usePeople'

function Customers() {
    const { data, busy, error, updatedAt, load, act } = usePeople()
    // The key of the person whose window is open.
    const [opened, setOpened] = useState('')
    // ?key= or ?id= (a book) opens a person, for links from other screens.
    useEffect(() => {
        const query = new URLSearchParams(window.location.search)
        const id = query.get('id')
        setOpened(query.get('key') || (id ? `b:${id}` : ''))
    }, [])
    const row = data?.rows?.find(item => item.key === opened)
    const mark = (item, field) => act({ op: 'mark', weddingId: item.weddingId, field, on: true }, markQuestion(item, field))

    return (
        <>
            <PeopleView data={data} busy={busy} error={error} updatedAt={updatedAt} onRefresh={load} onOpen={item => setOpened(item.key)} onMark={mark} />
            {row && (
                <PersonWindow
                    key={row.key} row={row} drafts={data.drafts} samples={data.samples} busy={busy} error={error}
                    act={act} api={adminApi} onClose={() => setOpened('')}
                />
            )}
        </>
    )
}

export default function CustomersPage() {
    return (
        <SuperAdminOnly>
            <Customers />
        </SuperAdminOnly>
    )
}
