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
import { getAuth } from 'firebase/auth'
import { db, storage, app as firebaseApp } from './firebaseClient'

// ── Server-routed studio writes ──────────────────────────────────────
// The studio's mutating ops (save preset, delete preset, hide static
// asset, delete uploaded background) go through /api/studio which
// uses the Admin SDK and bypasses Firestore rules entirely. That way
// the studio works after a normal Vercel deploy — no
// `firebase deploy --only firestore:rules` step required, no CLI
// auth lapses, no rules friction. The server still gates on a valid
// Firebase ID token (the `Authorization: Bearer ...` header below).
async function callStudioApi(op, payload = {}) {
    const auth = getAuth(firebaseApp)
    const user = auth.currentUser
    if (!user) throw new Error('יש להתחבר כדי לערוך את הסטודיו')
    const token = await user.getIdToken(/* forceRefresh */ false)
    const res = await fetch('/api/studio', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ op, ...payload }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `studio API ${op} failed (${res.status})`)
    }
    return res.json()
}
import { heebo, frankRuhl, notoHebrew, gveretLevin, playpenSansHebrew } from '@/app/fonts'
// Note: `secular`, `davidLibre`, `danaYad` exports still exist in
// '@/app/fonts' for legacy consumers (PageLayouts, app/layout.js) but
// are deliberately NOT registered here — the design studio's font
// picker was pruned to a curated set per the spring 2026 redesign.

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
    // wedding-bg / wedding-bg2 stay as PNG (under-1MB, not in this
    // pass's WebP conversion). The other three were re-encoded to
    // WebP at q 0.85, ~93% smaller than the source PNG.
    { id: 'wedding-bg', label: 'חתונה — לבן', src: '/backgrounds/wedding-bg.png', tags: ['wedding'] },
    { id: 'wedding-bg2', label: 'חתונה — עדין', src: '/backgrounds/wedding-bg2.png', tags: ['wedding'] },
    { id: 'weddingdesign1', label: 'חתונה — פרחוני', src: '/backgrounds/weddingdesign1.webp', tags: ['wedding', 'romantic'] },
    { id: 'romanticgarden', label: 'גן רומנטי', src: '/backgrounds/romanticgarden.webp', tags: ['wedding', 'romantic'] },
    { id: 'pokerbg', label: 'פוקר — לבד ירוק', src: '/backgrounds/pokerbg.webp', tags: ['poker'] },
]

// ── UNIFIED BACKGROUNDS ──────────────────────────────────────────────
// Per the spring 2026 redesign the studio collapses three distinct
// asset types (frames / textures / page backgrounds) into a single
// "background for the book" gallery. Conceptually they all paint the
// page surface; splitting them into three separate pickers produced
// decision fatigue and a confused result.
//
// We keep the original registries above so legacy presets that still
// reference `frame: '/_next/.../frame2.png'` or `texture:
// '/textures/tex3.png'` continue to render unchanged. New work goes
// through `backgroundUrl` (a single field on the wedding doc),
// resolved here.
//
// Each entry here is normalized to the same shape `{ id, src, label,
// kind, tags }` so the picker doesn't have to branch on origin.
export const UNIFIED_BACKGROUNDS = [
    ...STATIC_BACKGROUNDS.map(b => ({ id: b.id, src: b.src, label: b.label, kind: 'background', tags: b.tags || [] })),
    ...TEXTURES_REGISTRY.map(t => ({ id: t.id, src: t.src, label: t.label, kind: 'texture', tags: ['texture'] })),
    ...Object.values(FRAMES_REGISTRY).map(f => ({ id: f.id, src: f.src, label: f.label, kind: 'frame', tags: ['frame'] })),
]

// ── Font registry ────────────────────────────────────────────────────
// next/font generates a hashed className per build, so we never store
// the className itself in Firestore — we store a stable key and resolve
// to the live font object here. Adding a new font: import in
// src/app/fonts.js, add it here.
export const FONTS_REGISTRY = {
    notoHebrew: { id: 'notoHebrew', label: 'Noto Hebrew', font: notoHebrew },
    frankRuhl: { id: 'frankRuhl', label: 'Frank Ruhl', font: frankRuhl },
    heebo: { id: 'heebo', label: 'Heebo', font: heebo },
    gveretLevin: { id: 'gveretLevin', label: 'גברת לוין', font: gveretLevin },
    playpenSansHebrew: { id: 'playpenSansHebrew', label: 'Playpen Sans Hebrew', font: playpenSansHebrew },
}

