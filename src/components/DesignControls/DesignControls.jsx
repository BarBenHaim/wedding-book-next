'use client'

const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontFamily: `'Noto Serif Hebrew', 'David Libre', serif`,
    fontSize: 3, // % מהגובה
    fontColor: '#000000',
    borderColor: '#d8bfa4',
    borderWidth: 0.5, // % מהרוחב
    borderRadius: 0, // % מהרוחב
    pagePadding: 3, // % מהגובה
    textureUrl: '',
    imageStyle: {
        width: 80, // % מהרוחב
        height: 60, // % מהגובה
        marginTop: 5, // % מהגובה
        borderRadius: '0%',
        borderWidth: '0px',
        borderStyle: 'solid',
        boxShadow: 'none',
    },
}

export default function DesignControls({ settings, onChange }) {
    const resetToDefault = () => onChange({ ...BASE_DEFAULTS })

    return (
        <div dir='rtl' className='space-y-6 md:max-h-[90vh] md:overflow-y-auto pr-1'>
            {/* צבעים */}
            <section className='rounded-xl border border-gray-200 bg-white/80 p-4'>
                <h4 className='mb-3 text-sm font-semibold'>צבעים וטיפוגרפיה</h4>
                <input
                    type='color'
                    value={settings.backgroundColor}
                    onChange={e => onChange({ backgroundColor: e.target.value })}
                />
                <input
                    type='color'
                    value={settings.fontColor}
                    onChange={e => onChange({ fontColor: e.target.value })}
                />
                <label>גודל טקסט (% מהגובה)</label>
                <input
                    type='range'
                    min='1'
                    max='10'
                    value={settings.fontSize}
                    onChange={e => onChange({ fontSize: parseInt(e.target.value) })}
                />
            </section>

            {/* עמוד */}
            <section className='rounded-xl border border-gray-200 bg-white/80 p-4'>
                <h4 className='mb-3 text-sm font-semibold'>עמוד</h4>
                <label>מסגרת (% מהרוחב)</label>
                <input
                    type='range'
                    min='0'
                    max='5'
                    value={settings.borderWidth}
                    onChange={e => onChange({ borderWidth: parseInt(e.target.value) })}
                />
                <label>רדיוס (% מהרוחב)</label>
                <input
                    type='range'
                    min='0'
                    max='20'
                    value={settings.borderRadius}
                    onChange={e => onChange({ borderRadius: parseInt(e.target.value) })}
                />
                <label>Padding (% מהגובה)</label>
                <input
                    type='range'
                    min='0'
                    max='10'
                    value={settings.pagePadding}
                    onChange={e => onChange({ pagePadding: parseInt(e.target.value) })}
                />
            </section>

            {/* תמונה */}
            <section className='rounded-xl border border-gray-200 bg-white/80 p-4'>
                <h4 className='mb-3 text-sm font-semibold'>תמונה</h4>
                <label>רוחב (% מהרוחב)</label>
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
                />
                <label>גובה מקסימלי (% מהגובה)</label>
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
                />
                <label>מרווח עליון (% מהגובה)</label>
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
                />
            </section>

            <button onClick={resetToDefault} className='rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm'>
                איפוס
            </button>
        </div>
    )
}
