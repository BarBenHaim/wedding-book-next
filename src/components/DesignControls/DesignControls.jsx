'use client'

import { useState } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

/* --- מסגרות --- */
import frame1 from '../../media/frames/frame1.png'
import frame2 from '../../media/frames/frame2.png'
import frame3 from '../../media/frames/frame3.png'
import frame4 from '../../media/frames/frame4.png'
import frame5 from '../../media/frames/frame5.png'
import frame6 from '../../media/frames/frame6.png'

/* --- טקסטורות --- */
import tex1 from '../../media/textures/tex1.png'
import tex2 from '../../media/textures/tex2.png'
import tex3 from '../../media/textures/tex3.png'
import tex4 from '../../media/textures/tex4.png'
import tex5 from '../../media/textures/tex5.png'
import tex6 from '../../media/textures/tex6.png'
import tex7 from '../../media/textures/tex7.png'
import tex8 from '../../media/textures/tex8.png'
import tex9 from '../../media/textures/tex9.png'
import tex10 from '../../media/textures/tex10.png'
import tex11 from '../../media/textures/tex11.png'
import tex12 from '../../media/textures/tex12.png'
import tex13 from '../../media/textures/tex13.png'
import tex14 from '../../media/textures/tex14.png'
import tex15 from '../../media/textures/tex15.png'
import tex16 from '../../media/textures/tex16.png'
import tex17 from '../../media/textures/tex17.png'
import tex18 from '../../media/textures/tex18.png'

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

            fontSizePercent: 3.5,
            imageStyle: { width: 85, height: 70 },
            nameMarginTop: 4,
            textMaxWidth: 80,
        },
    },
    {
        name: 'שמנת אלגנטי',
        preview: '#fdf6ec',
        values: {
            backgroundColor: '#fdf6ec',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex3.src,
            frame: frame1.src,
            fontSizePercent: 3,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 8,
            nameMarginBottom: 0,
            textMaxWidth: 75,
        },
    },

    {
        name: 'ורוד עדין',
        preview: '#fde2e4',
        values: {
            backgroundColor: '#fde2e4',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex8.src,
            frame: null,
            fontSizePercent: 3.5,
            imageStyle: { width: 85, height: 65, borderRadius: '10px' },
            nameMarginTop: 6,
            textMaxWidth: 80,
        },
    },
    {
        name: 'ורוד ',
        preview: '#f8f1f1ff',
        values: {
            backgroundColor: '#f8f1f1ff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex18.src,
            frame: null,
            fontSizePercent: 3.5,
            imageStyle: { width: 85, height: 65, borderRadius: '10px' },
            nameMarginTop: 6,
            textMaxWidth: 80,
        },
    },
    {
        name: 'טבע ',
        preview: '#93d198ff',
        values: {
            backgroundColor: '#93d198ff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex16.src,
            frame: null,
            fontSizePercent: 3.5,
            imageStyle: { width: 85, height: 65, borderRadius: '10px' },
            nameMarginTop: 6,
            textMaxWidth: 80,
        },
    },
    {
        name: 'ציור',
        preview: '#c4b5ecff',
        values: {
            backgroundColor: '#c4b5ecff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex12.src,
            frame: null,
            fontSizePercent: 3,
            imageStyle: { width: 85, height: 70, borderRadius: '10px' },
            nameMarginTop: 6,
            textMaxWidth: 80,
        },
    },
    {
        name: 'מסגרת',
        preview: '#353535ff',
        values: {
            backgroundColor: '#ffffffff',
            fontClass: heebo.className,
            fontColor: '#000000',
            frame: frame4.src,
            texture: null,
            fontSizePercent: 3,
            imageStyle: { width: 75, height: 65, borderRadius: '10px' },
            nameMarginTop: 8,
            textMaxWidth: 75,
        },
    },
]

/* --- רקעים --- */
const BACKGROUNDS = ['#ffffff', '#fdf6ec', '#fde2e4', '#e8f0fe', '#f3f3f3', '#2c2c2c']

/* --- טקסטורות --- */
const TEXTURES = [
    null,
    tex1,
    tex2,
    tex3,
    tex4,
    tex5,
    tex6,
    tex7,
    tex8,
    tex9,
    tex10,
    tex11,
    tex12,
    tex13,
    tex14,
    tex15,
    tex16,
    tex17,
    tex18,
]

/* --- מסגרות --- */
const FRAMES = [null, frame1, frame2, frame3, frame4, frame5, frame6]

/* --- פונטים --- */
const FONTS = [
    { font: notoHebrew, label: 'Noto Hebrew' },
    { font: frankRuhl, label: 'Frank Ruhl' },
    { font: davidLibre, label: 'David Libre' },
    { font: heebo, label: 'Heebo' },
    { font: secular, label: 'Secular One' },
]

/* --- גדלים --- */
const FONT_SIZES = [
    { name: 'קטן', value: 2.5 },
    { name: 'בינוני', value: 2.8 },
    { name: 'גדול', value: 3 },
    { name: 'ענק', value: 4 },
]

