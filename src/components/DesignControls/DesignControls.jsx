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

/* --- ברירות מחדל --- */
const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontClass: notoHebrew.className,
    fontColor: '#000000',
    texture: null,
    frame: null,
    frameColor: '#000000',
    fontSizePercent: 3,
    imageStyle: { width: 85, height: 70 },
}

/* --- פריסטים --- */
const PRESETS = [
    {
        name: 'קלאסי',
        previewColor: '#ffffffff',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#ffffffff',
            fontClass: heebo.className,
            fontColor: '#000000ff',
            frame: frame2.src,
            fontSizePercent: 3.5,
            imageStyle: { width: 85, height: 70 },
            nameMarginTop: 1,
            textMaxWidth: 80,
        },
    },
    {
        name: 'כמעט קלאסי',
        previewColor: '#1e1e1e',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#ffffffff',
            fontClass: heebo.className,
            fontColor: '#000000ff',
            frame: frame1.src,
            texture: tex3.src,
            fontSizePercent: 3,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 4,
            textMaxWidth: 75,
        },
    },
    {
        name: 'חתונה מהאגדות',
        previewColor: '#e9d251ff',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#e9d251ff',
            fontClass: heebo.className,
            fontColor: '#000000ff',
            texture: tex6.src,
            fontSizePercent: 3,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 4,
            textMaxWidth: 75,
        },
    },
    {
        name: 'פרחוני',
        previewColor: '#ed95ffff',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#ed95ffff',
            fontClass: heebo.className,
            fontColor: '#000000ff',
            texture: tex8.src,
            fontSizePercent: 3.5,
            imageStyle: { width: 85, height: 65, borderRadius: '10px' },
            nameMarginTop: 3,
            textMaxWidth: 80,
        },
    },
    {
        name: 'תביא',
        previewColor: '#262227ff',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#262227ff',
            fontClass: heebo.className,
            fontColor: '#000000ff',
            texture: tex7.src,
            fontSizePercent: 3.5,
            imageStyle: { width: 70, height: 65, borderRadius: '10px' },
            nameMarginTop: 5,
            textMaxWidth: 80,
        },
    },
]

/* --- רקעים --- */
const BACKGROUNDS = [
    { name: 'לבן', value: '#ffffff' },
    { name: 'קרם', value: '#fdfaf6' },
    { name: 'ורוד פסטל', value: '#fde2e4' },
    { name: 'תכלת עדין', value: '#e0f2fe' },
    { name: 'אפור בהיר', value: '#f3f4f6' },
    { name: 'שחור אלגנטי', value: '#1f2937' },
]

