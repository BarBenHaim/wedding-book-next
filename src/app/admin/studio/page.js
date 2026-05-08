'use client'

// /admin/studio — super-admin Book Template Studio.
//
// This commit ships the route shell and the one-shot Firestore seeder.
// Subsequent commits add the three-column editor (presets list / live
// preview / properties), preset CRUD, and background upload. Until
// then the page renders a status panel confirming the seeder worked
// and lists the presets currently in Firestore — useful as a sanity
// check that DesignControls (the viewer's preset picker) is reading
// from the same data the studio will edit.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wand2, ChevronRight, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { listPresets, seedBuiltinPresetsIfMissing, BUILTIN_PRESETS } from '@/lib/studioPresets'

function StudioContent() {
    const [seedStatus, setSeedStatus] = useState({ state: 'pending' })
    const [presets, setPresets] = useState([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            // Seed first (idempotent — does nothing if the docs are
            // already there) so the list call below is guaranteed to
            // see at least the 8 system presets.
            const result = await seedBuiltinPresetsIfMissing()
            if (cancelled) return
            setSeedStatus({ state: 'done', ...result })

            const list = await listPresets()
            if (!cancelled) setPresets(list)
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const systemCount = presets.filter(p => p.ownerType === 'system').length
    const studioCount = presets.filter(p => p.ownerType === 'studio').length

    return (
        <div
            className='min-h-screen px-4 sm:px-10 py-10 relative'
            dir='rtl'
            style={{
                backgroundColor: '#f8f4ec',
                backgroundImage: [
                    'radial-gradient(ellipse 1100px 560px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 600px 600px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                ].join(', '),
            }}
        >
            <div className='max-w-5xl mx-auto'>
                {/* ── Breadcrumb ── */}
                <div className='flex items-center gap-1.5 text-[12px] text-[#a89378] mb-4'>
                    <Link href='/admin' className='hover:text-[#7a6a52] transition-colors'>
                        מרכז הניהול
                    </Link>
                    <ChevronRight size={12} className='rotate-180' />
                    <span className='text-[#5a4d3a] font-semibold'>סטודיו עיצוב</span>
                </div>

                {/* ── Header ── */}
                <div className='flex items-center gap-4 mb-8'>
                    <div
                        className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0'
                        style={{
                            background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                            boxShadow:
                                '0 12px 24px -10px rgba(170,136,64,0.45), inset 0 1px 0 rgba(255,255,255,0.30)',
                        }}
                    >
                        <Wand2 size={20} className='text-white' />
                    </div>
                    <div>
                        <h1
                            className='leading-tight tracking-tight font-bold'
                            style={{ color: '#1a1410', fontSize: '22px', letterSpacing: '-0.015em' }}
                        >
                            סטודיו עיצוב
                        </h1>
                        <p
                            className='mt-1'
                            style={{ color: '#a89378', fontSize: '12px' }}
                        >
                            יצירה ועריכה של תבניות עמודי ספר. הזוגות בוחרים מהתבניות
                            כשהם מעצבים את הספר שלהם בעמוד הצופה.
                        </p>
                    </div>
                </div>

                {/* ── Seed status panel ── */}
                <div
                    className='rounded-2xl p-5 mb-6'
                    style={{
                        background: '#ffffff',
                        border: '1px solid rgba(212,184,103,0.22)',
                        boxShadow: '0 16px 32px -20px rgba(170,136,64,0.22)',
                    }}
                >
                    <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>
                        סטטוס סנכרון
                    </p>
                    <SeedStatus seedStatus={seedStatus} systemCount={systemCount} studioCount={studioCount} />
                </div>

                {/* ── Presets list (read-only in this commit) ── */}
                <div
                    className='rounded-2xl overflow-hidden'
                    style={{
                        background: '#ffffff',
                        border: '1px solid rgba(212,184,103,0.22)',
                        boxShadow: '0 24px 50px -28px rgba(170,136,64,0.28)',
                    }}
                >
                    <div
                        className='px-6 py-5 border-b border-[#f0e8d4]'
                        style={{ background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}
                    >
                        <div className='flex items-center gap-3'>
                            <div
                                className='w-1.5 h-6 rounded-full'
                                style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}
                            />
                            <h2 style={{ color: '#1a1410', fontSize: '15px', fontWeight: 700 }}>
                                תבניות זמינות
                            </h2>
                            {presets.length > 0 && (
                                <span
                                    className='rounded-full px-3 py-0.5'
                                    style={{
                                        background: 'rgba(201,164,78,0.10)',
                                        color: '#a8843a',
                                        border: '1px solid rgba(212,184,103,0.30)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                    }}
                                >
                                    {presets.length}
                                </span>
                            )}
                        </div>
                    </div>

                    {presets.length === 0 ? (
                        <div className='flex flex-col items-center justify-center py-16 gap-3'>
                            <Loader2 size={20} className='animate-spin text-[#a8843a]' />
                            <p className='text-sm text-[#a89378]'>טוען תבניות...</p>
                        </div>
                    ) : (
                        <ul className='divide-y divide-[#f4ecd9]'>
                            {presets.map(p => (
                                <PresetRow key={p.id || p.name} preset={p} />
                            ))}
                        </ul>
                    )}
                </div>

                {/* ── Roadmap note ── */}
                <p className='text-center text-[11px] text-[#a89378] mt-8 font-medium leading-relaxed'>
                    בקרוב: עורך מלא עם תצוגה חיה, החלפת רקעים, פונטים, מסגרות,
                    והעלאת רקעים מותאמים אישית.
                </p>
            </div>
        </div>
    )
}

function SeedStatus({ seedStatus, systemCount, studioCount }) {
    if (seedStatus.state === 'pending') {
        return (
            <div className='flex items-center gap-2.5 text-sm text-[#7a6a52]'>
                <Loader2 size={14} className='animate-spin text-[#a8843a]' />
                <span>בודק את ה-Firestore...</span>
            </div>
        )
    }
    if (seedStatus.status === 'error') {
        return (
            <div className='flex items-start gap-2.5'>
                <AlertTriangle size={16} className='text-amber-600 mt-0.5 shrink-0' />
                <div className='space-y-1'>
                    <p className='text-sm font-semibold text-[#1a1410]'>
                        השרת לא הגיב — התבניות הזמינות מגיעות מהקוד עצמו
                    </p>
                    <p className='text-[11.5px] text-[#a89378]'>
                        תבניות מערכת ממשיכות לעבוד גם בלי Firestore. אפשר לנסות שוב
                        על ידי רענון העמוד.
                    </p>
                </div>
            </div>
        )
    }
    if (seedStatus.status === 'already-present') {
        return (
            <div className='flex items-start gap-2.5'>
                <CheckCircle2 size={16} className='text-emerald-600 mt-0.5 shrink-0' />
                <div className='space-y-1'>
                    <p className='text-sm font-semibold text-[#1a1410]'>
                        הכל מסונכרן — {systemCount} תבניות מערכת
                        {studioCount > 0 ? `, ${studioCount} תבניות שלך` : ''}
                    </p>
                    <p className='text-[11.5px] text-[#a89378]'>
                        תבניות המערכת כבר נכתבו ל-Firestore. הזוגות רואים את אותן
                        תבניות ביצירת הספר.
                    </p>
                </div>
            </div>
        )
    }
    if (seedStatus.status === 'ok' && seedStatus.seeded > 0) {
        return (
            <div className='flex items-start gap-2.5'>
                <CheckCircle2 size={16} className='text-emerald-600 mt-0.5 shrink-0' />
                <div className='space-y-1'>
                    <p className='text-sm font-semibold text-[#1a1410]'>
                        {seedStatus.seeded} תבניות מערכת נכתבו ל-Firestore
                    </p>
                    <p className='text-[11.5px] text-[#a89378]'>
                        זה היה הסנכרון הראשון. מעכשיו כל שינוי שנעשה בסטודיו ישתקף
                        ישירות לזוגות בעמוד הצופה.
                    </p>
                </div>
            </div>
        )
    }
    // Fallback for any unexpected status — don't block the studio.
    return (
        <div className='flex items-center gap-2.5 text-sm text-[#7a6a52]'>
            <CheckCircle2 size={16} className='text-emerald-600 shrink-0' />
            <span>תבניות נטענו ({systemCount + studioCount})</span>
        </div>
    )
}

function PresetRow({ preset }) {
    const v = preset.values || {}
    const summary = [
        v.template ? `מבנה: ${v.template}` : null,
        v.fontKey ? `פונט: ${v.fontKey}` : null,
        v.frameId ? `מסגרת: ${v.frameId}` : v.frameId === null ? null : null,
        v.texture ? 'עם מרקם' : null,
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <li className='flex items-center gap-3 px-6 py-4'>
            <div
                className='w-10 h-10 rounded-lg shrink-0'
                style={{
                    background: preset.preview || '#ffffff',
                    border: '1px solid rgba(212,184,103,0.30)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.40)',
                }}
            />
            <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                    <p className='text-sm font-semibold text-[#1a1410] truncate'>
                        {preset.name || preset.id}
                    </p>
                    <span
                        className='text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded'
                        style={{
                            background:
                                preset.ownerType === 'system'
                                    ? 'rgba(170,136,64,0.10)'
                                    : 'rgba(125,167,106,0.12)',
                            color:
                                preset.ownerType === 'system' ? '#a8843a' : '#4f7a3e',
                        }}
                    >
                        {preset.ownerType === 'system' ? 'מערכת' : 'סטודיו'}
                    </span>
                </div>
                {summary && (
                    <p className='text-[11.5px] text-[#a89378] mt-0.5 truncate'>{summary}</p>
                )}
            </div>
        </li>
    )
}

export default function StudioPage() {
    return (
        <AdminPageWrapper>
            <StudioContent />
        </AdminPageWrapper>
    )
}
