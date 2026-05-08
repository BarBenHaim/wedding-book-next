'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebaseClient'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew, gveretLevin, danaYad } from '@/app/fonts'
import { getMessages } from '@/i18n/getMessages'
import { dirFor, normalizeLocale } from '@/i18n/locales'

import frame1 from '../../media/frames/frame1.png'
import frame2 from '../../media/frames/frame2.png'
import frame3 from '../../media/frames/frame3.png'
import frame4 from '../../media/frames/frame4.png'

const tex1 = { src: '/textures/tex1.png' }
const tex2 = { src: '/textures/tex2.png' }
const tex3 = { src: '/textures/tex3.png' }
const tex4 = { src: '/textures/tex4.png' }
const tex5 = { src: '/textures/tex5.png' }
const tex6 = { src: '/textures/tex6.png' }
const tex7 = { src: '/textures/tex7.png' }
const tex8 = { src: '/textures/tex8.png' }
const tex9 = { src: '/textures/tex9.png' }

const TEXTURES = [tex1, tex2, tex3, tex4, tex5, tex6, tex7, tex8, tex9]
const FRAMES = [frame1, frame2, frame3, frame4]

/* PRESETS — every entry must include `template`. After the spring 2026
 * curation pass: 4 originals + 4 vintage memory-book templates. The
 * Modern Card and Specialty/Experimental families were trimmed; their
 * layout files remain on disk as orphan code so they can be re-enabled
 * without rebuilding (just re-add the import + dispatcher branch + a
 * preset entry here). */
const PRESETS = [
    // ─── Original classic templates (do not edit) ───────────────────────
    {
        name: 'קלאסי',
        preview: '#ffffff',
        values: {
            template: 'classic',
            backgroundColor: '#ffffff',
            fontClass: heebo.className,
            fontColor: '#000000',
            frame: frame2.src,
            texture: null,
            fontSizePercent: 2.5,
            imageStyle: { width: 80, height: 70, borderRadius: 0 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        name: 'פסטורלי',
        preview: '#ffffff',
        values: {
            template: 'classic',
            backgroundColor: '#ffffff',
            fontClass: heebo.className,
            fontColor: '#000000',
            frame: null,
            texture: tex6.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 80, height: 70, borderRadius: 0 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },

    {
        name: 'שמפניה',
        preview: '#fdf6ec',
        values: {
            template: 'classic',
            backgroundColor: '#fdf6ec',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex1.src,
            frame: frame1.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 7.5,
            textMaxWidth: 70,
            imageMarginTop: 0,
        },
    },
    {
        name: 'פרחי גן',
        preview: '#c4b5ecff',
        values: {
            template: 'classic',
            backgroundColor: '#c4b5ecff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex3.src,
            frame: null,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        name: 'מינימלי',
        preview: '#ffffff',
        values: {
            template: 'classic',
            backgroundColor: '#ffffff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: null,
            frame: frame4.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65, borderRadius: 0 },
            nameMarginTop: 6,
            textMaxWidth: 70,
            imageMarginTop: 1,
        },
    },

    // ─── Vintage memory-book ────────────────────────────────────────────
    {
        name: 'פולארויד וינטג׳',
        preview: '#fcfaf6',
        values: {
            template: 'polaroid',
            backgroundColor: '#ffffff',
            fontClass: gveretLevin.className,
            fontColor: '#3d2e1a',
            texture: tex5.src,
            textureOpacity: 0.9, // ← זה

            frame: null,
        },
    },

    {
        name: 'זהב עתיק',
        preview: '#f7f1e3',
        values: {
            template: 'classic',
            backgroundColor: '#f7f1e3',
            fontClass: gveretLevin.className,
            fontColor: '#3d2e1a',
            texture: tex9.src,
            frame: null,
        },
    },
    {
        name: 'אלבום זיכרונות',
        preview: '#ffffff',
        values: {
            template: 'collage',
            backgroundColor: '#ffffff',
            fontClass: gveretLevin.className,
            fontColor: '#3d2e1a',
            texture: tex8.src,
            textureOpacity: 0.2, // ← זה
            frame: null,
        },
    },
]

const FONTS = [
    { font: notoHebrew, label: 'Noto Hebrew' },
    { font: frankRuhl, label: 'Frank Ruhl' },
    { font: davidLibre, label: 'David Libre' },
    { font: heebo, label: 'Heebo' },
    { font: secular, label: 'Secular One' },
    { font: gveretLevin, label: 'גברת לוין' },
    { font: danaYad, label: 'דנה יד' },
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

    // i18n — `locale` is passed in by the parent (viewer page) so the
    // panel speaks the same language the couple sees on their guest
    // page. Fall back to Hebrew so old call-sites still work.
    const resolvedLocale = normalizeLocale(locale)
    const t = useMemo(() => getMessages(resolvedLocale).designControls, [resolvedLocale])
    const dir = dirFor(resolvedLocale)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
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
                        <Card title={t.presetsTitle}>
                            <div className='grid grid-cols-2 gap-3'>
                                {PRESETS.map(preset => (
                                    <button
                                        key={preset.name}
                                        onClick={() => applyPreset(preset)}
                                        className={`relative h-16 rounded-lg border transition-all overflow-hidden ${
                                            activePreset === preset.name
                                                ? 'ring-2 ring-[#AA8840] border-transparent'
                                                : 'border-gray-200 hover:scale-[1.02]'
                                        }`}
                                        style={{ background: preset.preview }}
                                    >
                                        {/* Label sits in the trailing-bottom corner of the
                                            swatch. bg-white/90 reads against any preview color
                                            we've shipped — was previously branched on the Hebrew
                                            substring 'לבן' which would no-op in i18n. */}
                                        <span className='absolute bottom-1 end-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/90 text-black'>
                                            {preset.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Card>

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
                        </Card>
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

                                {TEXTURES.map((tex, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onChange({ coverTexture: tex.src, coverFrame: 'none' })}
                                        className={`aspect-square rounded-lg border overflow-hidden transition-all ${
                                            settings.coverTexture === tex.src
                                                ? 'ring-2 ring-[#c9a44e] border-transparent'
                                                : 'hover:opacity-80'
                                        }`}
                                    >
                                        <img src={tex.src} className='w-full h-full object-cover' />
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
