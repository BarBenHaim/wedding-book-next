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
    Lock, Crown,
} from 'lucide-react'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import {
    listPresets, seedBuiltinPresetsIfMissing,
    resolvePreset, FRAMES_REGISTRY, FONTS_REGISTRY, TEXTURES_REGISTRY, FONT_IDS,
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

    // Resolve the preset's storage-shape values to the runtime shape
    // BookPageTemplate expects. resolvePreset is the same function the
    // viewer uses when applying a preset to a wedding's design doc.
    const resolvedStyle = useMemo(() => {
        if (!activePreset) return null
        return resolvePreset(activePreset).values
    }, [activePreset])

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
                        preset={activePreset}
                        styleSettings={resolvedStyle}
                        entry={mockEntry}
                        blessingLength={blessingLength}
                        onBlessingLengthChange={setBlessingLength}
                    />
                    <PropertiesPanel preset={activePreset} />
                </div>
            </div>
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

// ── Right rail: properties panel (read-only in this commit) ──────────
function PropertiesPanel({ preset }) {
    const isSystem = preset?.ownerType === 'system'
    const v = preset?.values || {}

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
                {preset && isSystem && (
                    <p className='text-[10.5px] text-[#a89378] mt-1 leading-relaxed'>
                        זוהי תבנית מערכת — לא ניתן לערוך אותה ישירות. בעדכון הבא:
                        כפתור "צור עותק לעריכה".
                    </p>
                )}
                {preset && !isSystem && (
                    <p className='text-[10.5px] text-[#a89378] mt-1 leading-relaxed'>
                        עריכה תהיה זמינה בעדכון הבא.
                    </p>
                )}
            </div>

            <div
                className='overflow-y-auto'
                style={{ maxHeight: 'calc(100vh - 140px)' }}
            >
                {!preset ? (
                    <div className='p-6 text-center text-[12px] text-[#a89378]'>
                        בחר תבנית כדי לראות את המאפיינים שלה
                    </div>
                ) : (
                    <div className='p-4 space-y-4'>
                        <PropertyRow icon={Layers} label='מבנה' value={v.template || 'classic'} />
                        <PropertyColor label='רקע' value={v.backgroundColor} icon={Palette} />
                        <PropertyFont label='פונט' fontKey={v.fontKey} icon={Type} />

                        {/* Font size — slider, disabled in this commit */}
                        <PropertySlider
                            icon={Type}
                            label='גודל פונט'
                            value={v.fontSizePercent ?? 2.5}
                            min={1.5}
                            max={6}
                            step={0.1}
                            unit='% מגובה העמוד'
                            disabled
                        />

                        <PropertyColor label='צבע פונט' value={v.fontColor} icon={Palette} />
                        <PropertyFrame label='מסגרת' frameId={v.frameId} icon={Frame} />
                        <PropertyTexture label='מרקם' textureUrl={v.texture} icon={ImageIcon} />

                        {/* Image size — width-only slider, height auto-
                            tracks 4:3. Lock icon makes the coupling
                            obvious. Disabled here; editable in next
                            commit. */}
                        <PropertyImageSize imageStyle={v.imageStyle} disabled />

                        {/* Image corner radius */}
                        <PropertySlider
                            icon={RotateCw}
                            label='עיגול פינות תמונה'
                            value={Number(v.imageStyle?.borderRadius) || 0}
                            min={0}
                            max={48}
                            step={1}
                            unit='px'
                            disabled
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

function PropertyColor({ label, value, icon: Icon }) {
    if (!value) return null
    return (
        <div>
            <div className='flex items-center gap-1.5 mb-1.5'>
                {Icon && <Icon size={12} className='text-[#c9a44e]' />}
                <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                    {label}
                </span>
            </div>
            <div
                className='flex items-center gap-2 px-3 py-2 rounded-lg'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                <div
                    className='w-6 h-6 rounded shrink-0'
                    style={{
                        background: value,
                        border: '1px solid rgba(0,0,0,0.10)',
                    }}
                />
                <code className='text-[11.5px] font-mono text-[#5a4d3a]'>{value}</code>
            </div>
        </div>
    )
}

function PropertyFont({ label, fontKey, icon: Icon }) {
    const font = fontKey ? FONTS_REGISTRY[fontKey] : null
    return (
        <div>
            <div className='flex items-center gap-1.5 mb-1.5'>
                {Icon && <Icon size={12} className='text-[#c9a44e]' />}
                <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                    {label}
                </span>
            </div>
            <div
                className='px-3 py-2 rounded-lg flex items-center justify-between gap-2'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                <span
                    className={`text-[14px] text-[#1a1410] truncate ${
                        font?.font?.className || ''
                    }`}
                >
                    {font?.label || fontKey || '—'}
                </span>
                <span className='text-[10px] text-[#a89378] shrink-0'>
                    {FONT_IDS.length} זמינים
                </span>
            </div>
        </div>
    )
}

function PropertyFrame({ label, frameId, icon: Icon }) {
    const frame = frameId ? FRAMES_REGISTRY[frameId] : null
    return (
        <div>
            <div className='flex items-center gap-1.5 mb-1.5'>
                {Icon && <Icon size={12} className='text-[#c9a44e]' />}
                <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                    {label}
                </span>
            </div>
            <div
                className='px-3 py-2 rounded-lg flex items-center gap-2'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                {frame ? (
                    <>
                        <div
                            className='w-8 h-8 rounded shrink-0 bg-white'
                            style={{
                                backgroundImage: `url(${frame.src})`,
                                backgroundSize: 'cover',
                                border: '1px solid #ead9b3',
                            }}
                        />
                        <span className='text-[12px] text-[#3d3225]'>{frame.label}</span>
                    </>
                ) : (
                    <span className='text-[12px] text-[#a89378] italic'>ללא</span>
                )}
            </div>
        </div>
    )
}

function PropertyTexture({ label, textureUrl, icon: Icon }) {
    const tex = textureUrl
        ? TEXTURES_REGISTRY.find(t => t.src === textureUrl)
        : null
    return (
        <div>
            <div className='flex items-center gap-1.5 mb-1.5'>
                {Icon && <Icon size={12} className='text-[#c9a44e]' />}
                <span className='text-[11px] font-semibold text-[#7a6a52] uppercase tracking-wider'>
                    {label}
                </span>
            </div>
            <div
                className='px-3 py-2 rounded-lg flex items-center gap-2'
                style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}
            >
                {textureUrl ? (
                    <>
                        <div
                            className='w-8 h-8 rounded shrink-0'
                            style={{
                                backgroundImage: `url(${textureUrl})`,
                                backgroundSize: 'cover',
                                border: '1px solid #ead9b3',
                            }}
                        />
                        <span className='text-[12px] text-[#3d3225]'>
                            {tex?.label || textureUrl.split('/').pop()}
                        </span>
                    </>
                ) : (
                    <span className='text-[12px] text-[#a89378] italic'>ללא</span>
                )}
            </div>
        </div>
    )
}

function PropertySlider({ icon: Icon, label, value, min, max, step, unit, disabled }) {
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
                readOnly
                className='w-full accent-[#AA8840] disabled:opacity-50 disabled:cursor-not-allowed'
            />
        </div>
    )
}

// Image size — width-only slider with height locked at 4:3. The lock
// icon makes the coupling visible without offering an unlock toggle:
// the WYSIWYG capture pipeline depends on a 4:3 image throughout, so
// allowing arbitrary aspect here would silently break print fidelity.
function PropertyImageSize({ imageStyle, disabled }) {
    const width = imageStyle?.width ?? 90
    const height = imageStyle?.height ?? width * 0.75 // 4:3
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
                readOnly
                className='w-full accent-[#AA8840] disabled:opacity-50 disabled:cursor-not-allowed'
            />
            <p className='text-[10px] text-[#a89378] mt-1 leading-relaxed'>
                גובה התמונה ננעל ליחס 4:3 — אותו יחס שהאפליקציה מחייבת בצילום
                ובהעלאה כדי לוודא שהתצוגה והדפוס זהים.
            </p>
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
