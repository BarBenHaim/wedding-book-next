'use client'

// The bottom sheet of "see how it will look in the book": the guest's own words and
// photo set on a real book page (the same BookPageTemplate the printed book uses),
// in the owner's own interior design. Read-only: nothing here is saved or sent.
//
// This file is loaded only when the sheet is opened (see LivePagePreviewButton), so the
// form itself carries none of the book renderer's weight on a weak connection.

import { useEffect, useMemo, useRef, useState } from 'react'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import defaultStyle, { resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'

export const SHEET_STR = {
    he: {
        heading: 'ככה הברכה שלך תיראה בספר',
        note: 'זו תצוגה מקדימה. הספר מודפס בדיוק ככה, עם הברכות של כולם.',
        back: 'חזרה לעריכה',
        empty: 'כתבו כמה מילים כדי לראות אותן על העמוד',
    },
    en: {
        heading: 'Here’s how your blessing will look in the book',
        note: 'This is a preview. The printed book looks exactly like this, with everyone’s blessings.',
        back: 'Back to editing',
        empty: 'Write a few words to see them on the page',
    },
    es: {
        heading: 'Así se verá tu bendición en el libro',
        note: 'Es una vista previa. El libro impreso se ve exactamente así, con las bendiciones de todos.',
        back: 'Volver a editar',
        empty: 'Escribe unas palabras para verlas en la página',
    },
    it: {
        heading: 'Ecco come apparirà la tua benedizione nel libro',
        note: 'È un’anteprima. Il libro stampato è esattamente così, con le benedizioni di tutti.',
        back: 'Torna a modificare',
        empty: 'Scrivi qualche parola per vederla sulla pagina',
    },
}

export default function PreviewSheet({ entry, bookDoc, locale = 'he', accent = '#14183A', onClose }) {
    const t = SHEET_STR[locale] || SHEET_STR.he
    const rtl = locale === 'he'
    const backRef = useRef(null)
    const [size, setSize] = useState(300)

    // the owner's own interior design, else the book's default
    const style = useMemo(() => ({ ...defaultStyle, ...(resolveInteriorDesign(bookDoc) || {}), locale }), [bookDoc, locale])

    useEffect(() => {
        const measure = () => setSize(Math.max(220, Math.min(340, Math.floor(window.innerWidth - 64))))
        measure()
        window.addEventListener('resize', measure)
        const onKey = e => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        // keep the page behind from scrolling while the sheet is open
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        backRef.current?.focus()
        return () => {
            window.removeEventListener('resize', measure)
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = prev
        }
    }, [onClose])

    const hasText = Boolean((entry?.text || '').trim())

    return (
        <div
            role='dialog'
            aria-modal='true'
            aria-label={t.heading}
            dir={rtl ? 'rtl' : 'ltr'}
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                background: 'rgba(20,24,58,0.56)', WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)',
                animation: 'wtSheetFade .22s ease-out',
            }}
        >
            <style>{`@keyframes wtSheetFade{from{opacity:0}to{opacity:1}}@keyframes wtSheetUp{from{transform:translateY(32px);opacity:0}to{transform:none;opacity:1}}`}</style>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 440, background: '#FBF8F2', borderRadius: '26px 26px 0 0',
                    padding: '22px 20px calc(22px + env(safe-area-inset-bottom))', textAlign: 'center',
                    boxShadow: '0 -24px 60px -20px rgba(20,24,58,.5)', animation: 'wtSheetUp .28s cubic-bezier(.2,.8,.2,1)',
                    maxHeight: '92dvh', overflowY: 'auto',
                }}
            >
                <div aria-hidden='true' style={{ width: 42, height: 4, borderRadius: 4, background: 'rgba(20,24,58,.18)', margin: '-8px auto 14px' }} />
                <h2 style={{ margin: 0, fontSize: 19, lineHeight: 1.3, fontWeight: 800, color: '#14183A' }}>{t.heading}</h2>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0 12px' }}>
                    <div
                        style={{
                            width: size, height: size, borderRadius: 6, overflow: 'hidden', position: 'relative',
                            boxShadow: '0 26px 40px -22px rgba(20,24,58,.55), 0 2px 6px rgba(20,24,58,.18), 0 0 0 1px rgba(20,24,58,.08)',
                            transform: 'rotate(-1.2deg)', background: '#fff',
                        }}
                    >
                        <BookPageTemplate entry={entry} styleSettings={style} scaledWidth={size} scaledHeight={size} />
                        {!hasText && (
                            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, color: '#6C6F86', fontSize: 14, background: 'rgba(255,255,255,.72)' }}>
                                {t.empty}
                            </div>
                        )}
                    </div>
                </div>

                <p style={{ margin: '0 auto 18px', maxWidth: 320, fontSize: 13.5, lineHeight: 1.55, color: '#6C6F86' }}>{t.note}</p>

                <button
                    ref={backRef}
                    type='button'
                    onClick={onClose}
                    style={{
                        width: '100%', minHeight: 52, border: 0, borderRadius: 16, cursor: 'pointer', color: '#fff', fontSize: 16.5, fontWeight: 800,
                        background: `linear-gradient(180deg, ${accent} 0%, ${accent} 100%)`,
                        boxShadow: '0 14px 26px -14px rgba(20,24,58,.6), inset 0 1px 0 rgba(255,255,255,.22)',
                    }}
                >
                    {t.back}
                </button>
            </div>
        </div>
    )
}