export const FONT_IDS = Object.keys(FONTS_REGISTRY)

// ── Event-type targeting ─────────────────────────────────────────────
// Pure logic lives in presetFilters.js (unit-testable, no Firebase
// imports); re-exported here so UI code keeps a single import point.
import { presetMatchesEventType, filterPresetsByEventType } from './presetFilters'
export { presetMatchesEventType, filterPresetsByEventType }

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
    // Separate font for LATIN/English blessings (used when a blessing is
    // detected as English). Lets a mixed book pair, e.g., a Hebrew serif
    // with a matching English serif.
    const latinFontEntry = v.fontKeyLatin ? FONTS_REGISTRY[v.fontKeyLatin] : null
    const nameFontEntry = v.nameFontKey ? FONTS_REGISTRY[v.nameFontKey] : null
    const frameEntry = v.frameId ? FRAMES_REGISTRY[v.frameId] : null
    // Strip the stable keys from the output so the wedding doc that
    // gets saved doesn't accumulate both shapes.
    const { fontKey, fontKeyLatin, nameFontKey, frameId, ...rest } = v
    // Build values WITHOUT undefined keys — Firestore's client SDK rejects
    // `undefined` field values (the JSON round-trip in server paths hid this,
    // but a direct client setDoc from the portal does not). Only set
    // fontClass / nameFontClass when they actually resolve; BookPageTemplate
    // falls back gracefully when they're absent.
    const values = { ...rest, frame: frameEntry ? frameEntry.src : null }
    if (fontEntry) values.fontClass = fontEntry.font.className
    if (latinFontEntry) values.fontClassLatin = latinFontEntry.font.className
    if (nameFontEntry) values.nameFontClass = nameFontEntry.font.className
    // Split-related keys are ALWAYS present (with explicit defaults) in
    // the resolved output. The viewer applies presets by MERGING into
    // the wedding's existing styleSettings — if a preset simply omitted
    // these keys, the previous preset's autoSplit / blessingTemplate
    // would survive the switch and "haunt" the new design.
    values.autoSplit = rest.autoSplit === true
    values.splitThreshold = Number.isFinite(rest.splitThreshold) ? rest.splitThreshold : 240
    values.blessingTemplate = rest.blessingTemplate ?? null
    return { ...preset, values }
}

// ── Firestore plumbing ───────────────────────────────────────────────
// `studio_presets` is the single collection holding both system and
// user-created presets. System presets are seeded once and treated as
// read-only on the studio side. User presets carry ownerType:'studio'
// + createdBy + timestamps; they're freely editable + deletable.

const COLLECTION = 'studio_presets'

// Read every preset from Firestore. System presets sort first (by
// creation time), then user presets (most-recently-edited first).
// Filters out any preset whose id appears in studio_config/visibility's
// hiddenPresetIds — that's how we honor "delete a system preset"
// without fighting the seeder. On any error or empty collection we
// fall back to BUILTIN_PRESETS so the viewer's picker is never blank.
//
// `includePrivate` — when false (the default for couples / non-admin
// surfaces), presets flagged `isPrivate: true` are filtered out so
// they NEVER appear in the gallery. Super-admin's /admin/studio and
// the admin-detected branch of DesignControls pass `true` to see
// their private presets.
//
// `eventType` — when set (e.g. 'bar_mitzvah'), only presets tagged
// with that event type OR untagged (generic) presets are returned.
// See presetMatchesEventType above. Omit for admin surfaces.
export async function listPresets({ includePrivate = false, eventType = null } = {}) {
    try {
        const [snap, vis] = await Promise.all([
            getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'asc'))),
            readVisibility(),
        ])
        const hidden = new Set(vis.hiddenPresetIds)
        const filterPrivate = preset => includePrivate || !preset.isPrivate
        const filterEvent = preset => presetMatchesEventType(preset, eventType)
        if (snap.empty) {
            return BUILTIN_PRESETS
                .filter(p => !hidden.has(p.id))
                .filter(filterPrivate)
                .filter(filterEvent)
        }
        const docs = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => !hidden.has(d.id))
            .filter(filterPrivate)
            .filter(filterEvent)
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
        return filterPresetsByEventType(BUILTIN_PRESETS, eventType)
    }
}

