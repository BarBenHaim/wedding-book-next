'use client'

import { useState } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

import frame1 from '../../media/frames/frame1.png'
import frame2 from '../../media/frames/frame2.png'
import frame3 from '../../media/frames/frame3.png'
import frame4 from '../../media/frames/frame4.png'
import frame5 from '../../media/frames/frame5.png'
import frame6 from '../../media/frames/frame6.png'
import frame7 from '../../media/frames/frame7.png'
import frame8 from '../../media/frames/frame8.png'
import frame9 from '../../media/frames/frame9.png'
import frame10 from '../../media/frames/frame10.png'
import frame11 from '../../media/frames/frame11.png'
import frame12 from '../../media/frames/frame12.png'

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

const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontClass: notoHebrew.className,
    fontColor: '#000000',
    texture: null, // טקסטורה כרקע
    frame: null, // מסגרת נפרדת
    fontSizePercent: 3,
    imageStyle: { width: 70, height: 70 },
}

/* פריסטים */
const PRESETS = [
    {
        name: 'רומנטי עדין',
        previewColor: '#fff6f9',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fff6f9',
            fontClass: heebo.className,
            fontColor: '#8b1e3f',
            texture: tex4.src,
            frame: null,
            fontSizePercent: 4,
            imageStyle: { width: 80, height: 65 },
        },
    },
    {
        name: 'קלאסי זהב',
        previewColor: '#fdfaf6',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fdfaf6',
            fontClass: secular.className,
            fontColor: '#b68c2d',
            texture: null,
            frame: tex3.src,
            fontSizePercent: 4,
            imageStyle: { width: 80, height: 65 },
        },
    },
    {
        name: 'כהה אלגנטי',
        previewColor: '#1e1e1e',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontClass: frankRuhl.className,
            fontColor: '#f0e6d2',
            texture: tex2.src,
            frame: frame1.src,
        },
    },
    {
        name: 'המיוחד של ברקודה',
        previewColor: '#46dbf5ff',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontClass: notoHebrew.className,
            fontColor: '#000000ff',
            texture: tex4.src,
            imageStyle: { width: 85, height: 65, borderRadius: 40 },
        },
    },
    {
        name: 'מינימליסטי',
        previewColor: '#ffffffff',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontClass: notoHebrew.className,
            fontColor: '#000000ff',
            texture: tex4.src,
            frame: frame4.src,
            imageStyle: { width: 85, height: 65, borderRadius: 20 },
        },
    },
]

/* רקעים */
const BACKGROUNDS = [
    { name: 'לבן', value: '#ffffff' },
    { name: 'קרם', value: '#fdfaf6' },
    { name: 'ורוד פסטל', value: '#fde2e4' },
    { name: 'תכלת עדין', value: '#e0f2fe' },
    { name: 'אפור בהיר', value: '#f3f4f6' },
    { name: 'שחור אלגנטי', value: '#1f2937' },
]

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
    // tex10,
    tex11,
]

const TEXTURES = [
    { name: 'חלק', url: null },
    ...texturesImports.map((t, i) => ({
        name: `טקסטורה ${i + 1}`,
        url: t,
    })),
]

// נשים את כל ה־imports במערך
const framesImports = [
    frame1,
    frame2,
    frame3,
    frame4,
    frame5,
    frame6,
    frame7,
    // frame8,
    // frame9,
    frame10,
    frame11,
    frame12,
]

// נבנה את ה־array של המסגרות
const FRAMES = [
    { name: 'ללא', url: null },
    ...framesImports.map((f, i) => ({
        name: `מסגרת ${i + 1}`,
        url: f,
    })),
]

/* צבעי טקסט */
const FONT_COLORS = [
    { name: 'שחור', value: '#000000' },
    { name: 'זהב', value: '#b68c2d' },
    { name: 'בורדו', value: '#8b1e3f' },
    { name: 'כהה אלגנטי', value: '#1f2937' },
    { name: 'שמנת', value: '#f8f4ec' },
    { name: 'לבן', value: '#ffffff' },
]

/* פונטים */
const FONTS = [notoHebrew, frankRuhl, davidLibre, heebo, secular]

/* גדלי טקסט */
const FONT_SIZES = [
    { name: 'קטן', value: 2.5 },
    { name: 'בינוני', value: 2.8 },
    { name: 'גדול', value: 3 },
    { name: 'ענק', value: 4 },
]

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

            {/* טקסטורות כרקע */}
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

            {/* מסגרות */}
            <section>
                <h4 className='mb-3 text-xs font-semibold text-gray-600'>מסגרת</h4>
                <div className='grid grid-cols-2 gap-3'>
                    {FRAMES.map(frame => (
                        <button
                            key={frame.name}
                            onClick={() => applyFrame(frame.url ? frame.url.src : null)}
                            className={`rounded-md border transition-all duration-200 ${
                                settings.frame === (frame.url ? frame.url.src : null)
                                    ? 'ring-2 ring-pink-400 shadow'
                                    : 'ring-1 ring-gray-200 hover:ring-gray-400'
                            }`}
                        >
                            {frame.url ? (
                                <img src={frame.url.src} alt={frame.name} className='w-full h-16 object-cover' />
                            ) : (
                                <div className='w-full h-16 flex items-center justify-center text-gray-500 text-xs'>
                                    ללא
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
        </div>
    )
}
