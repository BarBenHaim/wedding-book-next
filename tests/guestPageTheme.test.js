import { describe, it, expect } from 'vitest'
import { buildGuestPageTheme } from '@/lib/guestPageTheme'

// This module is one long ternary chain, and adding a branch to the
// middle of a ternary chain is a classic way to silently re-point every
// event that follows it. These tests exist mostly to make that loud.

const build = args => buildGuestPageTheme(args)

describe('variant selection', () => {
    it('picks night whenever the variant says so, for any event type', () => {
        // Deliberately NOT gated on eventType the way romantic is: the
        // design was made for a bar mitzvah, and an eventType gate would
        // have hidden it from exactly the event it was built for.
        for (const eventType of ['wedding', 'bar_mitzvah', 'bat_mitzvah', 'birthday', 'brit', undefined]) {
            const r = build({ eventType, designVariant: 'night' })
            expect(r.isNight, String(eventType)).toBe(true)
            expect(r.theme.pageBgImage).toContain('nightglass')
        }
    })

    it('keeps romantic a wedding-only variant', () => {
        expect(build({ eventType: 'wedding', designVariant: 'romantic' }).isRomantic).toBe(true)
        expect(build({ eventType: 'birthday', designVariant: 'romantic' }).isRomantic).toBe(false)
    })

    it('lets poker win over a variant request, because poker is the event', () => {
        const r = build({ eventType: 'poker', designVariant: 'night' })
        expect(r.isPoker).toBe(true)
        expect(r.theme.pageBgImage).toContain('pokerbg')
    })

    it('leaves every existing look exactly where it was', () => {
        // The regression this file is really for.
        expect(build({ eventType: 'wedding' }).theme.pageBg).toBe('#f8f4ec')
        expect(build({ eventType: 'birthday' }).theme.cardBg).toBe('#ffffff')
        expect(build({ eventType: 'bar_mitzvah' }).theme.buttonGradient).toContain('#d3b46a')
        expect(build({ eventType: 'poker' }).theme.pageBg).toBe('#0a2818')
        expect(build({ eventType: 'wedding', designVariant: 'romantic' }).theme.pageBg).toBe('#1f3527')
        expect(build({}).theme.pageBg).toBe('#f8f4ec')
        expect(build().theme.pageBg).toBe('#f8f4ec')
    })

    it('reports exactly one variant flag at a time', () => {
        for (const args of [
            { eventType: 'poker' },
            { eventType: 'wedding', designVariant: 'romantic' },
            { eventType: 'bar_mitzvah', designVariant: 'night' },
        ]) {
            const r = build(args)
            const on = [r.isPoker, r.isRomantic, r.isNight].filter(Boolean)
            expect(on, JSON.stringify(args)).toHaveLength(1)
        }
    })
})

describe('the night photo card is a window, not paper', () => {
    it('gives the photo card a different surface from the writing card', () => {
        // The whole reason the extra keys exist. A cream slab here would
        // cover the only part of the scene the guest can still see.
        const { theme } = build({ eventType: 'bar_mitzvah', designVariant: 'night' })
        expect(theme.photoCardBg).toBeTruthy()
        expect(theme.photoCardBg).not.toBe(theme.cardBg)
        expect(theme.photoCardBorder).toContain('dashed')
        expect(theme.photoWellBg).toBeTruthy()
    })

    it('leaves the keys unset everywhere else, so the form falls back', () => {
        // The form reads `theme.photoCardBg || theme.cardBg`. If a
        // variant ever set these by accident its photo card would change
        // surface without anyone touching the form.
        for (const args of [{ eventType: 'wedding' }, { eventType: 'poker' }, { eventType: 'wedding', designVariant: 'romantic' }]) {
            const { theme } = build(args)
            for (const key of ['photoCardBg', 'photoCardBorder', 'photoWellBg', 'photoWellBorder']) {
                expect(theme[key], `${JSON.stringify(args)} ${key}`).toBeUndefined()
            }
        }
    })
})

