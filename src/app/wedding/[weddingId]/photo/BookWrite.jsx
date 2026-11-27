'use client'

// "Straight into the book": the guest sees their own page and fills it in. Three
// large buttons (blessing, photo, name) each open a drawer; the page above
// updates as they type. This file only draws: the words, the photo, the camera
// and the sending all live in the blessing page (photo/page.js).

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import dynamic from 'next/dynamic'
import Cropper from 'react-easy-crop'
import { Noto_Serif_Hebrew } from 'next/font/google'
import { frankRuhl } from '@/app/fonts'
import { charactersLeft, filledParts, nextToFill, previewEntry, sendState } from '@/lib/bookWrite'
import css from './book-write.module.css'

const serif = Noto_Serif_Hebrew({ subsets: ['hebrew', 'latin'], weight: ['700', '900'], display: 'swap', preload: false })
const BookSheet = dynamic(() => import('./BookSheet'), { ssr: false, loading: () => null })

const PATHS = {
    text: 'M4 20c4-1 6.5-3.5 9-6l6.5-7.5a2.1 2.1 0 0 0-3-3L9 10c-2.5 2.5-4 5.5-5 10Zm9.5-13.5 4 4',
    photo: 'M6.8 6.2A2.3 2.3 0 0 1 5.2 7.2l-1.1.2C3 7.6 2.25 8.5 2.25 9.6V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.6c0-1.1-.75-2-1.8-2.2l-1.14-.17a2.3 2.3 0 0 1-1.64-1.05l-.82-1.32a2.2 2.2 0 0 0-1.74-1.04 49 49 0 0 0-5.23 0 2.2 2.2 0 0 0-1.74 1.04ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    name: 'M3 17c3-1 4-9 6-9s0 8 2 8 3-4 4-4 .5 3 2 3 2-1 4-2M3 21h18',
    gallery: 'M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2ZM4 17l5-5 4 4 2.5-2.5L20 18M16.9 9a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0Z',
    send: 'M20 4 3.5 11.2l6.2 2.1M20 4l-5 16-5.3-6.7M20 4 9.7 13.3V19l3-3.2',
}
const Icon = ({ name }) => (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
        <path d={PATHS[name]} />
    </svg>
)

