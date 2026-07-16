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

import { useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import {
    Wand2, ChevronRight, CheckCircle2, AlertTriangle, Loader2,
    Palette, Image as ImageIcon, Type, Frame, Layers, RotateCw,
    Lock, Crown, Save, Copy, Trash2, Undo2, X, Upload,
} from 'lucide-react'
import { auth } from '@/lib/firebaseClient'
import { onAuthStateChanged } from 'firebase/auth'
import { isSuperAdmin } from '@/lib/superAdmin'
import { useRouter } from 'next/navigation'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import {
    listPresets, seedBuiltinPresetsIfMissing, savePreset, deletePreset,
    clonePresetForEdit, listAllBackgrounds, uploadBackground,
    deleteStudioBackground,
    resolvePreset, FRAMES_REGISTRY, FONTS_REGISTRY, TEXTURES_REGISTRY,
    FONT_IDS, FRAME_IDS,
} from '@/lib/studioPresets'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { EVENT_TYPE_ORDER, getEventConfig } from '@/lib/eventTypes'
import { PHOTO_FRAMES } from '@/lib/photoFrames'
import { uploadPhotoFrameAsset, listPhotoFrameAssets, deletePhotoFrameAsset } from '@/lib/studioPresets'
import { listDefaultCovers, uploadDefaultCover, clearDefaultCover } from '@/lib/studioPresets'
import { PUBLIC_EVENT_TYPES, EVENT_TYPE_META } from '@/lib/onboarding'
import FramedPhoto from '@/components/FramedPhoto/FramedPhoto'
import { applyPresetClean } from '@/lib/bookDesignSchema'

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

// Page render size in the preview pane. Desktop renders at 800px
// square — large enough to read typography clearly while leaving
// room for the side rails. On mobile we clamp to viewport width
// minus padding (set in usePreviewSize below) so the 1:1 page never
// overflows on a 375-wide phone. BookPageTemplate uses scaledWidth/
// Height to compute its own font + image sizes, so passing the
// clamped value keeps everything proportional — no transforms.
const PREVIEW_SIZE_DESKTOP = 800
const PREVIEW_PADDING_MOBILE = 48 // page px-4 (16) + canvas p-4 (16) on each side, roughly
const PREVIEW_BREAKPOINT = 1024 // matches Tailwind's `lg:` cutoff used in the column grid

// Hook — returns the live preview-canvas size. Tracks viewport width
// so the 1:1 page renders crisply on both desktop and a 375-wide
// phone. Re-runs on window resize so the preview reflows when the
// user rotates their device or pops out a sidebar in dev tools.
function usePreviewSize() {
    const [size, setSize] = useState(PREVIEW_SIZE_DESKTOP)
    useEffect(() => {
        if (typeof window === 'undefined') return
        const update = () => {
            const w = window.innerWidth
            if (w >= PREVIEW_BREAKPOINT) {
                setSize(PREVIEW_SIZE_DESKTOP)
            } else {
                // On mobile / tablet the canvas owns the full main
                // column. Cap at desktop size so big tablets don't
                // grow it past where typography stays comfortable.
                setSize(Math.min(PREVIEW_SIZE_DESKTOP, w - PREVIEW_PADDING_MOBILE))
            }
        }
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])
    return size
}

// Mobile-only tab IDs. On lg+ the three panels render in parallel
// columns; below that the user picks one tab at a time and the
// other two collapse off-screen.
const MOBILE_TABS = [
    { id: 'presets', label: 'תבניות' },
    { id: 'preview', label: 'תצוגה' },
    { id: 'properties', label: 'מאפיינים' },
]

// Visibility wrapper for the three panels. On mobile, only the
// active-tab panel renders; on lg+ all three render regardless.
// Centralising the toggle keeps the panel components themselves
// unaware of the mobile tab state.
function tabClass(active) {
    return active ? 'block' : 'hidden lg:block'
}

function StudioContent() {
    const [seedStatus, setSeedStatus] = useState({ state: 'pending' })
    const [presets, setPresets] = useState([])
    const [activeId, setActiveId] = useState(null)
    const [blessingLength, setBlessingLength] = useState(100)

    // Preview photo override — defaults to MOCK_PHOTO (the inline SVG
    // placeholder). The super-admin can upload a real wedding photo
    // here to see how skin tones / exposure / faces sit against the
    // chosen typography + spacing. Stored as a data URL in component
    // state — never persisted, never sent anywhere; the upload exists
    // purely for visual sanity-checking the template. A second click
    // on the same button reverts to the SVG.
    const [previewPhoto, setPreviewPhoto] = useState(null)
    const previewPhotoInputRef = useRef(null)
    const handlePreviewPhotoPick = e => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onloadend = () => setPreviewPhoto(reader.result)
        reader.readAsDataURL(file)
        // Reset the input so picking the same file twice still fires
        // onChange (browsers debounce identical selections otherwise).
        if (e.target) e.target.value = ''
    }

    // Mobile-only tab state. Defaults to "preview" — the panel the
    // user looks at most. lg+ ignores this entirely (all three panels
    // render side by side regardless).
    const [mobileTab, setMobileTab] = useState('preview')

    const previewSize = usePreviewSize()

    // Draft — the editable copy of the loaded preset. Driven from
    // activePreset on selection change, then mutated by the
    // properties panel until the user saves or reverts.
    const [draft, setDraft] = useState(null)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null) // { type, message }

    // Backgrounds (static + uploaded). Pulled once on mount + after
    // every successful upload/delete so the picker reflects the
    // latest collection.
    const [backgrounds, setBackgrounds] = useState([])
    const [uploadStatus, setUploadStatus] = useState({ state: 'idle' })

    const refreshBackgrounds = async () => {
        const list = await listAllBackgrounds()
        setBackgrounds(list)
    }
    useEffect(() => {
        refreshBackgrounds()
    }, [])

    const handleUploadBackground = async file => {
        if (!file) return
        setUploadStatus({ state: 'pending' })
        try {
            const saved = await uploadBackground(file, {
                uid: auth.currentUser?.uid,
            })
            await refreshBackgrounds()
            setUploadStatus({ state: 'idle' })
            // Auto-select the freshly uploaded background.
            updateValues({ texture: saved.url })
            showToast('success', 'הרקע הועלה ונבחר')
        } catch (err) {
            setUploadStatus({ state: 'idle' })
            showToast('error', err?.message || 'העלאה נכשלה')
        }
    }

    const handleDeleteBackground = async bg => {
        if (!bg || bg.origin !== 'studio') return
        if (!window.confirm(`למחוק את הרקע "${bg.label}"?`)) return
        try {
            await deleteStudioBackground(bg.id, bg.storagePath)
            await refreshBackgrounds()
            // If the deleted background was the active texture, clear it.
            if (draft?.values?.texture === bg.url) {
                updateValues({ texture: null })
            }
            showToast('success', 'הרקע נמחק')
        } catch (err) {
            showToast('error', err?.message || 'מחיקה נכשלה')
        }
    }

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
    // Spring 2026 user request: super-admin can edit/delete system
    // presets too — the AdminGate below ensures only the super-admin
    // reaches this page, so there's no need for a UI-level read-only
    // shield. The `isSystem` flag is still used for the small "מערכת"
    // badge so the user sees what they're touching, but not for
    // gating actions.
    const editable = !!draft

    // Has the user changed anything since loading the preset? Compared
    // by JSON serialization — fast enough for the shape we have.
    const dirty = useMemo(() => {
        if (!draft || !activePreset) return false
        return JSON.stringify(draft) !== JSON.stringify(activePreset)
    }, [draft, activePreset])

    // Resolve the DRAFT (not the persisted preset) to the runtime
    // shape so the preview reflects unsaved edits live.
    //
    // CRITICAL — merge with `defaultStyle` exactly the way the viewer
    // does (`{ ...defaultStyle, ...firestoreData.coverDesign }`). The
    // viewer's render path always sees defaultStyle's baseline fields
    // (e.g. `pagePadding: 0`, `imageStyle: { width: 90, ... }`)
    // because of that merge. If the studio preview renders the raw
    // preset values without the same merge, BookPageTemplate's `??`
    // fallbacks kick in (pagePadding → 4, etc) and the same preset
    // looks DIFFERENT in studio vs in the actual book — the bug the
    // user hit when their nameMarginTop edits "didn't show right" in
    // the wedding viewer.
    const resolvedStyle = useMemo(() => {
        if (!draft) return null
        return { ...defaultStyle, ...resolvePreset(draft).values }
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
    // Toggle the draft's `isPrivate` flag. The save flow persists
    // whatever value is on draft, so we just flip it in local state
    // and let the user decide when to commit (Save button).
    const togglePrivate = () => {
        if (!draft) return
        setDraft(prev => ({ ...prev, isPrivate: !prev.isPrivate }))
    }
    // Toggle a single event-type tag on the draft (root-level
    // `eventTypes: string[]` — NOT inside values). Empty array (or
    // missing) = generic preset, shown for every event type. The
    // couple-facing pickers filter on this via presetMatchesEventType.
    const toggleEventType = typeId => {
        if (!draft) return
        setDraft(prev => {
            const cur = Array.isArray(prev.eventTypes) ? prev.eventTypes : []
            const next = cur.includes(typeId)
                ? cur.filter(t => t !== typeId)
                : [...cur, typeId]
            return { ...prev, eventTypes: next }
        })
    }
    const clearEventTypes = () => {
        if (!draft) return
        setDraft(prev => ({ ...prev, eventTypes: [] }))
    }

    // Preview mode: regular page (name+text+photo) vs a blessing-only
    // page (no photo) — the page the auto-split produces and the one
    // `blessingTemplate` styles. Lets the admin SEE the blessing-page
    // layout they picked without leaving the studio.
    const [previewBlessingOnly, setPreviewBlessingOnly] = useState(false)

    // Mock entry passed to the renderer. `text` swaps with the length
    // toggle; everything else stays fixed. When the draft's composition
    // layer says two-per-page, the preview becomes a real duo page so
    // the admin sees exactly what the book will render.
    const mockEntry = useMemo(() => {
        const base = {
            id: 'studio-mock',
            name: MOCK_NAME,
            text: MOCK_BLESSINGS[blessingLength],
            imageUrl: previewBlessingOnly ? null : previewPhoto || MOCK_PHOTO,
        }
        if (draft?.values?.entriesPerPage === 2) {
            return {
                id: 'studio-mock-duo',
                _duo: [
                    base,
                    {
                        id: 'studio-mock-2',
                        name: 'משפחת כהן',
                        text: 'איזה אירוע מהמם! מאחלים המון אושר ושמחה, היה כיף להיות חלק מהערב הזה 💛',
                        imageUrl: previewBlessingOnly ? null : previewPhoto || MOCK_PHOTO,
                    },
                ],
            }
        }
        return base
    }, [blessingLength, previewPhoto, previewBlessingOnly, draft?.values?.entriesPerPage])

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

    // ── Guided preset builder ("פריסט חדש") ──────────────────────────
    // The wizard walks the four architecture layers in order —
    // composition → surface → typography → photo frame — with a live
    // page preview, then drops a fully-formed draft into the editor
    // for fine-tuning + save. applyPresetClean guarantees the draft
    // carries every canonical key from birth.
    const [wizardOpen, setWizardOpen] = useState(false)
    const handleWizardCreate = ({ name, values }) => {
        const fresh = clonePresetForEdit(
            { name: name || 'פריסט חדש', values: applyPresetClean(values) },
            { uid: auth.currentUser?.uid },
        )
        fresh.name = name || 'פריסט חדש' // clone suffixes "— עותק"; keep the wizard's name
        setPresets(prev => [...prev, fresh])
        setActiveId(fresh.id)
        setWizardOpen(false)
        showToast('info', 'הפריסט נוצר — כוונן פרטים ושמור כדי לשמר')
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
                <div className='flex items-start sm:items-center justify-between gap-3 mb-6 flex-wrap'>
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

                    <div className='flex items-center gap-2'>
                        <button
                            onClick={() => setWizardOpen(true)}
                            className='flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white transition-all hover:brightness-105 active:scale-[0.98]'
                            style={{
                                background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                boxShadow: '0 6px 16px -6px rgba(170,136,64,0.55)',
                            }}
                        >
                            <Wand2 className='w-4 h-4' />
                            פריסט חדש
                        </button>
                        <SeedStatusChip seedStatus={seedStatus} />
                    </div>
                </div>

                {wizardOpen && (
                    <PresetWizard
                        backgrounds={backgrounds}
                        onClose={() => setWizardOpen(false)}
                        onCreate={handleWizardCreate}
                    />
                )}

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
                        onTogglePrivate={togglePrivate}
                        onClone={handleClone}
                        onSave={handleSave}
                        onSaveAsNew={handleSaveAsNew}
                        onRevert={handleRevert}
                        onDelete={handleDelete}
                    />
                )}

                {/* Mobile tab bar — only on viewports below lg. On
                    desktop the three panels show side-by-side and
                    this segmented control is hidden. Each tab maps
                    to a panel below, which is shown/hidden via the
                    same activeTab key. */}
                <div className='lg:hidden mb-4'>
                    <div
                        className='flex rounded-xl overflow-hidden p-0.5'
                        style={{
                            background: '#ffffff',
                            border: '1px solid rgba(212,184,103,0.22)',
                            boxShadow: '0 4px 10px -6px rgba(170,136,64,0.20)',
                        }}
                    >
                        {MOBILE_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setMobileTab(tab.id)}
                                className={`flex-1 py-2 text-[12.5px] font-bold rounded-lg transition-all ${
                                    mobileTab === tab.id
                                        ? 'text-white'
                                        : 'text-[#7a6a52] hover:bg-[#fbf6ec]'
                                }`}
                                style={
                                    mobileTab === tab.id
                                        ? {
                                              background:
                                                  'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                          }
                                        : { background: 'transparent' }
                                }
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Three-column grid on lg+. Below lg, columns stack
                    vertically and the mobile tab above hides all but
                    the active panel. tabClass() encodes that — the
                    panel either renders normally on mobile (active
                    tab) or hides; on lg it always renders. */}
                <div className='grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-5'>
                    <div className={tabClass(mobileTab === 'presets')}>
                        <PresetListPanel
                            presets={presets}
                            activeId={activeId}
                            onSelect={id => {
                                setActiveId(id)
                                // Auto-switch to preview after a pick
                                // on mobile — most users want to see
                                // the result, not stay on the list.
                                if (typeof window !== 'undefined' && window.innerWidth < PREVIEW_BREAKPOINT) {
                                    setMobileTab('preview')
                                }
                            }}
                        />
                        <DefaultCoversPanel />
                    </div>
                    <div className={tabClass(mobileTab === 'preview')}>
                        <PreviewPanel
                            preset={draft}
                            styleSettings={resolvedStyle}
                            entry={mockEntry}
                            blessingLength={blessingLength}
                            onBlessingLengthChange={setBlessingLength}
                            previewSize={previewSize}
                            hasCustomPhoto={!!previewPhoto}
                            onPickPhoto={() => previewPhotoInputRef.current?.click()}
                            onClearPhoto={() => setPreviewPhoto(null)}
                            blessingOnly={previewBlessingOnly}
                            onToggleBlessingOnly={() => setPreviewBlessingOnly(v => !v)}
                        />
                        {/* Hidden file input owned by the parent so its
                            value survives PreviewPanel re-mounts (e.g.
                            mobile-tab switches). The ref-click pattern
                            keeps the click target inside the toolbar
                            without leaking native UI. */}
                        <input
                            ref={previewPhotoInputRef}
                            type='file'
                            accept='image/*'
                            onChange={handlePreviewPhotoPick}
                            className='hidden'
                        />
                    </div>
                    <div className={tabClass(mobileTab === 'properties')}>
                        <PropertiesPanel
                            draft={draft}
                            editable={editable}
                            onValuesChange={updateValues}
                            onImageStyleChange={updateImageStyle}
                            onToggleEventType={toggleEventType}
                            onClearEventTypes={clearEventTypes}
                            backgrounds={backgrounds}
                            uploadStatus={uploadStatus}
                            onUploadBackground={handleUploadBackground}
                            onDeleteBackground={handleDeleteBackground}
                        />
                    </div>
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
    onTogglePrivate,
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

            {/* Private toggle — marks the preset as super-admin-only
                so it never appears in /viewer's gallery for couples.
                A single click toggles draft.isPrivate; saving the
                preset persists it. */}
            <button
                type='button'
                onClick={onTogglePrivate}
                title={draft.isPrivate ? 'הסר סטטוס פרטי' : 'הפוך לפריסט פרטי (רק לסופר־אדמין)'}
                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-all'
                style={{
                    background: draft.isPrivate ? 'rgba(170,136,64,0.18)' : '#fff',
                    border: `1px solid ${draft.isPrivate ? '#aa8840' : '#ead9b3'}`,
                    color: draft.isPrivate ? '#7a5d27' : '#7a6a52',
                }}
            >
                {draft.isPrivate ? '🔒 פרטי' : 'פרטי?'}
            </button>

            {/* "Source" badge — purely informational. System
                presets stay flagged so the user knows which ones
                ship with the app and which they created. Editing
                is allowed for both. */}
            {isSystem && (
                <span className='flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-full bg-amber-50 border border-amber-200 text-amber-700'>
                    <Crown size={11} /> תבנית מערכת
                </span>
            )}
            {dirty && (
                <span className='px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[#AA8840]/10 text-[#a8843a] border border-[#AA8840]/30'>
                    לא נשמר
                </span>
            )}
            <button
                onClick={onClone}
                title='שכפל את התבנית כתבנית חדשה'
                className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed'
                style={{
                    background: '#ffffff',
                    border: '1px solid #ead9b3',
                    color: '#7a6a52',
                }}
            >
                <Copy size={13} /> שכפל
            </button>
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
// ── Default cover artwork per event type ─────────────────────────────
// Super-admin uploads a designed cover for each event type; every NEW
// event of that type is born with it (create-event sets it as
// coverDesign.coverTexture — the full-bleed cover background). The
// celebrant photo from the /start wizard fades in ON TOP of it.
function DefaultCoversPanel() {
    const [covers, setCovers] = useState(null)
    const [busyType, setBusyType] = useState(null)
    const [coversErr, setCoversErr] = useState('')

    useEffect(() => {
        listDefaultCovers().then(setCovers).catch(() => setCovers({}))
    }, [])

    async function onPick(type, file) {
        if (!file) return
        setBusyType(type)
        setCoversErr('')
        try {
            const entry = await uploadDefaultCover(type, file, { uid: auth.currentUser?.uid })
            setCovers(c => ({ ...(c || {}), [type]: entry }))
        } catch (e) {
            setCoversErr(e?.message || 'ההעלאה נכשלה')
        } finally {
            setBusyType(null)
        }
    }

    async function onClear(type) {
        setBusyType(type)
        setCoversErr('')
        try {
            await clearDefaultCover(type)
            setCovers(c => ({ ...(c || {}), [type]: null }))
        } catch (e) {
            setCoversErr(e?.message || 'המחיקה נכשלה')
        } finally {
            setBusyType(null)
        }
    }

    return (
        <div
            className='mt-4 rounded-2xl p-4'
            style={{ background: '#ffffff', border: '1px solid rgba(212,184,103,0.22)', boxShadow: '0 4px 10px -6px rgba(170,136,64,0.2)' }}
        >
            <h3 className='text-[13.5px] font-bold' style={{ color: '#5c4a2f' }}>
                כריכת ברירת מחדל לכל סוג אירוע
            </h3>
            <p className='mt-0.5 mb-3' style={{ color: '#a89378', fontSize: '11.5px', lineHeight: 1.5 }}>
                כל ספר חדש נולד עם הכריכה של הסוג שלו. תמונת החוגגים מהאשף משתלבת מעליה בפייד.
            </p>
            {coversErr && (
                <p className='mb-2 text-[11.5px] font-bold' style={{ color: '#b3401f' }}>{coversErr}</p>
            )}
            <div className='grid grid-cols-2 gap-2.5'>
                {PUBLIC_EVENT_TYPES.map(type => {
                    const meta = EVENT_TYPE_META[type] || {}
                    const entry = covers?.[type]
                    const busy = busyType === type
                    return (
                        <div
                            key={type}
                            className='rounded-xl overflow-hidden'
                            style={{ border: '1px solid rgba(212,184,103,0.35)', background: '#fbf6ec' }}
                        >
                            <div
                                className='relative w-full'
                                style={{
                                    aspectRatio: '1 / 1',
                                    backgroundImage: entry?.url ? `url(${entry.url})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }}
                            >
                                {!entry?.url && (
                                    <span className='absolute inset-0 flex items-center justify-center text-[11px]' style={{ color: '#b3a184' }}>
                                        {covers === null ? 'טוען…' : 'אין כריכה'}
                                    </span>
                                )}
                                {busy && (
                                    <span className='absolute inset-0 flex items-center justify-center bg-white/60'>
                                        <Loader2 className='w-5 h-5 animate-spin' style={{ color: '#b8893d' }} />
                                    </span>
                                )}
                            </div>
                            <div className='flex items-center justify-between px-2 py-1.5'>
                                <span className='text-[11.5px] font-bold' style={{ color: '#5c4a2f' }}>
                                    {meta.emoji} {meta.label || type}
                                </span>
                                <span className='flex items-center gap-1'>
                                    <label
                                        className='cursor-pointer text-[11px] font-bold px-2 py-1 rounded-lg'
                                        style={{ background: 'linear-gradient(180deg,#f4e7c8,#e8d5a8)', color: '#6d5220', border: '1px solid rgba(170,136,64,0.5)' }}
                                    >
                                        {entry?.url ? 'החלפה' : 'העלאה'}
                                        <input
                                            type='file'
                                            accept='image/*'
                                            hidden
                                            disabled={busy}
                                            onChange={e => { onPick(type, e.target.files?.[0]); e.target.value = '' }}
                                        />
                                    </label>
                                    {entry?.url && (
                                        <button
                                            type='button'
                                            className='text-[11px] px-1.5 py-1 rounded-lg hover:bg-black/5'
                                            style={{ color: '#a3541f' }}
                                            disabled={busy}
                                            onClick={() => onClear(type)}
                                            title='הסרת ברירת המחדל'
                                        >
                                            <Trash2 className='w-3.5 h-3.5' />
                                        </button>
                                    )}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function PresetListPanel({ presets, activeId, onSelect }) {
    const system = presets.filter(p => p.ownerType === 'system')
    const studio = presets.filter(p => p.ownerType === 'studio')

    return (
        <aside
            className='rounded-2xl overflow-hidden self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh_-_80px)]'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 16px 32px -20px rgba(170,136,64,0.20)',
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

            <div className='lg:overflow-y-auto lg:max-h-[calc(100vh_-_140px)]'>
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
                            <span className='flex-1 min-w-0 text-right'>
                                <span
                                    className={`block text-[12.5px] truncate ${
                                        activeId === p.id ? 'text-[#1a1410] font-bold' : 'text-[#5a4d3a] font-semibold'
                                    }`}
                                >
                                    {p.name || p.id}
                                </span>
                                {/* Event-type tags — which galleries this
                                    preset appears in. No tags = generic. */}
                                {Array.isArray(p.eventTypes) && p.eventTypes.length > 0 && (
                                    <span className='block text-[9.5px] text-[#b8a37e] truncate'>
                                        {p.eventTypes.map(t => getEventConfig(t).label).join(' · ')}
                                    </span>
                                )}
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
// previewSize comes from the usePreviewSize hook in StudioContent —
// 800 on lg+, viewport-clamped on mobile so the 1:1 page never
// overflows on a 375-wide phone.
function PreviewPanel({
    preset, styleSettings, entry, blessingLength, onBlessingLengthChange, previewSize,
    hasCustomPhoto, onPickPhoto, onClearPhoto,
    blessingOnly, onToggleBlessingOnly,
}) {
    return (
        <main
            className='rounded-2xl overflow-hidden flex flex-col'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 16px 32px -20px rgba(170,136,64,0.20)',
                minHeight: '480px',
            }}
        >
            {/* Toolbar — wraps on mobile so the title and length
                toggle don't crash into each other when the canvas
                shrinks. */}
            <div
                className='px-4 sm:px-5 py-3 border-b border-[#f0e8d4] flex flex-wrap items-center justify-between gap-2'
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
                    <span className='hidden sm:inline text-[10.5px] text-[#a89378]'>1:1 · 8.5&quot;×8.5&quot;</span>
                </div>

                {/* Photo controls — upload a real wedding photo
                    OR clear it back to the SVG placeholder. Sits to
                    the side of the length toggle so the toolbar reads
                    as one tight cluster of preview-affecting controls. */}
                <button
                    type='button'
                    onClick={hasCustomPhoto ? onClearPhoto : onPickPhoto}
                    title={hasCustomPhoto ? 'חזור לתמונה הסטנדרטית' : 'העלה תמונה אמיתית לפריוויו'}
                    className='inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-[11.5px] font-bold transition-all shrink-0'
                    style={{
                        background: hasCustomPhoto ? '#fff5f5' : '#ffffff',
                        border: `1px solid ${hasCustomPhoto ? '#ffcdcd' : '#ead9b3'}`,
                        color: hasCustomPhoto ? '#b32424' : '#7a6a52',
                    }}
                >
                    {hasCustomPhoto ? (
                        <>
                            <X size={11} /> נקה תמונה
                        </>
                    ) : (
                        <>
                            <Upload size={11} /> תמונה אמיתית
                        </>
                    )}
                </button>

                {/* Blessing-page preview toggle — renders the mock entry
                    WITHOUT a photo, i.e. exactly the page the auto-split
                    (or a photo-less guest) produces. This is where the
                    preset's `blessingTemplate` shows its effect. */}
                <button
                    type='button'
                    onClick={onToggleBlessingOnly}
                    title='תצוגת עמוד ברכה (ללא תמונה) — כך ייראה עמוד הברכה בפיצול'
                    className='inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-[11.5px] font-bold transition-all shrink-0'
                    style={{
                        background: blessingOnly
                            ? 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)'
                            : '#ffffff',
                        border: `1px solid ${blessingOnly ? '#b8893d' : '#ead9b3'}`,
                        color: blessingOnly ? '#ffffff' : '#7a6a52',
                    }}
                >
                    <Layers size={11} /> עמוד ברכה
                </button>

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
                            className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-[11.5px] font-bold transition-all ${
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
                            {len}
                            <span className='hidden sm:inline'> תווים</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview canvas — padding shrinks on mobile so the page
                rectangle gets every pixel of available width. */}
            <div
                className='flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8 overflow-auto'
                style={{ background: '#f4ecd9' }}
            >
                {!preset || !styleSettings ? (
                    <div className='text-center text-[#a89378] text-sm py-8'>
                        בחר תבנית מהרשימה
                    </div>
                ) : (
                    <div
                        className='shrink-0'
                        style={{
                            width: previewSize,
                            height: previewSize,
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
                            scaledWidth={previewSize}
                            scaledHeight={previewSize}
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
function PropertiesPanel({
    draft, editable, onValuesChange, onImageStyleChange,
    onToggleEventType, onClearEventTypes,
    backgrounds, uploadStatus, onUploadBackground, onDeleteBackground,
}) {
    const isSystem = draft?.ownerType === 'system'
    const v = draft?.values || {}
    const draftEventTypes = Array.isArray(draft?.eventTypes) ? draft.eventTypes : []

    return (
        <aside
            className='rounded-2xl overflow-hidden self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh_-_80px)]'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow: '0 16px 32px -20px rgba(170,136,64,0.20)',
            }}
        >
            <div
                className='px-4 py-3.5 border-b border-[#f0e8d4]'
                style={{ background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}
            >
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold'>
                    מאפיינים
                </p>
                {draft && (
                    <p className='text-[10.5px] text-[#a89378] mt-1 leading-relaxed'>
                        השינויים מתעדכנים בתצוגה החיה. לחץ &quot;שמור&quot; כדי לשמר.
                        {isSystem && ' עריכת תבנית מערכת — מומלץ "שמור כעותק" כדי לשמור את המקור.'}
                    </p>
                )}
            </div>

            <div className='lg:overflow-y-auto lg:max-h-[calc(100vh_-_140px)]'>
                {!draft ? (
                    <div className='p-6 text-center text-[12px] text-[#a89378]'>
                        בחר תבנית כדי לראות את המאפיינים שלה
                    </div>
                ) : (
                    <div className='p-4 space-y-4'>
                        {/* Event-type targeting — which event types see
                            this preset in their gallery. Nothing
                            selected = generic (shows for everyone).
                            Stored on the preset ROOT (eventTypes), not
                            in values — it's metadata, not style. */}
                        <PropertyEventTypesEdit
                            selected={draftEventTypes}
                            disabled={!editable}
                            onToggle={onToggleEventType}
                            onClear={onClearEventTypes}
                        />

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
                            label='פונט הברכה (עברית)'
                            fontKey={v.fontKey}
                            disabled={!editable}
                            onChange={k => onValuesChange({ fontKey: k })}
                        />

                        {/* Separate font for English blessings — the book
                            auto-detects each blessing's language and uses this
                            font for English ones (falls back to the Hebrew font
                            if not set). Great for mixed books like Jerry's. */}
                        <PropertyFontEdit
                            icon={Type}
                            label='פונט הברכה (אנגלית)'
                            fontKey={v.fontKeyLatin}
                            disabled={!editable}
                            onChange={k => onValuesChange({ fontKeyLatin: k })}
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

                        {/* Blessing alignment — 'auto' = per-language (Hebrew
                            right / English left, great for mixed books); or
                            force right/center/left. Direction (RTL/LTR) is
                            always auto-detected per blessing for correct flow. */}
                        <PropertyAlignPicker
                            label='יישור הברכה'
                            value={v.textAlign}
                            disabled={!editable}
                            onChange={a => onValuesChange({ textAlign: a })}
                        />

                        {/* Line spacing of the blessing body. */}
                        <PropertySlider
                            icon={Type}
                            label='ריווח שורות'
                            value={v.textLineHeight ?? 1.5}
                            min={1}
                            max={2.4}
                            step={0.05}
                            disabled={!editable}
                            onChange={n => onValuesChange({ textLineHeight: n })}
                        />

                        {/* Readability floor for LONG blessings: how small the
                            body font may shrink to fit (with a photo). Higher =
                            stays bigger/more readable (photo gets the squeeze). */}
                        <PropertySlider
                            icon={Type}
                            label='מינ׳ גודל טקסט (ברכה ארוכה)'
                            value={v.fontMinFactor ?? 0.62}
                            min={0.5}
                            max={1}
                            step={0.02}
                            disabled={!editable}
                            onChange={n => onValuesChange({ fontMinFactor: n })}
                        />

                        {/* Composition: two blessings per page — an elegantly
                            divided duo page (DuoPageLayout). Mutually exclusive
                            with auto-split (duo compresses, split expands), so
                            turning it on ignores the split settings. */}
                        <PropertyToggle
                            label='שתי ברכות בעמוד'
                            value={v.entriesPerPage === 2}
                            disabled={!editable}
                            onChange={b => onValuesChange({ entriesPerPage: b ? 2 : 1 })}
                            onLabel='זוג בעמוד'
                            offLabel='ברכה לעמוד'
                        />
                        {v.entriesPerPage === 2 && (
                            <p className='text-[10.5px] leading-relaxed -mt-1' style={{ color: '#a89378' }}>
                                שתי ברכות חולקות עמוד עם קו עיטור ביניהן. הפיצול האוטומטי לא פעיל במצב הזה.
                            </p>
                        )}

                        {/* Smart auto-split: a long blessing + photo becomes a
                            blessing-only page (centered, roomy) followed by a
                            photo-only page; short blessings stay combined. */}
                        <PropertyToggle
                            label='פיצול אוטומטי: ברכה ארוכה לעמוד נפרד'
                            value={v.autoSplit}
                            disabled={!editable || v.entriesPerPage === 2}
                            onChange={b => onValuesChange({ autoSplit: b })}
                        />
                        {v.autoSplit && (
                            <PropertySlider
                                icon={Type}
                                label='אורך לפיצול (תווים)'
                                value={v.splitThreshold ?? 240}
                                min={2}
                                max={600}
                                step={1}
                                disabled={!editable}
                                onChange={n => onValuesChange({ splitThreshold: n })}
                            />
                        )}

                        {/* Blessing-page layout — a SEPARATE template for
                            blessing-only pages: the text page the auto-split
                            produces, and entries that came without a photo.
                            'כמו הספר' (null) keeps the pre-feature behavior
                            (same template everywhere). Preview it with the
                            "עמוד ברכה" toggle in the center panel. */}
                        <PropertyTemplatePicker
                            label='פריסת עמוד הברכה'
                            value={v.blessingTemplate ?? null}
                            disabled={!editable}
                            onChange={t => onValuesChange({ blessingTemplate: t })}
                            hint='חל על עמוד הברכה בפיצול ועל ברכות שהגיעו בלי תמונה. "כמו הספר" = אותה פריסה כמו שאר העמודים.'
                        />

                        <PropertyWeightPicker
                            label='משקל פונט'
                            value={v.fontWeight}
                            disabled={!editable}
                            onChange={w => onValuesChange({ fontWeight: w })}
                        />

                        <PropertyColorEdit
                            icon={Palette}
                            label='צבע פונט'
                            value={v.fontColor}
                            disabled={!editable}
                            onChange={c => onValuesChange({ fontColor: c })}
                            hint='צובע גם את שם האורח וגם את גוף הברכה'
                        />

                        {/* Guest-name typography. Independent from
                            body — `nameFontSizePercent` controls the
                            line height of the name label, and
                            `nameMarginTop` is the gap between the top
                            of the page and the name. Both are stored
                            on the preset's values and honored by
                            BookPageTemplate. */}
                        <PropertySlider
                            icon={Type}
                            label='גודל שם האורח'
                            value={v.nameFontSizePercent ?? 2.1}
                            min={1}
                            max={5}
                            step={0.1}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ nameFontSizePercent: n })}
                        />

                        <PropertyWeightPicker
                            label='משקל שם האורח'
                            value={v.nameFontWeight}
                            disabled={!editable}
                            onChange={w => onValuesChange({ nameFontWeight: w })}
                        />

                        {/* Independent font for the guest name —
                            usually you want a different family for
                            the name (e.g. an elegant handwriting
                            face like גברת לוין) while the blessing
                            stays in a clean readable face. Setting
                            this to "אוטומטי" falls back to the body
                            font. */}
                        <PropertyFontEdit
                            icon={Type}
                            label='פונט שם האורח'
                            fontKey={v.nameFontKey}
                            disabled={!editable}
                            onChange={k => onValuesChange({ nameFontKey: k })}
                        />

                        {/* Independent color for the guest name —
                            lets the studio give the name a distinct
                            accent (e.g. gold) without recolouring
                            the blessing text. Falls back to body
                            fontColor in BookPageTemplate when unset. */}
                        <PropertyColorEdit
                            icon={Palette}
                            label='צבע שם האורח'
                            value={v.nameColor}
                            disabled={!editable}
                            onChange={c => onValuesChange({ nameColor: c })}
                            hint='צובע רק את שם האורח. אם לא מוגדר — משתמש בצבע גוף הברכה.'
                        />

                        {/* Page padding — the base inset every element
                            sits inside. THIS is the "why doesn't 0 touch
                            the edge" answer: margins are measured from
                            the padded box, so 0% here + 0% margin =
                            literally the page edge. */}
                        <PropertySlider
                            icon={Frame}
                            label='ריפוד עמוד (מסגרת פנימית)'
                            value={v.pagePadding ?? 4}
                            min={0}
                            max={12}
                            step={0.5}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ pagePadding: n })}
                            hint='המרווח הבסיסי מכל קצוות העמוד. 0 = התוכן יכול לגעת בקצה.'
                        />

                        <PropertySlider
                            icon={Type}
                            label='ריווח שם מלמעלה'
                            value={v.nameMarginTop ?? 2}
                            min={0}
                            max={20}
                            step={0.5}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ nameMarginTop: n })}
                        />

                        <PropertySlider
                            icon={Type}
                            label='ריווח שם מלמטה'
                            value={v.nameMarginBottom ?? 1}
                            min={0}
                            max={20}
                            step={0.5}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ nameMarginBottom: n })}
                        />

                        {/* Collage-only — name is positioned absolutely
                            in this layout (other layouts use flow with
                            nameMarginTop). Three sliders control where
                            the signature sits on the page + how much it
                            tilts. Defaults preserve the original
                            handmade look: 15% from left, 12% from
                            bottom, tilted 6°. */}
                        {v.template === 'collage' && (
                            <>
                                <PropertySlider
                                    icon={Type}
                                    label='מיקום שם — אופקי (מהשמאל)'
                                    value={v.nameOffsetX ?? 15}
                                    min={0}
                                    max={90}
                                    step={1}
                                    unit='%'
                                    disabled={!editable}
                                    onChange={n => onValuesChange({ nameOffsetX: n })}
                                />
                                <PropertySlider
                                    icon={Type}
                                    label='מיקום שם — אנכי (מהתחתית)'
                                    value={v.nameOffsetY ?? 12}
                                    min={0}
                                    max={90}
                                    step={1}
                                    unit='%'
                                    disabled={!editable}
                                    onChange={n => onValuesChange({ nameOffsetY: n })}
                                />
                                <PropertySlider
                                    icon={Type}
                                    label='זווית שם (סיבוב)'
                                    value={v.nameRotation ?? 6}
                                    min={-30}
                                    max={30}
                                    step={1}
                                    unit='°'
                                    disabled={!editable}
                                    onChange={n => onValuesChange({ nameRotation: n })}
                                />
                            </>
                        )}

                        <PropertyFrameEdit
                            icon={Frame}
                            label='מסגרת'
                            frameId={v.frameId}
                            disabled={!editable}
                            onChange={id => onValuesChange({ frameId: id })}
                        />

                        <PropertyBackgroundsEdit
                            icon={ImageIcon}
                            label='רקע / מרקם'
                            currentUrl={v.texture}
                            backgrounds={backgrounds}
                            uploadStatus={uploadStatus}
                            disabled={!editable}
                            onChange={url => onValuesChange({ texture: url })}
                            onUpload={onUploadBackground}
                            onDelete={onDeleteBackground}
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
                                    // Keep one decimal so 0.1% slider
                                    // steps don't get rounded away —
                                    // the user wants finer control
                                    // than integer percentages.
                                    height: Math.round(width * 0.75 * 10) / 10,
                                })
                            }
                        />

                        {/* "From where the image starts" — gap above
                            the photo. % of page height. */}
                        <PropertySlider
                            icon={ImageIcon}
                            label='ריווח תמונה מלמעלה'
                            value={v.imageMarginTop ?? 2}
                            min={0}
                            max={20}
                            step={0.5}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ imageMarginTop: n })}
                        />

                        <PropertySlider
                            icon={ImageIcon}
                            label='ריווח תמונה מלמטה'
                            value={v.imageMarginBottom ?? 2}
                            min={0}
                            max={20}
                            step={0.5}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ imageMarginBottom: n })}
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

                        {/* Photo frame — a decorative treatment drawn AROUND
                            the photo (mats / gold rings; layer 4 of the preset
                            architecture). Code-drawn, so it prints losslessly.
                            The framed photo keeps the same footprint the width
                            slider defines. */}
                        <PropertyPhotoFramePicker
                            label='מסגרת לתמונה'
                            frameId={v.photoFrame ?? null}
                            frameUrl={v.photoFrameUrl ?? null}
                            frameInset={v.photoFrameInset}
                            disabled={!editable}
                            onChange={patch => onValuesChange(patch)}
                        />

                        {/* Gap between image and blessing text. % of
                            page height. textMarginTop is honored by
                            BookPageTemplate (line ~141) and was the
                            last spacing field still hidden from the
                            studio. */}
                        <PropertySlider
                            icon={Type}
                            label='ריווח ברכה מלמעלה'
                            value={v.textMarginTop ?? 0}
                            min={0}
                            max={20}
                            step={0.5}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ textMarginTop: n })}
                        />

                        {/* Max width of the blessing block. % of
                            page width. Lower values force tighter
                            line-wrapping (more lines, narrower
                            column) — useful for long blessings on
                            narrow page layouts. */}
                        <PropertySlider
                            icon={Type}
                            label='רוחב מקסימלי לברכה'
                            value={v.textMaxWidth ?? 85}
                            min={30}
                            max={100}
                            step={1}
                            unit='%'
                            disabled={!editable}
                            onChange={n => onValuesChange({ textMaxWidth: n })}
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
// soft cream surface. Showing the raw hex as an editable text field
// so the user can paste an exact value, plus a Copy button so they
// can grab the current hex for use elsewhere (Figma, brand guide,
// etc).
function PropertyColorEdit({ icon: Icon, label, value, disabled, onChange, hint }) {
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
                hint={hint}
            />
        )
    }
    return (
        <div>
            <PropertyHeader icon={Icon} label={label} />
            <div
                className='flex items-center gap-1.5 px-2.5 py-2 rounded-lg'
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
                    className='flex-1 min-w-0 bg-transparent text-[12px] font-mono text-[#5a4d3a] outline-none disabled:opacity-60 disabled:cursor-not-allowed'
                />
                <CopyHexButton value={value} />
            </div>
            {hint && (
                <p className='text-[10px] text-[#a89378] mt-1 leading-relaxed'>
                    {hint}
                </p>
            )}
        </div>
    )
}

// Tiny copy-to-clipboard button for hex values. Flips to a checkmark
// for ~1.4s after a successful copy so the user sees confirmation.
// Falls back silently if the clipboard API is unavailable (older
// browsers / non-secure contexts).
function CopyHexButton({ value }) {
    const [copied, setCopied] = useState(false)
    const onClick = async e => {
        e.preventDefault()
        try {
            await navigator.clipboard?.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
        } catch {
            /* clipboard unavailable — no-op */
        }
    }
    return (
        <button
            type='button'
            onClick={onClick}
            title='העתק את הצבע'
            className='shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[#f4ecd9]'
            style={{ color: copied ? '#4f7a3e' : '#a8843a' }}
        >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
        </button>
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
            <div className='grid grid-cols-3 sm:grid-cols-4 gap-1.5'>
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

// Unified backgrounds picker — covers everything that maps to the
// page's CSS background-image (currently the renderer's `texture`
// field). Three sources, grouped:
//   • textures   — 9 tiled patterns from /public/textures/
//   • system     — curated full-page backgrounds in /public/backgrounds/
//   • studio     — uploaded by the super admin into Firestore
// Plus an "ללא" tile to clear the background and an upload button
// that opens the file picker (also handles drag-and-drop).
function PropertyBackgroundsEdit({
    icon: Icon, label, currentUrl, backgrounds,
    uploadStatus, disabled, onChange, onUpload, onDelete,
}) {
    const fileInputRef = useRef(null)
    const [isDragging, setIsDragging] = useState(false)

    const onFilePick = e => {
        const file = e.target.files?.[0]
        if (file) onUpload(file)
        if (e.target) e.target.value = '' // allow re-uploading same name
    }
    const onDrop = e => {
        e.preventDefault()
        setIsDragging(false)
        if (disabled) return
        const file = e.dataTransfer?.files?.[0]
        if (file) onUpload(file)
    }

    const systemBgs = backgrounds.filter(b => b.origin === 'static')
    const studioBgs = backgrounds.filter(b => b.origin === 'studio')
    const isUploading = uploadStatus?.state === 'pending'

    return (
        <div>
            <PropertyHeader icon={Icon} label={label} />

            {/* Section: textures (kept inline — they're tiles, distinct
                from full-page backgrounds visually). */}
            <BgSection label='מרקמים' count={TEXTURES_REGISTRY.length}>
                <div className='grid grid-cols-4 sm:grid-cols-5 gap-1.5'>
                    <FrameTile
                        isNone
                        selected={!currentUrl}
                        disabled={disabled}
                        onClick={() => !disabled && onChange(null)}
                    />
                    {TEXTURES_REGISTRY.map(t => (
                        <FrameTile
                            key={t.id}
                            src={t.src}
                            selected={t.src === currentUrl}
                            disabled={disabled}
                            onClick={() => !disabled && onChange(t.src)}
                        />
                    ))}
                </div>
            </BgSection>

            {/* Section: curated full-page backgrounds shipping in code */}
            {systemBgs.length > 0 && (
                <BgSection label='רקעים מהמערכת' count={systemBgs.length}>
                    <div className='grid grid-cols-4 sm:grid-cols-5 gap-1.5'>
                        {systemBgs.map(b => (
                            <FrameTile
                                key={b.id}
                                src={b.src}
                                selected={b.src === currentUrl}
                                disabled={disabled}
                                onClick={() => !disabled && onChange(b.src)}
                            />
                        ))}
                    </div>
                </BgSection>
            )}

            {/* Section: studio-uploaded. Each tile gets a small delete
                "✕" button on hover so the user can prune their library. */}
            <BgSection label='הרקעים שלי' count={studioBgs.length}>
                {studioBgs.length === 0 ? (
                    <p className='text-[11px] text-[#a89378] italic px-2 py-1'>
                        עדיין לא העלית רקע — נסה את כפתור ההעלאה למטה
                    </p>
                ) : (
                    <div className='grid grid-cols-4 sm:grid-cols-5 gap-1.5'>
                        {studioBgs.map(b => (
                            <StudioBgTile
                                key={b.id}
                                bg={b}
                                selected={b.url === currentUrl}
                                disabled={disabled}
                                onClick={() => !disabled && onChange(b.url)}
                                onDelete={() => onDelete && onDelete(b)}
                            />
                        ))}
                    </div>
                )}
            </BgSection>

            {/* Upload area — drop zone OR click-to-browse. */}
            <div
                onDragOver={e => {
                    if (disabled) return
                    e.preventDefault()
                    setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
                className={`mt-2 rounded-lg px-3 py-3 cursor-pointer transition-colors text-center ${
                    disabled || isUploading ? 'cursor-not-allowed opacity-60' : ''
                }`}
                style={{
                    background: isDragging ? '#f4ecd9' : '#fbf6ec',
                    border: `1px dashed ${isDragging ? '#c9a44e' : '#ead9b3'}`,
                }}
            >
                <input
                    ref={fileInputRef}
                    type='file'
                    accept='image/jpeg,image/png,image/webp,image/svg+xml'
                    onChange={onFilePick}
                    disabled={disabled || isUploading}
                    className='hidden'
                />
                {isUploading ? (
                    <div className='flex items-center justify-center gap-2 text-[12px] text-[#7a6a52]'>
                        <Loader2 size={13} className='animate-spin' />
                        מעלה רקע...
                    </div>
                ) : (
                    <div className='flex items-center justify-center gap-2 text-[12px] font-semibold text-[#7a6a52]'>
                        <Upload size={13} />
                        {isDragging ? 'שחרר כדי להעלות' : 'העלה רקע (גרור או לחץ)'}
                    </div>
                )}
                <p className='text-[10px] text-[#a89378] mt-1.5 leading-relaxed'>
                    JPG / PNG / WebP / SVG · עד 5MB · יחס סביב 1:1 (SVG פטור מבדיקת ממדים)
                </p>
            </div>
        </div>
    )
}

// Lightweight collapsible-section header for the backgrounds picker.
// Kept always-expanded in v1 — v2 can add accordion behavior if the
// list grows.
function BgSection({ label, count, children }) {
    return (
        <div className='mt-2'>
            <div className='flex items-center gap-2 mb-1.5 px-1'>
                <span className='text-[10.5px] font-bold uppercase tracking-widest text-[#a89378]'>
                    {label}
                </span>
                <span className='text-[10px] text-[#c4b9a4]'>{count}</span>
            </div>
            {children}
        </div>
    )
}

// Variant of FrameTile that also shows a delete affordance on hover
// for studio-uploaded backgrounds. The clickable area selects, the
// floating ✕ deletes (with confirm in the parent).
function StudioBgTile({ bg, selected, disabled, onClick, onDelete }) {
    return (
        <div className='relative group aspect-square'>
            <button
                type='button'
                onClick={onClick}
                disabled={disabled}
                className={`absolute inset-0 rounded-lg overflow-hidden transition-all disabled:cursor-not-allowed ${
                    selected
                        ? 'ring-2 ring-[#AA8840] ring-offset-1'
                        : 'hover:scale-105'
                }`}
                style={{ background: '#ffffff', border: '1px solid #ead9b3' }}
            >
                <img
                    src={bg.url}
                    alt={bg.label || ''}
                    className='absolute inset-0 w-full h-full object-cover'
                />
            </button>
            <button
                type='button'
                onClick={e => {
                    e.stopPropagation()
                    onDelete()
                }}
                title='מחק רקע'
                className='absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white border border-red-200 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow'
            >
                <X size={11} />
            </button>
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
// ── PresetWizard — the guided preset builder ─────────────────────────
// One decision per step, in the order of the preset architecture:
//
//   1. קומפוזיציה — how blessings become pages (classic / duo / split)
//   2. משטח       — the page background (gallery + color)
//   3. טיפוגרפיה  — the font + size feel
//   4. תמונה      — the photo frame (built-in / uploaded overlay)
//
// A live BookPageTemplate preview re-renders after every choice, so
// building a preset feels like composing a page, not filling a form.
// "יצירה" drops a complete draft (canonical keys included) into the
// regular editor for fine-tuning + save.
const WIZ_STEPS = ['קומפוזיציה', 'משטח', 'טיפוגרפיה', 'תמונה']

const WIZ_COMPOSITIONS = [
    {
        id: 'classic',
        title: 'קלאסי',
        desc: 'שם, תמונה וברכה — עמוד לכל ברכה',
        patch: { entriesPerPage: 1, autoSplit: false },
    },
    {
        id: 'duo',
        title: 'זוגי',
        desc: 'שתי ברכות בעמוד עם קו עיטור ביניהן',
        patch: { entriesPerPage: 2, autoSplit: false },
    },
    {
        id: 'split',
        title: 'פיצול',
        desc: 'ברכה ארוכה בעמוד משלה, התמונה בעמוד שאחריה',
        patch: { entriesPerPage: 1, autoSplit: true, splitThreshold: 240 },
    },
]

const WIZ_SIZES = [
    { id: 'fine', label: 'עדין', fontSizePercent: 2.6 },
    { id: 'classic', label: 'קלאסי', fontSizePercent: 3 },
    { id: 'bold', label: 'נוכח', fontSizePercent: 3.6 },
]

function PresetWizard({ backgrounds, onClose, onCreate }) {
    const [step, setStep] = useState(0)
    const [name, setName] = useState('')
    const [composition, setComposition] = useState('classic')
    const [values, setValues] = useState(() => applyPresetClean({}))
    const patch = p => setValues(prev => applyPresetClean({ ...prev, ...p }))

    // Live preview entry follows the composition choice.
    const previewEntry = useMemo(() => {
        const base = { id: 'wiz', name: MOCK_NAME, text: MOCK_BLESSINGS[100], imageUrl: MOCK_PHOTO }
        if (values.entriesPerPage === 2) {
            return {
                id: 'wiz-duo',
                _duo: [base, { id: 'wiz2', name: 'משפחת כהן', text: MOCK_BLESSINGS[30], imageUrl: MOCK_PHOTO }],
            }
        }
        return base
    }, [values.entriesPerPage])

    const resolvedPreview = useMemo(
        () => resolvePreset({ id: '__wiz', values }).values || values,
        [values],
    )

    return (
        <div
            className='fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6'
            style={{ background: 'rgba(24,17,8,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
        >
            <div
                className='w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col'
                style={{ background: '#fdfaf3', maxHeight: '92vh', boxShadow: '0 40px 80px -30px rgba(0,0,0,0.5)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header — step trail */}
                <div className='flex items-center justify-between px-5 py-3.5' style={{ borderBottom: '1px solid rgba(212,184,103,0.3)' }}>
                    <div className='flex items-center gap-2'>
                        <Wand2 className='w-4 h-4' style={{ color: '#b8893d' }} />
                        <span className='text-[14px] font-bold' style={{ color: '#3a2d1a' }}>פריסט חדש</span>
                    </div>
                    <div className='flex items-center gap-1.5'>
                        {WIZ_STEPS.map((label, i) => (
                            <button
                                key={label}
                                onClick={() => i < step && setStep(i)}
                                className='flex items-center gap-1.5'
                                style={{ cursor: i < step ? 'pointer' : 'default' }}
                            >
                                <span
                                    className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold'
                                    style={{
                                        background: i === step ? '#b8893d' : i < step ? '#e7d6ac' : '#f1e8d4',
                                        color: i === step ? '#fff' : '#8a6d30',
                                    }}
                                >
                                    {i < step ? '✓' : i + 1}
                                </span>
                                <span className='hidden sm:inline text-[11px] font-semibold' style={{ color: i === step ? '#8a6d30' : '#b3a284' }}>
                                    {label}
                                </span>
                            </button>
                        ))}
                    </div>
                    <button onClick={onClose} className='p-1.5 rounded-lg hover:bg-black/5'>
                        <X className='w-4 h-4' style={{ color: '#8a6f45' }} />
                    </button>
                </div>

                <div className='flex-1 overflow-y-auto grid sm:grid-cols-[280px_1fr]'>
                    {/* Live preview — always visible, re-skins per choice */}
                    <div className='flex flex-col items-center justify-center gap-2 p-4' style={{ background: '#f4ecd9' }}>
                        <div
                            className='shrink-0'
                            style={{ width: 240, height: 240, borderRadius: 4, overflow: 'hidden', background: '#fff', boxShadow: '0 20px 45px -20px rgba(0,0,0,0.35)' }}
                        >
                            <BookPageTemplate entry={previewEntry} styleSettings={resolvedPreview} scaledWidth={240} scaledHeight={240} />
                        </div>
                        <span className='text-[10.5px]' style={{ color: '#a89378' }}>תצוגה חיה — מתעדכנת עם כל בחירה</span>
                    </div>

                    {/* Step content */}
                    <div className='p-5 space-y-4'>
                        {step === 0 && (
                            <>
                                <h3 className='text-[15px] font-bold' style={{ color: '#3a2d1a' }}>איך הברכות יושבות על העמוד?</h3>
                                <div className='space-y-2'>
                                    {WIZ_COMPOSITIONS.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { setComposition(c.id); patch(c.patch) }}
                                            className={`w-full text-right rounded-xl px-4 py-3 border transition-all ${
                                                composition === c.id ? 'bg-white shadow-sm' : 'bg-white/50 hover:bg-white'
                                            }`}
                                            style={{ borderColor: composition === c.id ? '#b8893d' : 'rgba(212,184,103,0.35)', borderWidth: composition === c.id ? 2 : 1 }}
                                        >
                                            <div className='text-[13.5px] font-bold' style={{ color: '#3a2d1a' }}>{c.title}</div>
                                            <div className='text-[11.5px] mt-0.5' style={{ color: '#8a6f45' }}>{c.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        {step === 1 && (
                            <>
                                <h3 className='text-[15px] font-bold' style={{ color: '#3a2d1a' }}>המשטח של העמוד</h3>
                                <div className='grid grid-cols-4 gap-2'>
                                    <button
                                        onClick={() => patch({ backgroundUrl: null, texture: null })}
                                        className={`aspect-square rounded-lg border-2 transition-all ${!values.backgroundUrl && !values.texture ? '' : 'opacity-70 hover:opacity-100'}`}
                                        style={{ background: values.backgroundColor || '#fff', borderColor: !values.backgroundUrl && !values.texture ? '#b8893d' : 'rgba(212,184,103,0.35)' }}
                                        title='צבע חלק'
                                    >
                                        <span className='text-[9.5px]' style={{ color: '#8a6f45' }}>חלק</span>
                                    </button>
                                    {(backgrounds || []).slice(0, 15).map(bg => (
                                        <button
                                            key={bg.id}
                                            onClick={() => patch({ backgroundUrl: bg.src })}
                                            className={`aspect-square rounded-lg border-2 bg-cover bg-center transition-all ${values.backgroundUrl === bg.src ? '' : 'opacity-80 hover:opacity-100'}`}
                                            style={{ backgroundImage: `url(${bg.src})`, borderColor: values.backgroundUrl === bg.src ? '#b8893d' : 'rgba(212,184,103,0.35)' }}
                                            title={bg.label}
                                        />
                                    ))}
                                </div>
                                <div className='flex items-center justify-between pt-1'>
                                    <span className='text-[12px] font-semibold' style={{ color: '#7a6a52' }}>צבע רקע</span>
                                    <input
                                        type='color'
                                        value={values.backgroundColor || '#ffffff'}
                                        onChange={e => patch({ backgroundColor: e.target.value })}
                                        className='w-9 h-9 rounded-lg border cursor-pointer'
                                        style={{ borderColor: 'rgba(212,184,103,0.4)' }}
                                    />
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <h3 className='text-[15px] font-bold' style={{ color: '#3a2d1a' }}>הקול הטיפוגרפי</h3>
                                <div className='space-y-2'>
                                    {Object.values(FONTS_REGISTRY).map(f => {
                                        const active = values.fontKey === f.id
                                        return (
                                            <button
                                                key={f.id}
                                                onClick={() => patch({ fontKey: f.id })}
                                                className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 border transition-all ${active ? 'bg-white shadow-sm' : 'bg-white/50 hover:bg-white'}`}
                                                style={{ borderColor: active ? '#b8893d' : 'rgba(212,184,103,0.35)', borderWidth: active ? 2 : 1 }}
                                            >
                                                <span className='text-[11px]' style={{ color: '#a89378' }}>{f.label}</span>
                                                <span className={`${f.font.className} text-[17px]`} style={{ color: '#3a2d1a' }}>ברכה מכל הלב</span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <div>
                                    <span className='block text-[12px] font-semibold mb-1.5' style={{ color: '#7a6a52' }}>גודל הכתב</span>
                                    <div className='flex gap-2'>
                                        {WIZ_SIZES.map(sz => (
                                            <button
                                                key={sz.id}
                                                onClick={() => patch({ fontSizePercent: sz.fontSizePercent })}
                                                className='flex-1 rounded-lg py-2 text-[12px] font-bold border transition-all'
                                                style={{
                                                    borderColor: values.fontSizePercent === sz.fontSizePercent ? '#b8893d' : 'rgba(212,184,103,0.35)',
                                                    background: values.fontSizePercent === sz.fontSizePercent ? '#fff' : 'rgba(255,255,255,0.5)',
                                                    color: '#5a4426',
                                                }}
                                            >
                                                {sz.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className='flex items-center justify-between'>
                                    <span className='text-[12px] font-semibold' style={{ color: '#7a6a52' }}>צבע הכתב</span>
                                    <input
                                        type='color'
                                        value={values.fontColor || '#000000'}
                                        onChange={e => patch({ fontColor: e.target.value })}
                                        className='w-9 h-9 rounded-lg border cursor-pointer'
                                        style={{ borderColor: 'rgba(212,184,103,0.4)' }}
                                    />
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <>
                                <h3 className='text-[15px] font-bold' style={{ color: '#3a2d1a' }}>המסגרת של התמונה</h3>
                                <PropertyPhotoFramePicker
                                    label='בחרו מסגרת'
                                    frameId={values.photoFrame ?? null}
                                    frameUrl={values.photoFrameUrl ?? null}
                                    frameInset={values.photoFrameInset}
                                    disabled={false}
                                    onChange={p => patch(p)}
                                />
                                <div>
                                    <span className='block text-[12px] font-semibold mb-1.5' style={{ color: '#7a6a52' }}>שם הפריסט</span>
                                    <input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder='למשל: זהב קלאסי — זוגי'
                                        className='w-full rounded-xl px-4 py-2.5 text-[13.5px] outline-none'
                                        style={{ background: '#fff', border: '1.5px solid rgba(212,184,103,0.45)', color: '#3a2d1a' }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className='flex items-center justify-between px-5 py-3.5' style={{ borderTop: '1px solid rgba(212,184,103,0.3)' }}>
                    <button
                        onClick={() => (step === 0 ? onClose() : setStep(s => s - 1))}
                        className='px-4 py-2 rounded-xl text-[12.5px] font-bold hover:bg-black/5'
                        style={{ color: '#8a6f45' }}
                    >
                        {step === 0 ? 'ביטול' : '→ חזרה'}
                    </button>
                    {step < WIZ_STEPS.length - 1 ? (
                        <button
                            onClick={() => setStep(s => s + 1)}
                            className='px-6 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all hover:brightness-105 active:scale-[0.98]'
                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 6px 16px -6px rgba(170,136,64,0.55)' }}
                        >
                            ממשיכים ←
                        </button>
                    ) : (
                        <button
                            onClick={() => onCreate({ name: name.trim(), values })}
                            className='px-6 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all hover:brightness-105 active:scale-[0.98]'
                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 6px 16px -6px rgba(170,136,64,0.55)' }}
                        >
                            יצירת הפריסט ✨
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// Photo-frame picker — visual chips rendered by the REAL frame engine
// (FramedPhoto in placeholder mode), so what you pick is exactly what
// the book prints. Three groups: none, the built-in artful frames, and
// uploaded overlay artwork (PNG/SVG with a transparent window) with an
// upload tile + per-frame delete. Selecting an overlay reveals the
// window-inset slider.
function PropertyPhotoFramePicker({ label, frameId, frameUrl, frameInset, disabled, onChange }) {
    const [uploaded, setUploaded] = useState([])
    const [uploading, setUploading] = useState(false)
    const [uploadErr, setUploadErr] = useState('')
    const fileRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        listPhotoFrameAssets().then(list => {
            if (!cancelled) setUploaded(Array.isArray(list) ? list : [])
        })
        return () => { cancelled = true }
    }, [])

    async function handleUpload(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file || disabled) return
        setUploadErr('')
        setUploading(true)
        try {
            const added = await uploadPhotoFrameAsset(file, { uid: auth.currentUser?.uid })
            setUploaded(prev => [added, ...prev])
            onChange({ photoFrame: null, photoFrameUrl: added.url })
        } catch (err) {
            setUploadErr(err?.message || 'ההעלאה נכשלה')
        } finally {
            setUploading(false)
        }
    }

    async function handleDelete(item) {
        if (!confirm(`למחוק את המסגרת "${item.label}"?`)) return
        try {
            await deletePhotoFrameAsset(item.id, item.storagePath)
            setUploaded(prev => prev.filter(x => x.id !== item.id))
            if (frameUrl === item.url) onChange({ photoFrame: null, photoFrameUrl: null })
        } catch (err) {
            alert('המחיקה נכשלה: ' + (err?.message || err))
        }
    }

    const chipCls = active =>
        `flex flex-col items-center gap-1 rounded-md px-1 py-1.5 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            active ? 'bg-white shadow-sm ring-2 ring-[#b8893d]' : 'hover:bg-white/70'
        }`

    return (
        <div>
            <PropertyHeader icon={Palette} label={label} />
            <div
                className='grid grid-cols-3 gap-1.5 rounded-lg p-1.5'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                {/* none */}
                <button
                    type='button'
                    onClick={() => !disabled && onChange({ photoFrame: null, photoFrameUrl: null })}
                    disabled={disabled}
                    className={chipCls(!frameId && !frameUrl)}
                >
                    <span className='flex items-center justify-center' style={{ width: 56, height: 52 }}>
                        <FramedPhoto placeholder slotW={44} frameId={null} />
                    </span>
                    <span className='text-[9.5px] leading-tight text-center' style={{ color: '#7a6a52' }}>בלי מסגרת</span>
                </button>

                {/* built-ins — drawn by the real engine */}
                {PHOTO_FRAMES.map(f => {
                    const active = !frameUrl && frameId === f.id
                    return (
                        <button
                            key={f.id}
                            type='button'
                            onClick={() => !disabled && onChange({ photoFrame: f.id, photoFrameUrl: null })}
                            disabled={disabled}
                            title={f.label}
                            className={chipCls(active)}
                        >
                            <span className='flex items-center justify-center overflow-hidden' style={{ width: 56, height: 52 }}>
                                <FramedPhoto placeholder slotW={46} frameId={f.id} />
                            </span>
                            <span className='text-[9.5px] leading-tight text-center' style={{ color: active ? '#8a6d30' : '#7a6a52' }}>
                                {f.label}
                            </span>
                        </button>
                    )
                })}

                {/* uploaded overlays */}
                {uploaded.map(item => {
                    const active = frameUrl === item.url
                    return (
                        <div key={item.id} className='relative group'>
                            <button
                                type='button'
                                onClick={() => !disabled && onChange({ photoFrame: null, photoFrameUrl: item.url })}
                                disabled={disabled}
                                title={item.label}
                                className={`w-full ${chipCls(active)}`}
                            >
                                <span className='flex items-center justify-center' style={{ width: 56, height: 52 }}>
                                    <span style={{ position: 'relative', width: 46, height: 36 }}>
                                        <span
                                            style={{
                                                position: 'absolute', inset: 4, borderRadius: 2,
                                                background: 'linear-gradient(135deg, #d8cdbb 0%, #b9ab93 100%)',
                                            }}
                                        />
                                        <img src={item.url} alt='' style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
                                    </span>
                                </span>
                                <span className='text-[9.5px] leading-tight text-center truncate w-full' style={{ color: active ? '#8a6d30' : '#7a6a52' }}>
                                    {item.label}
                                </span>
                            </button>
                            {!disabled && (
                                <button
                                    type='button'
                                    onClick={() => handleDelete(item)}
                                    className='absolute -top-1 -end-1 w-4.5 h-4.5 rounded-full bg-white border border-gray-300 text-red-500 text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity shadow px-1'
                                    title='מחיקת מסגרת'
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )
                })}

                {/* upload tile */}
                <button
                    type='button'
                    onClick={() => !disabled && !uploading && fileRef.current?.click()}
                    disabled={disabled || uploading}
                    className='flex flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 border border-dashed transition-all hover:bg-white/70 disabled:opacity-50'
                    style={{ borderColor: '#d3b46a', minHeight: 74 }}
                >
                    {uploading ? (
                        <Loader2 className='w-4 h-4 animate-spin' style={{ color: '#b8893d' }} />
                    ) : (
                        <Upload className='w-4 h-4' style={{ color: '#b8893d' }} />
                    )}
                    <span className='text-[9.5px] text-center leading-tight' style={{ color: '#8a6d30' }}>
                        {uploading ? 'מעלה…' : 'העלאת מסגרת (PNG שקוף)'}
                    </span>
                </button>
            </div>
            <input ref={fileRef} type='file' accept='image/png,image/webp,image/svg+xml' className='hidden' onChange={handleUpload} />
            {uploadErr && <p className='text-[10px] mt-1' style={{ color: '#b3402e' }}>{uploadErr}</p>}

            {/* Overlay window inset — how far the photo tucks under the artwork */}
            {frameUrl && (
                <div className='mt-2'>
                    <PropertySlider
                        icon={Frame}
                        label='עומק חלון המסגרת'
                        value={Number.isFinite(frameInset) ? frameInset : 6}
                        min={0}
                        max={16}
                        step={0.5}
                        unit='%'
                        disabled={disabled}
                        onChange={n => onChange({ photoFrameInset: n })}
                    />
                </div>
            )}
        </div>
    )
}

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
                    {Number(width).toFixed(1)}% × {Number(height).toFixed(1)}%
                </span>
            </div>
            <input
                type='range'
                value={width}
                min={30}
                max={100}
                step={0.1}
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

// Font weight picker — segmented control with the five most useful
// weights. Stored as a numeric CSS font-weight (300/400/500/600/700)
// so next/font/local picks the closest available weight file at
// render time. "אוטומטי" sends `undefined`, which means the font uses
// its natural weight (whatever single weight the font file ships with,
// or the font's CSS default). Adding a weight here doesn't require
// touching BookPageTemplate — it just writes to styleSettings.fontWeight
// (or nameFontWeight) which the renderer already honors.
const WEIGHT_OPTIONS = [
    { value: undefined, label: 'אוטומטי' },
    { value: 300, label: 'Light' },
    { value: 400, label: 'Regular' },
    { value: 500, label: 'Medium' },
    { value: 600, label: 'SemiBold' },
    { value: 700, label: 'Bold' },
]

function PropertyWeightPicker({ label, value, disabled, onChange }) {
    return (
        <div>
            <PropertyHeader icon={Type} label={label} />
            <div
                className='flex flex-wrap gap-1 rounded-lg p-1'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                {WEIGHT_OPTIONS.map(opt => {
                    const active = value === opt.value
                    return (
                        <button
                            key={opt.label}
                            type='button'
                            onClick={() => !disabled && onChange(opt.value)}
                            disabled={disabled}
                            className={`px-2.5 py-1 rounded-md text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                active
                                    ? 'text-white shadow-sm'
                                    : 'text-[#7a6a52] hover:bg-white'
                            }`}
                            style={{
                                ...(active && {
                                    background:
                                        'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                }),
                                fontWeight: opt.value || 400,
                            }}
                        >
                            {opt.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// Blessing text alignment options. 'auto' aligns each blessing by its own
// language (Hebrew → right, English → left) — perfect for mixed books;
// the others force one alignment regardless of language.
const ALIGN_OPTIONS = [
    { value: 'auto', label: 'אוטומטי' },
    { value: 'right', label: 'ימין' },
    { value: 'center', label: 'מרכז' },
    { value: 'left', label: 'שמאל' },
]

function PropertyAlignPicker({ label, value, disabled, onChange }) {
    return (
        <div>
            <PropertyHeader icon={Type} label={label} />
            <div
                className='flex flex-wrap gap-1 rounded-lg p-1'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                {ALIGN_OPTIONS.map(opt => {
                    const active = (value ?? 'center') === opt.value
                    return (
                        <button
                            key={opt.value}
                            type='button'
                            onClick={() => !disabled && onChange(opt.value)}
                            disabled={disabled}
                            className={`px-2.5 py-1 rounded-md text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                active ? 'text-white shadow-sm' : 'text-[#7a6a52] hover:bg-white'
                            }`}
                            style={{ ...(active && { background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }) }}
                        >
                            {opt.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// Simple on/off segmented toggle, styled like the pickers above.
function PropertyToggle({ label, value, disabled, onChange, onLabel = 'דלוק', offLabel = 'כבוי' }) {
    return (
        <div>
            <PropertyHeader icon={Type} label={label} />
            <div className='flex gap-1 rounded-lg p-1' style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}>
                {[[true, onLabel], [false, offLabel]].map(([val, lbl]) => {
                    const active = Boolean(value) === val
                    return (
                        <button
                            key={String(val)}
                            type='button'
                            onClick={() => !disabled && onChange(val)}
                            disabled={disabled}
                            className={`flex-1 px-2.5 py-1 rounded-md text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                active ? 'text-white shadow-sm' : 'text-[#7a6a52] hover:bg-white'
                            }`}
                            style={{ ...(active && { background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }) }}
                        >
                            {lbl}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Blessing-page template picker ────────────────────────────────────
// The active renderers BookPageTemplate dispatches on. `null` = "כמו
// הספר" (inherit the preset's main template — the pre-feature
// behavior). Labels mirror the system-preset names so the admin
// recognizes each layout instantly.
const TEMPLATE_OPTIONS = [
    { value: null, label: 'כמו הספר' },
    { value: 'classic', label: 'קלאסי' },
    { value: 'polaroid', label: 'פולארויד' },
    { value: 'scrapbook', label: 'סקראפבוק' },
    { value: 'notebook', label: 'מחברת' },
    { value: 'collage', label: 'קולאז׳' },
]

function PropertyTemplatePicker({ label, value, disabled, onChange, hint }) {
    return (
        <div>
            <PropertyHeader icon={Layers} label={label} />
            <div className='flex flex-wrap gap-1 rounded-lg p-1' style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}>
                {TEMPLATE_OPTIONS.map(opt => {
                    const active = (value ?? null) === opt.value
                    return (
                        <button
                            key={String(opt.value)}
                            type='button'
                            onClick={() => !disabled && onChange(opt.value)}
                            disabled={disabled}
                            className={`px-2.5 py-1 rounded-md text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                active ? 'text-white shadow-sm font-bold' : 'text-[#7a6a52] hover:bg-white'
                            }`}
                            style={{ ...(active && { background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }) }}
                        >
                            {opt.label}
                        </button>
                    )
                })}
            </div>
            {hint && <p className='text-[10px] text-[#c4b9a4] mt-1.5 leading-relaxed'>{hint}</p>}
        </div>
    )
}

// ── Event-type tags editor ───────────────────────────────────────────
// Multi-select chips for the preset's ROOT `eventTypes` array. Empty
// selection = generic preset (visible for every event type) — that's
// also the backward-compat default for presets created before this
// feature. Labels come from the shared eventTypes catalogue so the
// studio speaks the same names as the admin wedding form.
function PropertyEventTypesEdit({ selected, disabled, onToggle, onClear }) {
    const isGeneric = selected.length === 0
    return (
        <div>
            <PropertyHeader icon={Crown} label='שיוך לסוג אירוע' />
            <div className='flex flex-wrap gap-1 rounded-lg p-1' style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}>
                <button
                    type='button'
                    onClick={() => !disabled && onClear()}
                    disabled={disabled}
                    className={`px-2.5 py-1 rounded-md text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        isGeneric ? 'text-white shadow-sm font-bold' : 'text-[#7a6a52] hover:bg-white'
                    }`}
                    style={{ ...(isGeneric && { background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }) }}
                >
                    כל האירועים
                </button>
                {EVENT_TYPE_ORDER.map(typeId => {
                    const active = selected.includes(typeId)
                    return (
                        <button
                            key={typeId}
                            type='button'
                            onClick={() => !disabled && onToggle(typeId)}
                            disabled={disabled}
                            className={`px-2.5 py-1 rounded-md text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                active ? 'text-white shadow-sm font-bold' : 'text-[#7a6a52] hover:bg-white'
                            }`}
                            style={{ ...(active && { background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }) }}
                        >
                            {getEventConfig(typeId).label}
                        </button>
                    )
                })}
            </div>
            <p className='text-[10px] text-[#c4b9a4] mt-1.5 leading-relaxed'>
                {isGeneric
                    ? 'התבנית מוצגת לכל סוגי האירועים. בחר סוגים כדי להציג אותה רק להם.'
                    : 'התבנית תוצג רק לאירועים מהסוגים שנבחרו (אפשר לבחור כמה).'}
            </p>
        </div>
    )
}

// Super-admin gate. AdminPageWrapper handles signed-in; this gate
// adds the SUPER_ADMIN_EMAILS check on top so the studio is truly
// "for me only" per the user's spring 2026 request.
function SuperAdminGate({ children }) {
    const router = useRouter()
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) {
                router.replace('/login')
                return
            }
            setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [router])

    if (state === 'checking') {
        return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    }
    if (state === 'denied') {
        return (
            <div
                className='flex h-screen flex-col items-center justify-center text-center px-6'
                style={{ background: '#f8f4ec' }}
            >
                <div
                    className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4'
                    style={{
                        background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                        boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)',
                    }}
                >
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>
                    סטודיו העיצוב פתוח רק למנהל הראשי. אם זו טעות, ודאו שהאימייל שלכם מופיע ב-SUPER_ADMIN_EMAILS.
                </p>
            </div>
        )
    }
    return children
}

export default function StudioPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <StudioContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
