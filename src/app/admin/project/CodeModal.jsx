'use client'

// A small code reader for the project page: the real Python source on
// one side, a guided walkthrough on the other. Click a step and the code
// scrolls to (and tints) the lines it talks about; click a line and the
// step that covers it lights up. No editor, no library - the page is a
// presentation, and 600 lines of Python do not need Monaco.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, ChevronRight, ChevronLeft } from 'lucide-react'

const KEYWORDS = new Set([
    'def', 'return', 'if', 'elif', 'else', 'for', 'in', 'not', 'and', 'or', 'import', 'from', 'as',
    'class', 'try', 'except', 'raise', 'with', 'pass', 'continue', 'break', 'lambda', 'None', 'True',
    'False', 'is', 'while', 'yield', 'global', 'del', 'assert',
])

// Tiny Python tokenizer, one line at a time, carrying docstring state
// across lines. Good enough to make the structure readable; not a parser.
function tokenizeLine(line, state) {
    const out = []
    let i = 0
    const push = (kind, text) => { if (text) out.push({ kind, text }) }

    while (i < line.length) {
        if (state.doc) {
            const end = line.indexOf(state.doc, i)
            if (end < 0) { push('str', line.slice(i)); i = line.length; break }
            push('str', line.slice(i, end + 3)); i = end + 3; state.doc = null
            continue
        }
        const ch = line[i]
        // The hash is its own token so it stays on the left even when the
        // comment text is Hebrew and renders right-to-left.
        if (ch === '#') { push('hash', '#'); push('cmt', line.slice(i + 1)); i = line.length; break }
        const tri = line.slice(i, i + 3)
        if (tri === '"""' || tri === "'''") {
            const end = line.indexOf(tri, i + 3)
            if (end < 0) { push('str', line.slice(i)); state.doc = tri; i = line.length; break }
            push('str', line.slice(i, end + 3)); i = end + 3
            continue
        }
        if (ch === '"' || ch === "'") {
            let j = i + 1
            while (j < line.length && line[j] !== ch) { if (line[j] === '\\') j++; j++ }
            // f-strings: the prefix letter sits right before the quote.
            push('str', line.slice(i, j + 1)); i = j + 1
            continue
        }
        if (ch === '@' && /^@\w/.test(line.slice(i))) {
            const m = line.slice(i).match(/^@[\w.]+/)
            push('dec', m[0]); i += m[0].length
            continue
        }
        if (/[A-Za-z_]/.test(ch)) {
            const m = line.slice(i).match(/^[A-Za-z_]\w*/)
            const word = m[0]
            // String prefix (f"...", r"...") - let the string branch take it.
            const next = line[i + word.length]
            if (word.length === 1 && /[fFrRbB]/.test(word) && (next === '"' || next === "'")) {
                push('str', word); i += 1
                continue
            }
            push(KEYWORDS.has(word) ? 'kw' : 'id', word); i += word.length
            continue
        }
        if (/[0-9]/.test(ch)) {
            const m = line.slice(i).match(/^\d+(\.\d+)?/)
            push('num', m[0]); i += m[0].length
            continue
        }
        push('op', ch); i += 1
    }
    return out
}

const COLOR = {
    kw: '#c792ea', str: '#c3e88d', cmt: '#8a7f70', hash: '#8a7f70', dec: '#ffcb6b', num: '#f78c6c', id: '#e8e0d0', op: '#b8ae9c',
}

function useHighlighted(code) {
    return useMemo(() => {
        const state = { doc: null }
        return code.split('\n').map(line => tokenizeLine(line, state))
    }, [code])
}

