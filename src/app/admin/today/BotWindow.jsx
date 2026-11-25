'use client'
// Everything about the WhatsApp bot in one window. Settings are saved through
// PUT /api/sales-agent/settings (revision checked, BusinessOS writes there
// too); the three automations through /api/admin/customers.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, BookOpen, Check, SlidersHorizontal, Zap } from 'lucide-react'
import { BOT_MODELS, MAX_INSTRUCTIONS, MODE_NAMES, changeWarning, settingsChange } from '@/lib/botSettings'
import { ATTENTION_BUCKETS, STAGE_META } from '@/lib/salesAgent/leadsView'
import Window, { Notice, Switch } from '../ui/Window'
import k from '../ui/kit.module.css'
import w from '../ui/windows.module.css'

const TABS = [
    { key: 'state', label: 'מצב ומודל', Icon: SlidersHorizontal },
    { key: 'auto', label: 'אוטומציות', Icon: Zap },
    { key: 'words', label: 'הנחיות', Icon: BookOpen },
    { key: 'results', label: 'ביצועים', Icon: Activity },
]
const AUTOMATIONS = [
    {
        key: 'requests', op: 'draftSwitch', label: 'טיוטות ללקוחות',
        about: 'כשלקוח כותב, Claude מכין תשובה ורשימת משימות. שום דבר לא נשלח בלי אישור שלך.',
        on: 'להפעיל טיוטות ללקוחות? Claude יכין תשובה לכל לקוח שכותב, וכל שליחה תחכה לאישור שלך.',
        off: 'לכבות את הטיוטות ללקוחות?',
    },
    {
        key: 'samples', op: 'sampleSwitch', label: 'דוגמאות שלט ללידים',
        about: 'הבוט מציע לליד דוגמת "ברכו את" עם התמונה שלו. כל דוגמה מחכה לאישור שלך.',
        on: 'להפעיל את הצעת דוגמאות השלט? הבוט יתחיל להציע אותן ללידים.',
        off: 'לכבות את הצעת דוגמאות השלט?',
    },
    {
        key: 'followups', op: 'settings', label: 'הודעות מעקב ללקוחות',
        about: 'הודעות לפני ואחרי האירוע. כשזה פעיל הן נשלחות לבד, בלי אישור.',
        on: 'להפעיל שליחה אוטומטית? הודעות יישלחו ללקוחות בלי אישור נוסף. הפעל רק אחרי שהודעת בדיקה הגיעה אליך.',
        off: 'לכבות את השליחה האוטומטית?',
    },
]
const SAVE_ERRORS = {
    INSTRUCTIONS_TOO_LONG: 'ההנחיות ארוכות מדי.',
    INVALID_OPENING_MEDIA: 'אחת מהודעות הפתיחה מצביעה על קובץ שלא קיים. מתקנים ב-BusinessOS.',
    SETTINGS_SAVE_FAILED: 'השמירה נכשלה בשרת.',
}
const leadName = lead => lead.name || lead.profileName || `מספר שמסתיים ב-${String(lead.phone || '').slice(-4)}`
const stamp = value => {
    const ms = typeof value === 'string' ? Date.parse(value) : (value?._seconds || value?.seconds || 0) * 1000
    return ms ? new Date(ms).toLocaleString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : ''
}

