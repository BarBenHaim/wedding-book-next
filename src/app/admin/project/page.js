'use client'

// /admin/project — the project presentation screen.
//
// Everything needed to present Wedding Tales as the final project for
// the "תכנות עם LLMs" course, in one place that opens from the admin
// header: the two diagrams, the prompt itself, the experiments run
// against it, where the Python lives, live numbers from the real
// database, and the order to click things in.
//
// Built as a screen rather than a slide deck on purpose. A deck goes
// stale the moment the code moves; this reads the live event count from
// Firestore and pings the Flask service while you are standing there.

import { useCallback, useEffect, useState } from 'react'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { auth } from '@/lib/firebaseClient'
import {
    Boxes, GitBranch, Play, FileCode2, FlaskConical, ListChecks,
    ExternalLink, RefreshCw, CheckCircle2, XCircle, Copy, Check,
} from 'lucide-react'
import SystemDiagram from './SystemDiagram'
import SequenceDiagram from './SequenceDiagram'
import { RUBRIC, EXPERIMENTS, SYSTEM_PROMPT, PY_FILES, DEMO_SCRIPT } from './projectContent'

const TABS = [
    { id: 'overview', label: 'סקירה', icon: Boxes },
    { id: 'diagrams', label: 'דיאגרמות', icon: GitBranch },
    { id: 'prompt', label: 'הפרומפט', icon: FileCode2 },
    { id: 'experiments', label: 'ניסויים', icon: FlaskConical },
    { id: 'rubric', label: 'מפת ציון', icon: ListChecks },
    { id: 'demo', label: 'הדגמה', icon: Play },
]

const CARD = 'rounded-2xl border border-[#ead9b3] bg-white p-5'

function Stat({ label, value, hint }) {
    return (
        <div className={CARD}>
            <div className='text-[11px] font-semibold tracking-wide text-[#a89378]'>{label}</div>
            <div className='mt-1 text-3xl font-extrabold tabular-nums text-[#3d2e1a]'>{value}</div>
            {hint && <div className='mt-0.5 text-[11px] text-[#a89378]'>{hint}</div>}
        </div>
    )
}

