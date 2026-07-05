import { describe, it, expect } from 'vitest'
import {
    presetMatchesEventType,
    filterPresetsByEventType,
    resolveActiveTemplate,
    adoptSurfaceKeepCover,
} from '../src/lib/presetFilters'

// ── Event-type targeting ─────────────────────────────────────────────

const generic = { id: 'p_generic', name: 'כללי' } // no eventTypes at all
const genericEmpty = { id: 'p_empty', name: 'כללי ריק', eventTypes: [] }
const weddingOnly = { id: 'p_wed', name: 'חתונה', eventTypes: ['wedding'] }
const barMitzvah = { id: 'p_bar', name: 'בר מצווה', eventTypes: ['bar_mitzvah'] }
const multi = { id: 'p_multi', name: 'בר+בת', eventTypes: ['bar_mitzvah', 'bat_mitzvah'] }
const ALL = [generic, genericEmpty, weddingOnly, barMitzvah, multi]

describe('presetMatchesEventType', () => {
    it('no eventType filter → everything matches (admin surfaces)', () => {
        for (const p of ALL) {
            expect(presetMatchesEventType(p, null)).toBe(true)
            expect(presetMatchesEventType(p, undefined)).toBe(true)
            expect(presetMatchesEventType(p, '')).toBe(true)
        }
    })

    it('untagged / empty-tagged presets are generic — visible to every event type', () => {
        expect(presetMatchesEventType(generic, 'wedding')).toBe(true)
        expect(presetMatchesEventType(generic, 'bar_mitzvah')).toBe(true)
        expect(presetMatchesEventType(genericEmpty, 'poker')).toBe(true)
    })

    it('tagged presets match only their own event types', () => {
        expect(presetMatchesEventType(weddingOnly, 'wedding')).toBe(true)
        expect(presetMatchesEventType(weddingOnly, 'bar_mitzvah')).toBe(false)
        expect(presetMatchesEventType(barMitzvah, 'bar_mitzvah')).toBe(true)
        expect(presetMatchesEventType(barMitzvah, 'wedding')).toBe(false)
    })

    it('multi-tagged presets match each tagged type', () => {
        expect(presetMatchesEventType(multi, 'bar_mitzvah')).toBe(true)
        expect(presetMatchesEventType(multi, 'bat_mitzvah')).toBe(true)
        expect(presetMatchesEventType(multi, 'wedding')).toBe(false)
    })

    it('survives malformed input', () => {
        expect(presetMatchesEventType(null, 'wedding')).toBe(true)
        expect(presetMatchesEventType({ eventTypes: 'wedding' }, 'wedding')).toBe(true) // non-array → generic
        expect(presetMatchesEventType({ eventTypes: [null, undefined] }, 'wedding')).toBe(true) // falsy tags stripped → generic
    })
})

describe('filterPresetsByEventType', () => {
    it('wedding sees wedding + generic, NOT bar mitzvah', () => {
        const ids = filterPresetsByEventType(ALL, 'wedding').map(p => p.id)
        expect(ids).toEqual(['p_generic', 'p_empty', 'p_wed'])
    })

    it('bar mitzvah sees bar-mitzvah-tagged + multi + generic, NOT wedding', () => {
        const ids = filterPresetsByEventType(ALL, 'bar_mitzvah').map(p => p.id)
        expect(ids).toEqual(['p_generic', 'p_empty', 'p_bar', 'p_multi'])
    })

    it('no filter → full list unchanged; non-array input → []', () => {
        expect(filterPresetsByEventType(ALL, null)).toHaveLength(ALL.length)
        expect(filterPresetsByEventType(undefined, 'wedding')).toEqual([])
    })
})

// ── Blessing-page template resolution ────────────────────────────────

