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
        name: 'קלאסי',
        preview: '#fff',
        values: { backgroundColor: '#fff', fontClass: heebo.className, fontColor: '#000', frame: frame2.src },
    },
    { name: 'כמעט קלאסי', preview: '#eee', values: { backgroundColor: '#fff', texture: tex3.src, frame: frame1.src } },
    { name: 'אגדות', preview: '#e9d251', values: { backgroundColor: '#e9d251', texture: tex6.src } },
    { name: 'פרחוני', preview: '#ed95ff', values: { backgroundColor: '#ed95ff', texture: tex8.src } },
    { name: 'כהה', preview: '#262227', values: { backgroundColor: '#262227', fontColor: '#fff', texture: tex7.src } },
]

/* --- רקעים --- */
const BACKGROUNDS = ['#ffffff', '#fdfaf6', '#fde2e4', '#e0f2fe', '#f3f4f6', '#1f2937']

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
const FONTS = [notoHebrew, frankRuhl, davidLibre, heebo, secular]

/* --- גדלים --- */
const FONT_SIZES = [
    { name: 'קטן', value: 2.5 },
    { name: 'בינוני', value: 2.8 },
    { name: 'גדול', value: 3 },
    { name: 'ענק', value: 4 },
]

/* --- צבעי טקסט --- */
const FONT_COLORS = ['#000000', '#d4af37', '#8b1e3f', '#1f2937', '#f8f4ec', '#ffffff']

export default function DesignControls({ settings, onChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    return (
        <div
            dir='rtl'
            className='grid grid-cols-2 gap-4 text-sm p-4 bg-white rounded-xl shadow border border-gray-200 overflow-y-auto'
        >
            {/* פריסטים */}
            <section className='col-span-2'>
                <h4 className='mb-2 text-xs font-medium text-gray-600'>פריסטים</h4>
                <div className='grid grid-cols-5 gap-2'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => applyPreset(preset)}
                            className={`h-12 rounded-lg border ${
                                activePreset === preset.name ? 'ring-2 ring-pink-400' : ''
                            }`}
                            style={{ background: preset.preview }}
                            title={preset.name}
                        />
                    ))}
                </div>
            </section>

            {/* רקעים */}
            <section>
                <h4 className='mb-2 text-xs font-medium text-gray-600'>רקע</h4>
                <div className='flex flex-wrap gap-2'>
                    {BACKGROUNDS.map(bg => (
                        <button
                            key={bg}
                            onClick={() => onChange({ ...settings, backgroundColor: bg })}
                            className={`h-7 w-7 rounded-full ${
                                settings.backgroundColor === bg ? 'ring-2 ring-pink-400' : ''
                            }`}
                            style={{ backgroundColor: bg }}
                        />
                    ))}
                </div>
            </section>

            {/* טקסטורות */}
            <section>
                <h4 className='mb-2 text-xs font-medium text-gray-600'>טקסטורות</h4>
                <div className='grid grid-cols-4 gap-2'>
                    {TEXTURES.map((tex, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, texture: tex ? tex.src : null })}
                            className={`aspect-square rounded-md border overflow-hidden ${
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
                <h4 className='mb-2 text-xs font-medium text-gray-600'>פונט</h4>
                <div className='flex gap-2 flex-wrap'>
                    {FONTS.map((font, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, fontClass: font.className })}
                            className={`w-9 h-9 flex items-center justify-center rounded-md ${
                                settings.fontClass === font.className ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                            }`}
                        >
                            <span className={`${font.className} text-sm`}>אב</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* גודל טקסט */}
            <section>
                <h4 className='mb-2 text-xs font-medium text-gray-600'>גודל טקסט</h4>
                <div className='flex gap-2 flex-wrap'>
                    {FONT_SIZES.map(size => (
                        <button
                            key={size.value}
                            onClick={() => onChange({ ...settings, fontSizePercent: size.value })}
                            className={`px-2 py-1 rounded-full text-xs ${
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
                <h4 className='mb-2 text-xs font-medium text-gray-600'>צבע טקסט</h4>
                <div className='flex flex-wrap gap-2'>
                    {FONT_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => onChange({ ...settings, fontColor: c })}
                            className={`h-7 w-7 rounded-full ${settings.fontColor === c ? 'ring-2 ring-pink-400' : ''}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </section>

            {/* מסגרות */}
            <section>
                <h4 className='mb-2 text-xs font-medium text-gray-600'>מסגרות</h4>
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
            <section className='col-span-2'>
                <h4 className='mb-2 text-xs font-medium text-gray-600'>כריכה</h4>
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
