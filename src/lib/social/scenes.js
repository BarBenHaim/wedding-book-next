// src/lib/social/scenes.js
//
// What the picture is OF, as art direction rather than a description.
//
// The first version of the image prompts said things like "an open guest
// book on a table". That produces exactly what you would expect: a
// stock photograph of a generic book, different every time, recognisable
// as nothing in particular. Lord's note after seeing the first renders
// was that they should look designed and should vary - a birthday one, a
// bar mitzvah one, a bat mitzvah one - and that the product is SQUARE,
// which none of the prompts had ever said.
//
// So this file splits the picture into two things that vary
// independently: the SCENE (what is happening, how it is framed, what
// lens) and the EVENT STYLE (palette, props, mood). Six scenes times
// four event types is twenty-four distinct-looking posts before a single
// word of caption changes, and each one is specified tightly enough that
// the model is composing rather than inventing.
//
// The direction is deliberately photographic - surface, light, lens,
// distance - because that produces a consistent result. Adjectives like
// "elegant" and "premium" produce a different stock cliche every time.

// The product, stated identically in every prompt. This is the fact the
// earlier prompts were missing, and it is the one people recognise the
// product by: a square book reads as a keepsake, a rectangular one reads
// as a photo album from a shop.
export const PRODUCT = [
    'The book is SQUARE: equal width and height, roughly 25cm on each side, hardcover with a fine fabric or textured paper cover and a slim spine.',
    'Never a portrait or landscape rectangle. The square shape must be unmistakable from the angle chosen.',
    'No printed logos, no lettering and no title on the cover unless the instructions below explicitly ask for text.',
].join(' ')

// Shared photographic grammar. One place, so a change to the house look
// does not mean editing twenty-four scene descriptions.
export const CRAFT = [
    'Photographic and real, not a 3D render and not an illustration.',
    'One soft directional light source, as if from a nearby window. Gentle falloff, soft-edged shadows, no flash.',
    'Shot on a full-frame camera with a 50mm or 85mm lens at a wide aperture: the subject is sharp, the background falls away.',
    'Natural imperfection is welcome - a crease in the linen, an uneven shadow. Nothing looks staged for a catalogue.',
    'No people\'s faces. No confetti, no sparkles, no lens flare, no bokeh light strings, no text overlays, no borders, no collage.',
].join(' ')

/**
 * The scenes.
 *
 * `needsPhoto` marks the ones that must be built by EDITING a real
 * photograph rather than generated: where the picture's whole claim is
 * that this is a book we actually printed, or a screen that actually
 * exists, a synthesised version is worse than nothing. The one audience
 * that will look closely is the one deciding whether to spend 950
 * shekels on a physical keepsake.
 */
export const SCENES = [
    {
        id: 'flatlay',
        label: 'שטוח מלמעלה',
        job: 'להראות את הצורה. הריבוע הוא מה שמזהים',
        prompt: [
            'Shot straight down from directly above onto a textured linen surface.',
            'The square book sits slightly off-centre, closed, one corner catching the light so the depth of the cover reads.',
            'A few small props rest near the edges of the frame, partly cropped: never crowding the book.',
            'Generous empty space above and to one side, enough that a line of text could sit there without touching anything.',
        ].join(' '),
    },
    {
        id: 'spread_open',
        label: 'עמוד פתוח',
        job: 'להראות מה יש בפנים: ברכה בכתב יד ותמונה',
        needsPhoto: true,
        prompt: [
            'The square book lying open flat, seen from just above and slightly to one side so both pages read.',
            'One page carries a handwritten message, the facing page a printed photograph.',
            'Close enough that the paper texture and the ink are visible, far enough that the whole spread is in frame.',
        ].join(' '),
    },
    {
        id: 'phone_screen',
        label: 'המסך בתוך טלפון',
        job: 'להסביר את המנגנון בלי מילים: סורקים, כותבים, מעלים',
        needsPhoto: true,
        // The source image is a real screenshot of the live guest page, so
        // the Hebrew interface is correct by construction. Asking a model
        // to invent a Hebrew UI produces gibberish text in a mock-up that
        // is supposed to demonstrate the product working.
        prompt: [
            'Place this screenshot on the display of a modern smartphone held upright in one hand.',
            'The screen content must be reproduced EXACTLY as given: same layout, same colours, same text, unchanged and unblurred, fitted to the screen with no cropping of the interface.',
            'Behind the hand, softly out of focus, a square hardcover guest book rests on a table.',
            'Natural skin, a real hand, no jewellery, no watch. Shot slightly from above at a comfortable reading distance.',
        ].join(' '),
    },
    {
        id: 'event_table',
        label: 'שולחן קבלת פנים',
        job: 'להראות איפה הספר עמוד בפועל באירוע',
        prompt: [
            'A welcome table at an event, photographed from standing height at a slight angle.',
            'The square book rests on it beside a small printed card holding a QR code, and a pen lies nearby.',
            'The room behind is dim and out of focus, suggesting an evening event without showing any guests.',
        ].join(' '),
    },
    {
        id: 'shelf_years_later',
        label: 'על המדף, שנים אחרי',
        job: 'הרגש. זה מה שמוכר מזכרת',
        prompt: [
            'The square book standing on a domestic shelf among ordinary household objects, years after the event.',
            'Lived-in and unstyled: a plant, a framed picture, a ceramic jug, everything slightly worn.',
            'Late afternoon light across the wall. Nothing in the frame suggests a product photograph.',
        ].join(' '),
    },
    {
        id: 'handover',
        label: 'רגע המסירה',
        job: 'המוצר כמתנה, לא כמוצר',
        prompt: [
            'Two hands passing the closed square book across a table, caught mid-movement.',
            'Cropped at the wrists so no faces or bodies are in frame.',
            'Shallow focus on the book, hands slightly soft. The gesture should read as giving something that matters.',
        ].join(' '),
    },
]

