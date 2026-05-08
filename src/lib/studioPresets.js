'use client'

// src/lib/studioPresets.js
//
// Single source of truth for the book design presets the couple sees on
// their viewer (and that the super-admin Studio at /admin/studio will
// edit/extend in upcoming commits).
//
// Presets are stored in Firestore as `studio_presets/{id}` so the Studio
// can CRUD them at runtime. Each preset carries STABLE keys for font /
// frame instead of build-hashed Next.js className / asset URLs — those
// resolve through this module's registries at render time. That means a
// preset doc written in build A still works after build B even if the
// underlying className hashes change.
//
// On first load the system presets (BUILTIN_PRESETS below) are seeded
// into Firestore via seedBuiltinPresetsIfMissing(). Until that runs,
// listPresets() falls back to the hardcoded array — so the viewer's
// preset picker always renders, even with an empty / unreachable
// Firestore.

import {
    collection, doc, getDocs, getDoc, setDoc, addDoc, deleteDoc,
    query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from './firebaseClient'
import { heebo, frankRuhl, secular, davidLibre, notoHebrew, gveretLevin, danaYad } from '@/app/fonts'

// ── Frame URL registry ───────────────────────────────────────────────
// Frames are next/image-imported PNGs from src/media/frames. Their
// resolved URLs (e.g. /_next/static/media/frame2.abc123.png) change on
// every build, so we never store the URL in Firestore — we store a
// stable id and resolve here. Adding a new frame: drop the file in
// src/media/frames, import it, add the entry below.
import frame1 from '../media/frames/frame1.png'
import frame2 from '../media/frames/frame2.png'
import frame3 from '../media/frames/frame3.png'
import frame4 from '../media/frames/frame4.png'

export const FRAMES_REGISTRY = {
    frame1: { id: 'frame1', label: 'מסגרת קלאסית', src: frame1.src },
    frame2: { id: 'frame2', label: 'מסגרת זהב', src: frame2.src },
    frame3: { id: 'frame3', label: 'מסגרת מינימלית', src: frame3.src },
    frame4: { id: 'frame4', label: 'מסגרת עדינה', src: frame4.src },
}

export const FRAME_IDS = Object.keys(FRAMES_REGISTRY)

// ── Texture URL registry ─────────────────────────────────────────────
// Textures live under public/textures/ — their URLs ARE stable (Next.js
// serves /public/* verbatim) so we can store them by URL. Listed here
// for the Studio's picker to show all options.
export const TEXTURES_REGISTRY = Array.from({ length: 9 }, (_, i) => ({
    id: `tex${i + 1}`,
    label: `מרקם ${i + 1}`,
    src: `/textures/tex${i + 1}.png`,
}))

// ── Backgrounds registry ─────────────────────────────────────────────
// Static page-background candidates. Curated — not every file in
// public/backgrounds/ is a valid page background (some are photo-page
// UI artwork like envelope.png / formbg.png). Studio backgrounds
// uploaded by super admins live in Firestore (collection
// `studio_backgrounds`) and the picker will merge both lists — that
// wires up in commit 5.
export const STATIC_BACKGROUNDS = [
    { id: 'wedding-bg', label: 'חתונה — לבן', src: '/backgrounds/wedding-bg.png', tags: ['wedding'] },
    { id: 'wedding-bg2', label: 'חתונה — עדין', src: '/backgrounds/wedding-bg2.png', tags: ['wedding'] },
    { id: 'weddingdesign1', label: 'חתונה — פרחוני', src: '/backgrounds/weddingdesign1.png', tags: ['wedding', 'romantic'] },
    { id: 'romanticgarden', label: 'גן רומנטי', src: '/backgrounds/romanticgarden.png', tags: ['wedding', 'romantic'] },
    { id: 'pokerbg', label: 'פוקר — לבד ירוק', src: '/backgrounds/pokerbg.png', tags: ['poker'] },
]

// ── Font registry ────────────────────────────────────────────────────
// next/font generates a hashed className per build, so we never store
// the className itself in Firestore — we store a stable key and resolve
// to the live font object here. Adding a new font: import in
// src/app/fonts.js, add it here.
export const FONTS_REGISTRY = {
    notoHebrew: { id: 'notoHebrew', label: 'Noto Hebrew', font: notoHebrew },
    frankRuhl: { id: 'frankRuhl', label: 'Frank Ruhl', font: frankRuhl },
    davidLibre: { id: 'davidLibre', label: 'David Libre', font: davidLibre },
    heebo: { id: 'heebo', label: 'Heebo', font: heebo },
    secular: { id: 'secular', label: 'Secular One', font: secular },
    gveretLevin: { id: 'gveretLevin', label: 'גברת לוין', font: gveretLevin },
    danaYad: { id: 'danaYad', label: 'דנה יד', font: danaYad },
}

export const FONT_IDS = Object.keys(FONTS_REGISTRY)

// ── BUILTIN PRESETS ──────────────────────────────────────────────────
// The 8 system presets that have shipped to couples since spring 2026.
// Stored in Firestore as ownerType:'system' (read-only in the Studio).
// Used as the fallback list when Firestore is empty / unreachable.
//
// Each preset's `values` object uses STABLE keys (`fontKey`, `frameId`)
// — not the built-className / build-URL the renderer needs. Use
// resolvePreset() below to expand to the runtime shape before passing
// to onChange / the renderer.
export const BUILTIN_PRESETS = [
    // ─── Original classic templates (do not edit) ────────────────────
    {
        id: 'system_classic',
        name: 'קלאסי',
        ownerType: 'system',
        preview: '#ffffff',
        values: {
            template: 'classic',
            backgroundColor: '#ffffff',
            fontKey: 'heebo',
            fontColor: '#000000',
            frameId: 'frame2',
            texture: null,
            fontSizePercent: 2.5,
            imageStyle: { width: 80, height: 70, borderRadius: 0 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        id: 'system_pastoral',
        name: 'פסטורלי',
        ownerType: 'system',
        preview: '#ffffff',
        values: {
            template: 'classic',
            backgroundColor: '#ffffff',
            fontKey: 'heebo',
            fontColor: '#000000',
            frameId: null,
            texture: '/textures/tex6.png',
            fontSizePercent: 2.5,
            imageStyle: { width: 80, height: 70, borderRadius: 0 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        id: 'system_champagne',
        name: 'שמפניה',
        ownerType: 'system',
        preview: '#fdf6ec',
        values: {
            template: 'classic',
            backgroundColor: '#fdf6ec',
            fontKey: 'heebo',
            fontColor: '#000000',
            texture: '/textures/tex1.png',
            frameId: 'frame1',
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 7.5,
            textMaxWidth: 70,
            imageMarginTop: 0,
        },
    },
    {
        id: 'system_garden',
        name: 'פרחי גן',
        ownerType: 'system',
        preview: '#c4b5ecff',
        values: {
            template: 'classic',
            backgroundColor: '#c4b5ecff',
            fontKey: 'heebo',
            fontColor: '#000000',
            texture: '/textures/tex3.png',
            frameId: null,
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65 },
            nameMarginTop: 4,
            textMaxWidth: 70,
            imageMarginTop: 2,
        },
    },
    {
        id: 'system_minimal',
        name: 'מינימלי',
        ownerType: 'system',
        preview: '#ffffff',
        values: {
            template: 'classic',
            backgroundColor: '#ffffff',
            fontKey: 'heebo',
            fontColor: '#000000',
            texture: null,
            frameId: 'frame4',
            fontSizePercent: 2.5,
            imageStyle: { width: 75, height: 65, borderRadius: 0 },
            nameMarginTop: 6,
            textMaxWidth: 70,
            imageMarginTop: 1,
        },
    },
    // ─── Vintage memory-book ─────────────────────────────────────────
    {
        id: 'system_polaroid_vintage',
        name: 'פולארויד וינטג׳',
        ownerType: 'system',
        preview: '#fcfaf6',
        values: {
            template: 'polaroid',
            backgroundColor: '#ffffff',
            fontKey: 'gveretLevin',
            fontColor: '#3d2e1a',
            texture: '/textures/tex5.png',
            textureOpacity: 0.9,
            frameId: null,
        },
    },
    {
        id: 'system_antique_gold',
        name: 'זהב עתיק',
        ownerType: 'system',
        preview: '#f7f1e3',
        values: {
            template: 'classic',
            backgroundColor: '#f7f1e3',
            fontKey: 'gveretLevin',
            fontColor: '#3d2e1a',
            texture: '/textures/tex9.png',
            frameId: null,
        },
    },
    {
        id: 'system_memory_album',
        name: 'אלבום זיכרונות',
        ownerType: 'system',
        preview: '#ffffff',
        values: {
            template: 'collage',
            backgroundColor: '#ffffff',
            fontKey: 'gveretLevin',
            fontColor: '#3d2e1a',
            texture: '/textures/tex8.png',
            textureOpacity: 0.2,
            frameId: null,
        },
    },
]

// Expand a preset's stable keys to the runtime shape the renderer +
// styleSettings flow expect (`fontClass` instead of `fontKey`, `frame`
// URL instead of `frameId`). This is the ONLY place that bridges the
// stored format and the in-memory format — keeps storage forward-
// compatible with build hash changes.
export function resolvePreset(preset) {
    if (!preset || !preset.values) return preset
    const v = preset.values
    const fontEntry = v.fontKey ? FONTS_REGISTRY[v.fontKey] : null
    const frameEntry = v.frameId ? FRAMES_REGISTRY[v.frameId] : null
    // Strip the stable keys from the output so the wedding doc that
    // gets saved doesn't accumulate both shapes.
    const { fontKey, frameId, ...rest } = v
    return {
        ...preset,
        values: {
            ...rest,
            fontClass: fontEntry ? fontEntry.font.className : undefined,
            frame: frameEntry ? frameEntry.src : null,
        },
    }
}

// ── Firestore plumbing ───────────────────────────────────────────────
// `studio_presets` is the single collection holding both system and
// user-created presets. System presets are seeded once and treated as
// read-only on the studio side. User presets carry ownerType:'studio'
// + createdBy + timestamps; they're freely editable + deletable.

const COLLECTION = 'studio_presets'

// Read every preset from Firestore. System presets sort first (by
// creation time), then user presets (most-recently-edited first). On
// any error or empty collection we fall back to BUILTIN_PRESETS so
// the viewer's picker is never blank.
export async function listPresets() {
    try {
        const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'asc')))
        if (snap.empty) return BUILTIN_PRESETS
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Sort: system first, then studio (most-recent updatedAt first).
        const system = docs.filter(d => d.ownerType === 'system')
        const studio = docs
            .filter(d => d.ownerType === 'studio')
            .sort(
                (a, b) =>
                    (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0)
            )
        return [...system, ...studio]
    } catch (err) {
        console.warn('[studioPresets] listPresets failed, using hardcoded fallback:', err?.message || err)
        return BUILTIN_PRESETS
    }
}

// Random-ish id for newly created studio presets. Six base36 chars is
// plenty given the few-dozen-presets-per-account scale we're at.
function newPresetId() {
    return 'studio_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// Save a single preset doc to Firestore. Used by the studio's "Save"
// (overwrite an existing studio preset) and "Save as new" (create a
// new studio preset cloned from the active one) actions. Refuses to
// touch system presets — those are seeded data and edits are
// disallowed at the lib level so a careless caller can't corrupt
// them. Returns the saved doc.
export async function savePreset(preset, { uid, asNew = false } = {}) {
    if (!preset) throw new Error('savePreset: missing preset')
    if (!asNew && preset.ownerType === 'system') {
        throw new Error('savePreset: system presets are read-only — clone first')
    }

    const now = new Date()
    const id = asNew || !preset.id ? newPresetId() : preset.id
    const merged = {
        ...preset,
        id,
        ownerType: 'studio',                     // any save lands as studio
        createdBy: preset.createdBy || uid || 'unknown',
        createdAt: asNew || !preset.createdAt ? now : preset.createdAt,
        updatedAt: now,
    }
    await setDoc(doc(db, COLLECTION, id), merged, { merge: false })
    return merged
}

// Delete a studio preset. System presets are protected at the lib
// level — same rationale as savePreset. Returns true on success.
export async function deletePreset(presetId, ownerType) {
    if (!presetId) throw new Error('deletePreset: missing id')
    if (ownerType === 'system') {
        throw new Error('deletePreset: system presets cannot be deleted')
    }
    await deleteDoc(doc(db, COLLECTION, presetId))
    return true
}

// Build a draft from a system preset that the studio can edit. Strips
// the system metadata, gives the clone a fresh id, and tags it as a
// studio preset. The clone is NOT persisted yet — the caller (studio
// UI) saves it through savePreset() when the user clicks save.
export function clonePresetForEdit(preset, { uid } = {}) {
    if (!preset) return null
    return {
        ...preset,
        id: newPresetId(),
        name: `${preset.name || 'תבנית'} — עותק`,
        ownerType: 'studio',
        createdBy: uid || 'unknown',
        createdAt: null,
        updatedAt: null,
    }
}

// ── Studio backgrounds (uploaded by super admins) ───────────────────
// Stored in Firestore `studio_backgrounds`, files in Firebase Storage
// under `studio/backgrounds/{uuid}.{ext}`. The Studio's background
// picker merges these with STATIC_BACKGROUNDS via listAllBackgrounds()
// below so users see both sources in one unified gallery.

const BACKGROUNDS_COLLECTION = 'studio_backgrounds'

const UPLOAD_LIMITS = {
    maxFileMB: 5,
    minSize: 1500, // px on the longer edge — matches the low-res guard threshold
    minAspect: 0.7,
    maxAspect: 1.5,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
}

// Read every uploaded background from Firestore. Sorted newest-first
// so the most recent uploads are visible immediately after refresh.
// Returns an empty array on error so the picker still renders the
// static layer.
export async function listStudioBackgrounds() {
    try {
        const snap = await getDocs(
            query(collection(db, BACKGROUNDS_COLLECTION), orderBy('createdAt', 'desc'))
        )
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) {
        console.warn('[studioPresets] listStudioBackgrounds failed:', err?.message || err)
        return []
    }
}

// Returns the unified background list — static (curated, ships in
// code) + uploaded (Firestore). Each entry carries an `origin` flag
// so the picker can badge them.
export async function listAllBackgrounds() {
    const uploaded = await listStudioBackgrounds()
    return [
        ...STATIC_BACKGROUNDS.map(b => ({ ...b, origin: 'static' })),
        ...uploaded.map(b => ({ ...b, origin: 'studio' })),
    ]
}

// Inspect an image File and return its natural dimensions + aspect.
// Used for client-side validation before upload — rejects undersized
// or wildly-off-aspect images so we don't bloat Storage with
// unusable assets. Resolves to `{ width, height, aspect }`.
function probeImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
            URL.revokeObjectURL(url)
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight,
                aspect: img.naturalWidth / img.naturalHeight,
            })
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('image-probe-failed'))
        }
        img.src = url
    })
}

