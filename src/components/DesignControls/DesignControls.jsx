'use client'

import { useState } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

/* --- מסגרות --- */
import frame1 from '../../media/frames/frame1.png'
import frame2 from '../../media/frames/frame2.png'
import frame3 from '../../media/frames/frame3.png'

/* --- טקסטורות --- */
import tex1 from '../../media/textures/tex1.png'
import tex2 from '../../media/textures/tex2.png'
import tex3 from '../../media/textures/tex3.png'
import tex5 from '../../media/textures/tex5.png'
import tex6 from '../../media/textures/tex6.png'

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
            fontSizePercent: 2.8,
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
            texture: tex1.src,
            frame: frame1.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 8,
            textMaxWidth: 70,
        },
    },
    {
        name: 'ציור',
        preview: '#c4b5ecff',
        values: {
            backgroundColor: '#c4b5ecff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex5.src,
            frame: null,
            fontSizePercent: 3,
            imageStyle: { width: 85, height: 70, borderRadius: '10px' },
            nameMarginTop: 2,
            textMaxWidth: 70,
        },
    },
]

/* --- רקעים --- */
const BACKGROUNDS = ['#ffffff', '#fdf6ec', '#fde2e4', '#e8f0fe', '#f3f3f3', '#2c2c2c']

/* --- טקסטורות --- */
const TEXTURES = [null, tex1, tex2, tex3, tex5, tex6]

/* --- מסגרות --- */
const FRAMES = [null, frame1, frame2, frame3]

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
]

/* --- צבעי טקסט --- */
const FONT_COLORS = ['#000000', '#d4af37', '#8b1e3f', '#2c2c2c', '#f8f4ec', '#ffffff']

export default function DesignControls({ settings, onChange }) {
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
            {/* פריסטים */}
            <Card title='🎨 פריסטים'>
                <div className='grid grid-cols-3 gap-2'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
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

            {/* רקעים */}
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

            {/* טקסטורות */}
            <Card title='🖼️ טקסטורות'>
                <div className='grid grid-cols-6 gap-2'>
                    {TEXTURES.map((tex, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, texture: tex ? tex.src : null })}
                            className={`aspect-square rounded border overflow-hidden ${
                                settings.texture === (tex ? tex.src : null) ? 'ring-2 ring-pink-400' : ''
                            }`}
                        >
                            {tex ? (
                                <img src={tex.src} className='w-full h-full object-cover' />
                            ) : (
                                <span className='text-[9px] text-gray-400'>חלק</span>
                            )}
                        </button>
                    ))}
                </div>
            </Card>

            {/* פונטים */}
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

            {/* גודל טקסט */}
            <Card title='🔠 גודל טקסט'>
                <div className='flex gap-2 flex-wrap'>
                    {FONT_SIZES.map(size => (
                        <button
                            key={size.value}
                            onClick={() => onChange({ ...settings, fontSizePercent: size.value })}
                            className={`px-2 py-0.5 rounded-full text-xs ${
                                settings.fontSizePercent === size.value ? 'bg-pink-100 ring-2 ring-pink-400' : 'border'
                            }`}
                        >
                            {size.name}
                        </button>
                    ))}
                </div>
            </Card>

            {/* צבע טקסט */}
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

            {/* מסגרות */}
            <Card title='📐 מסגרות'>
                <div className='grid grid-cols-5 gap-2'>
                    {FRAMES.map((f, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ ...settings, frame: f ? f.src : null })}
                            className={`aspect-square rounded border overflow-hidden ${
                                settings.frame === (f ? f.src : null) ? 'ring-2 ring-pink-400' : ''
                            }`}
                        >
                            {f ? (
                                <img src={f.src} className='w-full h-full object-cover' />
                            ) : (
                                <span className='text-[9px] text-gray-400'>ללא</span>
                            )}
                        </button>
                    ))}
                </div>
            </Card>

            {/* כריכה */}
            <Card title='📖 כריכה'>
                <div className='grid grid-cols-2 gap-2'>
                    <input
                        type='text'
                        placeholder='כותרת'
                        value={settings.coverTitle || ''}
                        onChange={e => onChange({ ...settings, coverTitle: e.target.value })}
                        className='border rounded px-2 py-1 text-xs shadow-sm w-full'
                    />
                    <input
                        type='text'
                        placeholder='תת־כותרת'
                        value={settings.coverSubtitle || ''}
                        onChange={e => onChange({ ...settings, coverSubtitle: e.target.value })}
                        className='border rounded px-2 py-1 text-xs shadow-sm w-full'
                    />
                </div>
            </Card>
        </div>
    )
}
