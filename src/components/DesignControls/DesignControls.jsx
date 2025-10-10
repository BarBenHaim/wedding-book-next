'use client'

import { useState } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

/* --- מסגרות --- */
import frame1 from '../../media/frames/frame1.png'
import frame2 from '../../media/frames/frame2.png'
import frame3 from '../../media/frames/frame3.png'
import frame4 from '../../media/frames/frame4.png'

/* --- טקסטורות --- */
import tex1 from '../../media/textures/tex1.png'
import tex2 from '../../media/textures/tex2.png'
import tex3 from '../../media/textures/tex3.png'

/* --- פריסטים --- */
const PRESETS = [
    {
        name: 'קלאסי לבן',
        preview: '#ffffff',
        values: {
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
        name: 'שמנת אלגנטי',
        preview: '#fdf6ec',
        values: {
            backgroundColor: '#fdf6ec',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex1.src,
            frame: frame1.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 8,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        name: 'ציור',
        preview: '#c4b5ecff',
        values: {
            backgroundColor: '#c4b5ecff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex3.src,
            frame: null,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 8,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        name: 'מסגרת מרובעת',
        preview: '#ffffff',
        values: {
            backgroundColor: '#ffffff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: null,
            frame: frame4.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65, borderRadius: 0 },
            nameMarginTop: 1,
            textMaxWidth: 70,
            imageMarginTop: 8,
        },
    },
]

const BACKGROUNDS = ['#ffffff', '#fdf6ec', '#fde2e4', '#e8f0fe', '#f3f3f3', '#2c2c2c']
const TEXTURES = [tex1, tex2, tex3]
const FRAMES = [frame1, frame2, frame3, frame4]
const FONTS = [
    { font: notoHebrew, label: 'Noto Hebrew' },
    { font: frankRuhl, label: 'Frank Ruhl' },
    { font: davidLibre, label: 'David Libre' },
    { font: heebo, label: 'Heebo' },
    { font: secular, label: 'Secular One' },
]
const FONT_SIZES = [
    { name: 'קטן', value: 2.5 },
    { name: 'בינוני', value: 2.8 },
    { name: 'גדול', value: 3 },
]
const FONT_COLORS = ['#000000', '#d4af37', '#8b1e3f', '#2c2c2c', '#f8f4ec', '#ffffff']

export default function DesignControls({ settings, onChange, mode, onModeChange, pdfSize, onSizeChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    const Card = ({ title, children }) => (
        <div className='bg-white border border-gray-200 rounded-lg shadow-sm p-3 space-y-2'>
            <h4 className='text-xs font-semibold text-gray-700'>{title}</h4>
            {children}
        </div>
    )

    return (
        <div dir='rtl' className='flex flex-col gap-3 text-sm p-4 bg-gray-50 rounded-xl shadow-inner'>
            {/* 🔀 מצב */}
            <div className='flex mb-4 gap-2'>
                <button
                    onClick={() => onModeChange('book')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        mode === 'book' ? 'bg-purple-600 text-white shadow' : 'bg-white border'
                    }`}
                >
                    📖 ספר
                </button>
                <button
                    onClick={() => onModeChange('cover')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        mode === 'cover' ? 'bg-pink-500 text-white shadow' : 'bg-white border'
                    }`}
                >
                    🎨 כריכה
                </button>
            </div>

            {/* ===================== מצב ספר ===================== */}
            {mode === 'book' && (
                <>
                    <Card title='🎨 פריסטים'>
                        <div className='grid grid-cols-3 gap-2'>
                            {PRESETS.map(preset => (
                                <button
                                    key={preset.name}
                                    onClick={() => applyPreset(preset)}
                                    className={`relative h-16 rounded-md border overflow-hidden transition hover:scale-105 ${
                                        activePreset === preset.name ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                    style={{ background: preset.preview }}
                                >
                                    <span className='absolute bottom-0.5 right-0.5 text-[9px] bg-white/80 px-1 rounded'>
                                        {preset.name}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card title='🖌️ רקע'>
                        <div className='flex flex-wrap gap-2'>
                            {BACKGROUNDS.map(bg => (
                                <button
                                    key={bg}
                                    onClick={() => onChange({ ...settings, backgroundColor: bg })}
                                    className={`h-7 w-7 rounded-full border ${
                                        settings.backgroundColor === bg ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                    style={{ backgroundColor: bg }}
                                />
                            ))}
                        </div>
                    </Card>

                    <Card title='🖼️ טקסטורות'>
                        <div className='grid grid-cols-6 gap-2'>
                            <button
                                onClick={() => onChange({ ...settings, texture: null })}
                                className={`px-2 py-1 rounded text-xs ${
                                    !settings.texture ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                                }`}
                            >
                                ללא
                            </button>
                            {TEXTURES.map(tex => (
                                <button
                                    key={tex.src}
                                    onClick={() => onChange({ ...settings, texture: tex.src })}
                                    className={`aspect-square rounded border overflow-hidden ${
                                        settings.texture === tex.src ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                >
                                    <img src={tex.src} className='w-full h-full object-cover' />
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card title='🔤 פונטים'>
                        <div className='grid grid-cols-3 gap-2'>
                            {FONTS.map(f => (
                                <button
                                    key={f.label}
                                    onClick={() => onChange({ ...settings, fontClass: f.font.className })}
                                    className={`flex flex-col items-center rounded border py-2 px-1 ${
                                        settings.fontClass === f.font.className ? 'bg-pink-50 ring-2 ring-pink-400' : ''
                                    }`}
                                >
                                    <span className={`${f.font.className} text-base leading-none`}>אב</span>
                                    <span className='text-[9px] text-gray-600'>{f.label}</span>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card title='🔠 גודל טקסט'>
                        <div className='flex gap-2 flex-wrap'>
                            {FONT_SIZES.map(size => (
                                <button
                                    key={size.value}
                                    onClick={() => onChange({ ...settings, fontSizePercent: size.value })}
                                    className={`px-2 py-0.5 rounded-full text-xs ${
                                        settings.fontSizePercent === size.value
                                            ? 'bg-pink-100 ring-2 ring-pink-400'
                                            : 'border'
                                    }`}
                                >
                                    {size.name}
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card title='🎨 צבע טקסט'>
                        <div className='flex flex-wrap gap-2'>
                            {FONT_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => onChange({ ...settings, fontColor: c })}
                                    className={`h-7 w-7 rounded-full border ${
                                        settings.fontColor === c ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </Card>

                    <Card title='📐 מסגרות'>
                        <div className='grid grid-cols-5 gap-2'>
                            <button
                                onClick={() => onChange({ ...settings, frame: null })}
                                className={`px-2 py-1 rounded text-xs ${
                                    !settings.frame ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                                }`}
                            >
                                ללא
                            </button>
                            {FRAMES.map(f => (
                                <button
                                    key={f.src}
                                    onClick={() => onChange({ ...settings, frame: f.src })}
                                    className={`aspect-square rounded border overflow-hidden ${
                                        settings.frame === f.src ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                >
                                    <img src={f.src} className='w-full h-full object-cover' />
                                </button>
                            ))}
                        </div>
                    </Card>
                </>
            )}

            {/* ===================== מצב כריכה ===================== */}
            {mode === 'cover' && (
                <div className='animate-fadeIn space-y-3'>
                    <Card title='📖 טקסט כריכה'>
                        <input
                            type='text'
                            placeholder='כותרת ראשית'
                            value={settings.coverTitle || ''}
                            onChange={e => onChange({ coverTitle: e.target.value })}
                            className='border rounded px-2 py-1 text-xs w-full mb-2'
                        />
                        <input
                            type='text'
                            placeholder='תת־כותרת'
                            value={settings.coverSubtitle || ''}
                            onChange={e => onChange({ coverSubtitle: e.target.value })}
                            className='border rounded px-2 py-1 text-xs w-full'
                        />
                    </Card>
                    <Card title='⬜ רקע טקסט'>
                        <div className='flex gap-2'>
                            <button
                                onClick={() =>
                                    onChange({
                                        ...settings,
                                        coverTextBg: settings.coverTextBg ? null : 'rgba(255,255,255,0.8)',
                                        coverTextColor: '#000000',
                                    })
                                }
                                className='px-3 py-1 rounded border text-xs'
                            >
                                {settings.coverTextBg ? '❌ בלי רקע' : '⬜ רקע לבן'}
                            </button>
                        </div>
                    </Card>

                    <Card title='🖼️ תמונת כריכה'>
                        {!settings.coverImage ? (
                            <input
                                type='file'
                                accept='image/*'
                                onChange={e => {
                                    const file = e.target.files[0]
                                    if (file) {
                                        const url = URL.createObjectURL(file)
                                        onChange({ coverImage: url })
                                    }
                                }}
                                className='text-xs'
                            />
                        ) : (
                            <div className='relative'>
                                <img
                                    src={settings.coverImage}
                                    alt='Cover'
                                    className='w-full mt-2 rounded shadow border'
                                />
                                <button
                                    onClick={() => onChange({ coverImage: null })}
                                    className='absolute top-2 left-2 bg-white/90 border border-gray-300 rounded-full px-2 py-1 text-[10px] hover:bg-red-100'
                                >
                                    ❌ הסר תמונה
                                </button>
                            </div>
                        )}
                    </Card>

                    <Card title='📍 מיקום תמונה'>
                        <div className='flex gap-2 flex-wrap items-center'>
                            <label className='text-xs'>X (%)</label>
                            <input
                                type='number'
                                value={settings.coverImageX || 50}
                                onChange={e => onChange({ ...settings, coverImageX: parseFloat(e.target.value) })}
                                className='border rounded px-2 py-1 text-xs w-16 text-center'
                            />
                            <label className='text-xs'>Y (%)</label>
                            <input
                                type='number'
                                value={settings.coverImageY || 50}
                                onChange={e => onChange({ ...settings, coverImageY: parseFloat(e.target.value) })}
                                className='border rounded px-2 py-1 text-xs w-16 text-center'
                            />
                            <label className='text-xs ml-2'>Scale</label>
                            <input
                                type='range'
                                min='20'
                                max='200'
                                value={settings.coverImageScale || 100}
                                onChange={e => onChange({ ...settings, coverImageScale: parseFloat(e.target.value) })}
                                className='w-24'
                            />
                            <span className='text-[10px]'>{settings.coverImageScale || 100}%</span>
                        </div>
                    </Card>

                    <Card title='🎨 טקסטורה כריכה'>
                        <div className='flex flex-wrap gap-2'>
                            <button
                                onClick={() => onChange({ coverTexture: null })}
                                className={`px-2 py-1 rounded text-xs ${
                                    !settings.coverTexture ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                                }`}
                            >
                                כמו בספר
                            </button>
                            <button
                                onClick={() => onChange({ coverTexture: 'none' })}
                                className={`px-2 py-1 rounded text-xs ${
                                    settings.coverTexture === 'none' ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                                }`}
                            >
                                ללא
                            </button>
                            {TEXTURES.map(tex => (
                                <button
                                    key={tex.src}
                                    onClick={() => onChange({ coverTexture: tex.src })}
                                    className={`h-10 w-10 rounded border overflow-hidden ${
                                        settings.coverTexture === tex.src ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                >
                                    <img src={tex.src} className='w-full h-full object-cover' />
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card title='📐 מסגרת כריכה'>
                        <div className='flex flex-wrap gap-2'>
                            <button
                                onClick={() => onChange({ coverFrame: null })}
                                className={`px-2 py-1 rounded text-xs ${
                                    !settings.coverFrame ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                                }`}
                            >
                                כמו בספר
                            </button>
                            <button
                                onClick={() => onChange({ coverFrame: 'none' })}
                                className={`px-2 py-1 rounded text-xs ${
                                    settings.coverFrame === 'none' ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                                }`}
                            >
                                ללא
                            </button>
                            {FRAMES.map(f => (
                                <button
                                    key={f.src}
                                    onClick={() => onChange({ coverFrame: f.src })}
                                    className={`h-10 w-10 rounded border overflow-hidden ${
                                        settings.coverFrame === f.src ? 'ring-2 ring-pink-400' : ''
                                    }`}
                                >
                                    <img src={f.src} className='w-full h-full object-cover' />
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* 📏 גודל ספר */}
            <Card title='📏 גודל הספר'>
                <div className='flex gap-2'>
                    <button
                        onClick={() => onSizeChange(20)}
                        className={`px-3 py-1 rounded ${
                            pdfSize === 200 ? 'bg-purple-600 text-white' : 'bg-white border'
                        }`}
                    >
                        20×20
                    </button>
                    <button
                        onClick={() => onSizeChange(30)}
                        className={`px-3 py-1 rounded ${
                            pdfSize === 300 ? 'bg-purple-600 text-white' : 'bg-white border'
                        }`}
                    >
                        30×30
                    </button>
                    <button
                        onClick={() => onSizeChange(21)}
                        className={`px-3 py-1 rounded ${
                            pdfSize === 210 ? 'bg-purple-600 text-white' : 'bg-white border'
                        }`}
                    >
                        21x21
                    </button>
                </div>
            </Card>
        </div>
    )
}
