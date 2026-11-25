'use client'
// What the AI providers cost, as far as the system counts it. The figures come
// with the leads (GET /api/sales-agent/leads), which already reads them.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Window, { Notice } from '../ui/Window'
import k from '../ui/kit.module.css'
import w from '../ui/windows.module.css'

export const dollars = value => `$${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dayMonth = iso => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`

export default function SpendWindow({ month, api, onClose }) {
    const [spend, setSpend] = useState(undefined)
    useEffect(() => {
        api('/api/sales-agent/leads').then(leads => setSpend(leads.spend || null)).catch(() => setSpend(null))
    }, [api])

    const peak = Math.max(0, ...(spend?.byDay || []).map(day => day.usd))
    return (
        <Window title='הוצאות' subtitle={month ? `החודש: ${dollars(month.month)}` : ''} onClose={onClose}>
            {spend === undefined ? <Notice>טוען…</Notice> : !spend ? <Notice tone='bad'>נתוני ההוצאות לא נקראו.</Notice> : (
                <div className={w.stack}>
                    <div className={w.figures}>
                        <div><b dir='ltr'>{dollars(spend.today)}</b><span>היום</span></div>
                        <div><b dir='ltr'>{dollars(spend.week)}</b><span>7 ימים</span></div>
                        <div><b dir='ltr'>{dollars(spend.month)}</b><span>30 ימים</span></div>
                        <div><b dir='ltr'>{dollars(spend.total)}</b><span>מאז תחילת הספירה</span></div>
                    </div>
                    <div className={w.card}>
                        <h3>14 הימים האחרונים</h3>
                        <div className={w.chart} dir='ltr'>
                            {(spend.byDay || []).map(day => (
                                <div key={day.date} title={`${dayMonth(day.date)} · ${dollars(day.usd)}`}>
                                    <i><em style={{ height: `${peak ? Math.max(day.usd ? 4 : 0, day.usd / peak * 100) : 0}%` }} /></i>
                                    <span>{dayMonth(day.date)}</span>
                                </div>
                            ))}
                        </div>
                        <p>היום הגבוה ביותר: <span dir='ltr'>{dollars(peak)}</span></p>
                    </div>
                    <div className={w.card}>
                        <h3>לאן זה הולך, מאז תחילת הספירה</h3>
                        <ul className={w.list}>
                            <li><b dir='ltr'>Claude</b><span dir='ltr'>{dollars(spend.anthropicTotal)}</span></li>
                            <li><b dir='ltr'>OpenAI</b><span dir='ltr'>{dollars(spend.openaiTotal)}</span></li>
                            <li><b>קריאות למודלים</b><span>{(spend.totalCalls || 0).toLocaleString('he-IL')}</span></li>
                            <li><b>תמונות</b><span>{(spend.totalImages || 0).toLocaleString('he-IL')}</span></li>
                        </ul>
                    </div>
                    <p className={w.fine}>
                        נספרות קריאות המודלים של האתר: תשובות הבוט, הודעות מעקב, בדיקת Claude, טיוטות ללקוחות, עזרה בכתיבת ברכות ותמונות. חלק מהן נספרות רק מאז העדכון האחרון.
                        לא נספרים: Make, וואטסאפ, כלי בדיקה פנימיים וכל מה שמחוץ לאתר. המחירים מוקלדים בקוד{spend.ratesCheckedOn ? ` (נבדקו ב-${spend.ratesCheckedOn})` : ''}. החיוב המדויק מופיע אצל Anthropic ו-OpenAI.
                    </p>
                    <div className={w.actions}><Link href='/admin/sales-leads#spend' className={k.button}>לעמוד הלידים</Link></div>
                </div>
            )}
        </Window>
    )
}
