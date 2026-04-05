'use client'
import { useState, useEffect } from 'react'
import { db } from '../../lib/firebaseClient'
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore'

const SURVEY_DOC = 'layout-survey-votes'

const layouts = [
    {
        id: 'A',
        title: 'Clean Vertical',
        titleHe: 'אלגנטי נקי',
        desc: 'עיצוב זורם לאורך עם מונוגרם, קווים דקורטיביים וכפתור עגול',
    },
    {
        id: 'B',
        title: 'Dark Luxe Card',
        titleHe: 'כרטיס כהה יוקרתי',
        desc: 'רקע כהה עם כרטיס שקוף, שמות אחד מתחת לשני וכפתור זהב רחב',
    },
    {
        id: 'C',
        title: 'Invitation Arch',
        titleHe: 'קשת הזמנה',
        desc: 'סגנון הזמנה עם קשת מסביב, מינימליסטי עם כפתור outline',
    },
    {
        id: 'D',
        title: 'Cinematic Wide',
        titleHe: 'קולנועי רחב',
        desc: 'שמות בשורה אחת עם & בעיגול, טבעות רקע וכפתור עם צל',
    },
]

function LayoutPreviewA() {
    return (
        <div className='w-full h-full flex flex-col items-center justify-center'
            style={{ background: 'linear-gradient(170deg, #faf6ef 0%, #f5efe4 40%, #ece4d5 100%)' }}>
            <div className='w-16 h-[1.5px] mb-2' style={{ background: 'linear-gradient(90deg, transparent, #c9a44e, transparent)' }} />
            <div className='text-sm mb-1' style={{ color: '#c9a44e', letterSpacing: '4px', fontWeight: 300, opacity: 0.7 }}>ב ♦ נ</div>
            <div className='text-[10px] mb-3' style={{ color: '#AA8840', letterSpacing: '2px' }}>ספר הברכות של</div>
            <div className='text-2xl font-extrabold mb-1' style={{
                background: 'linear-gradient(135deg, #AA8840, #d4b867, #c9a44e)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
                ברבונייק <span style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: 300 }}>&</span> ניגר
            </div>
            <div className='flex items-center gap-2 my-2'>
                <div className='w-8 h-[0.5px]' style={{ background: 'linear-gradient(90deg, transparent, #c9a44e80)' }} />
                <div className='text-[9px]' style={{ color: '#AA8840', fontWeight: 600 }}>15 באפריל 2026</div>
                <div className='w-8 h-[0.5px]' style={{ background: 'linear-gradient(90deg, #c9a44e80, transparent)' }} />
            </div>
            <div className='text-[9px] text-center leading-relaxed mb-3' style={{ color: '#8a7a65' }}>
                השאירו ברכה מהלב והעלו תמונות<br />שישמרו לנצח בספר החתונה שלנו
            </div>
            <div className='px-8 py-2 rounded-full text-white text-[10px] font-bold'
                style={{ background: 'linear-gradient(135deg, #AA8840, #c9a44e, #d4b867)' }}>
                + יצירת ברכה
            </div>
        </div>
    )
}

