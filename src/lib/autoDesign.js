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
import { ART_FRAMES } from './photoFrames'

const BASE = {
    template: 'classic', blessingTemplate: null, autoSplit: false, splitThreshold: 240, entriesPerPage: 1,
    backgroundColor: '#ffffff', texture: null, frame: null,
    textAlign: 'center', nameAlign: 'center', imageAlign: 'center',
    fontSizePercent: 3.2, nameFontSizePercent: 3, nameMarginTop: 0, nameMarginBottom: 1, nameMaxWidth: 60,
    imageStyle: { width: 62, borderRadius: 0, height: 46 }, photoFit: 'cover', photoLayout: 'uniform',
    imageMarginTop: 5.5, imageMarginBottom: 2, photoFrameInset: 6,
    textMaxWidth: 62, textMarginTop: 5, textLineHeight: 1.5, pagePadding: 3.5, borderRadius: 0,
}

// The slice of an art frame is measured once, in photoFrames.js, and read from there.
const art = id => {
    const f = ART_FRAMES.find(x => x.id === id)
    return { photoFrame: null, photoFrameUrl: f.url, photoFrameSlice: f.slicePct }
}
const built = id => ({ photoFrame: id, photoFrameUrl: null, photoFrameSlice: null })

// The designs the owners picked out (22.11.2026). `pagePadding` keeps the content clear of art
// painted along the page edge (the Jerusalem skyline along the bottom).
export const AUTO_DESIGNS = Object.freeze({
    'wd-silk': { backgroundUrl: '/backgrounds/book/wd-silk.webp', fontColor: '#4a3a22', nameColor: '#8a6a34', ...art('silk-ribbon') },
    'bm-jerusalem': { pagePadding: 8, backgroundUrl: '/backgrounds/book/bm-jerusalem.webp', fontColor: '#4a3520', nameColor: '#8a6234', ...art('sand-stone') },
    'bm-iceblue': { backgroundUrl: '/backgrounds/book/bm-iceblue.webp', fontColor: '#14305a', nameColor: '#2545E0', ...art('ice-gold') },
    'bd-balloons': { pagePadding: 5, backgroundUrl: '/backgrounds/book/bd-balloons.webp', fontColor: '#6a3a30', nameColor: '#d0705a', ...built('rounded') },
    'nt-linen': { backgroundUrl: '/backgrounds/book/nt-linen.webp', fontColor: '#3a2f22', nameColor: '#7a5c3a', ...art('linen-stitch') },
})

const BY_EVENT = {
    wedding: 'wd-silk',
    bar_mitzvah: 'bm-jerusalem',
    twins_bar_mitzvah: 'bm-jerusalem',
    bat_mitzvah: 'bm-iceblue',
    birthday: 'bd-balloons',
}

/** The house design key for an event type; any other type gets the plain linen one. */
export function autoDesignKeyFor(eventType) {
    return BY_EVENT[eventType] || 'nt-linen'
}

/** The complete `bookDesign` for a new event of this type, in the shape applyPresetClean gives. */
export function autoBookDesign(eventType) {
    return applyPresetClean({ ...BASE, ...AUTO_DESIGNS[autoDesignKeyFor(eventType)] })
}