// Upload a background. Validates → compresses → writes to Storage →
// writes the Firestore doc. Returns the stored doc on success,
// throws a Hebrew-friendly Error on validation failure so the UI
// can show the message verbatim.
//
// Compression mirrors the photo-page pipeline: 2560 px max edge,
// JPEG q 0.92, ≤ 1.5 MB. The 'browser-image-compression' module is
// dynamically imported so the studio bundle doesn't load it until a
// background is actually uploaded.
export async function uploadBackground(file, { uid, label = '', tags = [] } = {}) {
    if (!file) throw new Error('uploadBackground: missing file')

    // ── Validation ──
    if (!UPLOAD_LIMITS.allowedTypes.includes(file.type)) {
        throw new Error('פורמט לא נתמך — רק JPG, PNG או WebP')
    }
    if (file.size > UPLOAD_LIMITS.maxFileMB * 1024 * 1024) {
        throw new Error(`הקובץ גדול מדי — מקסימום ${UPLOAD_LIMITS.maxFileMB}MB`)
    }

    let probed
    try {
        probed = await probeImage(file)
    } catch {
        throw new Error('לא ניתן לקרוא את התמונה')
    }
    const longerEdge = Math.max(probed.width, probed.height)
    if (longerEdge < UPLOAD_LIMITS.minSize) {
        throw new Error(
            `רזולוציה נמוכה מדי (${probed.width}×${probed.height}). דרושים לפחות ${UPLOAD_LIMITS.minSize}px בצלע הארוכה`
        )
    }
    if (
        probed.aspect < UPLOAD_LIMITS.minAspect ||
        probed.aspect > UPLOAD_LIMITS.maxAspect
    ) {
        throw new Error(
            'יחס התמונה לא מתאים לעמוד ספר. אפשר רק תמונות סביב 1:1'
        )
    }

    // ── Compression — dynamic import so the studio bundle stays
    //    small for non-upload sessions. Best-effort: if it throws
    //    (rare iOS Safari quirk) we ship the original file. ──
    let compressed = file
    try {
        const { default: imageCompression } = await import('browser-image-compression')
        const out = await imageCompression(file, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 2560,
            initialQuality: 0.92,
            useWebWorker: true,
            fileType: 'image/jpeg',
        })
        if (out.size < file.size) compressed = out
    } catch (err) {
        console.warn('[studioPresets] compression skipped:', err?.message || err)
    }

    // ── Upload + write doc ──
    const ext =
        compressed.type === 'image/png'
            ? 'png'
            : compressed.type === 'image/webp'
            ? 'webp'
            : 'jpg'
    const id = newPresetId().replace('studio_', 'bg_')
    const storagePath = `studio/backgrounds/${id}.${ext}`
    const ref = storageRef(storage, storagePath)
    await uploadBytes(ref, compressed, { contentType: compressed.type || 'image/jpeg' })
    const url = await getDownloadURL(ref)

    const docData = {
        url,
        storagePath,
        label: label || file.name?.replace(/\.[^.]+$/, '') || 'רקע מותאם',
        originalFilename: file.name || null,
        width: probed.width,
        height: probed.height,
        sizeKB: Math.round(compressed.size / 1024),
        tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
        uploadedBy: uid || 'unknown',
        createdAt: new Date(),
    }
    await setDoc(doc(db, BACKGROUNDS_COLLECTION, id), docData)
    return { id, ...docData, origin: 'studio' }
}

