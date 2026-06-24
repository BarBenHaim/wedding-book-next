'use client'

// /wedding/[weddingId]/edit/[entryId] — a returning guest edits the blessing
// (text + name) and/or the photo they already submitted from this phone.
//
// Reached from the "Blessings you sent from this device" panel (see
// MySubmissions). Reading the entry is allowed client-side (same as the
// gallery); SAVING goes through /api/guest/update-entry, because the security
// rules forbid client-side entry updates / photo overwrites (Admin SDK only).
//
// This screen is purely additive — it never blocks adding NEW blessings; a
// "write another blessing" link sits right on it.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import imageCompression from 'browser-image-compression'
import { normalizeLocale } from '@/i18n/locales'
import { updateSubmissionMeta } from '@/lib/mySubmissions'

const COMPRESS = { maxSizeMB: 1.5, maxWidthOrHeight: 2560, initialQuality: 0.92, useWebWorker: true }

const STR = {
    he: {
        title: 'עריכת הברכה שלך',
        sub: 'אפשר לעדכן את הברכה או להחליף את התמונה. אפשר גם להוסיף ברכה חדשה בנפרד.',
        name: 'שם',
        namePh: 'איך לקרוא לך?',
        blessing: 'הברכה',
        blessingPh: 'כתבו כאן את הברכה…',
        photo: 'תמונה',
        replace: 'החלף תמונה',
        addPhoto: 'הוסף תמונה',
        remove: 'הסר תמונה',
        undo: 'ביטול',
        save: 'שמור שינויים',
        saving: 'שומר…',
        saved: 'השינויים נשמרו ✓',
        savedSub: 'הברכה שלך עודכנה בספר.',
        addNew: 'להוסיף ברכה חדשה',
        notFound: 'הברכה לא נמצאה',
        notFoundSub: 'ייתכן שהקישור אינו תקף. אפשר לחזור ולכתוב ברכה חדשה.',
        loadErr: 'טעינה נכשלה. נסו שוב.',
        saveErr: 'השמירה נכשלה. נסו שוב.',
        loading: 'טוען…',
    },
    en: {
        title: 'Edit your blessing',
        sub: 'Update the text or replace the photo. You can also add a new blessing separately.',
        name: 'Name',
        namePh: 'What should we call you?',
        blessing: 'Your blessing',
        blessingPh: 'Write your blessing here…',
        photo: 'Photo',
        replace: 'Replace photo',
        addPhoto: 'Add photo',
        remove: 'Remove photo',
        undo: 'Undo',
        save: 'Save changes',
        saving: 'Saving…',
        saved: 'Changes saved ✓',
        savedSub: 'Your blessing has been updated in the book.',
        addNew: 'Add a new blessing',
        notFound: 'Blessing not found',
        notFoundSub: 'This link may be invalid. You can go back and write a new blessing.',
        loadErr: 'Failed to load. Please try again.',
        saveErr: 'Save failed. Please try again.',
        loading: 'Loading…',
    },
}