export default function ProjectPage() {
    const [tab, setTab] = useState('overview')
    const [stats, setStats] = useState(null)
    const [health, setHealth] = useState(null)
    const [copied, setCopied] = useState(false)

    // Real numbers from the real database. The claim this page makes is
    // "this is a product, not an exercise", and that claim should be
    // checkable on the spot rather than typed into a slide.
    const loadStats = useCallback(async () => {
        try {
            const token = await auth.currentUser?.getIdToken()
            if (!token) return
            const res = await fetch('/api/admin/weddings', { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) return
            const list = await res.json()
            const events = Array.isArray(list) ? list : []
            setStats({
                events: events.length,
                blessings: events.reduce((n, w) => n + (w.greetingsCount ?? 0), 0),
                paid: events.filter(w => Number(w.amountPaid) > 0).length,
                printed: events.filter(w => w.printOrder).length,
            })
        } catch { /* the page is still useful without the numbers */ }
    }, [])

    const loadHealth = useCallback(async () => {
        setHealth({ loading: true })
        try {
            const res = await fetch('/api/admin/project-health', { cache: 'no-store' })
            setHealth(await res.json())
        } catch {
            setHealth({ configured: true, ok: false, reason: 'unreachable' })
        }
    }, [])

    useEffect(() => { loadStats(); loadHealth() }, [loadStats, loadHealth])

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(SYSTEM_PROMPT)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        } catch { /* clipboard blocked — the text is on screen anyway */ }
    }

    return (
        <AdminPageWrapper>
            <div dir='rtl' className='min-h-screen bg-[#faf6ee] pb-20'>
                <div className='mx-auto max-w-6xl px-4 pt-8 sm:px-6'>

                    <header className='mb-6'>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div>
                                <h1 className='text-2xl font-extrabold text-[#3d2e1a]'>Wedding Tales — פרויקט גמר</h1>
                                <p className='mt-1 text-sm text-[#7a6a52]'>
                                    תכנות עם LLMs · אפליקציית web חיה עם דאטאבייס, שירות Python ושימוש ב-Gemini API
                                </p>
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                <a href='https://app.weddingtales.co.il' target='_blank' rel='noreferrer'
                                    className='inline-flex items-center gap-1.5 rounded-xl border border-[#ead9b3] bg-white px-3 py-2 text-xs font-bold text-[#7a6a52]'>
                                    <ExternalLink size={13} /> האתר החי
                                </a>
                                <a href='https://github.com/BarBenHaim/wedding-book-next' target='_blank' rel='noreferrer'
                                    className='inline-flex items-center gap-1.5 rounded-xl border border-[#ead9b3] bg-white px-3 py-2 text-xs font-bold text-[#7a6a52]'>
                                    <GitBranch size={13} /> GitHub
                                </a>
                            </div>
                        </div>
                    </header>

                    {/* Flask health — the one thing that can be down while presenting. */}
                    <div className={`${CARD} mb-6 flex flex-wrap items-center justify-between gap-3`}>
                        <div className='flex items-center gap-3'>
                            {health?.loading ? (
                                <RefreshCw size={18} className='animate-spin text-[#a89378]' />
                            ) : health?.ok ? (
                                <CheckCircle2 size={18} className='text-emerald-600' />
                            ) : (
                                <XCircle size={18} className='text-rose-500' />
                            )}
                            <div>
                                <div className='text-sm font-bold text-[#3d2e1a]'>שירות ה-Python (Flask)</div>
                                <div className='text-[11px] text-[#a89378]'>
                                    {health?.loading ? 'בודק…'
                                        : health?.ok ? `פעיל · מודל ${health.model} · ${health.has_key ? 'מפתח מוגדר' : 'חסר מפתח API'}`
                                            : !health?.configured ? 'BLESSING_ASSIST_URL לא מוגדר — האפליקציה עובדת דרך מסלול הנפילה'
                                                : `לא זמין (${health?.reason}) — האפליקציה עובדת דרך מסלול הנפילה`}
                                </div>
                            </div>
                        </div>
                        <button onClick={loadHealth}
                            className='inline-flex items-center gap-1.5 rounded-xl border border-[#ead9b3] px-3 py-2 text-xs font-bold text-[#7a6a52]'>
                            <RefreshCw size={13} /> בדוק שוב
                        </button>
                    </div>

                    <nav className='mb-6 flex flex-wrap gap-2'>
                        {TABS.map(t => {
                            const Icon = t.icon
                            const on = tab === t.id
                            return (
                                <button key={t.id} onClick={() => setTab(t.id)}
                                    className='inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors'
                                    style={on
                                        ? { background: '#3d2e1a', color: '#fff' }
                                        : { background: '#fff', color: '#7a6a52', border: '1px solid #ead9b3' }}>
                                    <Icon size={13} /> {t.label}
                                </button>
                            )
                        })}
                    </nav>

                    {tab === 'overview' && (
                        <div className='space-y-5'>
                            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                                <Stat label='אירועים' value={stats?.events ?? '—'} hint='במסד הנתונים' />
                                <Stat label='ברכות' value={stats?.blessings ?? '—'} hint='שאורחים כתבו' />
                                <Stat label='שילמו' value={stats?.paid ?? '—'} hint='לקוחות משלמים' />
                                <Stat label='הודפסו' value={stats?.printed ?? '—'} hint='ספרים פיזיים' />
                            </div>

                            <div className={CARD}>
                                <h2 className='mb-2 font-extrabold text-[#3d2e1a]'>מה המערכת עושה</h2>
                                <p className='text-sm leading-relaxed text-[#5a4b35]'>
                                    אורחים באירוע סורקים QR, כותבים ברכה ומעלים תמונה מהנייד — בלי להתקין כלום.
                                    המשפחה מקבלת ספר מעוצב, דיגיטלי ומודפס. <b>עוזר כתיבה מבוסס LLM</b> עוזר
                                    לאורח שנתקע: הוא מקבל ממנו קשר לחוגגים, זיכרון וטון, ומחזיר שלוש הצעות לבחירה —
                                    או משפר טיוטה שכבר כתב בלי לאבד את הקול שלו.
                                </p>
                            </div>

                            <div className={CARD}>
                                <h2 className='mb-3 font-extrabold text-[#3d2e1a]'>איפה הפייתון</h2>
                                <p className='mb-3 text-sm text-[#5a4b35]'>
                                    כל לוגיקת ה-LLM יושבת בשירות Flask נפרד. ה-Next.js לא מדבר עם Gemini ישירות —
                                    הוא שולח בקשה לשירות, ושם נבנה הפרומפט ונעשית הקריאה.
                                </p>
                                <div className='overflow-x-auto'>
                                    <table className='w-full text-right text-sm'>
                                        <thead>
                                            <tr className='border-b border-[#ead9b3] text-[11px] uppercase tracking-wider text-[#a89378]'>
                                                <th className='py-2 font-semibold'>קובץ</th>
                                                <th className='py-2 font-semibold'>שורות</th>
                                                <th className='py-2 font-semibold'>תפקיד</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {PY_FILES.map(f => (
                                                <tr key={f.name} className='border-b border-[#f0e8d4] last:border-0'>
                                                    <td className='py-2 font-mono text-[12.5px] font-bold text-[#3d2e1a]'>{f.name}</td>
                                                    <td className='py-2 tabular-nums text-[#7a6a52]'>{f.lines}</td>
                                                    <td className='py-2 text-[#5a4b35]'>{f.role}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className='mt-3 rounded-xl bg-[#f6efe0] p-3 text-[12.5px] leading-relaxed text-[#5a4b35]'>
                                    <b>למה ההפרדה הזו חשובה:</b> בניית הפרומפט והפרסור של התשובה הם קוד טהור —
                                    בלי רשת ובלי Flask. לכן אפשר להריץ <span className='font-mono'>pytest</span> בלי
                                    מפתח API, בלי אינטרנט ובלי לשלם, ולכן כלי הניסויים יכול לייבא אותם ישירות.
                                </p>
                            </div>
                        </div>
                    )}

                    {tab === 'diagrams' && (
                        <div className='space-y-5'>
                            <div className={CARD}>
                                <h2 className='mb-1 font-extrabold text-[#3d2e1a]'>System Diagram</h2>
                                <p className='mb-4 text-[12.5px] text-[#7a6a52]'>
                                    ארכיטקטורת Full Stack: לקוחות, שכבת האפליקציה, שירות ה-Python, והשירותים החיצוניים.
                                </p>
                                <SystemDiagram />
                            </div>
                            <div className={CARD}>
                                <h2 className='mb-1 font-extrabold text-[#3d2e1a]'>Sequence Diagram</h2>
                                <p className='mb-4 text-[12.5px] text-[#7a6a52]'>
                                    זרימת עוזר הברכות — מרגע שהאורח לוחץ ועד שהוא רואה שלוש הצעות, כולל מסלול הנפילה.
                                </p>
                                <SequenceDiagram />
                            </div>
                        </div>
                    )}

                    {tab === 'prompt' && (
                        <div className='space-y-5'>
                            <div className={CARD}>
                                <div className='mb-3 flex items-center justify-between'>
                                    <h2 className='font-extrabold text-[#3d2e1a]'>הפרומפט המערכתי</h2>
                                    <button onClick={copyPrompt}
                                        className='inline-flex items-center gap-1.5 rounded-xl border border-[#ead9b3] px-3 py-1.5 text-xs font-bold text-[#7a6a52]'>
                                        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'הועתק' : 'העתק'}
                                    </button>
                                </div>
                                <p className='mb-3 text-[12.5px] text-[#7a6a52]'>
                                    נבנה ב-<span className='font-mono'>prompts.py → build_system_prompt()</span>.
                                    הסוגריים המסולסלים מוחלפים לפי האירוע: סוג האירוע, שמות החוגגים, שפה ומגבלת אורך.
                                </p>
                                <pre dir='ltr' className='overflow-x-auto rounded-xl bg-[#2b2317] p-4 text-[12px] leading-relaxed text-[#e8dcc4]'>
                                    {SYSTEM_PROMPT}
                                </pre>
                            </div>
                            <div className={CARD}>
                                <h2 className='mb-2 font-extrabold text-[#3d2e1a]'>שני מצבים</h2>
                                <ul className='space-y-2 text-sm text-[#5a4b35]'>
                                    <li><b>ideas</b> — מקבל קשר לחוגגים, זיכרון וטון, ומבקש שלוש ברכות שונות כמערך JSON.</li>
                                    <li><b>improve</b> — מקבל טיוטה של האורח ומשפר אותה בלי לאבד את הכוונה והקול שלו.</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {tab === 'experiments' && (
                        <div className='space-y-4'>
                            <div className={CARD}>
                                <p className='text-sm leading-relaxed text-[#5a4b35]'>
                                    כל שורה בפרומפט נולדה מכישלון אמיתי בפלט. הכלי{' '}
                                    <span className='font-mono text-[12.5px]'>prompt_lab.py</span> מריץ את <b>אותה בקשה</b> עם
                                    ובלי שורה מסוימת — הכרחי, כי בטמפרטורה 0.85 כל הרצה מחזירה טקסט אחר ממילא,
                                    אז השוואה של הרצה בודדת לא אומרת כלום.
                                </p>
                            </div>
                            {EXPERIMENTS.map(e => (
                                <div key={e.title} className={CARD}>
                                    <h3 className='mb-2 font-extrabold text-[#3d2e1a]'>{e.title}</h3>
                                    <dl className='space-y-1.5 text-[13px] leading-relaxed'>
                                        <div><dt className='inline font-bold text-[#8a6d40]'>הבעיה: </dt><dd className='inline text-[#5a4b35]'>{e.problem}</dd></div>
                                        <div><dt className='inline font-bold text-[#8a6d40]'>מה ניסיתי: </dt><dd className='inline text-[#5a4b35]'>{e.tried}</dd></div>
                                        <div><dt className='inline font-bold text-[#8a6d40]'>התוצאה: </dt><dd className='inline text-[#5a4b35]'>{e.result}</dd></div>
                                        <div><dt className='inline font-bold text-[#8a6d40]'>המסקנה: </dt><dd className='inline text-[#5a4b35]'>{e.lesson}</dd></div>
                                    </dl>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'rubric' && (
                        <div className='space-y-4'>
                            {RUBRIC.map(r => (
                                <div key={r.title} className={CARD}>
                                    <div className='mb-2 flex items-center gap-2'>
                                        <span className='rounded-full bg-[#3d2e1a] px-2.5 py-0.5 text-[11px] font-bold text-white'>{r.weight}</span>
                                        <h3 className='font-extrabold text-[#3d2e1a]'>{r.title}</h3>
                                    </div>
                                    <ul className='space-y-1'>
                                        {r.evidence.map(e => (
                                            <li key={e} className='flex gap-2 text-[13px] text-[#5a4b35]'>
                                                <CheckCircle2 size={14} className='mt-0.5 shrink-0 text-emerald-600' />
                                                <span>{e}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'demo' && (
                        <div className={CARD}>
                            <h2 className='mb-1 font-extrabold text-[#3d2e1a]'>סדר ההדגמה</h2>
                            <p className='mb-4 text-[12.5px] text-[#7a6a52]'>
                                שמונה צעדים, מהמוצר החי אל הקוד ובחזרה למספרים.
                            </p>
                            <ol className='space-y-3'>
                                {DEMO_SCRIPT.map((d, i) => (
                                    <li key={d.step} className='flex gap-3'>
                                        <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f4ecd9] text-[11px] font-bold text-[#8a6d40]'>{i + 1}</span>
                                        <div>
                                            <div className='text-sm font-bold text-[#3d2e1a]'>{d.step}</div>
                                            <div className='text-[12.5px] text-[#5a4b35]'>{d.detail}</div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            </div>
        </AdminPageWrapper>
    )
}