// Delete an uploaded background. Removes both the Firestore doc and
// the Storage object. The studio UI is responsible for confirming
// before calling this. If a preset references the deleted URL, it
// continues to point at the now-404 URL — v2 will add a referential-
// integrity check; for v1 we just warn.
export async function deleteStudioBackground(id, storagePath) {
    if (!id) throw new Error('deleteStudioBackground: missing id')
    await deleteDoc(doc(db, BACKGROUNDS_COLLECTION, id))
    if (storagePath) {
        try {
            await deleteObject(storageRef(storage, storagePath))
        } catch (err) {
            // Storage delete is best-effort — the doc is already gone,
            // so even if the file lingers it won't be discoverable
            // through the studio.
            console.warn('[studioPresets] storage delete failed:', err?.message || err)
        }
    }
    return true
}

// Write the BUILTIN_PRESETS to Firestore if the collection is empty or
// the system presets are missing. Idempotent — safe to call on every
// studio mount. Uses setDoc with the preset's literal id so the
// Firestore docId is stable across re-seeds (no duplicates).
export async function seedBuiltinPresetsIfMissing() {
    try {
        // Fast path: if the first system preset is already there, skip.
        const probe = await getDoc(doc(db, COLLECTION, BUILTIN_PRESETS[0].id))
        if (probe.exists()) return { seeded: 0, status: 'already-present' }

        const now = new Date()
        let seeded = 0
        for (const preset of BUILTIN_PRESETS) {
            await setDoc(
                doc(db, COLLECTION, preset.id),
                {
                    ...preset,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: 'system',
                },
                { merge: true }
            )
            seeded++
        }
        return { seeded, status: 'ok' }
    } catch (err) {
        console.warn('[studioPresets] seed failed:', err?.message || err)
        return { seeded: 0, status: 'error', error: err?.message || String(err) }
    }
}
