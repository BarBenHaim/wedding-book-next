'use client'

import { useEffect, useState } from 'react'
import { listPresets, resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'

// Couple-facing book-design picker. A curated gallery of presets, each
// rendered as a real mini <BookPageTemplate /> so the couple chooses by
// sight. Deliberately NOT the granular admin DesignControls (fonts /
// frames / textures) — couples get one tap, one design.
//
// The parent owns the write: onSelect(design, preset) receives the fully
// resolved style object ({ ...defaultStyle, ...resolvePreset(preset).values }).
// In the portal that's a client-SDK setDoc (owner). The component manages
// its own saving / saved / error UI from the promise onSelect returns.

const TILE = 132

const PREVIEW_ENTRY = {
    id: 'couple-design-preview',
    name: 'יעל ויואב',
    text: 'מזל טוב! מאחלים לכם חיים מלאים באהבה.',
    imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5d39e"/><stop offset="100%" stop-color="#d8b986"/></linearGradient></defs><rect width="400" height="300" fill="url(#s)"/><ellipse cx="320" cy="80" rx="38" ry="38" fill="#fff8e0" opacity="0.9"/><path d="M0 220 Q100 170 200 200 T 400 210 V 300 H 0 Z" fill="#a87f4b"/></svg>'
    )}`,
}

// Stable-ish signature compare — activeDesign is merged from preset
// values + defaults, so object identity never matches. A few tell-tale
// fields identify which preset is live.
function sameDesign(a, b) {
    if (!a || !b) return false
    return (
        a.backgroundColor === b.backgroundColor &&
        a.fontClass === b.fontClass &&
        a.backgroundUrl === b.backgroundUrl &&
        a.texture === b.texture &&
        a.template === b.template
    )
}

export default function CoupleDesignPicker({ activeDesign, onSelect, title = 'בחרו עיצוב לספר', hint }) {
    const [presets, setPresets] = useState(BUILTIN_PRESETS)
    const [savingKey, setSavingKey] = useState(null)
    const [save, setSave] = useState('') // '' | 'saved' | 'error'

    useEffect(() => {
        let cancelled = false
        listPresets().then(list => {
            if (!cancelled && Array.isArray(list) && list.length > 0) setPresets(list)
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function pick(preset) {
        // JSON round-trip drops any leftover `undefined` values — Firestore rejects them.
        const merged = JSON.parse(JSON.stringify({ ...defaultStyle, ...(resolvePreset(preset).values || {}) }))
        try {
            setSavingKey(preset.id || preset.name)
            setSave('')
            await onSelect(merged, preset)
            setSave('saved')
            setTimeout(() => setSave(''), 2500)
        } catch (err) {
            console.error('[CoupleDesignPicker] save failed', err)
            setSave('error')
            setTimeout(() => setSave(''), 3500)
        } finally {
            setSavingKey(null)
        }
    }

    return (
        <div>
            <div className='flex items-center justify-between mb-3'>
                <label className='block text-sm font-bold text-gray-600'>{title}</label>
                {save === 'saved' && <span className='text-xs font-bold text-emerald-600'>✓ נשמר</span>}
                {save === 'error' && <span className='text-xs font-bold text-red-500'>שמירה נכשלה</span>}
            </div>
            <div className='grid grid-cols-3 gap-2.5'>
                {presets.map(preset => {
                    const key = preset.id || preset.name
                    const previewStyle = { ...defaultStyle, ...(resolvePreset(preset).values || {}) }
                    const isActive = sameDesign(previewStyle, activeDesign)
                    const isSaving = savingKey === key
                    return (
                        <button
                            key={key}
                            onClick={() => pick(preset)}
                            disabled={isSaving}
                            title={preset.name}
                            className='relative rounded-xl overflow-hidden transition-all hover:scale-[1.02]'
                            style={{
                                border: isActive ? '2.5px solid #AA8840' : '2.5px solid transparent',
                                boxShadow: isActive ? '0 4px 16px rgba(170,136,64,0.25)' : '0 2px 8px rgba(0,0,0,0.06)',
                                aspectRatio: '1 / 1',
                            }}
                        >
                            <BookPageTemplate
                                entry={PREVIEW_ENTRY}
                                styleSettings={previewStyle}
                                scaledWidth={TILE}
                                scaledHeight={TILE}
                            />
                            {isActive && (
                                <span className='absolute top-1 end-1 w-5 h-5 rounded-full bg-[#AA8840] flex items-center justify-center shadow'>
                                    <svg className='w-3 h-3 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                                        <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
                                    </svg>
                                </span>
                            )}
                            {isSaving && (
                                <span className='absolute inset-0 bg-white/50 flex items-center justify-center'>
                                    <svg className='w-5 h-5 animate-spin text-[#AA8840]' fill='none' viewBox='0 0 24 24'>
                                        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                                        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z' />
                                    </svg>
                                </span>
                            )}
                            <span
                                className='absolute bottom-0 inset-x-0 py-1 text-[10px] font-bold text-center truncate'
                                style={{
                                    background: isActive ? 'rgba(170,136,64,0.92)' : 'rgba(255,255,255,0.85)',
                                    color: isActive ? '#fff' : '#666',
                                }}
                            >
                                {preset.name || ''}
                            </span>
                        </button>
                    )
                })}
            </div>
            {hint && <p className='text-[11px] text-gray-400 mt-3 leading-relaxed'>{hint}</p>}
        </div>
    )
}
