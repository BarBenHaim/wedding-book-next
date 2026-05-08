'use client'

// /admin/studio — super-admin Book Template Studio.
//
// Three-column layout (read-only in this commit; editing arrives in
// the next):
//   • Left rail  — presets list (system + studio), pick one to load.
//   • Center     — live page preview at 1:1, with a length toggle
//                  (30 / 100 / 210 chars) so the user can sanity-check
//                  typography and image-slot sizing across content.
//   • Right rail — properties panel for the loaded preset (disabled).
//
// The preview mounts the actual <BookPageTemplate /> the viewer + PDF
// pipeline both render — guarantees what the user sees here is what
// will print, modulo DPI scaling.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
    Wand2, ChevronRight, CheckCircle2, AlertTriangle, Loader2,
    Palette, Image as ImageIcon, Type, Frame, Layers, RotateCw,
    Lock, Crown, Save, Copy, Trash2, Undo2, X,
} from 'lucide-react'
import { auth } from '@/lib/firebaseClient'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import {
    listPresets, seedBuiltinPresetsIfMissing, savePreset, deletePreset,
    clonePresetForEdit,
    resolvePreset, FRAMES_REGISTRY, FONTS_REGISTRY, TEXTURES_REGISTRY,
    FONT_IDS, FRAME_IDS,
} from '@/lib/studioPresets'

// ── Mock blessings at the three lengths the photo form supports ──
// Calibrated to read naturally in Hebrew at each length, not just hit
// the char count. The 210 figure matches the textarea maxLength on
// the guest photo form.
const MOCK_BLESSINGS = {
    30: 'מזל טוב, באהבה רבה לזוג הצעיר!',
    100:
        'איזה רגע מרגש — שתחיו חיים מלאים בצחוק, באהבה ובהרפתקאות. כל יום יהיה חגיגה אמיתית.',
    210:
        'איזו שמחה לראות אתכם מתחתנים. מי שזכה להכיר אתכם יודע שזה לא רק חיבור של זוג — זה שילוב של שני עולמות שחיים לתת זה לזה. שתחיו חיים שמלאים באהבה, בצחוק, בעוצמות, ובהמון רגעים מרגשים.',
}
const MOCK_BLESSING_LENGTHS = [30, 100, 210]

const MOCK_NAME = 'גיא ולירז'

// 4:3 placeholder photo — inline SVG data-URI so the preview never
// depends on a network asset and always renders at the canonical
// camera-capture aspect ratio. Three-tone wash + a subtle landscape
// silhouette so it reads as "photo" rather than "blank rectangle".
const MOCK_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
        <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#f5d39e"/>
                <stop offset="100%" stop-color="#d8b986"/>
            </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#sky)"/>
        <ellipse cx="320" cy="80" rx="38" ry="38" fill="#fff8e0" opacity="0.9"/>
        <path d="M0 220 Q100 170 200 200 T 400 210 V 300 H 0 Z" fill="#a87f4b"/>
        <path d="M0 250 Q120 220 240 240 T 400 250 V 300 H 0 Z" fill="#7a5a2f"/>
    </svg>`
)}`

// Page render size in the preview pane. 800px square is large enough
// to read every layout's typography clearly without scrolling on a
// 1280-wide screen, while still leaving room for the right rail.
const PREVIEW_SIZE = 800

