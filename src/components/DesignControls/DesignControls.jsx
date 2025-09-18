'use client'

import { useState } from 'react'
// מייבא פונטים עבריים מהקובץ fonts.js
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

// ברירות מחדל
const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontClass: notoHebrew.className, // עברית כברירת מחדל
    fontSize: 3,
    fontColor: '#000000',
    borderColor: '#d8bfa4',
    borderWidth: 0.5,
    borderRadius: 0,
    pagePadding: 3,
    textureUrl: '',
    imageStyle: {
        width: 80,
        height: 60,
        marginTop: 5,
        borderRadius: '0%',
        borderWidth: '0px',
        borderStyle: 'solid',
        boxShadow: 'none',
        objectFit: 'cover',
    },
}

// פריסטים מעוצבים לעברית
export const PRESETS = [
    {
        name: 'קלאסי זהב',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fffdf8',
            fontClass: frankRuhl.className,
            fontColor: '#4b3b18',
            borderColor: '#d4af37',
            borderWidth: 1.2,
            pagePadding: 6,
            textureUrl: 'https://www.transparenttextures.com/patterns/gold-scale.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '3px',
                borderStyle: 'solid',
                borderColor: '#d4af37',
                boxShadow: '0 4px 18px rgba(212,175,55,0.35)',
            },
        },
    },
    {
        name: 'ורוד יוקרה',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fff6f9',
            fontClass: davidLibre.className,
            fontColor: '#b03060',
            borderColor: '#f3c0d1',
            borderWidth: 1.5,
            pagePadding: 7,
            textureUrl: 'https://www.transparenttextures.com/patterns/white-paper.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'dashed',
                borderColor: '#f3c0d1',
                boxShadow: '0 4px 12px rgba(176,48,96,0.25)',
            },
        },
    },
    {
        name: 'מודרני נקי',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fafafa',
            fontClass: heebo.className,
            fontColor: '#222222',
            borderColor: '#cccccc',
            borderWidth: 1,
            pagePadding: 5,
            textureUrl: 'https://www.transparenttextures.com/patterns/linen.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: '#333',
                boxShadow: '0 8px 18px rgba(0,0,0,0.15)',
            },
        },
    },
    {
        name: 'כפרי טבעי',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fdfcf7',
            fontClass: notoHebrew.className,
            fontColor: '#3f5035',
            borderColor: '#c9d7b5',
            borderWidth: 1.2,
            pagePadding: 8,
            textureUrl: 'https://www.transparenttextures.com/patterns/wood-pattern.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: '#c9d7b5',
                boxShadow: '0 5px 15px rgba(63,80,53,0.3)',
            },
        },
    },
    {
        name: 'אלגנטי כהה',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontClass: secular.className,
            fontColor: '#f0e6d2',
            borderColor: '#a67c52',
            borderWidth: 1.5,
            pagePadding: 5,
            textureUrl: 'https://www.transparenttextures.com/patterns/asfalt-light.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'double',
                borderColor: '#a67c52',
                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            },
        },
    },
]

export default function DesignControls({ settings, onChange }) {
    const resetToDefault = () => onChange({ ...BASE_DEFAULTS })
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    return (
        <div dir='rtl' className='space-y-8 md:max-h-[90vh] md:overflow-y-auto pr-1 font-sans'>
            {/* פריסטים */}
            <section className='rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm'>
                <h4 className='mb-4 text-sm font-bold text-gray-700'>בחרו סגנון מוכן</h4>
                <div className='grid grid-cols-2 gap-4'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => applyPreset(preset)}
                            className={`flex flex-col items-center justify-center h-32 rounded-lg border transition shadow-sm hover:scale-105 ${
                                activePreset === preset.name ? 'border-pink-500 shadow-md' : 'border-gray-300'
                            } ${preset.values.fontClass}`}
                            style={{
                                background: preset.values.backgroundColor,
                                color: preset.values.fontColor,
                            }}
                        >
                            <span className='text-xs mb-2'>{preset.name}</span>
                            {/* preview עם טקסט בעברית */}
                            <span className='text-sm'>ספר החתונה</span>
                            <div
                                className='w-12 h-8 rounded-sm'
                                style={{
                                    border: `${preset.values.borderWidth}px ${preset.values.borderStyle || 'solid'} ${
                                        preset.values.borderColor
                                    }`,
                                    backgroundImage: `url(${preset.values.textureUrl})`,
                                    backgroundColor: preset.values.backgroundColor,
                                    backgroundSize: 'cover',
                                }}
                            ></div>
                        </button>
                    ))}
                </div>
            </section>

            {/* שליטה ידנית */}
            <section className='rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm space-y-4'>
                <h4 className='text-sm font-bold text-gray-700'>התאמות ידניות</h4>

                <div>
                    <label className='block text-xs font-medium mb-1'>צבע רקע</label>
                    <input
                        type='color'
                        value={settings.backgroundColor}
                        onChange={e => onChange({ backgroundColor: e.target.value })}
                        className='w-12 h-8 rounded'
                    />
                </div>

                <div>
                    <label className='block text-xs font-medium mb-1'>צבע טקסט</label>
                    <input
                        type='color'
                        value={settings.fontColor}
                        onChange={e => onChange({ fontColor: e.target.value })}
                        className='w-12 h-8 rounded'
                    />
                </div>

                <div>
                    <label className='block text-xs font-medium mb-1'>עובי מסגרת (% מהרוחב)</label>
                    <input
                        type='range'
                        min='0'
                        max='5'
                        value={settings.borderWidth}
                        onChange={e => onChange({ borderWidth: parseInt(e.target.value) })}
                        className='w-full'
                    />
                </div>
            </section>

            <button
                onClick={resetToDefault}
                className='w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-medium hover:bg-gray-200 transition'
            >
                איפוס לברירת מחדל
            </button>
        </div>
    )
}
