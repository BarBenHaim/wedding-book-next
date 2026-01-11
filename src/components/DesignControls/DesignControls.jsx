'use client'

import { useState, useEffect, useRef } from 'react'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew } from '@/app/fonts'

/* --- נכסים --- */
import frame1 from '../../media/frames/frame1.png'
import frame2 from '../../media/frames/frame2.png'
import frame3 from '../../media/frames/frame3.png'
import frame4 from '../../media/frames/frame4.png'
import tex1 from '../../media/textures/tex1.png'
import tex2 from '../../media/textures/tex2.png'
import tex3 from '../../media/textures/tex3.png'

const TEXTURES = [tex1, tex2, tex3]
const FRAMES = [frame1, frame2, frame3, frame4]

/* --- נתונים קבועים --- */
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
            fontSizePercent: 2.5,
            imageStyle: { width: 80, height: 70, borderRadius: 0 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
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
            imageMarginTop: 2,
        },
    },
    {
        name: 'ציור',
        preview: '#c4b5ecff',
        values: {
            backgroundColor: '#c4b5ecff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: tex3.src,
            frame: null,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 8,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        name: 'מסגרת מרובעת',
        preview: '#ffffff',
        values: {
            backgroundColor: '#ffffff',
            fontClass: heebo.className,
            fontColor: '#000000',
            texture: null,
            frame: frame4.src,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65, borderRadius: 0 },
            nameMarginTop: 1,
            textMaxWidth: 70,
            imageMarginTop: 8,
        },
    },
]

const FONTS = [
    { font: notoHebrew, label: 'Noto Hebrew' },
    { font: frankRuhl, label: 'Frank Ruhl' },
    { font: davidLibre, label: 'David Libre' },
    { font: heebo, label: 'Heebo' },
    { font: secular, label: 'Secular One' },
]

/* --- רכיבי UX מתקדמים --- */

// רכיב אינפוט חכם
const BufferedInput = ({ value, onChange, placeholder, className }) => {
    const [localValue, setLocalValue] = useState(value || '')

    useEffect(() => {
        setLocalValue(value || '')
    }, [value])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localValue !== value) onChange(localValue)
        }, 300)
        return () => clearTimeout(timer)
    }, [localValue, onChange, value])

    return (
        <input
            type='text'
            value={localValue}
            placeholder={placeholder}
            onChange={e => setLocalValue(e.target.value)}
            className={className}
        />
    )
}

// 🔥 רכיב משטח שליטה (Joystick) למיקום התמונה
const PositionPad = ({ x, y, onChange }) => {
    const containerRef = useRef(null)
    const [isDragging, setIsDragging] = useState(false)

    const handleMove = (clientX, clientY) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()

        let newX = ((clientX - rect.left) / rect.width) * 100
        let newY = ((clientY - rect.top) / rect.height) * 100

        newX = Math.max(0, Math.min(100, newX))
        newY = Math.max(0, Math.min(100, newY))

        onChange(newX, newY)
    }

    const onMouseDown = e => {
        setIsDragging(true)
        handleMove(e.clientX, e.clientY)
    }

    useEffect(() => {
        if (!isDragging) return

        const onMouseMove = e => handleMove(e.clientX, e.clientY)
        const onMouseUp = () => setIsDragging(false)

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        window.addEventListener('touchmove', e => handleMove(e.touches[0].clientX, e.touches[0].clientY))
        window.addEventListener('touchend', onMouseUp)

        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.removeEventListener('touchmove', () => {})
            window.removeEventListener('touchend', () => {})
        }
    }, [isDragging])

    return (
        <div className='space-y-1'>
            <div className='flex justify-between text-[10px] text-gray-400'>
                <span>מיקום</span>
                <span>לחצי וגררי</span>
            </div>
            <div
                ref={containerRef}
                onMouseDown={onMouseDown}
                onTouchStart={e => {
                    setIsDragging(true)
                    handleMove(e.touches[0].clientX, e.touches[0].clientY)
                }}
                className={`relative w-full h-24 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden cursor-crosshair touch-none transition-colors ${
                    isDragging ? 'border-pink-400 bg-pink-50' : ''
                }`}
            >
                <div className='absolute top-1/2 left-0 w-full h-px bg-gray-200 pointer-events-none' />
                <div className='absolute left-1/2 top-0 w-px h-full bg-gray-200 pointer-events-none' />

                <div
                    className='absolute w-6 h-6 bg-white border-2 border-pink-500 rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75'
                    style={{ left: `${x}%`, top: `${y}%`, scale: isDragging ? '1.2' : '1' }}
                >
                    <div className='w-full h-full flex items-center justify-center'>
                        <div className='w-1 h-1 bg-pink-500 rounded-full' />
                    </div>
                </div>
            </div>
        </div>
    )
}