// ── Letting it off the leash ─────────────────────────────────────────
//
// Lord's note, after seeing the directed renders: give the model room,
// it is best when it builds from nothing. He is right, and the scenes
// above are the opposite instinct - they exist because a vague prompt
// produced generic stock photography.
//
// So the split is not "tight or loose", it is WHICH THINGS are fixed.
// Three facts are not style and are never negotiable: the book is
// square, no invented Hebrew, no faces. Everything a designer would
// actually decide - composition, palette, props, light, mood, distance -
// is handed over, along with an explicit push away from the obvious.
// That last part matters more than it looks: told only "be creative", a
// model reliably produces a book on a table, because that is the centre
// of everything it has seen.
export const NON_NEGOTIABLE = [
    PRODUCT,
    'No human faces anywhere in the frame. Hands are fine.',
    'No text, no lettering, no logo and no watermark unless the instructions below explicitly supply a line to render.',
].join(' ')

export const CREATIVE_LICENCE = [
    'You are art-directing this image, not illustrating a description.',
    'Choose the composition, the camera angle and distance, the surface, the palette, the props, the light and the mood yourself.',
    'It should look like a photograph a good brand would pay for: specific, considered, and unlike the last one.',
    'Deliberately avoid the obvious answer. A closed book centred on a wooden table in soft daylight is the image everyone makes; make a different one.',
    'Unusual angles, unexpected surfaces, strong shadow, negative space, a detail rather than the whole object - all welcome, as long as the product is unmistakable.',
].join(' ')

// The open brief, used when a post should be the model's idea rather
// than ours. It carries the JOB of the post so the freedom has a target:
// creative and off-message is worse than safe and on-message.
export const FREE_SCENE = {
    id: 'free',
    label: 'חופשי',
    job: 'לתת למודל לביים בעצמו',
    free: true,
}

export const SCENE_IDS = [...SCENES.map(s => s.id), FREE_SCENE.id]

export function findScene(id) {
    if (id === FREE_SCENE.id) return FREE_SCENE
    return SCENES.find(s => s.id === id) || null
}

/**
 * Palette, props and mood per event type.
 *
 * The navy and gold for a bar mitzvah is not an arbitrary choice: it is
 * the palette of the live guest page people actually see, so a post and
 * the screen it advertises look like the same product.
 */
export const EVENT_STYLE = {
    wedding: {
        label: 'חתונה',
        prompt: [
            'Palette: ivory, oat and warm cream, with one muted brass accent.',
            'Props: crumpled linen, a sprig of eucalyptus, a plain glass.',
            'Mood: calm, adult, unhurried. Daylight.',
        ].join(' '),
    },
    bar_mitzvah: {
        label: 'בר מצווה',
        prompt: [
            'Palette: deep navy blue and warm gold, on a dark textured surface.',
            'Props: a folded tallit with visible fringes at the edge of frame, a small kiddush cup.',
            'Mood: ceremonial and warm rather than formal. Evening light.',
        ].join(' '),
    },
    bat_mitzvah: {
        label: 'בת מצווה',
        prompt: [
            'Palette: soft blush, sage green and pale cream, on a light surface.',
            'Props: a few delicate stems, a thin ribbon, a small ceramic dish.',
            'Mood: bright, airy and fresh, never girlish or pastel-cute. Morning light.',
        ].join(' '),
    },
    birthday: {
        label: 'יום הולדת',
        prompt: [
            'Palette: warm terracotta, amber and soft white.',
            'Props: one single lit candle, a folded napkin, a small plate at the edge of frame.',
            'Mood: intimate and domestic, a small gathering rather than a party. Late light.',
        ].join(' '),
    },
}

export const EVENT_TYPES = Object.keys(EVENT_STYLE)

export function eventStyle(type) {
    return EVENT_STYLE[type] || EVENT_STYLE.wedding
}

export default {
    SCENES, SCENE_IDS, findScene, EVENT_STYLE, EVENT_TYPES, eventStyle,
    PRODUCT, CRAFT, NON_NEGOTIABLE, CREATIVE_LICENCE, FREE_SCENE,
}