function StateTab({ settings, busy, save, checkClaude, check }) {
    const experiment = settings.modelExperiment?.enabled === true
    const known = BOT_MODELS.some(model => model.id === settings.model)
    return (
        <div className={w.stack}>
            <div className={`${w.card} ${w.row}`}>
                <div>
                    <h3>{settings.enabled ? 'הבוט עונה ללידים' : 'הבוט כבוי'}</h3>
                    <p>{settings.enabled ? 'כיבוי עוצר את כל התשובות ללידים.' : 'לידים שכותבים לא מקבלים תשובה.'}</p>
                </div>
                <Switch on={settings.enabled} disabled={busy} label='הבוט פעיל' onChange={enabled => save({ enabled })} />
            </div>

            <div className={w.card}>
                <h3>איך הוא מוכר</h3>
                <div className={w.segments} role='radiogroup' aria-label='מצב הבוט'>
                    {Object.entries(MODE_NAMES).map(([mode, name]) => (
                        <button key={mode} type='button' role='radio' aria-checked={settings.mode === mode} disabled={busy} onClick={() => save({ mode })}>
                            <b>{name}</b>
                            <span>{mode === 'full_sales' ? 'מנהל את כל השיחה עד התשלום' : 'שולח הודעת פתיחה ועוצר'}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={w.card}>
                <h3>מי עונה ללידים</h3>
                {experiment ? <p>ניסוי מודלים פעיל, והוא קובע מי עונה. משנים אותו ב-BusinessOS.</p> : <>
                    {!known && <p>כרגע: <span dir='ltr'>{settings.model}</span></p>}
                    <div className={w.segments} role='radiogroup' aria-label='מודל'>
                        {BOT_MODELS.map(model => (
                            <button key={model.id} type='button' role='radio' aria-checked={settings.model === model.id} disabled={busy} onClick={() => save({ model: model.id })}>
                                <b dir='ltr'>{model.label}{settings.model === model.id && <Check size={18} aria-hidden='true' />}</b>
                                <span>{model.hint}</span>
                            </button>
                        ))}
                    </div>
                </>}
                <div className={w.actions}>
                    <button type='button' className={k.button} disabled={busy} onClick={checkClaude}>בדוק את Claude</button>
                    {check && <span data-ok={check.ok}>{check.message}</span>}
                </div>
                <p>הבדיקה והטיוטות ללקוחות רצות תמיד על Claude Opus 5.5, בלי קשר לבחירה כאן.</p>
            </div>

            <p className={w.fine}>גרסת הגדרות {settings.revision}{stamp(settings.updatedAt) && ` · עודכנה ${stamp(settings.updatedAt)}`}</p>
        </div>
    )
}

function AutoTab({ switches, busy, flip }) {
    return (
        <div className={w.stack}>
            {AUTOMATIONS.map(item => (
                <div key={item.key} className={`${w.card} ${w.row}`}>
                    <div><h3>{item.label}</h3><p>{item.about}</p></div>
                    {typeof switches?.[item.key] === 'boolean'
                        ? <Switch on={switches[item.key]} disabled={busy} label={item.label} onChange={on => flip(item, on)} />
                        : <p>המצב לא נקרא.</p>}
                </div>
            ))}
        </div>
    )
}

function WordsTab({ settings, busy, save }) {
    const [text, setText] = useState(settings.businessInstructions || '')
    useEffect(() => setText(settings.businessInstructions || ''), [settings.businessInstructions])
    const unchanged = !settingsChange(settings, { businessInstructions: text })
    const openings = (settings.openingExperiment?.variants || []).filter(variant => variant.enabled !== false && variant.weight !== 0)
    return (
        <div className={w.stack}>
            <div className={w.card}>
                <h3><label htmlFor='bot-instructions'>הנחיות לבוט</label></h3>
                <p>טקסט שהבוט מקבל בכל תשובה. מחירים, חבילות וקישורי תשלום מגיעים מהקטלוג ואי אפשר לשנות אותם כאן. ירידות שורה נשמרות כרווח.</p>
                <textarea id='bot-instructions' value={text} maxLength={MAX_INSTRUCTIONS} rows={7} onChange={event => setText(event.target.value)} />
                <div className={w.actions}>
                    <button type='button' className={k.button} disabled={busy || unchanged} onClick={() => save({ businessInstructions: text })}>שמור הנחיות</button>
                    <span dir='ltr'>{text.length} / {MAX_INSTRUCTIONS}</span>
                </div>
            </div>
            {openings.length > 0 && (
                <div className={w.card}>
                    <h3>הודעות הפתיחה הפעילות</h3>
                    <p>לקריאה בלבד. עורכים אותן ב-BusinessOS.</p>
                    {openings.map(variant => (
                        <details key={variant.id}>
                            <summary>{variant.label || variant.name || variant.id}</summary>
                            {(variant.blocks || []).filter(block => block.text).map((block, index) => <blockquote key={block.id || index}>{block.text}</blockquote>)}
                        </details>
                    ))}
                </div>
            )}
        </div>
    )
}

function ResultsTab({ leads }) {
    if (!leads) return <Notice tone='bad'>נתוני הלידים לא נקראו.</Notice>
    const week = leads.window7 || {}
    const stages = Object.entries(STAGE_META)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([key, meta]) => ({ key, label: meta.label, count: leads.summary?.byStage?.[key] || 0 }))
        .filter(stage => stage.count > 0)
    const most = Math.max(1, ...stages.map(stage => stage.count))
    const waiting = (leads.items || []).filter(lead => lead.attention)
    const bucket = key => ATTENTION_BUCKETS.find(row => row.key === key)?.label || key
    return (
        <div className={w.stack}>
            <div className={w.figures}>
                <div><b>{week.inWindow ?? 0}</b><span>לידים ב-7 ימים</span></div>
                <div><b>{week.won ?? 0}</b><span>תשלומים מאומתים</span></div>
                <div><b>{week.closeRate == null ? '—' : `${week.closeRate}%`}</b><span>המרה מאומתת</span></div>
                <div><b>{leads.summary?.openLeads ?? 0}</b><span>שיחות פתוחות</span></div>
            </div>
            <div className={w.card}>
                <h3>מי מחכה ({waiting.length})</h3>
                {waiting.length > 0 && (
                    <p>{ATTENTION_BUCKETS.map(row => [row.label, leads.summary?.buckets?.[row.key] || 0]).filter(([, count]) => count).map(([label, count]) => `${label}: ${count}`).join(' · ')}</p>
                )}
                {waiting.length === 0 ? <p>אף אחד לא מחכה כרגע.</p> : (
                    <ul className={w.list}>
                        {waiting.slice(0, 6).map(lead => <li key={lead.phone}><b>{leadName(lead)}</b><span>{bucket(lead.attention)}</span></li>)}
                    </ul>
                )}
                <div className={w.actions}><Link href='/admin/sales-leads' className={k.button}>לכל הלידים והשיחות</Link></div>
            </div>
            {stages.length > 0 && (
                <div className={w.card}>
                    <h3>איפה הלידים עומדים</h3>
                    <ul className={w.funnel}>
                        {stages.map(stage => (
                            <li key={stage.key}><span>{stage.label}</span><i><em style={{ width: `${Math.max(3, stage.count / most * 100)}%` }} /></i><b>{stage.count}</b></li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

export default function BotWindow({ bot, firstTab = 'state', api, onChanged, onClose }) {
    const [tab, setTab] = useState(firstTab)
    const [settings, setSettings] = useState(null)
    const [leads, setLeads] = useState(undefined)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState({ tone: 'info', words: '' })
    const [check, setCheck] = useState(null)

    const read = useCallback(async () => (await api('/api/sales-agent/settings')).settings, [api])

    useEffect(() => {
        read().then(setSettings).catch(() => setNote({ tone: 'bad', words: 'ההגדרות לא נקראו. סגור ופתח שוב.' }))
        api('/api/sales-agent/leads').then(setLeads).catch(() => setLeads(null))
    }, [api, read])

    const save = async patch => {
        const body = settingsChange(settings, patch)
        if (!body || !window.confirm(changeWarning(settings, patch))) return
        setBusy(true)
        setNote({ tone: 'info', words: 'שומר…' })
        try {
            await api('/api/sales-agent/settings', body, 'PUT')
        } catch (error) {
            const stale = error.message === 'STALE_REVISION'
            if (stale) await read().then(setSettings).catch(() => {})
            setNote({ tone: 'bad', words: stale ? 'מישהו שינה את ההגדרות בינתיים. טענתי אותן מחדש, בדוק ושמור שוב.' : `לא נשמר. ${SAVE_ERRORS[error.message] || error.message}` })
            setBusy(false)
            return
        }
        // A saved change counts only once the settings read back: the bot
        // reads them the same way.
        try {
            setSettings(await read())
            setNote({ tone: 'good', words: 'נשמר ונבדק. התשובות הבאות לפי ההגדרה החדשה.' })
        } catch {
            setNote({ tone: 'bad', words: 'נשמר, אבל קריאת ההגדרות אחרי השמירה נכשלה. צריך לבדוק מיד שהבוט עונה.' })
        }
        onChanged()
        setBusy(false)
    }

    const flip = async (item, on) => {
        if (!window.confirm(on ? item.on : item.off)) return
        setBusy(true)
        try {
            await api('/api/admin/customers', { op: item.op, enabled: on })
            await onChanged()
            setNote({ tone: 'good', words: `${item.label}: ${on ? 'הופעל' : 'כובה'}.` })
        } catch (error) {
            setNote({ tone: 'bad', words: `לא נשמר: ${error.message}` })
        } finally {
            setBusy(false)
        }
    }

    const checkClaude = async () => {
        setBusy(true)
        setCheck({ ok: true, message: 'בודק…' })
        try {
            setCheck((await api('/api/admin/customers', { op: 'claudeCheck' })).check)
        } catch (error) {
            setCheck({ ok: false, message: `הבדיקה לא רצה: ${error.message}` })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Window title='בוט וואטסאפ' subtitle={bot?.callsToday != null ? `${bot.callsToday} קריאות למודלים היום` : ''} onClose={onClose}>
            <div className={w.tabs} role='tablist'>
                {TABS.map(({ key, label, Icon }) => (
                    <button key={key} type='button' role='tab' aria-selected={tab === key} onClick={() => setTab(key)}>
                        <Icon size={18} aria-hidden='true' />{label}
                    </button>
                ))}
            </div>
            <Notice tone={note.tone}>{note.words}</Notice>
            <div key={tab} role='tabpanel'>
                {tab === 'auto' && <AutoTab switches={bot?.switches} busy={busy} flip={flip} />}
                {tab === 'results' && (leads === undefined ? <Notice>טוען…</Notice> : <ResultsTab leads={leads} />)}
                {(tab === 'state' || tab === 'words') && (!settings ? <Notice>{note.tone === 'bad' ? '' : 'טוען…'}</Notice>
                    : tab === 'state' ? <StateTab settings={settings} busy={busy} save={save} checkClaude={checkClaude} check={check} />
                        : <WordsTab settings={settings} busy={busy} save={save} />)}
            </div>
        </Window>
    )
}
