'use client'

import { useMemo } from 'react'
import TextureSelector from '../TextureSelector/TextureSelector'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defultStyle'

// ברירות מחדל
const BASE_DEFAULTS = {
    backgroundColor: '#fdfaf6',
    fontFamily: `'Noto Serif Hebrew', 'David Libre', serif`,
    fontSize: 18,
    fontColor: '#3a2f2f',
    borderColor: '#d8bfa4',
    borderWidth: 2,
    borderRadius: 0,
    textureUrl: '',
    imageStyle: {
        width: '100%',
        maxWidth: '95%',
        maxHeight: '80%',
        borderRadius: '0%',
        boxShadow: 'none',
        borderColor: '#000000',
        borderWidth: '0px',
        borderStyle: 'solid',
        objectFit: 'cover',
        display: 'block',
        margin: '0 auto',
        marginTop: '10px',
    },
}

// כלי נגישות: בדיקת קונטרסט
function hexToRgb(hex) {
    const c = hex.replace('#', '')
    const bigint = parseInt(
        c.length === 3
            ? c
                  .split('')
                  .map(x => x + x)
                  .join('')
            : c,
        16
    )
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}
function luminance({ r, g, b }) {
    const a = [r, g, b].map(v => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}
function contrastRatio(hex1, hex2) {
    try {
        const L1 = luminance(hexToRgb(hex1)) + 0.05
        const L2 = luminance(hexToRgb(hex2)) + 0.05
        return (Math.max(L1, L2) / Math.min(L1, L2)).toFixed(2)
    } catch {
        return '—'
    }
}

export default function DesignControls({ settings, onChange }) {
    const ratio = useMemo(
        () => contrastRatio(settings.fontColor, settings.backgroundColor),
        [settings.fontColor, settings.backgroundColor]
    )

    const handleUploadTexture = e => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => onChange({ textureUrl: reader.result })
        reader.readAsDataURL(file)
    }

    const resetToDefault = () => onChange({ ...BASE_DEFAULTS })
    const saveAsDefault = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('bookStyle', JSON.stringify(settings))
            alert('העיצוב נשמר כברירת מחדל 🎉')
        }
    }

    return (
        <div
            dir='rtl'
            className='
                space-y-6 
                max-h-none 
                md:max-h-[90vh] md:overflow-y-auto 
                pr-1
            '
        >
            {/* כותרת + פעולות */}
            <div className='flex items-center justify-between'>
                <h3 className='text-lg font-semibold text-gray-800 flex items-center gap-2'>🎨 עיצוב הספר</h3>
                <div className='flex gap-2'>
                    <button
                        type='button'
                        onClick={resetToDefault}
                        className='rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50'
                    >
                        איפוס
                    </button>
                    <button
                        type='button'
                        onClick={saveAsDefault}
                        className='rounded-md bg-pink-500 px-3 py-1.5 text-sm text-white shadow hover:bg-pink-600'
                    >
                        שמור כברירת מחדל
                    </button>
                </div>
            </div>

            {/* צבעים וטיפוגרפיה */}
            <section className='rounded-xl border border-gray-200 bg-white/70 p-3'>
                <h4 className='mb-3 text-sm font-medium text-gray-700'>טיפוגרפיה וצבעים</h4>

                <div className='grid grid-cols-2 gap-4'>
                    <div className='flex items-center justify-between'>
                        <label className='text-sm text-gray-700'>צבע רקע</label>
                        <input
                            type='color'
                            value={settings.backgroundColor}
                            onChange={e => onChange({ backgroundColor: e.target.value })}
                            className='h-9 w-16 cursor-pointer rounded border border-gray-300 shadow-sm'
                        />
                    </div>
                    <div className='flex items-center justify-between'>
                        <label className='text-sm text-gray-700'>צבע טקסט</label>
                        <input
                            type='color'
                            value={settings.fontColor}
                            onChange={e => onChange({ fontColor: e.target.value })}
                            className='h-9 w-16 cursor-pointer rounded border border-gray-300 shadow-sm'
                        />
                    </div>
                </div>

                <div className='mt-4'>
                    <label className='mb-1 block text-sm text-gray-700'>פונט</label>
                    <select
                        value={settings.fontFamily}
                        onChange={e => onChange({ fontFamily: e.target.value })}
                        className='w-full rounded-md border-gray-300 shadow-sm focus:border-pink-400 focus:ring-2 focus:ring-pink-200'
                    >
                        <option value={`'Noto Serif Hebrew', 'David Libre', serif`}>Noto Serif Hebrew</option>
                        <option value={`'David Libre', serif`}>David Libre</option>
                        <option value={`'Times New Roman', serif`}>Times New Roman</option>
                        <option value={`'Guttman Yad-Brush', cursive`}>כתב יד</option>
                        <option value={`Arial, sans-serif`}>Arial</option>
                    </select>
                </div>

                <div className='mt-4'>
                    <label className='mb-1 block text-sm text-gray-700'>גודל טקסט</label>
                    <div className='flex items-center gap-3'>
                        <input
                            type='range'
                            min='14'
                            max='36'
                            value={settings.fontSize}
                            onChange={e => onChange({ fontSize: parseInt(e.target.value) })}
                            className='w-full accent-pink-500'
                        />
                        <span className='text-sm text-gray-600'>{settings.fontSize}px</span>
                    </div>
                </div>
            </section>

            {/* מסגרת עמוד */}
            <section className='rounded-xl border border-gray-200 bg-white/70 p-3'>
                <h4 className='mb-3 text-sm font-medium text-gray-700'>מסגרת העמוד</h4>

                <div className='grid grid-cols-2 gap-4'>
                    <div className='flex items-center justify-between'>
                        <label className='text-sm text-gray-700'>צבע מסגרת</label>
                        <input
                            type='color'
                            value={settings.borderColor}
                            onChange={e => onChange({ borderColor: e.target.value })}
                            className='h-9 w-16 cursor-pointer rounded border border-gray-300 shadow-sm'
                        />
                    </div>
                    <div>
                        <label className='mb-1 block text-sm text-gray-700'>עובי מסגרת</label>
                        <div className='flex items-center gap-3'>
                            <input
                                type='range'
                                min='0'
                                max='10'
                                value={settings.borderWidth}
                                onChange={e => onChange({ borderWidth: parseInt(e.target.value) })}
                                className='w-full accent-pink-500'
                            />
                            <span className='text-sm text-gray-600'>{settings.borderWidth}px</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* עיצוב תמונה */}
            <section className='rounded-xl border border-gray-200 bg-white/70 p-3'>
                <h4 className='mb-3 text-sm font-medium text-gray-700'>עיצוב תמונה</h4>

                {/* רוחב */}
                <div className='mb-3'>
                    <label className='block text-sm text-gray-700'>רוחב תמונה (%)</label>
                    <input
                        type='range'
                        min='30'
                        max='95'
                        value={parseInt(settings.imageStyle?.width) || 80}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    width: `${e.target.value}%`,
                                },
                            })
                        }
                        className='w-full accent-pink-500'
                    />
                    <span className='text-sm text-gray-600'>{settings.imageStyle?.width || '80%'}</span>
                </div>

                {/* עיגוליות */}
                <div className='mb-3'>
                    <label className='block text-sm text-gray-700'>עיגוליות פינות (%)</label>
                    <input
                        type='range'
                        min='0'
                        max='50'
                        value={parseInt(settings.imageStyle?.borderRadius) || 0}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    borderRadius: `${e.target.value}%`,
                                },
                            })
                        }
                        className='w-full accent-pink-500'
                    />
                    <span className='text-sm text-gray-600'>{settings.imageStyle?.borderRadius || '0%'}</span>
                </div>

                {/* צבע מסגרת תמונה */}
                <div className='mb-3 flex items-center justify-between'>
                    <label className='text-sm text-gray-700'>צבע מסגרת</label>
                    <input
                        type='color'
                        value={settings.imageStyle?.borderColor || '#000000'}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    borderColor: e.target.value,
                                },
                            })
                        }
                        className='h-9 w-16 cursor-pointer rounded border border-gray-300 shadow-sm'
                    />
                </div>

                {/* עובי מסגרת תמונה */}
                <div className='mb-3'>
                    <label className='block text-sm text-gray-700'>עובי מסגרת (px)</label>
                    <input
                        type='range'
                        min='0'
                        max='10'
                        value={parseInt(settings.imageStyle?.borderWidth) || 0}
                        onChange={e =>
                            onChange({
                                imageStyle: {
                                    ...settings.imageStyle,
                                    borderWidth: `${e.target.value}`,
                                },
                            })
                        }
                        className='w-full accent-pink-500'
                    />
                    <span className='text-sm text-gray-600'>{settings.imageStyle?.borderWidth || '0'}px</span>
                </div>
            </section>

            {/* טקסטורות */}
            <section className='rounded-xl border border-gray-200 bg-white/70 p-3'>
                <h4 className='mb-3 text-sm font-medium text-gray-700'>טקסטורה</h4>
                <div className='mb-3'>
                    <TextureSelector value={settings.textureUrl} onChange={url => onChange({ textureUrl: url })} />
                </div>
                <div>
                    <label className='mb-1 block text-sm text-gray-700'>או העלה טקסטורה משלך</label>
                    <input
                        type='file'
                        accept='image/*'
                        onChange={handleUploadTexture}
                        className='block w-full cursor-pointer text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-pink-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-pink-600 hover:file:bg-pink-100'
                    />
                </div>
            </section>
        </div>
    )
}