const Card = ({ title, children, className = '' }) => (
    <div className={`bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden ${className}`}>
        <div className='bg-gray-50/50 px-4 py-2 border-b border-gray-100'>
            <h4 className='text-xs font-bold text-gray-500 uppercase tracking-wider'>{title}</h4>
        </div>
        <div className='p-4 space-y-3'>{children}</div>
    </div>
)

/* --- הקומפוננטה הראשית --- */
export default function DesignControls({ settings, onChange, mode, onModeChange }) {
    const [activePreset, setActivePreset] = useState(null)

    const applyPreset = preset => {
        setActivePreset(preset.name)
        onChange(preset.values)
    }

    // 🔥 פונקציה חדשה לטיפול בהעלאת תמונה - המרה ל-Base64 כדי שתישמר ב-Storage
    const handleImageUpload = e => {
        const file = e.target.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.onloadend = () => {
            // התוצאה כאן היא מחרוזת Base64 ארוכה שנשמרת ב-LocalStorage
            onChange({ ...settings, coverImage: reader.result })
        }
        reader.readAsDataURL(file)
    }

    return (
        <div dir='rtl' className='flex flex-col gap-3 h-full bg-gray-50/50 p-2'>
            {/* טאבים ראשיים */}
            <div className='bg-gray-200 p-1 rounded-xl flex gap-1 shadow-inner shrink-0'>
                <button
                    onClick={() => onModeChange('book')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                        mode === 'book' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    📖 פנים הספר
                </button>
                <button
                    onClick={() => onModeChange('cover')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                        mode === 'cover' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    🎨 עיצוב כריכה
                </button>
            </div>

            <div className='flex-1 overflow-y-auto pr-1 pl-1 space-y-4 pb-10 scrollbar-hide'>
                {/* === מצב ספר === */}
                {mode === 'book' && (
                    <div className='space-y-4 animate-fadeIn'>
                        <Card title='סגנונות מוכנים'>
                            <div className='grid grid-cols-2 gap-3'>
                                {PRESETS.map(preset => (
                                    <button
                                        key={preset.name}
                                        onClick={() => applyPreset(preset)}
                                        className={`relative h-16 rounded-lg border transition-all overflow-hidden ${
                                            activePreset === preset.name
                                                ? 'ring-2 ring-purple-500 border-transparent'
                                                : 'border-gray-200 hover:scale-[1.02]'
                                        }`}
                                        style={{ background: preset.preview }}
                                    >
                                        <span
                                            className={`absolute bottom-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                preset.name.includes('לבן')
                                                    ? 'bg-gray-100 text-black'
                                                    : 'bg-white/90 text-black'
                                            }`}
                                        >
                                            {preset.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Card>

                        <Card title='פונטים'>
                            <div className='space-y-2'>
                                {FONTS.map(f => (
                                    <button
                                        key={f.label}
                                        onClick={() => onChange({ ...settings, fontClass: f.font.className })}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                            settings.fontClass === f.font.className
                                                ? 'bg-purple-50 border-purple-400 text-purple-700'
                                                : 'bg-white hover:border-gray-300'
                                        }`}
                                    >
                                        <span className='text-[10px] text-gray-400'>{f.label}</span>
                                        <span className={`${f.font.className} text-base`}>אני אוהב אותך</span>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* === מצב כריכה === */}
                {mode === 'cover' && (
                    <div className='animate-fadeIn space-y-4'>
                        <Card title='טקסט כריכה'>
                            <div className='space-y-3'>
                                <BufferedInput
                                    value={settings.coverTitle}
                                    onChange={val => onChange({ ...settings, coverTitle: val })}
                                    placeholder='כותרת (למשל: החתונה של...)'
                                    className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-300 outline-none'
                                />
                                <BufferedInput
                                    value={settings.coverSubtitle}
                                    onChange={val => onChange({ ...settings, coverSubtitle: val })}
                                    placeholder='תת כותרת'
                                    className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-300 outline-none'
                                />
                            </div>
                            <div className='mt-3 flex items-center justify-between'>
                                <span className='text-xs text-gray-500'>רקע לטקסט</span>
                                <button
                                    onClick={() =>
                                        onChange({
                                            ...settings,
                                            coverTextBg: settings.coverTextBg ? null : 'rgba(255,255,255,0.8)',
                                        })
                                    }
                                    className={`relative w-10 h-5 rounded-full transition-colors ${
                                        settings.coverTextBg ? 'bg-pink-500' : 'bg-gray-300'
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${
                                            settings.coverTextBg ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                        </Card>

                        <Card title='תמונת כריכה'>
                            {!settings.coverImage ? (
                                <label className='flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-pink-50 hover:border-pink-300 transition-all'>
                                    <span className='text-2xl mb-1'>📷</span>
                                    <span className='text-xs text-gray-500'>העלאת תמונה</span>
                                    {/* 🔥 שימוש בפונקציה החדשה להעלאה */}
                                    <input
                                        type='file'
                                        accept='image/*'
                                        className='hidden'
                                        onChange={handleImageUpload}
                                    />
                                </label>
                            ) : (
                                <div className='space-y-4'>
                                    {/* תצוגה מקדימה קטנה */}
                                    <div className='relative rounded-lg overflow-hidden border border-gray-200'>
                                        <img src={settings.coverImage} className='w-full h-32 object-cover' />
                                        <button
                                            onClick={() => onChange({ coverImage: null })}
                                            className='absolute top-2 left-2 bg-white/90 text-red-500 p-1.5 rounded-full shadow hover:bg-red-50'
                                        >
                                            <svg
                                                className='w-4 h-4'
                                                fill='none'
                                                viewBox='0 0 24 24'
                                                stroke='currentColor'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    strokeWidth={2}
                                                    d='M6 18L18 6M6 6l12 12'
                                                />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* 🔥 המשטח החדש */}
                                    <PositionPad
                                        x={settings.coverImageX || 50}
                                        y={settings.coverImageY || 50}
                                        onChange={(newX, newY) =>
                                            onChange({ ...settings, coverImageX: newX, coverImageY: newY })
                                        }
                                    />

                                    {/* סליידר לזום */}
                                    <div>
                                        <div className='flex justify-between text-[10px] text-gray-400 mb-1'>
                                            <span>זום (Zoom)</span>
                                            <span>{settings.coverImageScale || 100}%</span>
                                        </div>
                                        <input
                                            type='range'
                                            min={20}
                                            max={500} // 🔥 הוגדל ל-500 לפי בקשתך
                                            value={settings.coverImageScale || 100}
                                            onChange={e =>
                                                onChange({ ...settings, coverImageScale: parseFloat(e.target.value) })
                                            }
                                            className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500'
                                        />
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card title='עיצוב ורקע'>
                            <div className='grid grid-cols-4 gap-2'>
                                {/* כפתור אוטומטי (ברירת מחדל של הספר) */}
                                <button
                                    onClick={() => onChange({ coverTexture: null, coverFrame: null })}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] border transition-all ${
                                        settings.coverTexture === null && settings.coverFrame === null
                                            ? 'bg-pink-50 border-pink-400 text-pink-700'
                                            : 'bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    אוטומטי
                                </button>

                                {/* 🔥 כפתור ללא (נקי) */}
                                <button
                                    onClick={() => onChange({ coverTexture: 'none', coverFrame: 'none' })}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] border transition-all ${
                                        settings.coverTexture === 'none'
                                            ? 'bg-pink-50 border-pink-400 text-pink-700'
                                            : 'bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    ללא
                                </button>

                                {/* כפתורי טקסטורות */}
                                {TEXTURES.map((tex, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onChange({ coverTexture: tex.src, coverFrame: 'none' })} // בחרתי שזה יבטל מסגרת אוטומטית כשבוחרים רקע
                                        className={`aspect-square rounded-lg border overflow-hidden transition-all ${
                                            settings.coverTexture === tex.src
                                                ? 'ring-2 ring-pink-400 border-transparent'
                                                : 'hover:opacity-80'
                                        }`}
                                    >
                                        <img src={tex.src} className='w-full h-full object-cover' />
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    )
}