describe('resolveActiveTemplate', () => {
    const base = { template: 'classic' }

    it('no blessingTemplate → main template everywhere (pre-feature behavior)', () => {
        expect(resolveActiveTemplate({ text: 'ברכה ארוכה', imageUrl: null }, base)).toBe('classic')
        expect(resolveActiveTemplate({ text: 'ברכה', imageUrl: 'x.jpg' }, base)).toBe('classic')
    })

    it("'inherit' behaves like unset", () => {
        const s = { template: 'polaroid', blessingTemplate: 'inherit' }
        expect(resolveActiveTemplate({ text: 'ברכה', imageUrl: null }, s)).toBe('polaroid')
    })

    it('blessing-only page (split text page / photo-less entry) uses blessingTemplate', () => {
        const s = { template: 'polaroid', blessingTemplate: 'notebook' }
        // auto-split text page: imageUrl stripped by expandBookPages
        expect(resolveActiveTemplate({ text: 'ברכה ארוכה', imageUrl: null, _split: 'text' }, s)).toBe('notebook')
        // entry that never had a photo
        expect(resolveActiveTemplate({ text: 'ברכה', imageUrl: null }, s)).toBe('notebook')
    })

    it('combined page and photo-only split page keep the main template', () => {
        const s = { template: 'polaroid', blessingTemplate: 'notebook' }
        expect(resolveActiveTemplate({ text: 'ברכה', imageUrl: 'x.jpg' }, s)).toBe('polaroid')
        expect(resolveActiveTemplate({ text: '', imageUrl: 'x.jpg', _split: 'photo' }, s)).toBe('polaroid')
    })

    it('empty/whitespace text page is not a blessing page', () => {
        const s = { template: 'polaroid', blessingTemplate: 'notebook' }
        expect(resolveActiveTemplate({ text: '   ', imageUrl: null }, s)).toBe('polaroid')
        expect(resolveActiveTemplate({}, s)).toBe('polaroid')
    })
})

// ── Cover-preserving design adoption ─────────────────────────────────

describe('adoptSurfaceKeepCover', () => {
    const ownerCover = {
        backgroundColor: '#f7f1e3',
        texture: '/textures/tex9.png',
        coverImage: 'https://storage/cover.jpg',
        coverImageScale: 1.35,
        coverImageX: 12,
        coverImageY: -4,
        coverTitle: 'דור ושקד',
        coverSubtitle: 'ספר הברכות',
        coverTextPosition: 'bc',
        coverTextBg: 'rgba(0,0,0,0.3)',
        coverTextColor: '#ffffff',
    }
    const preset = {
        backgroundColor: '#ffffff',
        texture: '/textures/tex5.png',
        fontClass: 'font-x',
        imageStyle: { width: 75, height: 65 },
        template: 'polaroid',
    }

    it('adopts the surface look but keeps EVERY cover-specific field', () => {
        const out = adoptSurfaceKeepCover(ownerCover, preset)
        // surface adopted
        expect(out.backgroundColor).toBe('#ffffff')
        expect(out.texture).toBe('/textures/tex5.png')
        expect(out.fontClass).toBe('font-x')
        // cover fields preserved — the "shrinking cover" regression guard
        expect(out.coverImage).toBe(ownerCover.coverImage)
        expect(out.coverImageScale).toBe(1.35)
        expect(out.coverImageX).toBe(12)
        expect(out.coverImageY).toBe(-4)
        expect(out.coverTitle).toBe('דור ושקד')
        expect(out.coverSubtitle).toBe('ספר הברכות')
        expect(out.coverTextPosition).toBe('bc')
        expect(out.coverTextBg).toBe('rgba(0,0,0,0.3)')
        expect(out.coverTextColor).toBe('#ffffff')
    })

    it('no existing cover → the design passes through untouched', () => {
        expect(adoptSurfaceKeepCover(null, preset)).toEqual(preset)
        expect(adoptSurfaceKeepCover({}, preset)).toEqual(preset)
    })

    it('does not mutate its inputs', () => {
        const cover = { ...ownerCover }
        const design = { ...preset }
        adoptSurfaceKeepCover(cover, design)
        expect(cover).toEqual(ownerCover)
        expect(design).toEqual(preset)
    })
})