describe('a saved studio preset', () => {
    // A flat, ivory-page palette of the kind the studio's guest-design
    // screen saves.
    const preset = { pageBg: '#fdf0f3', pageBgImage: 'none', titleColor: '#5a2a3a', cardBg: '#ffffff' }

    it('still wins on every flat design, exactly as before', () => {
        for (const args of [{ eventType: 'wedding' }, { eventType: 'poker' }, { eventType: 'wedding', designVariant: 'romantic' }]) {
            const { theme } = buildGuestPageTheme({ ...args, guestDesign: preset })
            expect(theme.titleColor, JSON.stringify(args)).toBe('#5a2a3a')
            expect(theme.pageBgImage, JSON.stringify(args)).toBe('none')
        }
    })

    it('does NOT apply to a framed design — it was burying it whole', () => {
        // The bug this rule exists for: on an event with a saved palette,
        // choosing 'night' changed nothing you could see, because
        // pageBgImage, pageBg, cardBg and every colour came from the
        // preset instead.
        for (const designVariant of ['night', 'dawn']) {
            const { theme } = buildGuestPageTheme({ designVariant, guestDesign: preset })
            expect(theme.pageBgImage, designVariant).toContain('glass')
            expect(theme.titleColor, designVariant).not.toBe('#5a2a3a')
            expect(theme.cardBg, designVariant).not.toBe('#ffffff')
        }
    })

    it('does not apply PART of it either', () => {
        // Half is worse than none. The preset is coherent against a flat
        // page — its dark-brown title is dark because the page behind it
        // is ivory. Over the night photograph that title is gone.
        const { theme } = buildGuestPageTheme({ designVariant: 'night', guestDesign: { titleColor: '#5a2a3a' } })
        expect(theme.titleColor).toBe('#e9d7ab')
    })

    it('destroys nothing — the same doc renders the preset again on a flat design', () => {
        const framed = buildGuestPageTheme({ eventType: 'wedding', designVariant: 'night', guestDesign: preset }).theme
        const flat = buildGuestPageTheme({ eventType: 'wedding', designVariant: '', guestDesign: preset }).theme
        expect(framed.titleColor).not.toBe(flat.titleColor)
        expect(flat.titleColor).toBe('#5a2a3a')
    })

    it('reports whether the design is framed', () => {
        expect(buildGuestPageTheme({ designVariant: 'night' }).framed).toBe(true)
        expect(buildGuestPageTheme({ designVariant: 'dawn' }).framed).toBe(true)
        expect(buildGuestPageTheme({ eventType: 'wedding' }).framed).toBe(false)
    })

    it('ignores a non-object override', () => {
        expect(buildGuestPageTheme({ eventType: 'wedding', guestDesign: 'nope' }).theme.pageBg).toBe('#f8f4ec')
    })
})
describe('every variant returns a complete surface', () => {
    it('never leaves the form without the values it renders with', () => {
        const required = [
            'pageBg', 'pageBgImage', 'pageBgSize', 'pageBgPosition', 'pageBgRepeat',
            'titleColor', 'subtitleColor', 'accentColor',
            'cardBg', 'cardBorder', 'cardShadow', 'cardLabelColor', 'cardCounterColor',
            'inputBg', 'inputBorder', 'inputFocusBorder', 'inputTextColor', 'inputPlaceholderColor',
            'dividerLine', 'buttonGradient', 'buttonShadow', 'trustText',
        ]
        for (const args of [
            {}, { eventType: 'poker' },
            { eventType: 'wedding', designVariant: 'romantic' },
            { eventType: 'bar_mitzvah', designVariant: 'night' },
        ]) {
            const { theme } = build(args)
            for (const key of required) {
                expect(theme[key], `${JSON.stringify(args)} → ${key}`).toBeDefined()
            }
        }
    })
})

// ── The framed variants ──────────────────────────────────────────────
//
// 'night' and 'dawn' put the form inside a glass panel that is part of
// a PHOTOGRAPH. That makes their layout a property of the asset, not of
// the form, which is why they carry geometry as well as colour.

