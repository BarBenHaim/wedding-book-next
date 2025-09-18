'use client'

import { useState } from 'react'

// ברירות מחדל
const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontFamily: `'Noto Serif Hebrew', 'David Libre', serif`,
    fontSize: 3,
    fontColor: '#000000',
    borderColor: '#d8bfa4',
    borderWidth: 0.5,
    borderRadius: 0, // תמיד 0
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
    },
}

// פריסטים מעוצבים
export const PRESETS = [
    {
        name: 'קלאסי זהב',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fffdf5',
            fontFamily: `'Cinzel Decorative', serif`,
            fontColor: '#3a2f2f',
            borderColor: '#d4af37',
            borderWidth: 1.2,
            pagePadding: 5,
            textureUrl: 'https://www.transparenttextures.com/patterns/gold-scale.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: '#d4af37',
                boxShadow: '0 4px 18px rgba(212,175,55,0.25)',
            },
        },
    },
    {
        name: 'רומנטי תחרה',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fff8fb',
            fontFamily: `'Great Vibes', cursive`,
            fontColor: '#9b4677',
            borderColor: '#e5bcd3',
            borderWidth: 1,
            pagePadding: 6,
            textureUrl: 'https://www.transparenttextures.com/patterns/lace.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'dashed',
                borderColor: '#e5bcd3',
                boxShadow: '0 3px 10px rgba(155,70,119,0.2)',
            },
        },
    },
    {
        name: 'מודרני אלגנטי',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#ffffff',
            fontFamily: `'Montserrat', sans-serif`,
            fontColor: '#111111',
            borderColor: '#000000',
            borderWidth: 0.8,
            pagePadding: 4,
            textureUrl: 'https://www.transparenttextures.com/patterns/paper-fibers.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#000',
                boxShadow: '0 6px 14px rgba(0,0,0,0.15)',
            },
        },
    },
    {
        name: 'כפרי טבעי',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#f9fdf9',
            fontFamily: `'Cormorant Garamond', serif`,
            fontColor: '#3b5231',
            borderColor: '#bcd3a3',
            borderWidth: 1,
            pagePadding: 7,
            textureUrl: 'https://www.transparenttextures.com/patterns/wood-pattern.png',
            imageStyle: {
                ...BASE_DEFAULTS.imageStyle,
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: '#bcd3a3',
                boxShadow: '0 5px 15px rgba(59,82,49,0.3)',
            },
        },
    },
    {
        name: 'אלגנטי כהה',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontFamily: `'Playfair Display SC', serif`,
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
                            className={`flex flex-col items-center justify-center h-28 rounded-lg border transition shadow-sm hover:scale-105 ${
                                activePreset === preset.name ? 'border-pink-500 shadow-md' : 'border-gray-300'
                            }`}
                            style={{
                                background: preset.values.backgroundColor,
                                fontFamily: preset.values.fontFamily,
                                color: preset.values.fontColor,
                            }}
                        >
                            <span className='text-xs mb-2'>{preset.name}</span>
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
                    <label className='block text-xs font-medium mb-1'>גודל טקסט (% מהגובה)</label>
                    <input
                        type='range'
                        min='1'
                        max='10'
                        value={settings.fontSize}
                        onChange={e => onChange({ fontSize: parseInt(e.target.value) })}
                        className='w-full'
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

                <div>
                    <label className='block text-xs font-medium mb-1'>Padding (% מהגובה)</label>
                    <input
                        type='range'
                        min='0'
                        max='10'
                        value={settings.pagePadding}
                        onChange={e => onChange({ pagePadding: parseInt(e.target.value) })}
                        className='w-full'
                    />
                </div>
            </section>

            {/* שליטה בתמונה */}
            <section className='rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm space-y-4'>
                <h4 className='text-sm font-bold text-gray-700'>תמונה</h4>

                <div>
                    <label className='block text-xs font-medium mb-1'>רוחב (% מהרוחב)</label>
                    <input
                        type='range'
                        min='10'
                        max='100'
                        value={settings.imageStyle.width}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    width: parseInt(e.target.value),
                                },
                            })
                        }
                        className='w-full'
                    />
                </div>

                <div>
                    <label className='block text-xs font-medium mb-1'>גובה (% מהגובה)</label>
                    <input
                        type='range'
                        min='10'
                        max='100'
                        value={settings.imageStyle.height}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    height: parseInt(e.target.value),
                                },
                            })
                        }
                        className='w-full'
                    />
                </div>

                <div>
                    <label className='block text-xs font-medium mb-1'>מרווח עליון (% מהגובה)</label>
                    <input
                        type='range'
                        min='0'
                        max='20'
                        value={settings.imageStyle.marginTop}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    marginTop: parseInt(e.target.value),
                                },
                            })
                        }
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