// Random-ish id for newly created studio presets. Six base36 chars is
// plenty given the few-dozen-presets-per-account scale we're at.
function newPresetId() {
    return 'studio_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// Save a single preset doc to Firestore. Used by the studio's "Save"
// (overwrite an existing preset with the live settings) and "Save as
// new" (create a new preset cloned from the active one). Returns the
// saved doc.
//
// Spring 2026: the system-preset read-only guard was REMOVED at the
// user's explicit request ("no restrictions"). System presets remain
// flagged ownerType:'system' so the seeder won't double-seed them
// after edits, but in-place mutation is allowed. If the user wants
// the original back they can wipe `studio_presets/{id}` and
// seedBuiltinPresetsIfMissing will re-create it.
export async function savePreset(preset, { uid, asNew = false } = {}) {
    if (!preset) throw new Error('savePreset: missing preset')
    // Server-routed (Admin SDK) — see callStudioApi above for
    // rationale. The server fills in createdBy / timestamps and
    // returns the merged doc.
    const { preset: saved } = await callStudioApi('savePreset', { preset, asNew })
    return saved
}

// Delete any preset — system or studio. System presets are not
// protected at the lib level anymore (spring 2026 user request); if
// deleted, they will reappear on the next call to
// seedBuiltinPresetsIfMissing because that seeder probes
// BUILTIN_PRESETS[0].id and re-seeds when missing. To prevent the
// reseed, callers can additionally write a sentinel into
// studio_config/visibility.hiddenPresetIds. Returns true on success.
export async function deletePreset(presetId, ownerType) {
    if (!presetId) throw new Error('deletePreset: missing id')
    // For system presets we also write to hiddenPresetIds so the
    // seeder doesn't recreate them on the next mount — the server
    // does both in one call when `alsoHide` is true.
    await callStudioApi('deletePreset', {
        id: presetId,
        alsoHide: ownerType === 'system',
    })
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
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
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

// Returns the unified background list — UNIFIED_BACKGROUNDS (curated
// page bgs + textures + frames, all collapsed into one "book
// background" gallery per the spring 2026 redesign) + uploaded
// (Firestore). Filters out anything in the studio_config visibility
// doc's `hiddenBackgroundIds` so the user can soft-delete static
// items they don't want to see again.
export async function listAllBackgrounds() {
    const [uploaded, vis] = await Promise.all([listStudioBackgrounds(), readVisibility()])
    const hidden = new Set(vis.hiddenBackgroundIds)
    const all = [
        ...UNIFIED_BACKGROUNDS.map(b => ({ ...b, origin: 'static' })),
        ...uploaded.map(b => ({ ...b, kind: 'background', origin: 'studio' })),
    ]
    return all.filter(b => !hidden.has(b.id))
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
        throw new Error('פורמט לא נתמך — רק JPG, PNG, WebP או SVG')
    }
    if (file.size > UPLOAD_LIMITS.maxFileMB * 1024 * 1024) {
        throw new Error(`הקובץ גדול מדי — מקסימום ${UPLOAD_LIMITS.maxFileMB}MB`)
    }

    // ── SVG fast path ─────────────────────────────────────────────
    // Vector SVGs have no natural pixel dimensions, so probeImage()
    // and the minSize / aspect-ratio checks don't apply. We also
    // skip raster compression (browser-image-compression rasterizes
    // input — it would actually DEGRADE the SVG, defeating the whole
    // "I want better print quality" reason for choosing SVG). The
    // file ships as-is.
    //
    // Security note: a scripted SVG (`<script>` tags / inline event
    // handlers) is harmless when rendered via <img src> or CSS
    // background-image — browsers disable script execution in image
    // contexts. The renderer in BookPageTemplate uses both, so we
    // don't need DOMPurify-style sanitization here.
    const isSvg = file.type === 'image/svg+xml'
    let probed = null
    if (!isSvg) {
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
    }

    // ── Compression — only for raster. Dynamic import so the studio
    //    bundle stays small for non-upload sessions. Best-effort: if
    //    it throws (rare iOS Safari quirk) we ship the original file. ──
    let compressed = file
    if (!isSvg) {
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
    }

    // ── Upload + write doc ──
    const ext = isSvg
        ? 'svg'
        : compressed.type === 'image/png'
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
        width: probed?.width ?? null,
        height: probed?.height ?? null,
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
    await callStudioApi('deleteUploadedBackground', { id, storagePath })
    return true
}

// ── Visibility / soft-hide ───────────────────────────────────────────
// Static backgrounds (curated, ship in code) and seeded system
// presets can't be "hard-deleted" the way uploaded ones can — they're
// either source files in public/ or doc IDs the seeder will re-create
// on the next mount. To honor the user's "delete anything freely"
// request we instead track hidden IDs in a single config doc and
// filter them out of the picker / list APIs.
//
// One global doc (`studio_config/visibility`) keeps the model simple
// — visibility is a super-admin / studio-owner concern, not a
// per-couple choice. If we ever need per-account hiding we'll move
// the array onto the wedding doc.
const VISIBILITY_DOC = 'studio_config/visibility'

async function readVisibility() {
    try {
        const [coll, id] = VISIBILITY_DOC.split('/')
        const snap = await getDoc(doc(db, coll, id))
        if (!snap.exists()) return { hiddenBackgroundIds: [], hiddenPresetIds: [] }
        const v = snap.data() || {}
        return {
            hiddenBackgroundIds: Array.isArray(v.hiddenBackgroundIds) ? v.hiddenBackgroundIds : [],
            hiddenPresetIds: Array.isArray(v.hiddenPresetIds) ? v.hiddenPresetIds : [],
        }
    } catch (err) {
        console.warn('[studioPresets] readVisibility failed:', err?.message || err)
        return { hiddenBackgroundIds: [], hiddenPresetIds: [] }
    }
}

async function writeVisibility(patch) {
    const [coll, id] = VISIBILITY_DOC.split('/')
    const current = await readVisibility()
    const next = { ...current, ...patch }
    await setDoc(doc(db, coll, id), next, { merge: true })
    return next
}

// Hide a static background. Caller passes the static id (e.g.
// 'tex3', 'romanticgarden', 'frame2'). Idempotent — adding twice is
// a no-op. Returns the new hidden array.
export async function hideStaticBackground(id) {
    if (!id) throw new Error('hideStaticBackground: missing id')
    await callStudioApi('hideBackground', { id })
    // Re-read so callers get the updated list.
    return (await readVisibility()).hiddenBackgroundIds
}

// Mirror for system presets — `deletePreset` removes the doc but the
// seeder might re-create it on next mount. Adding to this list tells
// the seeder + listPresets to skip it.
export async function hidePreset(id) {
    if (!id) throw new Error('hidePreset: missing id')
    await callStudioApi('hidePreset', { id })
    return (await readVisibility()).hiddenPresetIds
}

// "Restore everything" escape hatch — handy if the user nukes
// everything and wants the gallery back to defaults.
export async function clearVisibilityHidden() {
    await callStudioApi('clearVisibility')
    return true
}

// Write the BUILTIN_PRESETS to Firestore if the collection is empty or
// the system presets are missing. Idempotent — safe to call on every
// studio mount. Uses setDoc with the preset's literal id so the
// Firestore docId is stable across re-seeds (no duplicates). Honors
// hiddenPresetIds so a system preset the user deleted doesn't keep
// reappearing.
export async function seedBuiltinPresetsIfMissing() {
    try {
        // Fast path: if the first system preset is already there, skip.
        const probe = await getDoc(doc(db, COLLECTION, BUILTIN_PRESETS[0].id))
        if (probe.exists()) return { seeded: 0, status: 'already-present' }

        const vis = await readVisibility()
        const hidden = new Set(vis.hiddenPresetIds)
        const now = new Date()
        let seeded = 0
        for (const preset of BUILTIN_PRESETS) {
            if (hidden.has(preset.id)) continue
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