function LayoutPreviewB() {
    return (
        <div className='w-full h-full flex items-center justify-center relative overflow-hidden'
            style={{ background: 'linear-gradient(135deg, #18140F 0%, #2a2318 50%, #18140F 100%)' }}>
            <div className='absolute w-48 h-48 rounded-full' style={{
                background: 'radial-gradient(circle, rgba(201,164,78,0.08) 0%, transparent 70%)',
                top: '-40px', left: '-40px',
            }} />
            <div className='relative text-center px-6 py-7 rounded-2xl max-w-[200px] w-full'
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,164,78,0.2)' }}>
                <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[1.5px]'
                    style={{ background: 'linear-gradient(90deg, transparent, #c9a44e, transparent)' }} />
                <div className='text-[9px] mb-3' style={{ color: '#c9a44e', letterSpacing: '3px', fontWeight: 600 }}>ספר הברכות של</div>
                <div className='text-xl font-extrabold leading-tight' style={{ color: '#f0ebe3' }}>ברבונייק</div>
                <div className='text-base my-0.5' style={{ fontFamily: 'Georgia', fontStyle: 'italic', color: '#c9a44e', fontWeight: 300 }}>&</div>
                <div className='text-xl font-extrabold leading-tight mb-2' style={{ color: '#f0ebe3' }}>ניגר</div>
                <div className='flex items-center justify-center gap-2 my-2'>
                    <div className='w-6 h-[0.5px]' style={{ background: 'rgba(201,164,78,0.3)' }} />
                    <div className='w-1 h-1' style={{ background: '#c9a44e', transform: 'rotate(45deg)' }} />
                    <div className='w-6 h-[0.5px]' style={{ background: 'rgba(201,164,78,0.3)' }} />
                </div>
                <div className='inline-block rounded-xl px-3 py-0.5 mb-2 text-[9px]'
                    style={{ border: '1px solid rgba(201,164,78,0.3)', color: '#c9a44e' }}>15 באפריל 2026</div>
                <div className='text-[8px] leading-relaxed mb-3' style={{ color: '#8a7a65' }}>
                    השאירו ברכה מהלב והעלו תמונות<br />שישמרו לנצח בספר החתונה שלנו
                </div>
                <div className='w-full py-2 rounded-lg text-[10px] font-bold'
                    style={{ background: 'linear-gradient(135deg, #AA8840, #c9a44e)', color: '#18140F' }}>
                    + יצירת ברכה
                </div>
            </div>
        </div>
    )
}

function LayoutPreviewC() {
    return (
        <div className='w-full h-full flex items-center justify-center' style={{ background: '#f8f4ee' }}>
            <div className='relative text-center px-6 py-8' style={{ width: '200px' }}>
                <div className='absolute inset-0 pointer-events-none' style={{
                    border: '1px solid rgba(201,164,78,0.25)',
                    borderRadius: '100px 100px 12px 12px',
                }} />
                <div className='text-sm mb-2' style={{ color: '#c9a44e', opacity: 0.6 }}>✦</div>
                <div className='text-[9px] mb-3' style={{ color: '#AA8840', letterSpacing: '2px' }}>ספר הברכות של</div>
                <div className='text-xl font-extrabold' style={{ color: '#AA8840' }}>ברבונייק</div>
                <div className='text-base my-0.5' style={{ fontFamily: 'Georgia', fontStyle: 'italic', color: '#c9a44e', fontWeight: 300 }}>&</div>
                <div className='text-xl font-extrabold mb-2' style={{ color: '#AA8840' }}>ניגר</div>
                <div className='flex items-center justify-center gap-1 my-2'>
                    <div className='w-6 h-[0.3px]' style={{ background: '#c9a44e60' }} />
                    <div className='w-[3px] h-[3px] rounded-full' style={{ background: '#c9a44e' }} />
                    <div className='w-6 h-[0.3px]' style={{ background: '#c9a44e60' }} />
                </div>
                <div className='text-[9px] mb-1' style={{ color: '#AA8840', fontWeight: 600 }}>15 באפריל 2026</div>
                <div className='text-[8px] leading-relaxed mb-3' style={{ color: '#9a8b78' }}>
                    השאירו ברכה מהלב והעלו תמונות<br />שישמרו לנצח בספר החתונה שלנו
                </div>
                <div className='inline-block px-5 py-1.5 rounded-full text-[9px] font-bold'
                    style={{ border: '1px solid #c9a44e', color: '#AA8840' }}>
                    + יצירת ברכה
                </div>
            </div>
        </div>
    )
}