function StudioContent() {
    const [seedStatus, setSeedStatus] = useState({ state: 'pending' })
    const [presets, setPresets] = useState([])
    const [activeId, setActiveId] = useState(null)
    const [blessingLength, setBlessingLength] = useState(100)

    // Draft — the editable copy of the loaded preset. Driven from
    // activePreset on selection change, then mutated by the
    // properties panel until the user saves or reverts.
    const [draft, setDraft] = useState(null)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null) // { type, message }

    // Seed + load. Same flow as the shell from the previous commit —
    // the rendering changes, the data does not.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const result = await seedBuiltinPresetsIfMissing()
            if (cancelled) return
            setSeedStatus({ state: 'done', ...result })
            const list = await listPresets()
            if (cancelled) return
            setPresets(list)
            if (list.length > 0 && !activeId) setActiveId(list[0].id)
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const activePreset = useMemo(
        () => presets.find(p => p.id === activeId) || null,
        [presets, activeId]
    )

    // Reset the draft whenever the active preset changes. JSON
    // round-trip gives us a deep clone so editing draft.values doesn't
    // mutate the shared preset object.
    useEffect(() => {
        setDraft(activePreset ? JSON.parse(JSON.stringify(activePreset)) : null)
    }, [activePreset?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const isSystem = draft?.ownerType === 'system'
    const editable = !!draft && !isSystem

    // Has the user changed anything since loading the preset? Compared
    // by JSON serialization — fast enough for the shape we have.
    const dirty = useMemo(() => {
        if (!draft || !activePreset) return false
        return JSON.stringify(draft) !== JSON.stringify(activePreset)
    }, [draft, activePreset])

    // Resolve the DRAFT (not the persisted preset) to the runtime
    // shape so the preview reflects unsaved edits live.
    const resolvedStyle = useMemo(() => {
        if (!draft) return null
        return resolvePreset(draft).values
    }, [draft])

    // Helpers for the properties panel — apply a partial values patch
    // immutably. Panel calls onChange({ key: newValue }) and we merge.
    const updateValues = patch => {
        if (!draft) return
        setDraft(prev => ({
            ...prev,
            values: { ...(prev.values || {}), ...patch },
        }))
    }
    const updateImageStyle = patch => {
        if (!draft) return
        setDraft(prev => ({
            ...prev,
            values: {
                ...(prev.values || {}),
                imageStyle: { ...(prev.values?.imageStyle || {}), ...patch },
            },
        }))
    }
    const updateName = name => {
        if (!draft) return
        setDraft(prev => ({ ...prev, name }))
    }

    // Mock entry passed to the renderer. `text` swaps with the length
    // toggle; everything else stays fixed.
    const mockEntry = useMemo(
        () => ({
            id: 'studio-mock',
            name: MOCK_NAME,
            text: MOCK_BLESSINGS[blessingLength],
            imageUrl: MOCK_PHOTO,
        }),
        [blessingLength]
    )

    const showToast = (type, message) => {
        setToast({ type, message })
        setTimeout(() => setToast(null), 3500)
    }

    // Replace the current selection with a freshly cloned editable
    // copy of the active preset. Doesn't write to Firestore — the
    // user has to hit Save to persist.
    const handleClone = () => {
        if (!activePreset) return
        const clone = clonePresetForEdit(activePreset, {
            uid: auth.currentUser?.uid,
        })
        // Insert the clone into the local list at the top of the
        // studio section + select it. It's not in Firestore yet, so
        // refreshing the page would lose it — that's intentional.
        // The user must save to persist.
        setPresets(prev => [...prev, clone])
        setActiveId(clone.id)
        showToast('info', 'נוצר עותק לעריכה — שמור כדי לשמר')
    }

    // Save the current draft. If the draft has never been saved (no
    // matching doc in Firestore — which is the case for a fresh
    // clone), this is the first write. Otherwise overwrite.
    const handleSave = async () => {
        if (!draft || saving || !editable) return
        setSaving(true)
        try {
            const saved = await savePreset(draft, {
                uid: auth.currentUser?.uid,
            })
            setPresets(prev => {
                const exists = prev.some(p => p.id === saved.id)
                return exists
                    ? prev.map(p => (p.id === saved.id ? saved : p))
                    : [...prev, saved]
            })
            setActiveId(saved.id)
            showToast('success', 'נשמר')
        } catch (err) {
            showToast('error', `שמירה נכשלה: ${err?.message || err}`)
        } finally {
            setSaving(false)
        }
    }

    // Save-as-new always writes a new doc with a fresh id. Useful
    // when the user wants to keep the original studio preset and
    // branch off it.
    const handleSaveAsNew = async () => {
        if (!draft || saving) return
        setSaving(true)
        try {
            const saved = await savePreset(
                { ...draft, name: `${draft.name || 'תבנית'} — עותק` },
                { uid: auth.currentUser?.uid, asNew: true }
            )
            setPresets(prev => [...prev, saved])
            setActiveId(saved.id)
            showToast('success', 'נשמרה תבנית חדשה')
        } catch (err) {
            showToast('error', `שמירה נכשלה: ${err?.message || err}`)
        } finally {
            setSaving(false)
        }
    }

    const handleRevert = () => {
        if (!activePreset) return
        setDraft(JSON.parse(JSON.stringify(activePreset)))
        showToast('info', 'בוטלו השינויים')
    }

    const handleDelete = async () => {
        if (!draft || !editable) return
        if (!window.confirm(`למחוק את התבנית "${draft.name}"? פעולה זו לא ניתנת לביטול.`)) return
        setSaving(true)
        try {
            await deletePreset(draft.id, draft.ownerType)
            setPresets(prev => prev.filter(p => p.id !== draft.id))
            const remaining = presets.filter(p => p.id !== draft.id)
            setActiveId(remaining[0]?.id || null)
            showToast('success', 'התבנית נמחקה')
        } catch (err) {
            showToast('error', `מחיקה נכשלה: ${err?.message || err}`)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            className='min-h-screen px-4 sm:px-6 lg:px-10 py-8 relative'
            dir='rtl'
            style={{
                backgroundColor: '#f8f4ec',
                backgroundImage: [
                    'radial-gradient(ellipse 1100px 560px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 600px 600px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                ].join(', '),
            }}
        >
            <div className='max-w-[1400px] mx-auto'>
                {/* Breadcrumb */}
                <div className='flex items-center gap-1.5 text-[12px] text-[#a89378] mb-4'>
                    <Link href='/admin' className='hover:text-[#7a6a52] transition-colors'>
                        מרכז הניהול
                    </Link>
                    <ChevronRight size={12} className='rotate-180' />
                    <span className='text-[#5a4d3a] font-semibold'>סטודיו עיצוב</span>
                </div>

                {/* Header */}
                <div className='flex items-center justify-between gap-4 mb-6'>
                    <div className='flex items-center gap-4'>
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
                            <p className='mt-1' style={{ color: '#a89378', fontSize: '12px' }}>
                                בחירת תבנית קיימת ותצוגת חיה. עריכה ויצירת תבניות חדשות —
                                בעדכון הבא.
                            </p>
                        </div>
                    </div>

                    <SeedStatusChip seedStatus={seedStatus} />
                </div>

                {/* Action bar — name input + save/clone/revert/delete.
                    Hidden when nothing is loaded; shows different
                    actions for system (clone-only) vs studio
                    (save/saveAsNew/delete). */}
                {draft && (
                    <ActionBar
                        draft={draft}
                        isSystem={isSystem}
                        dirty={dirty}
                        saving={saving}
                        onNameChange={updateName}
                        onClone={handleClone}
                        onSave={handleSave}
                        onSaveAsNew={handleSaveAsNew}
                        onRevert={handleRevert}
                        onDelete={handleDelete}
                    />
                )}

                {/* Three-column grid. Stacks on narrower screens so
                    the studio is at least usable on tablet — though
                    full polish is a desktop feature. */}
                <div className='grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-5'>
                    <PresetListPanel
                        presets={presets}
                        activeId={activeId}
                        onSelect={setActiveId}
                    />
                    <PreviewPanel
                        preset={draft}
                        styleSettings={resolvedStyle}
                        entry={mockEntry}
                        blessingLength={blessingLength}
                        onBlessingLengthChange={setBlessingLength}
                    />
                    <PropertiesPanel
                        draft={draft}
                        editable={editable}
                        onValuesChange={updateValues}
                        onImageStyleChange={updateImageStyle}
                    />
                </div>

                {/* Toast — fixed-bottom notice for save/error/info. */}
                {toast && (
                    <div
                        className='fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl flex items-center gap-2'
                        style={{
                            background:
                                toast.type === 'success'
                                    ? 'rgba(167,212,148,0.95)'
                                    : toast.type === 'error'
                                    ? 'rgba(239,168,168,0.95)'
                                    : 'rgba(255,255,255,0.95)',
                            color:
                                toast.type === 'success'
                                    ? '#1f4d1d'
                                    : toast.type === 'error'
                                    ? '#5d1a1a'
                                    : '#3d3225',
                            border: '1px solid rgba(212,184,103,0.30)',
                            backdropFilter: 'blur(6px)',
                        }}
                    >
                        {toast.message}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Top action bar — name input + Save / Save-as-new / Revert /
//    Delete / Clone (for system presets). ───────────────────────────
function ActionBar({
    draft,
    isSystem,
    dirty,
    saving,
    onNameChange,
    onClone,
    onSave,
    onSaveAsNew,
    onRevert,
    onDelete,
}) {
    return (
        <div
            className='rounded-2xl px-4 py-3 mb-5 flex items-center gap-2.5 flex-wrap'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 8px 20px -16px rgba(170,136,64,0.22)',
            }}
        >
            <input
                type='text'
                value={draft.name || ''}
                onChange={e => onNameChange(e.target.value)}
                disabled={isSystem}
                placeholder='שם התבנית'
                className='flex-1 min-w-[180px] px-3 py-2 rounded-lg text-[14px] font-bold text-[#1a1410] outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                style={{
                    background: '#fbf6ec',
                    border: '1px solid #ead9b3',
                }}
            />

            {isSystem ? (
                <>
                    <span className='flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-full bg-amber-50 border border-amber-200 text-amber-700'>
                        <Crown size={11} /> תבנית מערכת — לקריאה בלבד
                    </span>
                    <button
                        onClick={onClone}
                        className='inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-all'
                        style={{
                            background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                            boxShadow: '0 6px 14px -8px rgba(170,136,64,0.50)',
                        }}
                    >
                        <Copy size={14} /> צור עותק לעריכה
                    </button>
                </>
            ) : (
                <>
                    {dirty && (
                        <span className='px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[#AA8840]/10 text-[#a8843a] border border-[#AA8840]/30'>
                            לא נשמר
                        </span>
                    )}
                    <button
                        onClick={onRevert}
                        disabled={!dirty || saving}
                        title='בטל שינויים'
                        className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed'
                        style={{
                            background: '#ffffff',
                            border: '1px solid #ead9b3',
                            color: '#7a6a52',
                        }}
                    >
                        <Undo2 size={13} /> בטל
                    </button>
                    <button
                        onClick={onSaveAsNew}
                        disabled={saving}
                        className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed'
                        style={{
                            background: '#ffffff',
                            border: '1px solid #ead9b3',
                            color: '#7a6a52',
                        }}
                    >
                        <Copy size={13} /> שמור כעותק
                    </button>
                    <button
                        onClick={onDelete}
                        disabled={saving}
                        title='מחק את התבנית הזו'
                        className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed'
                        style={{
                            background: '#fff5f5',
                            border: '1px solid #ffcdcd',
                            color: '#b32424',
                        }}
                    >
                        <Trash2 size={13} />
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!dirty || saving}
                        className='inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed'
                        style={{
                            background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                            boxShadow: '0 6px 14px -8px rgba(170,136,64,0.50)',
                        }}
                    >
                        {saving ? <Loader2 size={14} className='animate-spin' /> : <Save size={14} />}
                        שמור
                    </button>
                </>
            )}
        </div>
    )
}

// ── Seed status chip — collapsed inline summary so the giant panel
//    from the previous shell doesn't dominate the layout. ───────────
function SeedStatusChip({ seedStatus }) {
    if (seedStatus.state === 'pending') {
        return (
            <div className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#ead9b3] text-[11.5px] text-[#7a6a52]'>
                <Loader2 size={11} className='animate-spin' /> מסנכרן...
            </div>
        )
    }
    if (seedStatus.status === 'error') {
        return (
            <div className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-[11.5px] text-amber-700'>
                <AlertTriangle size={11} /> Firestore לא זמין
            </div>
        )
    }
    return (
        <div className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11.5px] text-emerald-700'>
            <CheckCircle2 size={11} />
            {seedStatus.status === 'ok' && seedStatus.seeded > 0
                ? `${seedStatus.seeded} תבניות סונכרנו`
                : 'מסונכרן'}
        </div>
    )
}

// ── Left rail: preset list, system first then studio ─────────────────
function PresetListPanel({ presets, activeId, onSelect }) {
    const system = presets.filter(p => p.ownerType === 'system')
    const studio = presets.filter(p => p.ownerType === 'studio')

    return (
        <aside
            className='rounded-2xl overflow-hidden self-start sticky top-6'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 16px 32px -20px rgba(170,136,64,0.20)',
                maxHeight: 'calc(100vh - 80px)',
            }}
        >
            <div
                className='px-4 py-3.5 border-b border-[#f0e8d4]'
                style={{ background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}
            >
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold'>
                    תבניות
                </p>
            </div>

            <div className='overflow-y-auto' style={{ maxHeight: 'calc(100vh - 140px)' }}>
                {presets.length === 0 ? (
                    <div className='py-10 flex flex-col items-center gap-2'>
                        <Loader2 size={16} className='animate-spin text-[#a8843a]' />
                        <span className='text-[11.5px] text-[#a89378]'>טוען...</span>
                    </div>
                ) : (
                    <>
                        <PresetGroup
                            label='מערכת'
                            sublabel='לקריאה בלבד — יצרו עותק לעריכה'
                            presets={system}
                            activeId={activeId}
                            onSelect={onSelect}
                            badge='system'
                        />
                        {studio.length > 0 && (
                            <PresetGroup
                                label='התבניות שלי'
                                presets={studio}
                                activeId={activeId}
                                onSelect={onSelect}
                                badge='studio'
                            />
                        )}
                    </>
                )}
            </div>
        </aside>
    )
}