const FRAMED = ['night', 'dawn']
const UNFRAMED = [{}, { eventType: 'poker' }, { eventType: 'wedding' }, { eventType: 'wedding', designVariant: 'romantic' }]
const LAYOUT_KEYS = [
    'formPaddingTop', 'formMaxWidth', 'titleFontSize', 'titleShadow',
    // The framed designs ask for a blessing and a photo and nothing
    // else. Dropping the name field, its ornament and the trust line
    // is ~145px, and that is exactly what makes the form fit between
    // the panel's rails instead of running onto the plinth below it.
    'hideSubtitle', 'hideNameField', 'hideTrust', 'textareaHeight',
    // Typography and the shortened empty photo well travel with
    // the frame too: a serif title and a hairline rule belong to a
    // lit glass panel and would be costume on a plain ivory page.
    'titleFont', 'titleRule',
    // The ceiling that makes "it cannot leave the panel" a property
    // of the layout rather than a claim about the content.
    'formMaxHeight',
]

describe('framed variants carry their own layout', () => {
    it('is offered to every event type, like night', () => {
        for (const eventType of ['wedding', 'bar_mitzvah', 'birthday', undefined]) {
            const r = buildGuestPageTheme({ eventType, designVariant: 'dawn' })
            expect(r.isDawn, String(eventType)).toBe(true)
            expect(r.theme.pageBgImage).toContain('dawnglass')
        }
    })

    it('declares every layout key, because the form has no fallback worth having', () => {
        // The form reads these and knows nothing about which variant is
        // on. A framed variant that forgot one would inherit a number
        // measured against a different photograph.
        for (const designVariant of FRAMED) {
            const { theme } = buildGuestPageTheme({ eventType: 'bar_mitzvah', designVariant })
            for (const key of LAYOUT_KEYS) {
                expect(theme[key], `${designVariant} → ${key}`).toBeDefined()
            }
        }
    })

    it('leaves the layout keys unset on every unframed variant', () => {
        // These exist so the default layout stays the default. A stray
        // value here would move a card that nobody asked to move.
        for (const args of UNFRAMED) {
            const { theme } = buildGuestPageTheme(args)
            for (const key of LAYOUT_KEYS) {
                expect(theme[key], `${JSON.stringify(args)} → ${key}`).toBeUndefined()
            }
        }
    })

    it('never places two framed variants in the same spot', () => {
        // The whole reason the numbers moved out of the form: the two
        // assets have panels in different places. If these ever match,
        // one of them was copied rather than measured.
        const night = buildGuestPageTheme({ designVariant: 'night' }).theme
        const dawn = buildGuestPageTheme({ designVariant: 'dawn' }).theme
        expect(dawn.formPaddingTop).not.toBe(night.formPaddingTop)
        expect(dawn.formMaxWidth).not.toBe(night.formMaxWidth)
    })

    it('gives a bright scene a light halo and a dark scene a dark shadow', () => {
        // titleShadow is a value rather than a flag precisely here: the
        // night shadow on the Kotel would smear grey under the title.
        const night = buildGuestPageTheme({ designVariant: 'night' }).theme
        const dawn = buildGuestPageTheme({ designVariant: 'dawn' }).theme
        expect(night.titleShadow).toContain('rgba(0,0,0')
        expect(dawn.titleShadow).toContain('rgba(255')
    })

    it('inverts the palette rather than reusing it', () => {
        // Gold type and a cream card disappear into pale limestone, and
        // night's pale button would be the hardest thing on the page to
        // find. Different scene, different answers.
        const night = buildGuestPageTheme({ designVariant: 'night' }).theme
        const dawn = buildGuestPageTheme({ designVariant: 'dawn' }).theme
        for (const key of ['titleColor', 'cardBg', 'buttonGradient', 'trustText', 'inputTextColor']) {
            expect(dawn[key], key).not.toBe(night[key])
        }
    })

    it('keeps the photo card a window in both', () => {
        for (const designVariant of FRAMED) {
            const { theme } = buildGuestPageTheme({ designVariant })
            expect(theme.photoCardBorder, designVariant).toContain('dashed')
            expect(theme.photoCardBg, designVariant).not.toBe(theme.cardBg)
        }
    })

    it('still reports exactly one variant flag', () => {
        const r = buildGuestPageTheme({ eventType: 'bar_mitzvah', designVariant: 'dawn' })
        expect([r.isPoker, r.isRomantic, r.isNight, r.isDawn].filter(Boolean)).toHaveLength(1)
    })

    it('still leaves poker alone, because poker is the event', () => {
        expect(buildGuestPageTheme({ eventType: 'poker', designVariant: 'dawn' }).isPoker).toBe(true)
    })
})