export default function EditBlessingPage() {
    const { weddingId, entryId } = useParams()
    const fileRef = useRef(null)

    const [status, setStatus] = useState('loading') // loading | ready | notfound | error
    const [locale, setLocale] = useState('he')
    const [maxChars, setMaxChars] = useState(210)
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [imageUrl, setImageUrl] = useState(null) // current saved photo
    const [removeImage, setRemoveImage] = useState(false)
    const [newBlob, setNewBlob] = useState(null) // compressed replacement
    const [newPreview, setNewPreview] = useState(null) // object URL for preview
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [wSnap, eSnap] = await Promise.all([
                    getDoc(doc(db, 'weddings', weddingId)),
                    getDoc(doc(db, 'weddings', weddingId, 'entries', entryId)),
                ])
                if (cancelled) return
                if (wSnap.exists()) {
                    const w = wSnap.data()
                    setLocale(normalizeLocale(w.locale) || 'he')
                    if (w.blessingMaxChars) setMaxChars(Number(w.blessingMaxChars) || 210)
                }
                if (!eSnap.exists()) {
                    setStatus('notfound')
                    return
                }
                const e = eSnap.data()
                setName(e.name && e.name !== 'אורח אנונימי' ? e.name : '')
                setText(e.text || '')
                setImageUrl(e.imageUrl || null)
                setStatus('ready')
            } catch (err) {
                console.error('[edit-blessing] load failed', err)
                if (!cancelled) setStatus('error')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId, entryId])

    const t = STR[locale] || STR.he
    const rtl = locale === 'he'

    async function onPickFile(ev) {
        const file = ev.target.files?.[0]
        ev.target.value = '' // allow re-picking the same file
        if (!file) return
        setError('')
        try {
            const compressed = await imageCompression(file, COMPRESS)
            if (newPreview) URL.revokeObjectURL(newPreview)
            setNewBlob(compressed)
            setNewPreview(URL.createObjectURL(compressed))
            setRemoveImage(false)
        } catch (err) {
            console.error('[edit-blessing] compress failed', err)
            setError(t.saveErr)
        }
    }

    function clearNewPhoto() {
        if (newPreview) URL.revokeObjectURL(newPreview)
        setNewBlob(null)
        setNewPreview(null)
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(r.result)
            r.onerror = reject
            r.readAsDataURL(blob)
        })
    }

    async function save() {
        if (saving) return
        setSaving(true)
        setError('')
        try {
            const payload = {
                weddingId,
                entryId,
                name: name.trim(),
                // Store as-typed; the book templates collapse whitespace
                // at display time unless preserveLineBreaks is set.
                text: text || '',
            }
            if (removeImage && !newBlob) {
                payload.removeImage = true
            } else if (newBlob) {
                payload.image = await blobToDataUrl(newBlob)
            }
            const res = await fetch('/api/guest/update-entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) throw new Error(data.error || 'save-failed')

            // Keep the cached "my submissions" preview in sync.
            updateSubmissionMeta(weddingId, entryId, { name: payload.name, text: payload.text || '' })
            if ('imageUrl' in data) setImageUrl(data.imageUrl)
            clearNewPhoto()
            setRemoveImage(false)
            setSaved(true)
        } catch (err) {
            console.error('[edit-blessing] save failed', err)
            setError(t.saveErr)
        } finally {
            setSaving(false)
        }
    }

    // ── Shell ──
    const shell = children => (
        <div
            dir={rtl ? 'rtl' : 'ltr'}
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '32px 16px',
                background:
                    'radial-gradient(120% 80% at 50% 0%, #fbf7ef 0%, #f3ead8 70%, #efe3cc 100%)',
                fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
        >
            <div style={{ width: '100%', maxWidth: 460 }}>{children}</div>
        </div>
    )

    if (status === 'loading') {
        return shell(<div style={{ textAlign: 'center', color: '#9a8763', paddingTop: 60 }}>{t.loading}</div>)
    }

    if (status === 'notfound' || status === 'error') {
        return shell(
            <div
                style={{
                    background: '#fffdf8',
                    border: '1px solid #e7dcc5',
                    borderRadius: 18,
                    padding: 28,
                    textAlign: 'center',
                }}
            >
                <div style={{ fontSize: 18, fontWeight: 700, color: '#6b5836', marginBottom: 8 }}>
                    {status === 'error' ? t.loadErr : t.notFound}
                </div>
                <div style={{ fontSize: 13, color: '#9a8763', marginBottom: 18, lineHeight: 1.6 }}>{t.notFoundSub}</div>
                <Link
                    href={`/wedding/${weddingId}/photo`}
                    style={{
                        display: 'inline-block',
                        background: '#c9a44e',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 14,
                        borderRadius: 10,
                        padding: '10px 22px',
                        textDecoration: 'none',
                    }}
                >
                    {t.addNew}
                </Link>
            </div>,
        )
    }

    if (saved) {
        return shell(
            <div
                style={{
                    background: '#fffdf8',
                    border: '1px solid #e7dcc5',
                    borderRadius: 18,
                    padding: 28,
                    textAlign: 'center',
                }}
            >
                <div style={{ fontSize: 40, marginBottom: 6 }}>🌿</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#6b5836', marginBottom: 6 }}>{t.saved}</div>
                <div style={{ fontSize: 13, color: '#9a8763', marginBottom: 20, lineHeight: 1.6 }}>{t.savedSub}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setSaved(false)}
                        style={{
                            background: '#fff',
                            color: '#6b5836',
                            border: '1px solid #d8c9a8',
                            fontWeight: 600,
                            fontSize: 14,
                            borderRadius: 10,
                            padding: '10px 20px',
                            cursor: 'pointer',
                        }}
                    >
                        {t.title}
                    </button>
                    <Link
                        href={`/wedding/${weddingId}/photo`}
                        style={{
                            background: '#c9a44e',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 14,
                            borderRadius: 10,
                            padding: '10px 20px',
                            textDecoration: 'none',
                        }}
                    >
                        {t.addNew}
                    </Link>
                </div>
            </div>,
        )
    }

    const showCurrent = imageUrl && !removeImage && !newPreview
    const labelStyle = { fontSize: 13, fontWeight: 700, color: '#6b5836', marginBottom: 6, display: 'block' }
    const fieldStyle = {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid #e0d4ba',
        borderRadius: 12,
        padding: '11px 13px',
        fontSize: 15,
        color: '#4a3f2c',
        background: '#fffdf8',
        outline: 'none',
    }

    return shell(
        <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#6b5836' }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: '#9a8763', marginTop: 6, lineHeight: 1.6 }}>{t.sub}</div>
            </div>

            <div
                style={{
                    background: '#fffdf8',
                    border: '1px solid #e7dcc5',
                    borderRadius: 18,
                    padding: 20,
                    boxShadow: '0 6px 22px rgba(120,96,60,0.08)',
                }}
            >
                {/* Name */}
                <label style={labelStyle}>{t.name}</label>
                <input
                    type='text'
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t.namePh}
                    maxLength={120}
                    style={{ ...fieldStyle, marginBottom: 16 }}
                />

                {/* Blessing */}
                <label style={labelStyle}>{t.blessing}</label>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value.slice(0, maxChars))}
                    placeholder={t.blessingPh}
                    maxLength={maxChars}
                    rows={5}
                    style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
                <div style={{ fontSize: 11, color: '#a89378', textAlign: rtl ? 'left' : 'right', marginTop: 4, marginBottom: 16 }}>
                    {text.length}/{maxChars}
                </div>

                {/* Photo */}
                <label style={labelStyle}>{t.photo}</label>
                <div
                    style={{
                        border: '1px dashed #d8c9a8',
                        borderRadius: 12,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        background: '#fcf8ef',
                    }}
                >
                    {(showCurrent || newPreview) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={newPreview || imageUrl}
                            alt=''
                            style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 10 }}
                        />
                    )}
                    {removeImage && !newPreview && (
                        <div style={{ fontSize: 13, color: '#9a8763', padding: '14px 0' }}>—</div>
                    )}

                    <input ref={fileRef} type='file' accept='image/*' onChange={onPickFile} style={{ display: 'none' }} />

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            type='button'
                            onClick={() => fileRef.current?.click()}
                            style={{
                                background: '#efe6d4',
                                color: '#6b5836',
                                border: '1px solid #ddcfb0',
                                fontWeight: 600,
                                fontSize: 13,
                                borderRadius: 9,
                                padding: '8px 16px',
                                cursor: 'pointer',
                            }}
                        >
                            {imageUrl || newPreview ? t.replace : t.addPhoto}
                        </button>

                        {newPreview ? (
                            <button
                                type='button'
                                onClick={clearNewPhoto}
                                style={{
                                    background: '#fff',
                                    color: '#9a6a4a',
                                    border: '1px solid #e3cdbf',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    borderRadius: 9,
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                }}
                            >
                                {t.undo}
                            </button>
                        ) : imageUrl && !removeImage ? (
                            <button
                                type='button'
                                onClick={() => setRemoveImage(true)}
                                style={{
                                    background: '#fff',
                                    color: '#9a6a4a',
                                    border: '1px solid #e3cdbf',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    borderRadius: 9,
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                }}
                            >
                                {t.remove}
                            </button>
                        ) : removeImage ? (
                            <button
                                type='button'
                                onClick={() => setRemoveImage(false)}
                                style={{
                                    background: '#fff',
                                    color: '#6b5836',
                                    border: '1px solid #ddcfb0',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    borderRadius: 9,
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                }}
                            >
                                {t.undo}
                            </button>
                        ) : null}
                    </div>
                </div>

                {error && (
                    <div style={{ marginTop: 14, color: '#b32424', fontSize: 13, textAlign: 'center' }}>{error}</div>
                )}

                {/* Save */}
                <button
                    type='button'
                    onClick={save}
                    disabled={saving}
                    style={{
                        marginTop: 18,
                        width: '100%',
                        background: saving ? '#d8c79a' : '#c9a44e',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 16,
                        borderRadius: 12,
                        padding: '13px 0',
                        border: 'none',
                        cursor: saving ? 'default' : 'pointer',
                    }}
                >
                    {saving ? t.saving : t.save}
                </button>
            </div>

            {/* Add-new escape hatch — editing never replaces adding more. */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Link href={`/wedding/${weddingId}/photo`} style={{ fontSize: 13, color: '#9a7b3e', textDecoration: 'underline' }}>
                    {t.addNew}
                </Link>
            </div>
        </div>,
    )
}