/* --- צבעי טקסט --- */
const FONT_COLORS = ['#000000', '#d4af37', '#8b1e3f', '#2c2c2c', '#f8f4ec', '#ffffff']

export default function DesignControls({ settings, onChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    return (
        <div
            dir='rtl'
            className='flex flex-col gap-5 text-sm p-5 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-y-auto'
        >
            {/* פריסטים */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>🎨 פריסטים</h4>
                <div className='grid grid-cols-5 gap-2'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => applyPreset(preset)}
                            className={`h-14 rounded-lg border overflow-hidden ${
                                activePreset === preset.name ? 'ring-2 ring-pink-400' : ''
                            }`}
                            style={{ background: preset.preview }}
                            title={preset.name}
                        >
                            <span className='text-[10px] font-medium text-gray-700 bg-white/70 px-1 rounded absolute bottom-1 right-1'>
                                {preset.name}
                            </span>
                        </button>
                    ))}
                </div>
            </section>

            {/* רקעים */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>🖌️ רקע</h4>
                <div className='flex flex-wrap gap-2'>
                    {BACKGROUNDS.map(bg => (
                        <button
                            key={bg}
                            onClick={() => onChange({ ...settings, backgroundColor: bg })}
                            className={`h-7 w-7 rounded-full shadow ${
                                settings.backgroundColor === bg ? 'ring-2 ring-pink-400' : ''
                            }`}
                            style={{ backgroundColor: bg }}
                        />
                    ))}
                </div>
            </section>

            {/* טקסטורות */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>🖼️ טקסטורות</h4>
                <div className='grid grid-cols-5 gap-2'>
                    {TEXTURES.map((tex, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, texture: tex ? tex.src : null })}
                            className={`aspect-square rounded-md border overflow-hidden relative ${
                                settings.texture === (tex ? tex.src : null) ? 'ring-2 ring-pink-400' : ''
                            }`}
                        >
                            {tex ? (
                                <img src={tex.src} className='w-full h-full object-cover' />
                            ) : (
                                <span className='text-[10px] text-gray-400'>חלק</span>
                            )}
                        </button>
                    ))}
                </div>
            </section>

            {/* פונטים */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>🔤 פונט</h4>
                <div className='grid grid-cols-2 gap-2'>
                    {FONTS.map((f, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, fontClass: f.font.className })}
                            className={`flex flex-col items-center justify-center rounded-lg border p-2 ${
                                settings.fontClass === f.font.className ? 'bg-pink-50 ring-2 ring-pink-400' : ''
                            }`}
                        >
                            <span className={`${f.font.className} text-base`}>אב</span>
                            <span className='text-[10px] text-gray-600 mt-1'>{f.label}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* גודל טקסט */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>🔠 גודל טקסט</h4>
                <div className='flex gap-2 flex-wrap'>
                    {FONT_SIZES.map(size => (
                        <button
                            key={size.value}
                            onClick={() => onChange({ ...settings, fontSizePercent: size.value })}
                            className={`px-3 py-1 rounded-full text-xs ${
                                settings.fontSizePercent === size.value ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                            }`}
                        >
                            {size.name}
                        </button>
                    ))}
                </div>
            </section>

            {/* צבע טקסט */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>🎨 צבע טקסט</h4>
                <div className='flex flex-wrap gap-2'>
                    {FONT_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => onChange({ ...settings, fontColor: c })}
                            className={`h-7 w-7 rounded-full shadow ${
                                settings.fontColor === c ? 'ring-2 ring-pink-400' : ''
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </section>

            {/* מסגרות */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>📐 מסגרות</h4>
                <div className='grid grid-cols-4 gap-2'>
                    {FRAMES.map((f, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, frame: f ? f.src : null })}
                            className={`aspect-square rounded-md border overflow-hidden ${
                                settings.frame === (f ? f.src : null) ? 'ring-2 ring-pink-400' : ''
                            }`}
                        >
                            {f ? (
                                <img src={f.src} className='w-full h-full object-cover' />
                            ) : (
                                <span className='text-[10px] text-gray-400'>ללא</span>
                            )}
                        </button>
                    ))}
                </div>
            </section>

            {/* כריכה */}
            <section>
                <h4 className='mb-2 text-xs font-semibold text-gray-700'>📖 כריכה</h4>
                <div className='grid grid-cols-2 gap-2'>
                    <input
                        type='text'
                        placeholder='כותרת'
                        value={settings.coverTitle || ''}
                        onChange={e => onChange({ ...settings, coverTitle: e.target.value })}
                        className='border rounded px-2 py-1 text-xs'
                    />
                    <input
                        type='text'
                        placeholder='תת־כותרת'
                        value={settings.coverSubtitle || ''}
                        onChange={e => onChange({ ...settings, coverSubtitle: e.target.value })}
                        className='border rounded px-2 py-1 text-xs'
                    />
                </div>
            </section>
        </div>
    )
}