export default function CodeModal({ file, code, onClose }) {
    const lines = useHighlighted(code || '')
    const steps = file?.walkthrough || []
    const [active, setActive] = useState(0)
    const [copied, setCopied] = useState(false)
    const codeRef = useRef(null)
    const lineRefs = useRef({})

    // Escape closes; the page behind must not scroll while this is open.
    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') setActive(a => Math.min(steps.length - 1, a + 1))
            if (e.key === 'ArrowUp') setActive(a => Math.max(0, a - 1))
        }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [onClose, steps.length])

    // Scroll the code to the active step's first line, leaving a little
    // room above so the line is not glued to the top edge.
    useEffect(() => {
        const step = steps[active]
        const el = step && lineRefs.current[step.from]
        const box = codeRef.current
        if (!el || !box) return
        box.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' })
    }, [active, steps])

    const stepFor = n => steps.findIndex(s => n >= s.from && n <= s.to)
    const current = steps[active]

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code || '')
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard is a nicety */ }
    }

    if (!file) return null

    return (
        <div className='fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6' dir='rtl'
            role='dialog' aria-modal='true' aria-label={file.name}>
            <div className='absolute inset-0 bg-[#2a2014]/60 backdrop-blur-[3px]' onClick={onClose} />

            <div className='relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[#ead9b3] bg-[#fffdf8] shadow-2xl'>
                {/* Header */}
                <div className='flex flex-wrap items-center gap-3 border-b border-[#ead9b3] bg-white px-5 py-3'>
                    <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                            <span className='font-mono text-[15px] font-extrabold text-[#3d2e1a]' dir='ltr'>{file.name}</span>
                            <span className='text-[11px] tabular-nums text-[#a89378]'>{lines.length} שורות</span>
                        </div>
                        <div className='text-[12.5px] text-[#7a6a52]'>{file.role}</div>
                    </div>
                    <button onClick={copy}
                        className='inline-flex items-center gap-1.5 rounded-xl border border-[#ead9b3] px-3 py-2 text-xs font-bold text-[#7a6a52] hover:bg-[#f6efe0]'>
                        {copied ? <Check size={13} className='text-emerald-600' /> : <Copy size={13} />}
                        {copied ? 'הועתק' : 'העתק קוד'}
                    </button>
                    <button onClick={onClose} aria-label='סגור'
                        className='rounded-xl border border-[#ead9b3] p-2 text-[#7a6a52] hover:bg-[#f6efe0]'>
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className='grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(260px,34%)_1fr]'>
                    {/* Walkthrough */}
                    <aside className='flex min-h-0 flex-col border-b border-[#ead9b3] md:border-b-0 md:border-l'>
                        <p className='px-4 pt-4 text-[12.5px] leading-relaxed text-[#5a4b35]'>{file.summary}</p>
                        <div className='mt-3 flex items-center justify-between px-4 text-[11px] font-semibold tracking-wide text-[#a89378]'>
                            <span>מדריך קריאה · {steps.length} תחנות</span>
                            <span className='hidden md:inline'>↑ ↓ לניווט</span>
                        </div>
                        <ol className='min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-2'>
                            {steps.map((s, i) => {
                                const on = i === active
                                return (
                                    <li key={s.from}>
                                        <button onClick={() => setActive(i)}
                                            className='w-full rounded-2xl border p-3 text-right transition-colors'
                                            style={on
                                                ? { background: '#3d2e1a', borderColor: '#3d2e1a', color: '#fff' }
                                                : { background: '#fff', borderColor: '#ead9b3', color: '#3d2e1a' }}>
                                            <div className='flex items-center justify-between gap-2'>
                                                <span className='text-[13px] font-extrabold'>{i + 1}. {s.title}</span>
                                                <span className='font-mono text-[10.5px] tabular-nums opacity-70' dir='ltr'>
                                                    {s.from === s.to ? s.from : `${s.from}–${s.to}`}
                                                </span>
                                            </div>
                                            {on && <p className='mt-1.5 text-[12px] leading-relaxed opacity-90'>{s.text}</p>}
                                        </button>
                                    </li>
                                )
                            })}
                        </ol>
                        <div className='flex items-center justify-between border-t border-[#ead9b3] bg-white px-4 py-2'>
                            <button onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0}
                                className='inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[#7a6a52] disabled:opacity-30'>
                                <ChevronRight size={14} /> הקודם
                            </button>
                            <span className='text-[11px] tabular-nums text-[#a89378]'>{active + 1} / {steps.length}</span>
                            <button onClick={() => setActive(a => Math.min(steps.length - 1, a + 1))} disabled={active >= steps.length - 1}
                                className='inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[#7a6a52] disabled:opacity-30'>
                                הבא <ChevronLeft size={14} />
                            </button>
                        </div>
                    </aside>

                    {/* Code */}
                    <div ref={codeRef} className='min-h-0 overflow-auto bg-[#1e1912]' dir='ltr'>
                        <pre className='m-0 min-w-max px-0 py-3 text-[12.5px] leading-[1.6]'
                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' }}>
                            {lines.map((tokens, idx) => {
                                const n = idx + 1
                                const inActive = current && n >= current.from && n <= current.to
                                return (
                                    <div key={n} ref={el => { lineRefs.current[n] = el }}
                                        onClick={() => { const s = stepFor(n); if (s >= 0) setActive(s) }}
                                        className='flex cursor-pointer'
                                        style={{
                                            // globals.css sets a font on '*'; inherit re-attaches every
                                            // level of this tree to the monospace font on the <pre>.
                                            fontFamily: 'inherit',
                                            background: inActive ? 'rgba(255, 203, 107, 0.12)' : 'transparent',
                                            boxShadow: inActive ? 'inset 3px 0 0 #ffcb6b' : 'none',
                                        }}>
                                        <span className='w-12 shrink-0 select-none pr-3 text-right tabular-nums'
                                            style={{ color: inActive ? '#ffcb6b' : '#6b6152', fontFamily: 'inherit' }}>{n}</span>
                                        <span className='whitespace-pre pr-6' style={{ opacity: current && !inActive ? 0.55 : 1, fontFamily: 'inherit' }}>
                                            {tokens.length === 0 ? ' ' : tokens.map((t, k) => (
                                                // Hebrew inside comments and strings keeps its own reading
                                                // direction (and its punctuation on the right side) while
                                                // the code around it stays left-to-right.
                                                <span key={k} style={{
                                                    color: COLOR[t.kind],
                                                    fontFamily: 'inherit',
                                                    fontStyle: t.kind === 'cmt' ? 'italic' : 'normal',
                                                    unicodeBidi: t.kind === 'cmt' || t.kind === 'str' ? 'plaintext' : 'normal',
                                                }}>{t.text}</span>
                                            ))}
                                        </span>
                                    </div>
                                )
                            })}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    )
}
