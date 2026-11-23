// src/lib/ownerLookAi.js — pure: what we ask the image model for, and the rules around asking.
//
// The owner uploads one photo of the celebrant (or the couple). For each design the image model gets that
// photo plus our own finished covers or signs as style references, and draws a creative cover or the upper
// part of a "ברכו את" sign around the person. The model draws the artwork and the Hebrew headline; the QR
// code, the steps and the web address of the sign are never drawn by the model (a drawn QR does not scan):
// the sign is left empty in its lower part, and portal/PosterSheet.jsx puts the real, scannable QR and the
// live text there.
//
// The photo of a customer goes to an outside service (OpenAI) for this, so the studio asks for an explicit
// yes first, and every event has a ceiling on how many images it can ask for.

import { EVENT_LABEL_HE } from './ownerLook'

/** Images one event may ask for in all: two rounds of the five designs, plus a few to spare. */
export const LOOK_LIMIT_PER_EVENT = 12

export const LOOK_OPTIONS = Object.freeze([
    { id: 'cover1', kind: 'cover', name: 'מסגרת זהב' },
    { id: 'cover2', kind: 'cover', name: 'שמש זהב' },
    { id: 'cover3', kind: 'cover', name: 'תמונה מלאה' },
    { id: 'sign1', kind: 'sign', name: 'קשת זהב' },
    { id: 'sign2', kind: 'sign', name: 'צבעי מים' },
])
export const LOOK_OPTION_IDS = Object.freeze(LOOK_OPTIONS.map(o => o.id))
export const lookOption = id => LOOK_OPTIONS.find(o => o.id === id) || null

// 1:1 for the cover, 2:3 for the sign; these are sizes the model draws well. The cover is enlarged to the size
// the book needs after it comes back (see the route).
export const API_SIZE = Object.freeze({ cover: '1024x1024', sign: '1024x1536' })
export const OUTPUT_EDGE = Object.freeze({ cover: 2000, sign: 2000 })

// Past this many characters the model starts dropping and inventing letters (see social/imagePrompt.js).
export const MAX_ART_NAME_CHARS = 24

/** The name as it will be drawn: whole when short, else the first words that fit, else the first word. */
export function artName(names) {
    const full = String(names || '').replace(/\s+/g, ' ').trim()
    if (!full) return ''
    if (full.length <= MAX_ART_NAME_CHARS) return full
    const words = full.split(' ')
    let out = ''
    for (const word of words) {
        const next = out ? `${out} ${word}` : word
        if (next.length > MAX_ART_NAME_CHARS) break
        out = next
    }
    return out || words[0].slice(0, MAX_ART_NAME_CHARS)
}

const MOTIF = Object.freeze({
    bar_mitzvah: 'a glowing old Jerusalem skyline, a gold-edged tallit stripe, deep navy and gold marbled watercolor',
    twins_bar_mitzvah: 'a glowing old Jerusalem skyline, gold-edged tallit stripes, deep navy and gold marbled watercolor',
    bat_mitzvah: 'delicate blush and ice-blue flowers, soft rose-gold watercolor washes with gold veining',
    wedding: 'a romantic golden-hour sea sunset, tulle drapes, candle lanterns and white flowers',
    birthday: 'rising balloons in peach, coral and gold, scattered gold confetti, warm watercolor',
    poker: 'deep emerald felt, gold playing cards and chips, rich and elegant',
    travel: 'a vintage world map, a gold compass rose, sky-blue watercolor, a sense of adventure',
    other: 'sage-green and champagne watercolor, a refined gold leaf garland, calm and universal',
})
const motifFor = type => MOTIF[type] || MOTIF.other

const DIRECTION = Object.freeze({
    cover1: 'The person sits in the centre inside a large ornate gold wreath ring with fine leaves, surrounded by the motif; ivory parchment around, thin gold border and corner ornaments. Title lettering at the bottom.',
    cover2: 'The person as a clean cut-out portrait on one side, in front of a big glowing gold disc like a sun, with layered watercolor landscape shapes in the lower corner and tiny gold stars. The lettering stacked on the other side.',
    cover3: 'The photo itself fills the whole cover as a cinematic, slightly stylised scene; add a soft ivory-to-transparent vignette at the bottom with the motif painted in gold and watercolor, and place the lettering there. The person stays natural and unretouched.',
    sign1: 'The person inside a tall gold-edged arch window, soft watercolor and gold marbling spilling around the arch, golden sparkles; the headline sits on a soft watercolor band under the arch.',
    sign2: 'A loose, joyful watercolor splash in the occasion colours behind the person, who is cut out cleanly with a soft glow; the headline in bold navy below in a hand-painted gold-edged ribbon.',
})

