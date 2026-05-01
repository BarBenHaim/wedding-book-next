'use client'

// /playground/layouts
//
// Live preview of every layout variant from PageLayouts.jsx, all rendered
// with the same sample entry so structural differences pop. The sample
// entry is editable inline so you can stress-test long text, missing
// image, missing name, etc.
//
// This route is intentionally outside the /wedding/[id] tree and not
// behind the AdminPageWrapper auth guard — it's a dev-only playground.
// Don't ship a public link to it.

import { useState } from 'react'
import { LAYOUTS } from '@/components/PageLayouts/PageLayouts'

const DEFAULT_ENTRY = {
    name: 'רעות',
    text: 'מזל טוב והצלחה גדולה בדרככם החדשה — שיהיה לכם בית מלא אהבה, צחוק ושמחה תמיד.',
    imageUrl: 'https://picsum.photos/seed/weddingbook/800/800',
}

const PRESETS = [
    {
        label: 'ברכה רגילה',
        entry: DEFAULT_ENTRY,
    },
    {
        label: 'ברכה ארוכה',
        entry: {
            name: 'דנה ויובל',
            text: 'מזל טוב לזוג היפה והמיוחד שלנו! שתזכו לחיים ארוכים מלאים באהבה אינסופית, בשמחה גדולה, באתגרים שתצליחו לעמוד בהם יחד, ובהמון רגעים קטנים שייהפכו לזיכרונות הכי יקרים. תהיו בריאים, מאושרים ותמיד תמצאו את הדרך האחד לשני.',
            imageUrl: 'https://picsum.photos/seed/longwed/800/800',
        },
    },
    {
        label: 'ברכה קצרה',
        entry: {
            name: 'מיכאל',
            text: 'מזל טוב!',
            imageUrl: 'https://picsum.photos/seed/shortwed/800/800',
        },
    },
    {
        label: 'בלי תמונה',
        entry: {
            name: 'סבתא רחל',
            text: 'נכדים יקרים, אני מתפללת שאלוהים יברך אתכם בכל טוב — באהבה, בריאות ושמחה לאורך כל ימי חייכם.',
            imageUrl: '',
        },
    },
    {
        label: 'בלי שם',
        entry: {
            name: '',
            text: 'מי שמוצא אישה מצא טוב, ויפק רצון מה׳. שיהיו חייכם משותפים מאושרים, מלאי משמעות ואהבה.',
            imageUrl: 'https://picsum.photos/seed/anon/800/800',
        },
    },
]

const RENDER_SIZE = 420 // px — square canvas per tile

