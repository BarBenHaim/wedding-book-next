'use client'

// /admin/social-preview — four renders, and one decision.
//
// This screen exists to answer a single question before any more of the
// social pipeline gets built: does the image model write Hebrew we can
// publish? Everything downstream — the caption writer, the approval
// queue, the scheduler — is the same work either way, but the answer
// decides whether the picture carries the words or whether the words go
// under it.
//
// So the page is deliberately not a dashboard. It is four tiles, each
// showing what was asked for beside what came back, with the exact
// string printed underneath in large selectable text. That pairing is
// the whole design: comparing a picture to a caption you are holding in
// your head is how a transposed letter survives review, and comparing it
// to the line directly below is how it does not.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Lock, Loader2, AlertTriangle, RefreshCw, ImageIcon, KeyRound } from 'lucide-react'
import { testBatch } from '@/lib/social/imagePrompt'
import { isoInIsrael } from '@/lib/salesAgent/leadsView'

const PAGE_BG = '#f8f4ec'
const CARD = { background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }
const GOLD = 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)'

const MODE_HE = { edit: 'תמונה אמיתית + טקסט', generate: 'תמונה שנוצרה במלואה' }
const SIZE_HE = { post: 'פוסט', story: 'סטורי' }
const REJECT_HE = {
    empty: 'בלי טקסט בכוונה',
    'too-long': 'ארוך מדי לרינדור',
    multiline: 'יותר משורה אחת',
    'mixed-script': 'עברית ואנגלית יחד',
    'contains-digits': 'יש ספרות בשורה',
    'not-hebrew': 'אין עברית בשורה',
}

async function authedFetch(path) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) {
        const err = new Error(data?.detail || data?.error || `HTTP ${res.status}`)
        err.code = data?.error
        throw err
    }
    return data
}

