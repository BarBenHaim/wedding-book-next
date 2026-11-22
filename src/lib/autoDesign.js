// src/lib/autoDesign.js — pure: the book a new event starts with.
//
// A paid order used to open an event with the plain default look, and the owner
// had to find the design strip to get anything better. Now the event opens
// already dressed for its occasion: one of the house designs (frameless page
// background, matching colours, a photo frame), chosen by event type.
//
// Written once, when the event is created (createWedding). It is the event's
// own `bookDesign`, so everything that already reads a book's design reads it,
// and the owner's pick in the design strip replaces it wholesale exactly as it
// replaces any other. Events that already exist are never touched.
//
// Fonts are left to the default on purpose. A preset names its fonts by a key
// that the browser turns into a build-specific class name, and a server cannot
// store that; the page falls back to the book's default face. The owner can
// still pick a design with its own fonts from the strip, which is the same
// design (see the studio_house_* presets) with fonts added.

import { applyPresetClean } from './bookDesignSchema'

const BASE = {
    template: 'classic', blessingTemplate: null, autoSplit: false, splitThreshold: 240, entriesPerPage: 1,
    backgroundColor: '#ffffff', texture: null, frame: null,
    textAlign: 'center', nameAlign: 'center', imageAlign: 'center',
    fontSizePercent: 2.7, nameFontSizePercent: 2.8, nameMarginTop: 0, nameMarginBottom: 1, nameMaxWidth: 60,
    imageStyle: { width: 60, borderRadius: 0, height: 45 }, photoFit: 'cover', photoLayout: 'uniform',
    imageMarginTop: 5.5, imageMarginBottom: 2, photoFrameInset: 6,
    textMaxWidth: 61, textMarginTop: 5, textLineHeight: 1.5, pagePadding: 3.5, borderRadius: 0,
}

// Slice (% of the artwork that is border) per art frame, kept with ART_FRAMES in photoFrames.js.
const ART = { 'gold-floral': 9.5, 'navy-gold': 8, oak: 7.5 }
const art = id => ({ photoFrame: null, photoFrameUrl: `/frames/art/${id}.png`, photoFrameSlice: ART[id] })
const built = id => ({ photoFrame: id, photoFrameUrl: null, photoFrameSlice: null })

export const AUTO_DESIGNS = Object.freeze({
    'wd-blush': { backgroundUrl: '/backgrounds/book/wd-blush.webp', fontColor: '#4a2f35', nameColor: '#8a4a5a', ...art('gold-floral') },
    // pagePadding keeps the content clear of the stripes and the garland painted along the edges
    'bm-tallit': { pagePadding: 12, backgroundUrl: '/backgrounds/book/bm-tallit.webp', fontColor: '#14305a', nameColor: '#2545E0', ...built('navy-line') },
    'bm-iceblue': { backgroundUrl: '/backgrounds/book/bm-iceblue.webp', fontColor: '#14305a', nameColor: '#2545E0', ...built('navy-line') },
    'bd-bunting': { pagePadding: 10, backgroundUrl: '/backgrounds/book/bd-bunting.webp', fontColor: '#5a3b4d', nameColor: '#c0507a', ...built('soft-card') },
    'cl-letterpress': { backgroundUrl: '/backgrounds/book/cl-letterpress.webp', fontColor: '#3a2f22', nameColor: '#7a5c3a', ...built('soft-card') },
})

const BY_EVENT = {
    wedding: 'wd-blush',
    bar_mitzvah: 'bm-tallit',
    twins_bar_mitzvah: 'bm-tallit',
    bat_mitzvah: 'bm-iceblue',
    birthday: 'bd-bunting',
}

/** The house design key for an event type; any other type gets the plain paper one. */
export function autoDesignKeyFor(eventType) {
    return BY_EVENT[eventType] || 'cl-letterpress'
}

/** The complete `bookDesign` for a new event of this type, in the shape applyPresetClean gives. */
export function autoBookDesign(eventType) {
    return applyPresetClean({ ...BASE, ...AUTO_DESIGNS[autoDesignKeyFor(eventType)] })
}
