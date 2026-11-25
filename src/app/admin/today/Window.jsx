'use client'
// The framed window that opens over the today screen. A native <dialog>, so
// focus, Escape and the backdrop behave without extra code.

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import w from './windows.module.css'

const CLOSE_MS = 200

export default function Window({ title, subtitle, onClose, children }) {
    const dialog = useRef(null)
    const [closing, setClosing] = useState(false)
    // A text selection dragged out of the window must not close it.
    const fromBackdrop = useRef(false)

    useEffect(() => {
        const node = dialog.current
        if (node && !node.open) {
            node.showModal()
            // Focus starts on the window, not on the close button.
            node.focus()
        }
        // The page behind stays where it was.
        const before = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = before }
    }, [])

    const close = useCallback(() => {
        setClosing(true)
        setTimeout(onClose, CLOSE_MS)
    }, [onClose])

    return (
        <dialog
            ref={dialog} tabIndex={-1} className={w.dialog} data-closing={closing || undefined} aria-label={title}
            onCancel={event => { event.preventDefault(); close() }}
            onPointerDown={event => { fromBackdrop.current = event.target === dialog.current }}
            onClick={event => { if (fromBackdrop.current && event.target === dialog.current) close() }}
        >
            <div className={w.sheet}>
                <header className={w.banner}>
                    <button type='button' className={w.close} onClick={close} aria-label='סגירה'><X size={22} aria-hidden='true' /></button>
                    <h2>{title}</h2>
                    <div className={w.flourish} aria-hidden='true' />
                    {subtitle && <p>{subtitle}</p>}
                </header>
                <div className={w.body}>{children}</div>
            </div>
        </dialog>
    )
}

export function Notice({ tone = 'info', children }) {
    if (!children) return null
    return <p className={w.notice} data-tone={tone} role={tone === 'bad' ? 'alert' : 'status'}>{children}</p>
}

export function Switch({ on, onChange, disabled, label }) {
    return (
        <button type='button' role='switch' aria-checked={on === true} aria-label={label} className={w.switch} disabled={disabled} onClick={() => onChange(!on)}>
            <span>{on ? 'פעיל' : 'כבוי'}</span><i />
        </button>
    )
}
