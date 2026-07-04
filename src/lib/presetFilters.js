// Pure preset-filtering helpers — no Firebase, no Next, no browser
// globals, so they're unit-testable under vitest's node environment.
// Re-exported by src/lib/studioPresets.js; UI code keeps importing
// from '@/lib/studioPresets'.

// A preset may carry `eventTypes: string[]` (values from
// src/lib/eventTypes.js — 'wedding' | 'bar_mitzvah' | ...). Missing or
// empty array means "generic" — the preset shows for EVERY event type
// (backward-compat: presets created before this feature keep appearing
// everywhere until the admin tags them in /admin/studio).
//
// Couple/guest-facing pickers pass the wedding's eventType so a bar
// mitzvah only sees bar-mitzvah presets (+ generic ones), a wedding
// only sees wedding presets, etc. Admin surfaces pass nothing and see
// the full list.
export function presetMatchesEventType(preset, eventType) {
    if (!eventType) return true // no filter requested → everything
    const tags = Array.isArray(preset?.eventTypes) ? preset.eventTypes.filter(Boolean) : []
    if (tags.length === 0) return true // untagged preset → generic, visible to all
    return tags.includes(eventType)
}

export function filterPresetsByEventType(presets, eventType) {
    const list = Array.isArray(presets) ? presets : []
    if (!eventType) return list
    return list.filter(p => presetMatchesEventType(p, eventType))
}

// ── Blessing-page template resolution ────────────────────────────────
// `styleSettings.blessingTemplate` lets a preset use a SEPARATE layout
// for blessing-only pages — the text page the auto-split produces
// (bookPages.js sets `_split: 'text'`, imageUrl null) and entries that
// arrived without a photo. Combined pages and photo-only pages keep the
// book's main `template`. Unset / null / 'inherit' → the main template
// everywhere (pre-feature behavior). Divider leaves are handled before
// this in BookPageTemplate and never reach here in practice; they
// resolve to the main template anyway (no text, no image).
export function resolveActiveTemplate(entry, styleSettings) {
    const mainTemplate = styleSettings?.template
    const override = styleSettings?.blessingTemplate
    if (!override || override === 'inherit') return mainTemplate
    const isBlessingOnlyPage = !entry?.imageUrl && Boolean((entry?.text || '').trim())
    return isBlessingOnlyPage ? override : mainTemplate
}