function Tile({ spec, index, state, onRun }) {
    const { status, image, error } = state
    return (
        <div className='rounded-2xl overflow-hidden' style={CARD}>
            <div className='px-4 py-3 border-b border-[#f0e8d8] flex items-center justify-between gap-3'>
                <div className='min-w-0'>
                    <div className='text-[13px] font-bold text-[#1a1410] truncate'>
                        {SIZE_HE[spec.size] || spec.size} · {MODE_HE[spec.mode] || spec.mode}
                    </div>
                    <div className='text-[11px] text-[#a89378] truncate'>{spec.angleId}</div>
                </div>
                <button
                    onClick={() => onRun(index)}
                    disabled={status === 'loading'}
                    className='shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-50'
                    style={{ background: GOLD }}
                >
                    {status === 'loading'
                        ? <><Loader2 size={13} className='animate-spin' /> מייצר</>
                        : <><RefreshCw size={13} /> {image ? 'שוב' : 'צור'}</>}
                </button>
            </div>

            <div className='aspect-[4/5] bg-[#faf7f0] flex items-center justify-center relative'>
                {image
                    ? <img src={image} alt='' className='w-full h-full object-contain' />
                    : status === 'loading'
                        ? <div className='text-center text-[#a89378] text-[12px] px-6'>
                            <Loader2 size={22} className='animate-spin mx-auto mb-2' />
                            זה לוקח בין 20 ל-60 שניות
                        </div>
                        : <ImageIcon size={26} className='text-[#ddd0b6]' />}
            </div>

            <div className='px-4 py-3 space-y-2'>
                {spec.text
                    ? (
                        <div>
                            <div className='text-[10.5px] text-[#a89378] mb-1'>הטקסט שביקשנו, אות באות</div>
                            {/* Selectable and in a big size on purpose: the whole
                                test is comparing this line to the picture above. */}
                            <div className='text-[15px] font-bold text-[#1a1410] select-all' dir='rtl'>{spec.text}</div>
                        </div>
                    )
                    : (
                        <div className='text-[11.5px] text-[#a89378]'>
                            ללא טקסט בתמונה ({REJECT_HE[spec.textRejected] || spec.textRejected})
                        </div>
                    )}
                {error && (
                    <div className='flex items-start gap-1.5 text-[11.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2'>
                        <AlertTriangle size={13} className='mt-0.5 shrink-0' />
                        <span className='break-words'>{error}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

function Content() {
    const date = isoInIsrael()
    const specs = testBatch(date)
    const [states, setStates] = useState(() => specs.map(() => ({ status: 'idle', image: null, error: null })))
    const [missingKey, setMissingKey] = useState(false)

    const run = useCallback(async index => {
        setStates(s => s.map((x, i) => (i === index ? { status: 'loading', image: x.image, error: null } : x)))
        try {
            const data = await authedFetch(`/api/social/preview?i=${index}&date=${date}`)
            setStates(s => s.map((x, i) => (i === index ? { status: 'done', image: data.dataUrl, error: null } : x)))
        } catch (err) {
            if (err.code === 'missing-openai-key') setMissingKey(true)
            setStates(s => s.map((x, i) => (i === index ? { status: 'error', image: x.image, error: err.message } : x)))
        }
    }, [date])

    // Serial rather than parallel: four concurrent image calls hit the
    // rate limit and three of them come back as errors that look like
    // model failures. Slower and honest beats fast and misleading.
    const runAll = useCallback(async () => {
        for (let i = 0; i < specs.length; i++) await run(i)
    }, [run, specs.length])

    const busy = states.some(s => s.status === 'loading')

    return (
        <div className='min-h-screen' style={{ background: PAGE_BG }} dir='rtl'>
            <div className='max-w-5xl mx-auto px-4 py-6'>
                <div className='flex items-start justify-between gap-4 mb-5'>
                    <div>
                        <h1 className='text-[20px] font-bold text-[#1a1410]'>בדיקת עברית בתמונות</h1>
                        <p className='text-[12.5px] text-[#a89378] mt-1 max-w-lg leading-relaxed'>
                            ארבעה רינדורים שנבחרו כדי לא להסכים זה עם זה: אחד על תמונה אמיתית של ספר שהודפס, אחד שנוצר מאפס, פוסט וסטורי, ואחד בלי טקסט בכלל.
                            תשווה כל תמונה לשורה שמתחתיה. אות אחת שגויה זה פוסל.
                        </p>
                    </div>
                    <button
                        onClick={runAll}
                        disabled={busy}
                        className='shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50'
                        style={{ background: GOLD }}
                    >
                        {busy ? <Loader2 size={15} className='animate-spin' /> : <RefreshCw size={15} />}
                        צור את כל הארבעה
                    </button>
                </div>

                {missingKey && (
                    <div className='mb-5 rounded-xl px-4 py-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200'>
                        <KeyRound size={16} className='text-amber-700 mt-0.5 shrink-0' />
                        <div className='text-[12.5px] text-amber-900 leading-relaxed'>
                            חסר <code className='font-mono text-[11.5px]'>OPENAI_API_KEY</code> במשתני הסביבה ב-Vercel. אחרי שמוסיפים אותו צריך לפרוס מחדש כדי שהוא ייכנס לתוקף.
                        </div>
                    </div>
                )}

                <div className='grid gap-4 sm:grid-cols-2'>
                    {specs.map((spec, i) => (
                        <Tile key={i} spec={spec} index={i} state={states[i]} onRun={run} />
                    ))}
                </div>

                <p className='text-[11.5px] text-[#a89378] mt-6 leading-relaxed'>
                    אם העברית יוצאת נקייה בכל הארבעה, הכיתוב נשאר בתוך התמונה והמשך הבנייה הוא כתיבת קפשנים, תור אישורים ופרסום.
                    אם היא נשברת, הטקסט עובר לקפשן מתחת לתמונה והתמונות נשארות בלי מילים.
                </p>
            </div>
        </div>
    )
}

function SuperAdminGate({ children }) {
    const router = useRouter()
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) { router.replace('/login'); return }
            setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [router])

    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: PAGE_BG }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: GOLD }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>המסך הזה מייצר תמונות בתשלום, והוא זמין רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

export default function SocialPreviewPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <Content />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
