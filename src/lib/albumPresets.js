// src/lib/albumPresets.js
//
// Three albums, one engine.
//
// A preset here is not a colour scheme bolted onto a fixed layout — it
// changes the geometry the layout engine solves with. Margin and gutter
// are the two numbers that decide whether a page reads as expensive or
// as a printout, so they belong to the preset rather than to the
// renderer, and the engine takes them as input.
//
// The brief was "beautiful, and not like the album services". What
// those look like, and what these deliberately avoid: every photo
// cropped to a uniform box, margins tight enough to feel like the paper
// ran out, and drop shadows standing in for design. So: generous and
// unequal white space, no crop anywhere, and ornament only where a
// preset is actually about ornament.

export const ALBUM_PRESETS = {
    // Wide margins, no ornament, nothing between the eye and the
    // photograph. The most expensive-looking of the three precisely
    // because it does the least.
    magazine: {
        id: 'magazine',
        label: 'מגזין — לבן, נדיב, שקט',
        hint: 'הרבה חלל לבן, בלי מסגרות ובלי צללים. נראה כמו ספר צילום, לא כמו הדפסה מקוונת.',
        pageBg: '#ffffff',
        ink: '#1a1a1a',
        muted: '#9a9a9a',
        accent: '#1a1a1a',
        geometry: { margin: 8.5, gutter: 2.2, soloMargin: 6 },
        photo: { radius: 0, border: null, shadow: 'none' },
        folio: { show: true, size: 1.5, letterSpacing: '0.22em' },
        swatch: ['#ffffff', '#e8e8e8', '#1a1a1a'],
    },

    // Dark ground, small margins, photographs carrying the whole page.
    // The margin never reaches zero: a photograph bled to the trim is a
    // photograph the binding can eat.
    cinematic: {
        id: 'cinematic',
        label: 'קולנועי — כהה, תמונות גדולות',
        hint: 'רקע עמוק ושוליים צרים, כך שהצילום נושא את העמוד. דרמטי — ומחמיא לתמונות טובות.',
        pageBg: '#101012',
        ink: '#f2efe9',
        muted: '#6f6d6a',
        accent: '#c9a44e',
        geometry: { margin: 4.5, gutter: 1.2, soloMargin: 2.5 },
        photo: { radius: 0, border: null, shadow: 'none' },
        folio: { show: true, size: 1.3, letterSpacing: '0.3em' },
        swatch: ['#101012', '#2a2a2e', '#c9a44e'],
    },

    // The house language, so an album can sit on the shelf beside a
    // blessing book and look like the same product.
    heritage: {
        id: 'heritage',
        label: 'קרם וזהב — השפה של Wedding Tales',
        hint: 'אותה פלטה של ספרי הברכות: קרם, זהב, ומסגרת דקה סביב כל תמונה.',
        pageBg: '#fbf6ec',
        ink: '#3d2e1a',
        muted: '#b9a684',
        accent: '#aa8840',
        geometry: { margin: 9.5, gutter: 2.4, soloMargin: 7 },
        photo: { radius: 2, border: '1px solid rgba(170,136,64,0.45)', shadow: 'none' },
        folio: { show: true, size: 1.4, letterSpacing: '0.18em' },
        swatch: ['#fbf6ec', '#e7dcc6', '#aa8840'],
    },
}

export const ALBUM_PRESET_ORDER = ['magazine', 'cinematic', 'heritage']

export function getAlbumPreset(id) {
    return ALBUM_PRESETS[id] || ALBUM_PRESETS.magazine
}

/** Engine options for a preset, merged over any explicit overrides. */
export function albumGeometry(presetId, pageW, pageH, overrides = {}) {
    const p = getAlbumPreset(presetId)
    return { pageW, pageH, ...p.geometry, ...overrides }
}