/* --- טקסטורות --- */
const texturesImports = [
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

const TEXTURES = [
    { name: 'חלק', url: null },
    ...texturesImports.map((t, i) => ({
        name: `טקסטורה ${i + 1}`,
        url: t,
    })),
]

/* --- מסגרות --- */
const framesImports = [frame1, frame2, frame3, frame4, frame5, frame6]

const FRAMES = [
    { name: 'ללא מסגרת', url: null },
    ...framesImports.map((f, i) => ({
        name: `מסגרת ${i + 1}`,
        url: f,
    })),
]

/* --- צבעי טקסט --- */
const FONT_COLORS = [
    { name: 'שחור', value: '#000000' },
    { name: 'זהב', value: '#d4af37' },
    { name: 'בורדו', value: '#8b1e3f' },
    { name: 'כהה אלגנטי', value: '#1f2937' },
    { name: 'שמנת', value: '#f8f4ec' },
    { name: 'לבן', value: '#ffffff' },
]

/* --- פונטים --- */
const FONTS = [notoHebrew, frankRuhl, davidLibre, heebo, secular]

/* --- גדלי טקסט --- */
const FONT_SIZES = [
    { name: 'קטן', value: 2.5 },
    { name: 'בינוני', value: 2.8 },
    { name: 'גדול', value: 3 },
    { name: 'ענק', value: 4 },
]

/* --- קומפוננטת השליטה --- */
export default function DesignControls({ settings, onChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    const applyBackground = bg => {
        onChange({ ...settings, backgroundColor: bg })
    }

    const applyTexture = texUrl => {
        onChange({ ...settings, texture: texUrl })
    }

    const applyFrame = frameUrl => {
        onChange({ ...settings, frame: frameUrl })
    }

    return (
        <div
            dir='rtl'
            className='flex flex-col gap-8 font-sans text-sm h-full overflow-y-auto p-6 bg-white rounded-2xl shadow border border-gray-200'
        >
            {/* פריסטים */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>פריסטים</h4>
                <div className='grid grid-cols-2 gap-3'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => applyPreset(preset)}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 ${
                                activePreset === preset.name
                                    ? 'ring-2 ring-pink-400 shadow'
                                    : 'border-gray-200 hover:border-gray-400'
                            }`}
                        >
                            <div
                                className='w-full h-12 rounded-md shadow-inner mb-2'
                                style={{ backgroundColor: preset.previewColor }}
                            />
                            <span className='text-xs text-gray-700'>{preset.name}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* רקעים */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>רקע</h4>
                <div className='grid grid-cols-6 gap-2'>
                    {BACKGROUNDS.map(bg => (
                        <button
                            key={bg.value}
                            onClick={() => applyBackground(bg.value)}
                            className={`h-8 w-8 rounded-md transition ${
                                settings.backgroundColor === bg.value
                                    ? 'ring-2 ring-pink-400 shadow'
                                    : 'ring-1 ring-gray-200 hover:ring-gray-400'
                            }`}
                            style={{ backgroundColor: bg.value }}
                            title={bg.name}
                        />
                    ))}
                </div>
            </section>

            {/* טקסטורות */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>טקסטורות</h4>
                <div className='grid grid-cols-2 gap-3'>
                    {TEXTURES.map(tex => (
                        <button
                            key={tex.name}
                            onClick={() => applyTexture(tex.url ? tex.url.src : null)}
                            className={`rounded-md border transition-all duration-200 ${
                                settings.texture === (tex.url ? tex.url.src : null)
                                    ? 'ring-2 ring-pink-400 shadow'
                                    : 'ring-1 ring-gray-200 hover:ring-gray-400'
                            }`}
                        >
                            {tex.url ? (
                                <img src={tex.url.src} alt={tex.name} className='w-full h-16 object-cover' />
                            ) : (
                                <div className='w-full h-16 flex items-center justify-center text-gray-500 text-xs'>
                                    חלק
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </section>

            {/* פונטים */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>פונט</h4>
                <div className='flex gap-2 flex-wrap'>
                    {FONTS.map((font, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, fontClass: font.className })}
                            className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-200 ${
                                settings.fontClass === font.className
                                    ? 'bg-pink-100 ring-2 ring-pink-400'
                                    : 'bg-white ring-1 ring-gray-200 hover:shadow'
                            }`}
                        >
                            <span className={`${font.className} text-base`}>אב</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* גודל טקסט */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>גודל טקסט</h4>
                <div className='flex gap-2'>
                    {FONT_SIZES.map(size => (
                        <button
                            key={size.value}
                            onClick={() => onChange({ ...settings, fontSizePercent: size.value })}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                                settings.fontSizePercent === size.value
                                    ? 'bg-pink-100 text-pink-700 ring-2 ring-pink-400'
                                    : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'
                            }`}
                        >
                            {size.name}
                        </button>
                    ))}
                </div>
            </section>

            {/* צבעי טקסט */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>צבע טקסט</h4>
                <div className='grid grid-cols-6 gap-2'>
                    {FONT_COLORS.map(c => (
                        <button
                            key={c.value}
                            onClick={() => onChange({ ...settings, fontColor: c.value })}
                            className={`h-8 w-8 rounded-full transition ${
                                settings.fontColor === c.value
                                    ? 'ring-2 ring-pink-400 shadow'
                                    : 'ring-1 ring-gray-200 hover:ring-gray-400'
                            }`}
                            style={{ backgroundColor: c.value }}
                            title={c.name}
                        />
                    ))}
                </div>
            </section>

            {/* מסגרות */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>מסגרות</h4>
                <div className='grid grid-cols-3 gap-2'>
                    {FRAMES.map(f => (
                        <button
                            key={f.name}
                            onClick={() => applyFrame(f.url ? f.url.src : null)}
                            className={`rounded-md border transition-all duration-200 ${
                                settings.frame === (f.url ? f.url.src : null)
                                    ? 'ring-2 ring-pink-400 shadow'
                                    : 'ring-1 ring-gray-200 hover:ring-gray-400'
                            }`}
                        >
                            {f.url ? (
                                <img src={f.url.src} alt={f.name} className='w-full h-16 object-cover' />
                            ) : (
                                <div className='w-full h-16 flex items-center justify-center text-gray-500 text-xs'>
                                    ללא
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </section>
        </div>
    )
}