export default function LayoutsPlayground() {
    const [entry, setEntry] = useState(DEFAULT_ENTRY)
    const [bgKind, setBgKind] = useState('neutral') // 'neutral' | 'cream' | 'dark'

    const update = (key, value) => setEntry(prev => ({ ...prev, [key]: value }))
    const applyPreset = preset => setEntry(preset.entry)

    const pageBg =
        bgKind === 'cream'
            ? '#f0ebe3'
            : bgKind === 'dark'
              ? '#18140F'
              : '#f5f5f5'

    const labelColor = bgKind === 'dark' ? '#f0ebe3' : '#2a2318'
    const subColor = bgKind === 'dark' ? '#aa8840' : '#7a6548'

    return (
        <div
            dir='rtl'
            style={{ background: pageBg, minHeight: '100vh', padding: '32px 16px', color: labelColor }}
        >
            <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                {/* Header */}
                <header style={{ marginBottom: 24 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: labelColor }}>
                        סטודיו עיצוב — לייאאוטים לעמוד ספר
                    </h1>
                    <p style={{ color: subColor, marginTop: 6, fontSize: 14 }}>
                        מתחת — אותה ברכה ב-{LAYOUTS.length} מבנים שונים. ערוך את הברכה / השם / התמונה למעלה כדי לראות איך כל מבנה מתנהג.
                    </p>
                </header>

                {/* Presets */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {PRESETS.map(p => (
                        <button
                            key={p.label}
                            onClick={() => applyPreset(p)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 999,
                                background: '#aa8840',
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                    <span style={{ width: 1, background: '#aa884033', margin: '0 4px' }} />
                    {[
                        { id: 'neutral', label: 'אפור' },
                        { id: 'cream', label: 'שמנת' },
                        { id: 'dark', label: 'כהה' },
                    ].map(b => (
                        <button
                            key={b.id}
                            onClick={() => setBgKind(b.id)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 999,
                                background: bgKind === b.id ? '#18140F' : 'transparent',
                                color: bgKind === b.id ? '#fff' : labelColor,
                                fontSize: 13,
                                fontWeight: 600,
                                border: `1px solid ${bgKind === b.id ? '#18140F' : '#aa884033'}`,
                                cursor: 'pointer',
                            }}
                        >
                            רקע {b.label}
                        </button>
                    ))}
                </div>

                {/* Editor */}
                <div
                    style={{
                        background: bgKind === 'dark' ? '#2a2318' : '#fff',
                        border: `1px solid ${bgKind === 'dark' ? '#3d2e1a' : '#e7dfce'}`,
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 32,
                        display: 'grid',
                        gridTemplateColumns: '1fr 2fr 1fr',
                        gap: 12,
                    }}
                >
                    <Field label='שם' value={entry.name} onChange={v => update('name', v)} dark={bgKind === 'dark'} />
                    <Field
                        label='ברכה'
                        value={entry.text}
                        onChange={v => update('text', v)}
                        textarea
                        dark={bgKind === 'dark'}
                    />
                    <Field
                        label='קישור לתמונה'
                        value={entry.imageUrl}
                        onChange={v => update('imageUrl', v)}
                        dark={bgKind === 'dark'}
                        ltr
                    />
                </div>

                {/* Layout grid */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(auto-fill, minmax(${RENDER_SIZE + 32}px, 1fr))`,
                        gap: 24,
                        justifyItems: 'center',
                    }}
                >
                    {LAYOUTS.map(({ id, label, description, Component }) => (
                        <article
                            key={id}
                            style={{
                                width: RENDER_SIZE + 32,
                                background: bgKind === 'dark' ? '#2a2318' : '#fff',
                                border: `1px solid ${bgKind === 'dark' ? '#3d2e1a' : '#e7dfce'}`,
                                borderRadius: 16,
                                padding: 16,
                                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                            }}
                        >
                            {/* Tile header */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h3
                                        style={{
                                            fontSize: 17,
                                            fontWeight: 800,
                                            margin: 0,
                                            color: labelColor,
                                        }}
                                    >
                                        {label}
                                    </h3>
                                    <code
                                        style={{
                                            fontSize: 11,
                                            color: subColor,
                                            fontFamily: 'monospace',
                                            background: bgKind === 'dark' ? '#18140F' : '#faf6ec',
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                        }}
                                    >
                                        {id}
                                    </code>
                                </div>
                                <p
                                    style={{
                                        margin: '4px 0 0 0',
                                        fontSize: 12,
                                        color: subColor,
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {description}
                                </p>
                            </div>

                            {/* The actual layout */}
                            <div
                                style={{
                                    width: RENDER_SIZE,
                                    height: RENDER_SIZE,
                                    margin: '0 auto',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                    overflow: 'hidden',
                                }}
                            >
                                <Component entry={entry} scaledWidth={RENDER_SIZE} scaledHeight={RENDER_SIZE} />
                            </div>
                        </article>
                    ))}
                </div>

                <footer style={{ marginTop: 40, textAlign: 'center', color: subColor, fontSize: 12 }}>
                    Playground פנימי. לא לשיתוף ציבורי. הקבצים: <code>src/components/PageLayouts/PageLayouts.jsx</code>
                </footer>
            </div>
        </div>
    )
}

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, textarea, ltr, dark }) {
    const inputBg = dark ? '#18140F' : '#faf6ec'
    const inputColor = dark ? '#f0ebe3' : '#2a2318'
    const inputBorder = dark ? '#3d2e1a' : '#e7dfce'
    const Tag = textarea ? 'textarea' : 'input'
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: dark ? '#aa8840' : '#7a6548', letterSpacing: '0.05em' }}>
                {label.toUpperCase()}
            </span>
            <Tag
                value={value}
                onChange={e => onChange(e.target.value)}
                dir={ltr ? 'ltr' : 'rtl'}
                rows={textarea ? 3 : undefined}
                style={{
                    background: inputBg,
                    color: inputColor,
                    border: `1px solid ${inputBorder}`,
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: textarea ? 'vertical' : 'none',
                    minHeight: textarea ? 70 : undefined,
                }}
            />
        </label>
    )
}
