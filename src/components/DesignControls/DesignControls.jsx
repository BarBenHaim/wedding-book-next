'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { storage, app as firebaseApp } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import { heebo, frankRuhl, notoHebrew, gveretLevin, playpenSansHebrew } from '@/app/fonts'
import { getMessages } from '@/i18n/getMessages'
import { dirFor, normalizeLocale } from '@/i18n/locales'
import {
    BUILTIN_PRESETS,
    listPresets,
    listAllBackgrounds,
    resolvePreset,
    UNIFIED_BACKGROUNDS,
    savePreset,
    deletePreset,
    deleteStudioBackground,
    hideStaticBackground,
    hidePreset,
    FONTS_REGISTRY,
} from '@/lib/studioPresets'

// Default backgrounds list for instant render before the live list
// (which includes uploaded backgrounds and honors hidden ids) loads
// from Firestore. The component swaps in the live list on mount.
const DEFAULT_BG_ITEMS = UNIFIED_BACKGROUNDS

/* The 8 built-in presets that ship with the app. Stored as the
 * single source of truth in `src/lib/studioPresets.js` so the upcoming
 * /admin/studio page edits the same data the viewer's preset picker
 * reads. listPresets() loads the live list from Firestore on mount;
 * BUILTIN_PRESETS is the offline-safe fallback (and the seed data the
 * studio writes to Firestore on first run).
 *
 * Both shapes (Firestore docs and BUILTIN_PRESETS) carry STABLE keys
 * for font/frame; the resolver expands them to runtime values
 * (className / asset URL) right before applyPreset calls onChange. */

// Curated font set — Secular One, David Libre and Dana Yad were
// pruned in spring 2026 (couple feedback: too many "Hebrew serif
// blends" with no clear differentiation). Active set is one
// classic serif, one humanist sans, one modern sans, one handwriting.
const FONTS = [
    { font: notoHebrew, label: 'Noto Hebrew' },
    { font: frankRuhl, label: 'Frank Ruhl' },
    { font: heebo, label: 'Heebo' },
    { font: gveretLevin, label: 'גברת לוין' },
    { font: playpenSansHebrew, label: 'Playpen Sans Hebrew' },
]

const BufferedInput = ({ value, onChange, placeholder, className }) => {
    const [localValue, setLocalValue] = useState(value || '')

    useEffect(() => {
        setLocalValue(value || '')
    }, [value])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localValue !== value) onChange(localValue)
        }, 300)
        return () => clearTimeout(timer)
    }, [localValue, onChange, value])

    return (
        <input
            type='text'
            value={localValue}
            placeholder={placeholder}
            onChange={e => setLocalValue(e.target.value)}
            className={className}
        />
    )
}

const PositionPad = ({ x, y, onChange, t }) => {
    const containerRef = useRef(null)
    const [isDragging, setIsDragging] = useState(false)

    const handleMove = (clientX, clientY) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        if (!rect.width || !rect.height) return

        let newX = ((clientX - rect.left) / rect.width) * 100
        let newY = ((clientY - rect.top) / rect.height) * 100

        newX = Math.max(0, Math.min(100, newX))
        newY = Math.max(0, Math.min(100, newY))

        if (!Number.isFinite(newX) || !Number.isFinite(newY)) return

        onChange(newX, newY)
    }

    const onMouseDown = e => {
        setIsDragging(true)
        handleMove(e.clientX, e.clientY)
    }

    useEffect(() => {
        if (!isDragging) return

        const onMouseMove = e => handleMove(e.clientX, e.clientY)
        const onMouseUp = () => setIsDragging(false)

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        window.addEventListener('touchmove', e => handleMove(e.touches[0].clientX, e.touches[0].clientY))
        window.addEventListener('touchend', onMouseUp)

        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.removeEventListener('touchmove', () => {})
            window.removeEventListener('touchend', () => {})
        }
    }, [isDragging])

    return (
        <div className='space-y-1'>
            <div className='flex justify-between text-[10px] text-gray-400'>
                <span>{t.position}</span>
                <span>{t.dragHint}</span>
            </div>
            <div
                ref={containerRef}
                onMouseDown={onMouseDown}
                onTouchStart={e => {
                    setIsDragging(true)
                    handleMove(e.touches[0].clientX, e.touches[0].clientY)
                }}
                className={`relative w-full h-24 bg-gray-100 rounded-lg border-2 border-dashed border-[#AA8840]/30 overflow-hidden cursor-crosshair touch-none transition-colors ${
                    isDragging ? 'border-[#c9a44e] bg-[#F5F5F5]' : ''
                }`}
            >
                <div className='absolute top-1/2 left-0 w-full h-px bg-gray-200 pointer-events-none' />
                <div className='absolute left-1/2 top-0 w-px h-full bg-gray-200 pointer-events-none' />

                <div
                    className='absolute w-6 h-6 bg-white border-2 border-[#c9a44e] rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75'
                    style={{ left: `${x}%`, top: `${y}%`, scale: isDragging ? '1.2' : '1' }}
                >
                    <div className='w-full h-full flex items-center justify-center'>
                        <div className='w-1 h-1 bg-[#c9a44e] rounded-full' />
                    </div>
                </div>
            </div>
        </div>
    )
}