const COVER_BRIEF = 'a premium Hebrew blessing-book FRONT COVER'
const SIGN_BRIEF = 'the TOP PART of a celebration sign (A4 portrait) with the title "ברכו את"'

/**
 * The prompt for one design. `people` is 'one' (a celebrant) or 'couple'; the faces must stay recognisable.
 * Returns '' for an unknown option.
 */
export function buildLookPrompt({ option, eventType, names = '', people = 'one' }) {
    const o = lookOption(option)
    if (!o) return ''
    const name = artName(names)
    const label = EVENT_LABEL_HE[eventType] || ''
    const who = people === 'couple' ? 'the couple (both people)' : eventType === 'twins_bar_mitzvah' ? 'the two brothers' : 'the celebrant'
    const lines = []
    lines.push(`Make ONE image: ${o.kind === 'cover' ? `${COVER_BRIEF} (square 1:1)` : `${SIGN_BRIEF} (portrait)`}.`)
    lines.push(`The FIRST attached image is a photo of ${who}. Keep every face accurately recognisable: do not change anyone's features, age, skin, hair or expression, and do not add people. Integrate ${people === 'couple' ? 'them' : 'the person'} beautifully and creatively into the artwork.`)
    lines.push(`The other attached images are finished designs of our brand. Use them only for the level of quality and the family of materials (ivory parchment, fine gold ornament, embossed gold Hebrew lettering, watercolor): make a NEW, unique composition, never a copy of them.`)
    lines.push(`Occasion motif: ${motifFor(eventType)}.`)
    lines.push(`Direction: ${DIRECTION[option]}`)
    if (o.kind === 'cover') {
        lines.push(`Hebrew text, spelled exactly, right to left, every letter correct, and nothing else written anywhere: the large title ספר הברכות${name ? `, the name ${name}` : ''}${label ? `, and a small line ${label}` : ''}.`)
        lines.push('Keep all text and all important art inside the central 86% of the image (the edges are trimmed in print).')
    } else {
        lines.push(`Hebrew text, spelled exactly, right to left, every letter correct, and nothing else written anywhere: the large headline ברכו את${name ? ` ${name}` : ''}${label ? `, and a small line ${label}` : ''}.`)
        lines.push('Design ONLY the upper 58% of the sign. The lower 42% must be a calm, plain, empty area in exactly the same background colour or paper texture, with no text, no shapes and no QR code (we place the real QR code there ourselves).')
        lines.push('Keep important content inside the central 88% of the width.')
    }
    lines.push('No flags, no logos, no watermark, no extra captions.')
    return lines.join('\n')
}

/** Which of our own finished designs go along as style references (paths under /public). */
export function styleRefs(option, eventType, coverKey) {
    const o = lookOption(option)
    if (!o) return []
    if (o.kind === 'cover') return [`/covers/${coverKey}.webp`, '/covers/bat_mitzvah.webp']
    return ['/look-refs/sign-yoav.webp', '/look-refs/sign-elia.webp']
}

/**
 * The only photo addresses we accept: a file the owner just uploaded into this event's own folder in our own
 * bucket. Anything else (another event's folder, another host) is refused, so the route cannot be used to make
 * our server fetch arbitrary addresses.
 */
export function validPhotoUrl(url, bucket, weddingId) {
    if (typeof url !== 'string' || url.length > 1500 || !bucket || !weddingId) return false
    let u
    try {
        u = new URL(url)
    } catch {
        return false
    }
    if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return false
    const prefix = `/v0/b/${bucket}/o/`
    if (!u.pathname.startsWith(prefix)) return false
    let object
    try {
        object = decodeURIComponent(u.pathname.slice(prefix.length))
    } catch {
        return false
    }
    return object.startsWith(`weddings/${weddingId}/owner-photo-`) && !object.includes('..') && !object.slice(`weddings/${weddingId}/`.length).includes('/')
}

/** Whether another image may be asked for, given what the event has used. */
export function renderAllowed(used) {
    const n = Number(used)
    return !(Number.isFinite(n) && n >= LOOK_LIMIT_PER_EVENT)
}