export default function BookWrite({
    t, locale = 'he', dir = 'rtl', who = '', formCopy, bookDoc, twinsPicker = null, extra = null, hasGreeting = false,
    name, setName, text, setText, maxChars,
    photoUrl, photoRequired, photoNudge, missingPhoto, onPick, onClearPhoto, applyCrop,
    cameraOpen, setCameraOpen, setCameraFacing, liveVideoRef, takePhoto, cameraFacing,
    isUpload, wholePhoto, crop, setCrop, zoom, setZoom, setCroppedAreaPixels,
    submitting, onSubmit,
}) {
    const [drawer, setDrawer] = useState('') // '' | 'text' | 'photo' | 'name'
    const [typing, setTyping] = useState(false)
    const [size, setSize] = useState(0)
    const [drawerHeight, setDrawerHeight] = useState(320)
    const stageRef = useRef(null)
    const drawerRef = useRef(null)
    const textRef = useRef(null)
    const nameRef = useRef(null)

    const filled = filledParts({ text, name, photoUrl })
    const send = sendState({ text, submitting })
    // the page may trail the keyboard by a frame; typing never waits for it
    const pageText = useDeferredValue(text)
    const pageName = useDeferredValue(name)
    const entry = useMemo(() => previewEntry({ name: pageName, text: pageText, photoUrl }), [pageName, pageText, photoUrl])

    // the page is as large as the room it is given
    useEffect(() => {
        const stage = stageRef.current
        if (!stage || typeof ResizeObserver === 'undefined') return undefined
        const watch = new ResizeObserver(([box]) => {
            const { width, height } = box.contentRect
            setSize(Math.floor(Math.max(120, Math.min(width - 20, height - 14, 460))))
        })
        watch.observe(stage)
        return () => watch.disconnect()
    }, [])

    useEffect(() => {
        const panel = drawerRef.current
        if (!drawer || !panel || typeof ResizeObserver === 'undefined') return undefined
        const watch = new ResizeObserver(() => setDrawerHeight(panel.offsetHeight))
        watch.observe(panel)
        return () => watch.disconnect()
    }, [drawer])

    // Rendered and focused inside the tap itself: a phone opens its keyboard
    // only for a focus that comes straight from the finger.
    const open = part => {
        flushSync(() => setDrawer(part))
        if (part === 'text') textRef.current?.focus()
        if (part === 'name') nameRef.current?.focus()
    }
    const close = useCallback(async () => {
        document.activeElement?.blur?.()
        setTyping(false)
        if (drawer === 'photo') {
            setCameraOpen(false)
            await applyCrop()
        }
        setDrawer('')
    }, [drawer, applyCrop, setCameraOpen])

    const focus = () => setTyping(true)
    const blur = () =>
        setTimeout(() => {
            if (![textRef.current, nameRef.current].includes(document.activeElement)) setTyping(false)
        }, 200)
    // tapping "done" or a sentence leaves the keyboard open until the tap lands
    const hold = e => { if (typing) e.preventDefault() }

    const addStarter = words => {
        const joined = `${text.trim() ? `${text.trim()} ` : ''}${words}`
        setText(joined.slice(0, maxChars))
    }

    const title = who ? t('bookTitleFor', { name: who }) : t('bookTitle')
    const ask = formCopy?.blessingLabel || (who ? t('bookAskFor', { name: who }) : t('bookAsk'))
    const tools = [
        { part: 'text', icon: 'text', label: t('bookToolText') },
        { part: 'photo', icon: 'photo', label: t('bookToolPhoto'), note: photoRequired ? t('momentPhotoRequired') : '' },
        { part: 'name', icon: 'name', label: t('bookToolName') },
    ]

    return (
        <div
            dir={dir}
            className={[css.root, drawer ? css.editing : '', typing ? css.typing : '', hasGreeting ? css.greeted : ''].join(' ')}
            style={{ '--bw-serif': serif.style.fontFamily, '--bw-book': frankRuhl.style.fontFamily, '--bw-drawer': `${drawerHeight}px` }}
        >
            <header className={css.head}>
                <h1>{title}</h1>
                <p>{formCopy?.momentSubtitle || t('bookHint')}</p>
                {twinsPicker}
            </header>

            <div ref={stageRef} className={css.stage}>
                <div
                    role='button'
                    tabIndex={0}
                    aria-label={t('bookHint')}
                    className={css.page}
                    style={{ width: size || undefined, height: size || undefined }}
                    onClick={() => !drawer && open(nextToFill(filled))}
                    onKeyDown={e => { if (!drawer && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(nextToFill(filled)) } }}
                >
                    <div className={css.sheet}>{size > 0 && <BookSheet entry={entry} bookDoc={bookDoc} locale={locale} size={size} />}</div>
                    {!filled.text && !filled.photo && (
                        <div className={css.empty}>
                            <Icon name='photo' />
                            <span>{t('bookEmptyPage')}</span>
                        </div>
                    )}
                </div>
            </div>

            {!drawer && (
                <div className={css.dock}>
                    <div className={css.tools}>
                        {tools.map(tool => (
                            <button
                                key={tool.part}
                                type='button'
                                className={`${css.tool} ${tool.part === 'photo' && photoNudge && missingPhoto ? css.wanted : ''}`}
                                onClick={() => open(tool.part)}
                            >
                                <span>
                                    <Icon name={tool.icon} />
                                    {tool.label}
                                    {tool.note && <small>{tool.note}</small>}
                                </span>
                                {filled[tool.part] && <em aria-hidden='true'>✓</em>}
                            </button>
                        ))}
                    </div>
                    {photoNudge && missingPhoto && <p role='alert' className={css.alert}>{t('photoRequiredNudge')}</p>}
                    <button type='button' className={css.cta} disabled={send.disabled} onClick={onSubmit}>
                        <Icon name='send' />
                        {send.label === 'bookSend' ? formCopy?.momentSubmit || t('bookSend') : t(send.label)}
                    </button>
                    <p className={css.trust}>{formCopy?.momentSecurityNote || t('securityNote')}</p>
                </div>
            )}

            {extra && !drawer && <div className={css.extra}>{extra}</div>}

            {drawer && (
                <>
                    <div className={css.scrim} onClick={close} aria-hidden='true' />
                    <div ref={drawerRef} className={css.drawer} role='dialog' aria-modal='true'>
                        {drawer === 'text' && (
                            <>
                                <h2>{ask}</h2>
                                <textarea
                                    ref={textRef}
                                    value={text}
                                    maxLength={maxChars}
                                    placeholder={formCopy?.blessingPlaceholder || t('bookTextPlaceholder')}
                                    aria-label={ask}
                                    onChange={e => setText(e.target.value)}
                                    onFocus={focus}
                                    onBlur={blur}
                                />
                                <div className={css.meter}>{t('bookCharsLeft', { count: charactersLeft(text, maxChars) })}</div>
                                <div className={css.chips}>
                                    {t('bookStarters').split('|').map(words => (
                                        <button key={words} type='button' onPointerDown={hold} onClick={() => addStarter(words)}>{words}</button>
                                    ))}
                                </div>
                            </>
                        )}

                        {drawer === 'name' && (
                            <>
                                <h2>{formCopy?.nameLabel || t('bookNameHeading')}</h2>
                                <input
                                    ref={nameRef}
                                    type='text'
                                    autoComplete='name'
                                    maxLength={60}
                                    value={name}
                                    placeholder={formCopy?.namePlaceholder || t('bookNamePlaceholder')}
                                    aria-label={formCopy?.nameLabel || t('bookNameHeading')}
                                    onChange={e => setName(e.target.value)}
                                    onFocus={focus}
                                    onBlur={blur}
                                    onKeyDown={e => { if (e.key === 'Enter') close() }}
                                />
                            </>
                        )}

                        {drawer === 'photo' && (
                            <>
                                <h2>{formCopy?.momentPhotoTitle || t('bookPhotoHeading')}</h2>
                                {cameraOpen && (
                                    <div className={css.view}>
                                        <video ref={liveVideoRef} autoPlay playsInline muted style={{ objectFit: wholePhoto ? 'contain' : 'cover', transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }} />
                                        <div className={css.shutter}>
                                            <button type='button' className={css.round} aria-label={t('bookClose')} onClick={() => setCameraOpen(false)}>✕</button>
                                            <button type='button' className={css.snap} aria-label={formCopy?.momentTakeNow || t('momentTakeNow')} onClick={takePhoto}><i /></button>
                                            <button type='button' className={css.round} aria-label='↻' onClick={() => setCameraFacing(prev => (prev === 'user' ? 'environment' : 'user'))}>↻</button>
                                        </div>
                                    </div>
                                )}
                                {!cameraOpen && photoUrl && (
                                    <div className={css.view}>
                                        {isUpload && !wholePhoto ? (
                                            <Cropper image={photoUrl} crop={crop} zoom={zoom} aspect={4 / 3} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)} />
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={photoUrl} alt='' />
                                        )}
                                    </div>
                                )}
                                {!cameraOpen && !photoUrl && (
                                    <>
                                        <button type='button' className={css.cta} onClick={() => setCameraOpen(true)}>
                                            <Icon name='photo' />
                                            {formCopy?.momentTakeNow || t('momentTakeNow')}
                                        </button>
                                        <label className={css.second}>
                                            <span>
                                                <Icon name='gallery' />
                                                {formCopy?.momentChooseGallery || t('momentChooseGallery')}
                                            </span>
                                            <input type='file' accept='image/*' onChange={e => { const file = e.target.files?.[0]; if (file) onPick(file); e.target.value = '' }} />
                                        </label>
                                    </>
                                )}
                            </>
                        )}

                        {drawer === 'photo' && !photoUrl ? (
                            <button type='button' className={css.link} onClick={close}>{t('bookClose')}</button>
                        ) : (
                            <>
                                {!cameraOpen && <button type='button' className={`${css.cta} ${css.done}`} onPointerDown={hold} onClick={close}>{t('bookDone')}</button>}
                                {drawer === 'photo' && !cameraOpen && <button type='button' className={css.link} onClick={onClearPhoto}>{t('replacePhoto')}</button>}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
