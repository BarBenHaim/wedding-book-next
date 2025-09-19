'use client'

import { useState } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

/* ברירות מחדל */
const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontClass: notoHebrew.className,
    fontWeight: '400',
    fontColor: '#000000',
    pageBorder: 'none',
    borderRadius: 'none',
    imageStyle: { frame: 'none', width: 90, height: 70 },
}

/* צבעים */
const COLOR_OPTIONS = {
    backgrounds: ['#ffffff', '#fffdf8', '#fff6f9', '#1e1e1e'],
    texts: ['#000000', '#4b3b18', '#b03060', '#f0e6d2'],
}

/* מסגרות תמונה */
const IMAGE_FRAMES = {
    none: { style: {} },
    gold: { style: { border: '3px solid #d4af37', boxShadow: '0 2px 8px rgba(212,175,55,0.3)' } },
    vintage: { style: { border: '4px double #7a5230', boxShadow: 'inset 0 0 6px rgba(0,0,0,0.4)' } },
    modern: { style: { border: 'none', boxShadow: '0 3px 8px rgba(0,0,0,0.25)' } },
}

/* מסגרות עמוד */
const PAGE_BORDERS = {
    none: { style: {} },
    gold: { style: { border: '4px solid #d4af37' } },
    classic: { style: { border: '2px solid #000000' } },
    modern: { style: { border: '2px dashed #888888' } },
}

/* פריסטים */
const PRESETS = [
    {
        name: 'קלאסי זהב',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fffdf8',
            fontClass: frankRuhl.className,
            fontColor: '#4b3b18',
            imageStyle: { frame: 'gold', width: 90, height: 80 },
            pageBorder: 'gold',
        },
    },
    {
        name: 'ורוד יוקרה',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fff6f9',
            fontClass: davidLibre.className,
            fontColor: '#b03060',
            imageStyle: { frame: 'vintage', width: 90, height: 80 },
            pageBorder: 'classic',
        },
    },
    {
        name: 'מודרני נקי',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fafafa',
            fontClass: heebo.className,
            fontColor: '#222',
            imageStyle: { frame: 'modern', width: 90, height: 80 },
            pageBorder: 'modern',
        },
    },
    {
        name: 'אלגנטי כהה',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontClass: secular.className,
            fontColor: '#f0e6d2',
            imageStyle: { frame: 'modern', width: 90, height: 80 },
            pageBorder: 'none',
        },
    },
]

export default function DesignControls({ settings, onChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    const resetToDefault = () => {
        setActivePreset(null)
        onChange(BASE_DEFAULTS)
    }

    return (
        <div dir='rtl' className='space-y-4 pr-1 font-sans text-sm'>
            {/* פריסטים */}
            <section className=' border-gray-200 bg-white/95  shadow-sm'>
                <h4 className=' font-semibold text-gray-800 text-sm'>🎨 סגנון מוכן</h4>
                <div className='grid grid-cols-2 gap-2'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => applyPreset(preset)}
                            className={`flex flex-col items-center justify-center h-20 rounded-md border transition hover:scale-[1.02] ${
                                activePreset === preset.name ? 'border-pink-500 shadow' : 'border-gray-300'
                            } ${preset.values.fontClass}`}
                            style={{ background: preset.values.backgroundColor, color: preset.values.fontColor }}
                        >
                            <span className='text-[10px]'>{preset.name}</span>
                            <span className='text-sm'>ספר החתונה</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* בחירת פונט */}
            <section className='rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm'>
                <h4 className='mb-2 font-semibold text-gray-800 text-sm'>📝 פונט</h4>
                <div className='grid grid-cols-2 gap-2'>
                    {[notoHebrew, frankRuhl, davidLibre, heebo, secular].map((font, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ fontClass: font.className })}
                            className={`p-2 border rounded-md bg-gray-50 hover:scale-[1.02] ${
                                settings.fontClass === font.className ? 'border-pink-500 bg-pink-50' : 'border-gray-300'
                            }`}
                        >
                            <span className={`${font.className} block text-sm`}>ספר החתונה</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* צבע טקסט */}
            <section className='rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm'>
                <h4 className='mb-2 font-semibold text-gray-800 text-sm'>🎨 צבע טקסט</h4>
                <div className='flex gap-2 flex-wrap'>
                    {COLOR_OPTIONS.texts.map(c => (
                        <button
                            key={c}
                            onClick={() => onChange({ fontColor: c })}
                            className={`w-8 h-8 rounded-full transition hover:scale-105 ${
                                settings.fontColor === c ? 'ring-2 ring-pink-500' : 'ring-1 ring-gray-300'
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </section>

            {/* צבע רקע */}
            <section className='rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm'>
                <h4 className='mb-2 font-semibold text-gray-800 text-sm'>🖼️ צבע רקע</h4>
                <div className='flex gap-2 flex-wrap'>
                    {COLOR_OPTIONS.backgrounds.map(c => (
                        <button
                            key={c}
                            onClick={() => onChange({ backgroundColor: c })}
                            className={`w-8 h-8 rounded-md transition hover:scale-105 ${
                                settings.backgroundColor === c ? 'ring-2 ring-pink-500' : 'ring-1 ring-gray-300'
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </section>

            {/* מסגרת עמוד */}
            <section className='rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm'>
                <h4 className='mb-2 font-semibold text-gray-800 text-sm'>📖 מסגרת עמוד</h4>
                <div className='flex gap-2 flex-wrap'>
                    {Object.entries(PAGE_BORDERS).map(([key, val]) => (
                        <button
                            key={key}
                            onClick={() => onChange({ pageBorder: key })}
                            className={`w-16 h-10 flex items-center justify-center rounded-md text-[10px] transition hover:scale-[1.02] ${
                                settings.pageBorder === key
                                    ? 'border-2 border-pink-500 bg-pink-50'
                                    : 'border border-gray-300'
                            }`}
                            style={val.style}
                        >
                            {key !== 'none' ? '' : 'ללא'}
                        </button>
                    ))}
                </div>
            </section>

            {/* מסגרת תמונה */}
            <section className='rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm'>
                <h4 className='mb-2 font-semibold text-gray-800 text-sm'>🖼️ מסגרת תמונה</h4>
                <div className='grid grid-cols-2 gap-2'>
                    {Object.entries(IMAGE_FRAMES).map(([key, val]) => (
                        <button
                            key={key}
                            onClick={() => onChange({ imageStyle: { ...settings.imageStyle, frame: key } })}
                            className={`p-2 rounded-md bg-gray-50 flex items-center justify-center hover:scale-[1.02] ${
                                settings.imageStyle.frame === key
                                    ? 'border-2 border-pink-500 bg-pink-50'
                                    : 'border border-gray-300'
                            }`}
                        >
                            <div className='w-14 h-10 bg-white' style={val.style} />
                        </button>
                    ))}
                </div>
            </section>

            {/* איפוס */}
            <button
                onClick={resetToDefault}
                className='w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-xs font-medium hover:bg-gray-200 transition'
            >
                איפוס לברירת מחדל
            </button>
        </div>
    )
}
