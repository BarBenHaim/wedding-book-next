'use client'

// "See how it will look in the book": a small button under the blessing form that opens a
// sheet with the guest's own words on a real book page. The sheet (and with it the whole
// book renderer) is loaded on the first tap, never with the form, so it costs nothing on a
// weak connection. It reads state the form already has; it writes nothing and sends nothing.

import { useState } from 'react'
import dynamic from 'next/dynamic'

const PreviewSheet = dynamic(() => import('./PreviewSheet'), { ssr: false, loading: () => null })

const LABEL = {
    he: 'איך זה ייראה בספר',
    en: 'See it on a book page',
    es: 'Verlo en una página del libro',
    it: 'Vedilo su una pagina del libro',
}

export default function LivePagePreviewButton({ name, text, photoUrl, bookDoc, locale = 'he', color = '#8a6d40', border = 'rgba(201,164,78,.4)', background = 'rgba(255,255,255,.7)', accent }) {
    const [open, setOpen] = useState(false)
    if (!bookDoc) return null
    const ready = Boolean((text || '').trim())
    return (
        <>
            <button
                type='button'
                onClick={() => setOpen(true)}
                disabled={!ready}
                className='flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-0'
                style={{ color, border: `1px solid ${border}`, background, minHeight: 30, cursor: ready ? 'pointer' : 'default' }}
                aria-label={LABEL[locale] || LABEL.he}
            >
                <svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.9' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                    <path d='M3 5.5c2.7-1.4 5.7-1.4 9 0 3.3-1.4 6.3-1.4 9 0v13c-2.7-1.4-5.7-1.4-9 0-3.3-1.4-6.3-1.4-9 0z' />
                    <path d='M12 5.5v13' />
                </svg>
                {LABEL[locale] || LABEL.he}
            </button>
            {open && (
                <PreviewSheet
                    entry={{ id: 'live-preview', name: (name || '').trim(), text: text || '', imageUrl: photoUrl || null }}
                    bookDoc={bookDoc}
                    locale={locale}
                    accent={accent}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}
