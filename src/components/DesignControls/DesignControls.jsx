'use client'

import { useState } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontClass: notoHebrew.className,
    fontColor: '#000000',
    texture: null,
    decorations: [],
    imageStyle: { width: 90, height: 70 },
}

/* טקסטורות */
const TEXTURES = [
    { name: 'נייר', url: '/textures/paper.png' },
    { name: 'פשתן', url: '/textures/linen.png' },
    { name: 'שיש', url: '/textures/marble.png' },
    { name: 'נצנצים', url: '/textures/glitter.png' },
]

/* דקורציות */
const DECORATIONS = [
    { icon: '❤️', value: 'hearts' },
    { icon: '⭐', value: 'stars' },
    { icon: '🌸', value: 'flowers' },
    { icon: '✨', value: 'sparkles' },
]

/* פריסטים */
const PRESETS = [
    {
        name: 'רומנטי',
        preview: '/previews/romantic.png',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#fff6f9',
            fontClass: davidLibre.className,
            fontColor: '#b03060',
            decorations: ['flowers'],
        },
    },
    {
        name: 'כוכבים',
        preview: '/previews/stars.png',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#0f172a',
            fontClass: frankRuhl.className,
            fontColor: '#facc15',
            decorations: ['stars'],
        },
    },
    {
        name: 'אלגנטי כהה',
        preview: '/previews/dark.png',
        values: {
            ...BASE_DEFAULTS,
            backgroundColor: '#1e1e1e',
            fontClass: secular.className,
            fontColor: '#f0e6d2',
        },
    },
]

export default function DesignControls({ settings, onChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    return (
        <div
            dir='rtl'
            className='flex flex-col gap-8 font-sans text-sm h-full overflow-y-auto p-4 bg-gradient-to-b from-white/70 to-white/30 backdrop-blur-xl rounded-3xl'
        >
            {/* פריסטים */}
            <section>
                <h4 className='mb-4 text-xs font-semibold text-gray-500 tracking-wide'>סגנון מוכן</h4>
                <div className='grid grid-cols-3 gap-4'>
                    {PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => applyPreset(preset)}
                            className={`rounded-2xl overflow-hidden shadow-sm transition hover:scale-[1.05] ${
                                activePreset === preset.name ? 'ring-2 ring-pink-400 shadow-lg' : 'ring-1 ring-gray-200'
                            }`}
                        >
                            <img src={preset.preview} alt={preset.name} className='w-full h-24 object-cover' />
                        </button>
                    ))}
                </div>
            </section>

            {/* פונט */}
            <section>
                <h4 className='mb-4 text-xs font-semibold text-gray-500 tracking-wide'>פונט</h4>
                <div className='flex justify-between'>
                    {[notoHebrew, frankRuhl, davidLibre, heebo, secular].map((font, idx) => (
                        <button
                            key={idx}
                            onClick={() => onChange({ fontClass: font.className })}
                            className={`w-12 h-12 flex items-center justify-center rounded-full transition backdrop-blur-md ${
                                settings.fontClass === font.className
                                    ? 'bg-pink-100 ring-2 ring-pink-400'
                                    : 'bg-white/60 ring-1 ring-gray-200'
                            }`}
                        >
                            <span className={`${font.className} text-lg`}>א</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* צבעים */}
            <section>
                <h4 className='mb-4 text-xs font-semibold text-gray-500 tracking-wide'>צבעים</h4>
                <div className='flex justify-between'>
                    {['#000000', '#4b3b18', '#b03060', '#f0e6d2'].map(c => (
                        <button
                            key={c}
                            onClick={() => onChange({ fontColor: c })}
                            className={`w-10 h-10 rounded-full transition ${
                                settings.fontColor === c ? 'ring-2 ring-pink-400' : 'ring-1 ring-gray-200'
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </section>

            {/* טקסטורות */}
            <section>
                <h4 className='mb-4 text-xs font-semibold text-gray-500 tracking-wide'>טקסטורות</h4>
                <div className='grid grid-cols-4 gap-3'>
                    {TEXTURES.map(tex => (
                        <button
                            key={tex.name}
                            onClick={() => onChange({ texture: tex.url })}
                            className={`rounded-xl overflow-hidden transition hover:scale-[1.05] ${
                                settings.texture === tex.url ? 'ring-2 ring-pink-400' : 'ring-1 ring-gray-200'
                            }`}
                        >
                            <img src={tex.url} alt={tex.name} className='w-full h-14 object-cover' />
                        </button>
                    ))}
                </div>
            </section>

            {/* דקורציות */}
            {/* דקורציות */}
            <section>
                <h4 className='mb-4 text-xs font-semibold text-gray-500 tracking-wide'>אלמנטים</h4>
                <div className='flex gap-3 flex-wrap'>
                    {DECORATIONS.map(deco => (
                        <button
                            key={deco.value}
                            onClick={() =>
                                onChange({
                                    decorations: (settings.decorations ?? []).includes(deco.value)
                                        ? (settings.decorations ?? []).filter(d => d !== deco.value)
                                        : [...(settings.decorations ?? []), deco.value],
                                })
                            }
                            className={`w-12 h-12 flex items-center justify-center rounded-2xl text-xl transition backdrop-blur-md ${
                                (settings.decorations ?? []).includes(deco.value)
                                    ? 'bg-pink-100 ring-2 ring-pink-400'
                                    : 'bg-white/60 ring-1 ring-gray-200'
                            }`}
                        >
                            {deco.icon}
                        </button>
                    ))}
                </div>
            </section>
        </div>
    )
}