function PresetGroup({ label, sublabel, presets, activeId, onSelect, badge }) {
    if (presets.length === 0) return null
    return (
        <div className='px-2 py-2'>
            <div className='px-3 py-1.5'>
                <p className='text-[10.5px] font-bold uppercase tracking-widest text-[#a89378]'>
                    {label}
                </p>
                {sublabel && (
                    <p className='text-[10px] text-[#c4b9a4] mt-0.5'>{sublabel}</p>
                )}
            </div>
            <ul className='space-y-0.5'>
                {presets.map(p => (
                    <li key={p.id}>
                        <button
                            onClick={() => onSelect(p.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                                activeId === p.id
                                    ? 'bg-[#AA8840]/10 ring-1 ring-[#AA8840]/30'
                                    : 'hover:bg-[#fbf6ec]'
                            }`}
                        >
                            <div
                                className='w-7 h-7 rounded-md shrink-0'
                                style={{
                                    background: p.preview || '#ffffff',
                                    border: '1px solid rgba(212,184,103,0.30)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.40)',
                                }}
                            />
                            <span
                                className={`flex-1 text-right text-[12.5px] truncate ${
                                    activeId === p.id ? 'text-[#1a1410] font-bold' : 'text-[#5a4d3a] font-semibold'
                                }`}
                            >
                                {p.name || p.id}
                            </span>
                            {badge === 'system' && (
                                <Crown size={10} className='text-[#a8843a] shrink-0' />
                            )}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}

// ── Center: preview + length toggle ──────────────────────────────────
function PreviewPanel({ preset, styleSettings, entry, blessingLength, onBlessingLengthChange }) {
    return (
        <main
            className='rounded-2xl overflow-hidden flex flex-col'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 16px 32px -20px rgba(170,136,64,0.20)',
                minHeight: '600px',
            }}
        >
            {/* Toolbar */}
            <div
                className='px-5 py-3 border-b border-[#f0e8d4] flex items-center justify-between gap-3'
                style={{ background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}
            >
                <div className='flex items-center gap-2.5 min-w-0'>
                    <div
                        className='w-1.5 h-5 rounded-full shrink-0'
                        style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}
                    />
                    <h2 className='text-[14px] font-bold text-[#1a1410] truncate'>
                        {preset?.name || 'תצוגה חיה'}
                    </h2>
                    <span className='text-[10.5px] text-[#a89378]'>1:1 · 8.5"×8.5"</span>
                </div>

                {/* Length toggle — 30 / 100 / 210 chars. Sets the mock
                    blessing the preview renders so the user can see if
                    typography + text-area-width hold up across content. */}
                <div
                    className='flex rounded-lg overflow-hidden shrink-0'
                    style={{ border: '1px solid #ead9b3' }}
                >
                    {MOCK_BLESSING_LENGTHS.map((len, i) => (
                        <button
                            key={len}
                            onClick={() => onBlessingLengthChange(len)}
                            className={`px-3 py-1.5 text-[11.5px] font-bold transition-all ${
                                blessingLength === len
                                    ? 'text-white'
                                    : 'text-[#7a6a52] hover:bg-[#fbf6ec]'
                            } ${i > 0 ? 'border-r border-[#ead9b3]' : ''}`}
                            style={
                                blessingLength === len
                                    ? {
                                          background:
                                              'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                      }
                                    : { background: '#ffffff' }
                            }
                        >
                            {len} תווים
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview canvas */}
            <div
                className='flex-1 flex items-center justify-center p-8 overflow-auto'
                style={{ background: '#f4ecd9' }}
            >
                {!preset || !styleSettings ? (
                    <div className='text-center text-[#a89378] text-sm'>
                        בחר תבנית מהרשימה
                    </div>
                ) : (
                    <div
                        className='shrink-0'
                        style={{
                            width: PREVIEW_SIZE,
                            height: PREVIEW_SIZE,
                            boxShadow:
                                '0 30px 60px -25px rgba(0,0,0,0.30), 0 8px 20px -8px rgba(0,0,0,0.18)',
                            borderRadius: 4,
                            overflow: 'hidden',
                            background: '#ffffff',
                        }}
                    >
                        <BookPageTemplate
                            entry={entry}
                            styleSettings={styleSettings}
                            scaledWidth={PREVIEW_SIZE}
                            scaledHeight={PREVIEW_SIZE}
                        />
                    </div>
                )}
            </div>
        </main>
    )
}

// ── Right rail: properties panel ─────────────────────────────────────
// Editable when the loaded preset is a studio preset; system presets
// stay read-only (the action bar surfaces a "Clone for editing"
// button instead). All controls operate on draft.values via the
// onValuesChange / onImageStyleChange callbacks.
function PropertiesPanel({ draft, editable, onValuesChange, onImageStyleChange }) {
    const isSystem = draft?.ownerType === 'system'
    const v = draft?.values || {}

    return (
        <aside
            className='rounded-2xl overflow-hidden self-start sticky top-6'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 16px 32px -20px rgba(170,136,64,0.20)',
                maxHeight: 'calc(100vh - 80px)',
            }}
        >
            <div
                className='px-4 py-3.5 border-b border-[#f0e8d4]'
                style={{ background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}
            >
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold'>
                    מאפיינים
                </p>
                {draft && isSystem && (
                    <p className='text-[10.5px] text-[#a89378] mt-1 leading-relaxed'>
                        תבנית מערכת — צור עותק כדי לערוך.
                    </p>
                )}
                {draft && !isSystem && (
                    <p className='text-[10.5px] text-[#a89378] mt-1 leading-relaxed'>
                        השינויים מתעדכנים בתצוגה החיה. לחץ "שמור" כדי לשמר.
                    </p>
                )}
            </div>

            <div
                className='overflow-y-auto'
                style={{ maxHeight: 'calc(100vh - 140px)' }}
            >
                {!draft ? (
                    <div className='p-6 text-center text-[12px] text-[#a89378]'>
                        בחר תבנית כדי לראות את המאפיינים שלה
                    </div>
                ) : (
                    <div className='p-4 space-y-4'>
                        {/* Renderer / template — kept read-only even
                            for studio presets. Switching renderers
                            mid-edit invalidates many style fields and
                            the studio v1 doesn't reconcile that. */}
                        <PropertyRow icon={Layers} label='מבנה' value={v.template || 'classic'} />

                        <PropertyColorEdit
                            icon={Palette}
                            label='רקע'
                            value={v.backgroundColor}
                            disabled={!editable}
                            onChange={c => onValuesChange({ backgroundColor: c })}
                        />

                        <PropertyFontEdit
                            icon={Type}
                            label='פונט'
                            fontKey={v.fontKey}
                            disabled={!editable}
                            onChange={k => onValuesChange({ fontKey: k })}
                        />

                        <PropertySlider
                            icon={Type}
                            label='גודל פונט'
                            value={v.fontSizePercent ?? 2.5}
                            min={1.5}
                            max={6}
                            step={0.1}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ fontSizePercent: n })}
                        />

                        <PropertyColorEdit
                            icon={Palette}
                            label='צבע פונט'
                            value={v.fontColor}
                            disabled={!editable}
                            onChange={c => onValuesChange({ fontColor: c })}
                        />

                        <PropertyFrameEdit
                            icon={Frame}
                            label='מסגרת'
                            frameId={v.frameId}
                            disabled={!editable}
                            onChange={id => onValuesChange({ frameId: id })}
                        />

                        <PropertyTextureEdit
                            icon={ImageIcon}
                            label='מרקם'
                            textureUrl={v.texture}
                            disabled={!editable}
                            onChange={url => onValuesChange({ texture: url })}
                        />

                        {/* Image size — width drives, height auto-
                            tracks 4:3 (no unlock). Stored as
                            imageStyle.{width,height} in % of page. */}
                        <PropertyImageSize
                            imageStyle={v.imageStyle}
                            disabled={!editable}
                            onChange={width =>
                                onImageStyleChange({
                                    width,
                                    height: Math.round(width * 0.75),
                                })
                            }
                        />

                        <PropertySlider
                            icon={RotateCw}
                            label='עיגול פינות תמונה'
                            value={Number(v.imageStyle?.borderRadius) || 0}
                            min={0}
                            max={48}
                            step={1}
                            unit='px'
                            disabled={!editable}
                            onChange={n =>
                                onImageStyleChange({ borderRadius: n })
                            }
                        />
                    </div>
                )}
            </div>
        </aside>
    )
}

// ── Property field components ────────────────────────────────────────

function PropertyRow({ icon: Icon, label, value }) {
    return (
        <div>
            <div className='flex items-center gap-1.5 mb-1.5'>
                {Icon && <Icon size={12} className='text-[#c9a44e]' />}
                <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                    {label}
                </span>
            </div>
            <div
                className='px-3 py-2 rounded-lg text-[12.5px] text-[#3d3225] font-medium'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                {value}
            </div>
        </div>
    )
}

// Color picker — native <input type=color> wrapped in the studio's
// soft cream surface. Showing the raw hex too so the user can paste
// a value precisely.
function PropertyColorEdit({ icon: Icon, label, value, disabled, onChange }) {
    if (value === undefined || value === null) {
        // Fall back to a sensible default the renderer accepts when
        // the preset doesn't carry an explicit value.
        return (
            <PropertyColorEdit
                icon={Icon}
                label={label}
                value={label === 'רקע' ? '#ffffff' : '#000000'}
                disabled={disabled}
                onChange={onChange}
            />
        )
    }
    return (
        <div>
            <PropertyHeader icon={Icon} label={label} />
            <div
                className='flex items-center gap-2 px-2.5 py-2 rounded-lg'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                <input
                    type='color'
                    value={value}
                    disabled={disabled}
                    onChange={e => onChange(e.target.value)}
                    className='w-7 h-7 rounded shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'
                    style={{ border: '1px solid rgba(0,0,0,0.10)' }}
                />
                <input
                    type='text'
                    value={value}
                    disabled={disabled}
                    onChange={e => onChange(e.target.value)}
                    className='flex-1 bg-transparent text-[12px] font-mono text-[#5a4d3a] outline-none disabled:opacity-60 disabled:cursor-not-allowed'
                />
            </div>
        </div>
    )
}

// Font picker — list of every loaded face. Each row renders the
// label IN its own font so the user can compare visually.
function PropertyFontEdit({ icon: Icon, label, fontKey, disabled, onChange }) {
    return (
        <div>
            <PropertyHeader icon={Icon} label={label} />
            <div
                className='rounded-lg overflow-hidden'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                <div className='max-h-44 overflow-y-auto'>
                    {FONT_IDS.map(id => {
                        const f = FONTS_REGISTRY[id]
                        const active = id === fontKey
                        return (
                            <button
                                key={id}
                                type='button'
                                onClick={() => !disabled && onChange(id)}
                                disabled={disabled}
                                className={`w-full text-right px-3 py-2 transition-colors disabled:cursor-not-allowed ${
                                    active
                                        ? 'bg-[#AA8840]/15'
                                        : 'hover:bg-[#f4ecd9]'
                                }`}
                            >
                                <span
                                    className={`text-[14px] ${
                                        active ? 'text-[#1a1410] font-bold' : 'text-[#3d3225]'
                                    } ${f.font.className}`}
                                >
                                    {f.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// Frame picker — thumbnail grid + a "ללא" tile to clear the frame.
function PropertyFrameEdit({ icon: Icon, label, frameId, disabled, onChange }) {
    return (
        <div>
            <PropertyHeader icon={Icon} label={label} />
            <div className='grid grid-cols-3 gap-1.5'>
                <FrameTile
                    isNone
                    selected={!frameId}
                    disabled={disabled}
                    onClick={() => !disabled && onChange(null)}
                />
                {FRAME_IDS.map(id => {
                    const f = FRAMES_REGISTRY[id]
                    return (
                        <FrameTile
                            key={id}
                            src={f.src}
                            selected={id === frameId}
                            disabled={disabled}
                            onClick={() => !disabled && onChange(id)}
                        />
                    )
                })}
            </div>
        </div>
    )
}

function FrameTile({ src, isNone, selected, disabled, onClick }) {
    return (
        <button
            type='button'
            onClick={onClick}
            disabled={disabled}
            className={`relative aspect-square rounded-lg overflow-hidden transition-all disabled:cursor-not-allowed ${
                selected
                    ? 'ring-2 ring-[#AA8840] ring-offset-1'
                    : 'hover:scale-105'
            }`}
            style={{
                background: '#ffffff',
                border: '1px solid #ead9b3',
            }}
        >
            {isNone ? (
                <span className='absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#a89378]'>
                    <X size={14} />
                </span>
            ) : (
                <img
                    src={src}
                    alt=''
                    className='absolute inset-0 w-full h-full object-cover'
                />
            )}
        </button>
    )
}

// Texture picker — same shape as the frame picker.
function PropertyTextureEdit({ icon: Icon, label, textureUrl, disabled, onChange }) {
    return (
        <div>
            <PropertyHeader icon={Icon} label={label} />
            <div className='grid grid-cols-5 gap-1.5'>
                <FrameTile
                    isNone
                    selected={!textureUrl}
                    disabled={disabled}
                    onClick={() => !disabled && onChange(null)}
                />
                {TEXTURES_REGISTRY.map(t => (
                    <FrameTile
                        key={t.id}
                        src={t.src}
                        selected={t.src === textureUrl}
                        disabled={disabled}
                        onClick={() => !disabled && onChange(t.src)}
                    />
                ))}
            </div>
        </div>
    )
}

// Generic numeric slider — used for font size + image corner radius.
// Editable when onChange is provided + not disabled. Steps fractionally
// for percentages, integer for px.
function PropertySlider({ icon: Icon, label, value, min, max, step, unit, disabled, onChange }) {
    return (
        <div>
            <div className='flex items-center justify-between gap-1.5 mb-1.5'>
                <div className='flex items-center gap-1.5'>
                    {Icon && <Icon size={12} className='text-[#c9a44e]' />}
                    <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                        {label}
                    </span>
                </div>
                <span className='text-[11px] font-mono text-[#3d3225]'>
                    {Number(value).toFixed(step < 1 ? 1 : 0)} {unit}
                </span>
            </div>
            <input
                type='range'
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onChange={e => onChange && onChange(Number(e.target.value))}
                className='w-full accent-[#AA8840] disabled:opacity-50 disabled:cursor-not-allowed'
            />
        </div>
    )
}

// Image size — width-only slider with height locked at 4:3. The lock
// icon makes the coupling visible without offering an unlock toggle:
// the WYSIWYG capture pipeline depends on a 4:3 image throughout, so
// allowing arbitrary aspect here would silently break print fidelity.
function PropertyImageSize({ imageStyle, disabled, onChange }) {
    const width = imageStyle?.width ?? 90
    const height = imageStyle?.height ?? Math.round(width * 0.75) // 4:3
    return (
        <div>
            <div className='flex items-center justify-between gap-1.5 mb-1.5'>
                <div className='flex items-center gap-1.5'>
                    <ImageIcon size={12} className='text-[#c9a44e]' />
                    <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                        גודל תמונה
                    </span>
                    <Lock size={9} className='text-[#a89378]' />
                </div>
                <span className='text-[11px] font-mono text-[#3d3225]'>
                    {Number(width).toFixed(0)}% × {Number(height).toFixed(0)}%
                </span>
            </div>
            <input
                type='range'
                value={width}
                min={30}
                max={100}
                step={1}
                disabled={disabled}
                onChange={e => onChange && onChange(Number(e.target.value))}
                className='w-full accent-[#AA8840] disabled:opacity-50 disabled:cursor-not-allowed'
            />
            <p className='text-[10px] text-[#a89378] mt-1 leading-relaxed'>
                גובה ננעל ליחס 4:3 — אותו יחס שהמצלמה והקרופר מחייבים, כדי
                שהתצוגה תתאים לדפוס.
            </p>
        </div>
    )
}

// Tiny header used by every editable property row so the layout stays
// consistent without repeating four lines of markup per field.
function PropertyHeader({ icon: Icon, label }) {
    return (
        <div className='flex items-center gap-1.5 mb-1.5'>
            {Icon && <Icon size={12} className='text-[#c9a44e]' />}
            <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                {label}
            </span>
        </div>
    )
}

export default function StudioPage() {
    return (
        <AdminPageWrapper>
            <StudioContent />
        </AdminPageWrapper>
    )
}