function LayoutPreviewD() {
    return (
        <div className='w-full h-full flex flex-col items-center justify-center relative overflow-hidden'
            style={{ background: 'linear-gradient(180deg, #f5efe4 0%, #ece4d5 60%, #e5dbc9 100%)' }}>
            <div className='absolute w-64 h-64 rounded-full' style={{
                border: '1px solid rgba(201,164,78,0.08)',
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            }} />
            <div className='absolute w-48 h-48 rounded-full' style={{
                border: '1px solid rgba(201,164,78,0.05)',
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            }} />
            <div className='relative z-10 text-center'>
                <div className='text-[8px] mb-3' style={{ color: '#c9a44e', letterSpacing: '4px', fontWeight: 600 }}>ספר הברכות של</div>
                <div className='flex items-center justify-center gap-2 mb-1'>
                    <span className='text-2xl font-extrabold' style={{
                        background: 'linear-gradient(135deg, #AA8840, #d4b867, #c9a44e)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>ברבונייק</span>
                    <div className='w-6 h-6 rounded-full flex items-center justify-center text-xs'
                        style={{ border: '1px solid #c9a44e', fontFamily: 'Georgia', fontStyle: 'italic', color: '#c9a44e' }}>&</div>
                    <span className='text-2xl font-extrabold' style={{
                        background: 'linear-gradient(135deg, #AA8840, #d4b867, #c9a44e)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>ניגר</span>
                </div>
                <div className='w-24 h-[0.5px] mx-auto my-3' style={{ background: 'linear-gradient(90deg, transparent, #c9a44e40, transparent)' }} />
                <div className='text-[9px] mb-1' style={{ color: '#AA8840', fontWeight: 600 }}>15 באפריל 2026</div>
                <div className='text-[8px] leading-relaxed mb-3' style={{ color: '#8a7a65' }}>
                    השאירו ברכה מהלב והעלו תמונות<br />שישמרו לנצח בספר החתונה שלנו
                </div>
                <div className='px-8 py-2 rounded-xl text-white text-[10px] font-bold'
                    style={{ background: 'linear-gradient(135deg, #AA8840, #c9a44e, #d4b867)', boxShadow: '0 4px 16px rgba(170,136,64,0.25)' }}>
                    + יצירת ברכה
                </div>
            </div>
        </div>
    )
}

const previewComponents = { A: LayoutPreviewA, B: LayoutPreviewB, C: LayoutPreviewC, D: LayoutPreviewD }

export default function SurveyPage() {
    const [votes, setVotes] = useState({ A: 0, B: 0, C: 0, D: 0 })
    const [voted, setVoted] = useState(null)
    const [loading, setLoading] = useState(true)
    const [totalVotes, setTotalVotes] = useState(0)

    useEffect(() => {
        loadVotes()
        // check if already voted via cookie
        const cookie = document.cookie.split('; ').find(c => c.startsWith('survey_voted='))
        if (cookie) setVoted(cookie.split('=')[1])
    }, [])

    async function loadVotes() {
        try {
            const ref = doc(db, 'surveys', SURVEY_DOC)
            const snap = await getDoc(ref)
            if (snap.exists()) {
                const data = snap.data()
                const v = { A: data.A || 0, B: data.B || 0, C: data.C || 0, D: data.D || 0 }
                setVotes(v)
                setTotalVotes(v.A + v.B + v.C + v.D)
            }
        } catch (e) {
            console.log('Could not load votes', e)
        }
        setLoading(false)
    }

    async function handleVote(id) {
        if (voted) return
        setVoted(id)
        document.cookie = `survey_voted=${id}; max-age=${60 * 60 * 24 * 30}; path=/`

        const newVotes = { ...votes, [id]: votes[id] + 1 }
        setVotes(newVotes)
        setTotalVotes(prev => prev + 1)

        try {
            const ref = doc(db, 'surveys', SURVEY_DOC)
            const snap = await getDoc(ref)
            if (snap.exists()) {
                await updateDoc(ref, { [id]: increment(1) })
            } else {
                await setDoc(ref, { A: 0, B: 0, C: 0, D: 0, [id]: 1 })
            }
        } catch (e) {
            console.log('Vote save error', e)
        }
    }

    function getPercent(id) {
        if (totalVotes === 0) return 0
        return Math.round((votes[id] / totalVotes) * 100)
    }

    return (
        <div dir='rtl' className='min-h-screen font-sans'
            style={{
                background: 'linear-gradient(170deg, #faf6ef 0%, #f0ebe3 50%, #e8dfd0 100%)',
                fontFamily: "'Assistant', sans-serif",
            }}>

            {/* Header */}
            <div className='text-center pt-10 pb-2 px-4'>
                <div className='text-sm tracking-widest mb-2' style={{ color: '#c9a44e', fontWeight: 600 }}>WEDDING TALES</div>
                <h1 className='text-3xl sm:text-4xl font-extrabold mb-3' style={{ color: '#2a2318' }}>
                    איזה עיצוב הכי מדבר אליכם?
                </h1>
                <p className='text-base max-w-md mx-auto' style={{ color: '#8a7a65' }}>
                    בחרו את העיצוב המועדף עליכם לעמוד האורחים — ההצבעה אנונימית
                </p>
                <div className='w-20 h-[1.5px] mx-auto mt-4'
                    style={{ background: 'linear-gradient(90deg, transparent, #c9a44e, transparent)' }} />
            </div>

            {/* Vote count */}
            {totalVotes > 0 && (
                <div className='text-center mt-4 mb-2'>
                    <span className='inline-block px-4 py-1.5 rounded-full text-sm font-semibold'
                        style={{ background: 'rgba(201,164,78,0.1)', color: '#AA8840' }}>
                        {totalVotes} הצבעות עד כה
                    </span>
                </div>
            )}

            {/* Cards grid */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto px-4 py-8'>
                {layouts.map((layout) => {
                    const Preview = previewComponents[layout.id]
                    const isVoted = voted === layout.id
                    const hasVoted = voted !== null
                    const pct = getPercent(layout.id)

                    return (
                        <div key={layout.id}
                            className='rounded-2xl overflow-hidden transition-all duration-300'
                            style={{
                                background: 'white',
                                border: isVoted ? '2px solid #c9a44e' : '2px solid transparent',
                                boxShadow: isVoted
                                    ? '0 8px 40px rgba(170,136,64,0.2)'
                                    : '0 4px 24px rgba(0,0,0,0.06)',
                                transform: isVoted ? 'scale(1.02)' : 'scale(1)',
                            }}>

                            {/* Preview */}
                            <div className='w-full aspect-[4/3] relative overflow-hidden'>
                                <Preview />
                                <div className='absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold'
                                    style={{ background: 'rgba(0,0,0,0.6)', color: '#c9a44e', backdropFilter: 'blur(8px)' }}>
                                    {layout.id}
                                </div>
                            </div>

                            {/* Info + Vote */}
                            <div className='p-4'>
                                <h3 className='text-lg font-bold mb-0.5' style={{ color: '#2a2318' }}>
                                    {layout.titleHe}
                                </h3>
                                <p className='text-xs mb-4' style={{ color: '#8a7a65' }}>{layout.desc}</p>

                                {/* Vote button or result */}
                                {!hasVoted ? (
                                    <button
                                        onClick={() => handleVote(layout.id)}
                                        className='w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer'
                                        style={{
                                            background: 'linear-gradient(135deg, #AA8840, #c9a44e, #d4b867)',
                                            color: 'white',
                                            border: 'none',
                                            fontFamily: "'Assistant', sans-serif",
                                        }}>
                                        הצביעו לעיצוב {layout.id}
                                    </button>
                                ) : (
                                    <div>
                                        <div className='flex items-center justify-between mb-1.5'>
                                            <span className='text-sm font-bold' style={{ color: isVoted ? '#AA8840' : '#8a7a65' }}>
                                                {isVoted ? '✓ הבחירה שלך' : `${pct}%`}
                                            </span>
                                            <span className='text-sm font-bold' style={{ color: '#2a2318' }}>
                                                {pct}%
                                            </span>
                                        </div>
                                        <div className='w-full h-2.5 rounded-full overflow-hidden' style={{ background: '#f0ebe3' }}>
                                            <div className='h-full rounded-full transition-all duration-700'
                                                style={{
                                                    width: `${pct}%`,
                                                    background: isVoted
                                                        ? 'linear-gradient(135deg, #AA8840, #c9a44e, #d4b867)'
                                                        : '#d4c9a8',
                                                }} />
                                        </div>
                                        <div className='text-xs mt-1 text-left' style={{ color: '#bfb49e' }}>
                                            {votes[layout.id]} הצבעות
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div className='text-center pb-10 px-4'>
                <div className='w-12 h-[1px] mx-auto mb-3' style={{ background: 'linear-gradient(90deg, transparent, #c9a44e40, transparent)' }} />
                <p className='text-xs' style={{ color: '#bfb49e', letterSpacing: '2px' }}>WEDDING TALES — DESIGN SURVEY</p>
            </div>
        </div>
    )
}
