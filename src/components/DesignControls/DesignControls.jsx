'use client'

const BASE_DEFAULTS = {
    backgroundColor: '#fdfaf6',
    fontFamily: `'Noto Serif Hebrew', 'David Libre', serif`,
    fontSize: 42, // ערכי אמת ל־A4
    fontColor: '#3a2f2f',
    borderColor: '#d8bfa4',
    borderWidth: 8,
    borderRadius: 0,
    textureUrl: '',
    imageStyle: {
        maxWidth: '2000px',
        maxHeight: '1600px',
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

export default function DesignControls({ settings, onChange }) {
    const resetToDefault = () => onChange({ ...BASE_DEFAULTS })
    const saveAsDefault = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('bookStyle', JSON.stringify(settings))
            alert('🎉 העיצוב נשמר כברירת מחדל')
        }
    }

    return (
        <div dir='rtl' className='space-y-6 md:max-h-[90vh] md:overflow-y-auto pr-1'>
            {/* כותרת + פעולות */}
            <div className='flex items-center justify-between'>
                <div className='flex gap-2'>
                    <button
                        type='button'
                        onClick={resetToDefault}
                        className='rounded-lg border border-gray-300 bg-white/80 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition'
                    >
                        איפוס
                    </button>
                    <button
                        type='button'
                        onClick={saveAsDefault}
                        className='rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 px-3 py-1.5 text-sm font-medium text-white shadow'
                    >
                        שמור כברירת מחדל
                    </button>
                </div>
            </div>

            {/* צבעים וטיפוגרפיה */}
            <section className='rounded-xl border border-gray-200 bg-white/80 backdrop-blur-md p-4'>
                <h4 className='mb-3 text-sm font-semibold text-gray-800'>טיפוגרפיה וצבעים</h4>

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
                        className='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
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
                            min='20'
                            max='80'
                            value={settings.fontSize}
                            onChange={e => onChange({ fontSize: parseInt(e.target.value) })}
                            className='w-full accent-pink-500'
                        />
                        <span className='text-sm text-gray-600'>{settings.fontSize}px</span>
                    </div>
                </div>
            </section>

            {/* מסגרת עמוד */}
            <section className='rounded-xl border border-gray-200 bg-white/80 backdrop-blur-md p-4'>
                <h4 className='mb-3 text-sm font-semibold text-gray-800'>מסגרת העמוד</h4>
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
                                max='20'
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
            <section className='rounded-xl border border-gray-200 bg-white/80 backdrop-blur-md p-4'>
                <h4 className='mb-3 text-sm font-semibold text-gray-800'>עיצוב תמונה</h4>

                <div className='space-y-4'>
                    <div>
                        <label className='mb-1 block text-sm text-gray-700'>רדיוס פינות תמונה</label>
                        <input
                            type='range'
                            min='0'
                            max='50'
                            value={parseInt(settings.imageStyle.borderRadius)}
                            onChange={e =>
                                onChange({
                                    imageStyle: { ...settings.imageStyle, borderRadius: `${e.target.value}%` },
                                })
                            }
                            className='w-full accent-pink-500'
                        />
                    </div>

                    <div>
                        <label className='mb-1 block text-sm text-gray-700'>עובי מסגרת תמונה</label>
                        <input
                            type='range'
                            min='0'
                            max='20'
                            value={parseInt(settings.imageStyle.borderWidth)}
                            onChange={e =>
                                onChange({
                                    imageStyle: { ...settings.imageStyle, borderWidth: `${e.target.value}px` },
                                })
                            }
                            className='w-full accent-pink-500'
                        />
                    </div>

                    <div>
                        <label className='mb-1 block text-sm text-gray-700'>סגנון מסגרת</label>
                        <select
                            value={settings.imageStyle.borderStyle}
                            onChange={e =>
                                onChange({
                                    imageStyle: { ...settings.imageStyle, borderStyle: e.target.value },
                                })
                            }
                            className='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm'
                        >
                            <option value='solid'>Solid</option>
                            <option value='dashed'>Dashed</option>
                            <option value='dotted'>Dotted</option>
                            <option value='double'>Double</option>
                        </select>
                    </div>

                    <div>
                        <label className='mb-1 block text-sm text-gray-700'>צל לתמונה</label>
                        <select
                            value={settings.imageStyle.boxShadow}
                            onChange={e =>
                                onChange({
                                    imageStyle: { ...settings.imageStyle, boxShadow: e.target.value },
                                })
                            }
                            className='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm'
                        >
                            <option value='none'>ללא</option>
                            <option value='0 2px 6px rgba(0,0,0,0.2)'>קטן</option>
                            <option value='0 6px 18px rgba(0,0,0,0.25)'>בינוני</option>
                            <option value='0 12px 24px rgba(0,0,0,0.3)'>גדול</option>
                        </select>
                    </div>
                </div>
            </section>
        </div>
    )
}