const Card = ({ title, children, className = '' }) => (
    <div className={`bg-white border border-[#AA8840]/10 rounded-xl shadow-sm overflow-hidden ${className}`}>
        <div className='bg-gradient-to-r from-[#AA8840]/5 to-transparent px-4 py-2.5 border-b border-[#AA8840]/10'>
            <h4 className='text-[11px] font-bold text-[#AA8840] uppercase tracking-wider'>{title}</h4>
        </div>
        <div className='p-4 space-y-3'>{children}</div>
    </div>
)

export default function DesignControls({
    settings,
    onChange,
    mode,
    onModeChange,
    saveStatus = 'idle',
    weddingId,
    locale,
}) {
    const [activePreset, setActivePreset] = useState(null)
    const [uploadingCover, setUploadingCover] = useState(false)

    // ── Super-admin gate ────────────────────────────────────────────
    // The viewer is the couple's design panel. By product decision,
    // wedding owners (the couple) get a CURATED experience: pick a
    // preset and you're done. Free-form editing — fonts, sizes,
    // colors, backgrounds, deleting/saving presets — stays super-
    // admin-only so couples don't accidentally break the look or
    // wipe shared studio assets. Detection runs on every auth-state
    // change so the UI reflects sign-in/sign-out without a refresh.
    const [isAdmin, setIsAdmin] = useState(false)
    useEffect(() => {
        const auth = getAuth(firebaseApp)
        const unsub = onAuthStateChanged(auth, user => {
            setIsAdmin(isSuperAdmin(user?.email))
        })
        return unsub
    }, [])

    // i18n — `locale` is passed in by the parent (viewer page) so the
    // panel speaks the same language the couple sees on their guest
    // page. Fall back to Hebrew so old call-sites still work.
    const resolvedLocale = normalizeLocale(locale)
    const t = useMemo(() => getMessages(resolvedLocale).designControls, [resolvedLocale])
    const dir = dirFor(resolvedLocale)

    // Presets — start with the hardcoded builtins so the picker renders
    // instantly even before Firestore answers, then swap in the live
    // list (system + studio-created) once it arrives. listPresets()
    // already falls back to BUILTIN_PRESETS on any error, so this also
    // handles the "Firestore unreachable" case gracefully.
    const [presets, setPresets] = useState(BUILTIN_PRESETS)
    useEffect(() => {
        let cancelled = false
        listPresets().then(list => {
            if (!cancelled && Array.isArray(list) && list.length > 0) setPresets(list)
        })
        return () => {
            cancelled = true
        }
    }, [])

    // Apply a preset to the wedding's design doc. The picker holds
    // storage-shape presets (with fontKey / frameId); resolvePreset
    // expands those to runtime values (fontClass / frame URL) so the
    // shape onChange receives is identical to what the old hardcoded
    // PRESETS array used to pass.
    const applyPreset = preset => {
        const resolved = resolvePreset(preset)
        setActivePreset(resolved.id || resolved.name)
        onChange(resolved.values)
    }

    // Live backgrounds list — pulled on mount, includes uploaded
    // backgrounds and respects the hidden-ids list. Until it loads we
    // render the static slice immediately so the picker isn't blank.
    const [bgItems, setBgItems] = useState(DEFAULT_BG_ITEMS)
    const [refreshTick, setRefreshTick] = useState(0)
    useEffect(() => {
        let cancelled = false
        listAllBackgrounds()
            .then(list => {
                if (!cancelled && Array.isArray(list)) setBgItems(list)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [refreshTick])
    const visibleBgItems = bgItems

    // ── Background delete ────────────────────────────────────────────
    // Static (curated) → soft-hide via hiddenBackgroundIds (Firestore
    // config doc). Uploaded → hard-delete (Firestore doc + Storage).
    // Either way the picker refreshes after.
    const handleDeleteBackground = async item => {
        if (!item) return
        if (!confirm(`${t.deleteBgConfirm}\n${item.label || item.id}`)) return
        try {
            if (item.origin === 'studio') {
                await deleteStudioBackground(item.id, item.storagePath)
            } else {
                await hideStaticBackground(item.id)
            }
            // If the active book/cover bg was the one we just deleted,
            // null it out so the renderer doesn't show a 404 / hidden
            // image.
            const patch = {}
            if (settings.backgroundUrl === item.src) patch.backgroundUrl = null
            if (settings.coverTexture === item.src) patch.coverTexture = null
            if (Object.keys(patch).length) onChange({ ...settings, ...patch })
            setRefreshTick(n => n + 1)
        } catch (err) {
            console.error('[design] delete background failed', err)
            alert(t.deleteBgError + '\n' + (err?.message || err))
        }
    }

    // ── Preset save (overwrite the active preset with current
    //    settings) ───────────────────────────────────────────────────
    // Spring 2026 user request: "I want to be able to edit the
    // existing presets too." Writes the live `settings` (plus the
    // computed stable keys for font/frame) back into the preset's
    // `values` field. System presets stay flagged ownerType:'system'
    // so the seeder doesn't double-create them.
    const handleSaveActivePreset = async () => {
        const target = presets.find(p => (p.id || p.name) === activePreset)
        if (!target) return
        // Reverse-resolve fontClass back to a stable fontKey so the
        // saved doc stays portable across builds.
        const fontKey =
            Object.values(FONTS_REGISTRY).find(f => f.font.className === settings.fontClass)?.id ||
            null
        const merged = {
            ...target,
            values: {
                ...(target.values || {}),
                ...settings,
                ...(fontKey ? { fontKey } : {}),
            },
        }
        try {
            const saved = await savePreset(merged)
            setPresets(prev => prev.map(p => (p.id === saved.id ? saved : p)))
        } catch (err) {
            console.error('[design] save preset failed', err)
            alert(t.savePresetError + '\n' + (err?.message || err))
        }
    }

    // Delete a preset entirely. Hard-deletes the Firestore doc; for
    // ownerType:'system' we also write the id into hiddenPresetIds so
    // the seeder doesn't recreate it on next mount.
    const handleDeletePreset = async preset => {
        if (!preset) return
        if (!confirm(`${t.deletePresetConfirm}\n${preset.name || preset.id}`)) return
        try {
            await deletePreset(preset.id)
            if (preset.ownerType === 'system') {
                await hidePreset(preset.id)
            }
            setPresets(prev => prev.filter(p => p.id !== preset.id))
            if (activePreset === (preset.id || preset.name)) setActivePreset(null)
        } catch (err) {
            console.error('[design] delete preset failed', err)
            alert(t.deletePresetError + '\n' + (err?.message || err))
        }
    }

    const handleImageUpload = async e => {
        const file = e.target.files[0]
        if (!file) return

        if (weddingId) {
            setUploadingCover(true)
            try {
                const mime = file.type || 'image/jpeg'
                const ext = mime.split('/')[1] || 'jpg'
                const path = `weddings/${weddingId}/cover.${ext}`
                const fileRef = storageRef(storage, path)
                await uploadBytes(fileRef, file, { contentType: mime })
                const url = await getDownloadURL(fileRef)
                onChange({ ...settings, coverImage: url })
                return
            } catch (err) {
                console.error('Cover upload to Storage failed, falling back to data URL:', err)
            } finally {
                setUploadingCover(false)
            }
        }

        const reader = new FileReader()
        reader.onloadend = () => {
            onChange({ ...settings, coverImage: reader.result })
        }
        reader.readAsDataURL(file)
    }

    return (
        <div dir={dir} className='flex flex-col gap-3 h-full bg-[#faf8f5] p-3'>
            <div className='flex items-center justify-end h-5 px-1 shrink-0'>
                {saveStatus === 'saving' && (
                    <span className='flex items-center gap-1.5 text-[11px] text-gray-400 font-medium'>
                        <span className='w-2.5 h-2.5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin' />
                        {t.saving}
                    </span>
                )}
                {saveStatus === 'saved' && (
                    <span className='flex items-center gap-1 text-[11px] text-emerald-600 font-semibold animate-fadeIn'>
                        <svg className='w-3 h-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
                        </svg>
                        {t.saved}
                    </span>
                )}
            </div>

            <div className='bg-[#ebe5da]/60 p-1 rounded-xl flex gap-1 shadow-inner shrink-0'>
                <button
                    onClick={() => onModeChange('book')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                        mode === 'book' ? 'bg-white text-[#AA8840] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {t.modeBook}
                </button>
                <button
                    onClick={() => onModeChange('cover')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                        mode === 'cover' ? 'bg-white text-[#c9a44e] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {t.modeCover}
                </button>
            </div>

            <div className='flex-1 overflow-y-auto pr-0.5 pl-0.5 space-y-4 pb-10 scrollbar-hide'>
                {mode === 'book' && (
                    <div className='space-y-4 animate-fadeIn'>
                        {/* PRESETS — quick-apply gallery. Tweaks below
                            are saved to the wedding doc, not back to
                            the preset (system presets stay read-only
                            via savePreset's lib-level guard). */}
                        <Card title={t.presetsTitle}>
                            <div className='grid grid-cols-2 gap-3'>
                                {presets.map(preset => {
                                    const presetKey = preset.id || preset.name
                                    const isActive = activePreset === presetKey
                                    return (
                                        <div key={presetKey} className='relative group'>
                                            <button
                                                onClick={() => applyPreset(preset)}
                                                className={`relative h-16 w-full rounded-lg border transition-all overflow-hidden ${
                                                    isActive
                                                        ? 'ring-2 ring-[#AA8840] border-transparent'
                                                        : 'border-gray-200 hover:scale-[1.02]'
                                                }`}
                                                style={{ background: preset.preview }}
                                            >
                                                <span className='absolute bottom-1 end-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/90 text-black'>
                                                    {preset.name}
                                                </span>
                                            </button>
                                            {/* Trash — hides on hover; works on
                                                system + studio presets alike (the
                                                lib-level guard was lifted at the
                                                user's "no restrictions" request). */}
                                            {isAdmin && (
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation()
                                                        handleDeletePreset(preset)
                                                    }}
                                                    className='absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-red-500 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow flex items-center justify-center hover:bg-red-50'
                                                    title={t.deletePreset}
                                                    aria-label={t.deletePreset}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                            <p className='text-[10px] text-gray-400 mt-3 leading-relaxed'>
                                {t.presetsHint}
                            </p>
                            {/* Save current settings to the active
                                preset. Super-admin-only; couples
                                shouldn't overwrite shared presets. */}
                            {isAdmin && activePreset && (
                                <button
                                    onClick={handleSaveActivePreset}
                                    className='mt-3 w-full py-2 rounded-lg bg-[#AA8840]/10 hover:bg-[#AA8840]/20 text-[#AA8840] text-[11px] font-bold transition-colors border border-[#AA8840]/30'
                                >
                                    {t.savePresetCta}
                                </button>
                            )}
                        </Card>

                        {isAdmin && (
                        <>
                        {/* BODY (TEXT) FONT — the blessing copy. */}
                        <Card title={t.fontsTitle}>
                            <div className='space-y-2'>
                                {FONTS.map(f => (
                                    <button
                                        key={f.label}
                                        onClick={() => onChange({ ...settings, fontClass: f.font.className })}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                            settings.fontClass === f.font.className
                                                ? 'bg-[#F5F5F5] border-[#AA8840] text-[#AA8840]'
                                                : 'bg-white hover:border-gray-300'
                                        }`}
                                    >
                                        <span className='text-[10px] text-gray-400'>{f.label}</span>
                                        <span className={`${f.font.className} text-base`}>{t.fontSample}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Body font size — % of page height. */}
                            <div className='mt-4 pt-3 border-t border-gray-100'>
                                <div className='flex justify-between text-[10px] text-gray-400 mb-1'>
                                    <span>{t.textSize}</span>
                                    <span>{(settings.fontSizePercent ?? 3).toFixed(1)}%</span>
                                </div>
                                <input
                                    type='range'
                                    min={1.5}
                                    max={5}
                                    step={0.1}
                                    value={settings.fontSizePercent ?? 3}
                                    onChange={e =>
                                        onChange({ ...settings, fontSizePercent: parseFloat(e.target.value) })
                                    }
                                    className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c9a44e]'
                                />
                            </div>

                            {/* Text color */}
                            <div className='mt-3 pt-3 border-t border-gray-100 flex items-center justify-between'>
                                <span className='text-[10px] text-gray-400'>{t.textColor}</span>
                                <input
                                    type='color'
                                    value={settings.fontColor || '#000000'}
                                    onChange={e => onChange({ ...settings, fontColor: e.target.value })}
                                    className='w-9 h-9 rounded-lg border border-gray-200 cursor-pointer'
                                />
                            </div>
                        </Card>

                        {/* GUEST NAME — own font + size, independent
                            of the body. Falls back to body font when
                            nameFontClass is unset, which is what the
                            old behavior was — so legacy weddings stay
                            visually unchanged. */}
                        <Card title={t.guestNameTitle}>
                            <div className='space-y-2'>
                                <button
                                    onClick={() => onChange({ ...settings, nameFontClass: null })}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                        !settings.nameFontClass
                                            ? 'bg-[#F5F5F5] border-[#AA8840] text-[#AA8840]'
                                            : 'bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <span className='text-[10px] text-gray-400'>{t.sameAsBody}</span>
                                    <span className='text-[11px]'>↺</span>
                                </button>
                                {FONTS.map(f => (
                                    <button
                                        key={f.label}
                                        onClick={() => onChange({ ...settings, nameFontClass: f.font.className })}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                            settings.nameFontClass === f.font.className
                                                ? 'bg-[#F5F5F5] border-[#AA8840] text-[#AA8840]'
                                                : 'bg-white hover:border-gray-300'
                                        }`}
                                    >
                                        <span className='text-[10px] text-gray-400'>{f.label}</span>
                                        <span className={`${f.font.className} text-base`}>{t.fontSample}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Name size — % of page height. Default
                                falls back to ~70% of body size (same
                                proportion BookPageTemplate uses when
                                nameFontSizePercent is unset). */}
                            <div className='mt-4 pt-3 border-t border-gray-100'>
                                <div className='flex justify-between text-[10px] text-gray-400 mb-1'>
                                    <span>{t.nameSize}</span>
                                    <span>
                                        {(
                                            settings.nameFontSizePercent ??
                                            (settings.fontSizePercent ?? 3) * 0.7
                                        ).toFixed(1)}
                                        %
                                    </span>
                                </div>
                                <input
                                    type='range'
                                    min={1}
                                    max={5}
                                    step={0.1}
                                    value={
                                        settings.nameFontSizePercent ??
                                        (settings.fontSizePercent ?? 3) * 0.7
                                    }
                                    onChange={e =>
                                        onChange({
                                            ...settings,
                                            nameFontSizePercent: parseFloat(e.target.value),
                                        })
                                    }
                                    className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c9a44e]'
                                />
                            </div>
                        </Card>

                        {/* UNIFIED BACKGROUNDS — frames + textures +
                            page bgs collapsed into one gallery. The
                            user explicitly asked for this: "all of
                            these are just background to me." */}
                        <Card title={t.backgroundTitle}>
                            <div className='grid grid-cols-3 gap-2'>
                                {/* "None" / blank background */}
                                <button
                                    onClick={() => onChange({ ...settings, texture: null, frame: null, backgroundUrl: null })}
                                    className={`aspect-square rounded-lg flex items-center justify-center text-[10px] border transition-all ${
                                        !settings.texture && !settings.frame && !settings.backgroundUrl
                                            ? 'bg-[#F5F5F5] border-[#c9a44e] text-[#AA8840]'
                                            : 'bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    {t.none}
                                </button>

                                {visibleBgItems.map(item => {
                                    // Active = backgroundUrl matches.
                                    // Per spring 2026: textures are
                                    // routed to backgroundUrl too so
                                    // they render as full-cover page
                                    // backgrounds, not repeating-tile
                                    // overlays. The legacy texture /
                                    // frame fields are cleared on any
                                    // selection so there's exactly one
                                    // source of truth for the page
                                    // surface.
                                    const active = settings.backgroundUrl === item.src
                                    return (
                                        <div key={item.id} className='relative group'>
                                            <button
                                                onClick={() =>
                                                    onChange({
                                                        ...settings,
                                                        backgroundUrl: item.src,
                                                        texture: null,
                                                        frame: null,
                                                    })
                                                }
                                                className={`aspect-square w-full rounded-lg border overflow-hidden transition-all ${
                                                    active
                                                        ? 'ring-2 ring-[#c9a44e] border-transparent'
                                                        : 'border-gray-200 hover:opacity-90'
                                                }`}
                                                title={item.label}
                                            >
                                                <img
                                                    src={item.src}
                                                    alt={item.label}
                                                    className='w-full h-full object-cover'
                                                />
                                                <span className='absolute bottom-0.5 inset-x-0 text-[9px] font-medium text-white text-center bg-black/40 backdrop-blur-sm py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate px-1'>
                                                    {item.label}
                                                </span>
                                            </button>
                                            {/* Per-tile delete — works for both
                                                static (soft-hide via
                                                hiddenBackgroundIds) and uploaded
                                                (Firestore doc deletion). */}
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    handleDeleteBackground(item)
                                                }}
                                                className='absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-red-500 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow flex items-center justify-center hover:bg-red-50'
                                                title={t.deleteBg}
                                                aria-label={t.deleteBg}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Background color — solid swatch picker
                                for cases where the user wants a flat
                                base under (or instead of) the image. */}
                            <div className='mt-4 pt-3 border-t border-gray-100 flex items-center justify-between'>
                                <span className='text-[10px] text-gray-400'>{t.bgColor}</span>
                                <input
                                    type='color'
                                    value={settings.backgroundColor || '#ffffff'}
                                    onChange={e => onChange({ ...settings, backgroundColor: e.target.value })}
                                    className='w-9 h-9 rounded-lg border border-gray-200 cursor-pointer'
                                />
                            </div>
                        </Card>
                        </>
                        )}
                    </div>
                )}

                {mode === 'cover' && (
                    <div className='animate-fadeIn space-y-4'>
                        <Card title={t.coverTextTitle}>
                            <div className='space-y-3'>
                                <BufferedInput
                                    value={settings.coverTitle}
                                    onChange={val => onChange({ ...settings, coverTitle: val })}
                                    placeholder={t.coverTitlePlaceholder}
                                    className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#c9a44e]/30 outline-none'
                                />
                                <BufferedInput
                                    value={settings.coverSubtitle}
                                    onChange={val => onChange({ ...settings, coverSubtitle: val })}
                                    placeholder={t.coverSubtitlePlaceholder}
                                    className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#c9a44e]/30 outline-none'
                                />
                            </div>
                            <div className='mt-3 flex items-center justify-between'>
                                <span className='text-xs text-gray-500'>{t.coverTextBg}</span>
                                <button
                                    onClick={() =>
                                        onChange({
                                            ...settings,
                                            coverTextBg: settings.coverTextBg ? null : 'rgba(255,255,255,0.8)',
                                        })
                                    }
                                    className={`relative w-10 h-5 rounded-full transition-colors ${
                                        settings.coverTextBg ? 'bg-[#c9a44e]' : 'bg-gray-300'
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${
                                            settings.coverTextBg ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className='mt-4 pt-3 border-t border-gray-100'>
                                <div className='text-xs text-gray-500 mb-2'>{t.coverTextPosition}</div>
                                <div dir='ltr' className='grid grid-cols-3 gap-1.5 w-full max-w-[160px] mx-auto'>
                                    {['tl', 'tc', 'tr', 'cl', 'center', 'cr', 'bl', 'bc', 'br'].map(id => {
                                        const active = (settings.coverTextPosition || 'center') === id
                                        return (
                                            <button
                                                key={id}
                                                type='button'
                                                onClick={() => onChange({ ...settings, coverTextPosition: id })}
                                                className={`aspect-square rounded-md border flex items-center justify-center transition-all ${
                                                    active
                                                        ? 'bg-[#F5F5F5] border-[#c9a44e] ring-1 ring-[#c9a44e]'
                                                        : 'bg-white border-gray-200 hover:border-[#AA8840]/40'
                                                }`}
                                                aria-label={`text position ${id}`}
                                            >
                                                <span
                                                    className={`block w-2 h-2 rounded-full ${
                                                        active ? 'bg-[#AA8840]' : 'bg-gray-300'
                                                    }`}
                                                />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </Card>

                        <Card title={t.coverImageTitle}>
                            {!settings.coverImage ? (
                                <label className='flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-[#AA8840]/30 rounded-xl cursor-pointer hover:bg-[#AA8840]/5 hover:border-[#c9a44e] transition-all duration-200'>
                                    <svg
                                        className='w-8 h-8 text-[#AA8840]/40 mb-1.5'
                                        fill='none'
                                        viewBox='0 0 24 24'
                                        strokeWidth={1.5}
                                        stroke='currentColor'
                                    >
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z'
                                        />
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z'
                                        />
                                    </svg>
                                    <span className='text-xs text-[#AA8840]/60 font-medium'>{t.uploadImage}</span>
                                    <input
                                        type='file'
                                        accept='image/*'
                                        className='hidden'
                                        onChange={handleImageUpload}
                                    />
                                </label>
                            ) : (
                                <div className='space-y-4'>
                                    <div className='relative rounded-lg overflow-hidden border border-gray-200'>
                                        <img src={settings.coverImage} className='w-full h-32 object-cover' />
                                        <button
                                            onClick={() => onChange({ coverImage: null })}
                                            className='absolute top-2 left-2 bg-white/90 text-red-500 p-1.5 rounded-full shadow hover:bg-red-50'
                                        >
                                            <svg
                                                className='w-4 h-4'
                                                fill='none'
                                                viewBox='0 0 24 24'
                                                stroke='currentColor'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    strokeWidth={2}
                                                    d='M6 18L18 6M6 6l12 12'
                                                />
                                            </svg>
                                        </button>
                                    </div>

                                    <PositionPad
                                        x={settings.coverImageX || 50}
                                        y={settings.coverImageY || 50}
                                        t={t}
                                        onChange={(newX, newY) =>
                                            onChange({ ...settings, coverImageX: newX, coverImageY: newY })
                                        }
                                    />

                                    <div>
                                        <div className='flex justify-between text-[10px] text-gray-400 mb-1'>
                                            <span>{t.zoom}</span>
                                            <span>{settings.coverImageScale || 100}%</span>
                                        </div>
                                        <input
                                            type='range'
                                            min={20}
                                            max={500}
                                            value={settings.coverImageScale || 100}
                                            onChange={e =>
                                                onChange({ ...settings, coverImageScale: parseFloat(e.target.value) })
                                            }
                                            className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c9a44e]'
                                        />
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card title={t.designAndBg}>
                            {/* Cover backdrop — also pulls from the
                                unified gallery (frames + textures +
                                page bgs as one set), so the cover
                                editor shares the same vocabulary as
                                the book page editor. */}
                            <div className='grid grid-cols-4 gap-2'>
                                <button
                                    onClick={() => onChange({ coverTexture: null, coverFrame: null })}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] border transition-all ${
                                        settings.coverTexture === null && settings.coverFrame === null
                                            ? 'bg-[#F5F5F5] border-[#c9a44e] text-[#AA8840]'
                                            : 'bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    {t.auto}
                                </button>

                                <button
                                    onClick={() => onChange({ coverTexture: 'none', coverFrame: 'none' })}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] border transition-all ${
                                        settings.coverTexture === 'none'
                                            ? 'bg-[#F5F5F5] border-[#c9a44e] text-[#AA8840]'
                                            : 'bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    {t.none}
                                </button>

                                {visibleBgItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => onChange({ coverTexture: item.src, coverFrame: 'none' })}
                                        className={`aspect-square rounded-lg border overflow-hidden transition-all ${
                                            settings.coverTexture === item.src
                                                ? 'ring-2 ring-[#c9a44e] border-transparent'
                                                : 'hover:opacity-80'
                                        }`}
                                        title={item.label}
                                    >
                                        <img src={item.src} className='w-full h-full object-cover' alt={item.label} />
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    )
}
