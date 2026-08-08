// src/lib/social/imagePrompt.js
//
// Asking an image model for a finished Hebrew post.
//
// This file replaces the approach in compose.js, and the reversal is
// worth stating plainly because it is the single riskiest bet in the
// social pipeline. compose.js composited the text ourselves: satori laid
// out the Hebrew, sharp burned it onto a photograph, and the letters were
// correct by construction because no model ever touched them. What it
// could not do was make the type feel designed. Every post came out with
// the same scrim and the same right-aligned block, because that is what a
// layout engine does.
//
// So the text goes back to the model. The upside is real design. The
// downside is that image models have historically produced Hebrew that
// ranges from slightly wrong to a row of invented glyphs, and Hebrew that
// is slightly wrong is worse for this business than no text at all: the
// audience is native, the product is a printed keepsake, and a mangled
// letter reads as "these people are careless with text" about a company
// whose entire job is printing text.
//
// Everything below is built around lowering that risk rather than hoping.
//
//   1. Short strings. Every extra word is another chance to hallucinate a
//      letterform, and the failure rate climbs with length, not linearly.
//   2. One string per image. Never a headline AND a kicker AND a price.
//      If the model has to place two Hebrew strings it will usually get
//      one of them wrong, and a post with one perfect line and one broken
//      line is unpublishable in exactly the same way as two broken lines.
//   3. Edit the real photograph rather than generate a new one, wherever
//      a real photograph exists. The books in the portfolio were actually
//      printed. A synthesised book is uncanny to the one audience that
//      has looked closely at a real one.
//   4. Every request carries an explicit verbatim contract for the text,
//      so that when a render IS wrong it is wrong in a way we can detect
//      by looking, rather than wrong in a way we argue about.
//
// If the four test renders come back with broken Hebrew, compose.js is
// the fallback and the three bidi lessons in its header are why it works.

import { planForDate, hashtagsFor } from './contentPlan'
import { findScene, eventStyle, PRODUCT, CRAFT, NON_NEGOTIABLE, CREATIVE_LICENCE, FREE_SCENE } from './scenes'
import { GUEST_SCREEN } from './contentPlan'

// The model. gpt-image-1 was the obvious choice and is no longer the
// current one - gpt-image-2 supersedes it, and it is better at exactly
// the thing this whole approach is betting on, which is rendering text
// inside the picture. Overridable by env so a bad result can be walked
// back to gpt-image-1, or down to gpt-image-1-mini, without a deploy.
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'

// Instagram wants 4:5 for feed and 9:16 for stories; the model offers
// 2:3, 3:2 and square. 1024x1536 is the closest available to both, and
// cropping a 2:3 down to 4:5 loses less than upscaling a square, so both
// formats are requested at 2:3 and trimmed afterwards rather than asking
// for something the model will approximate badly.
export const SIZES = {
    post: { size: '1024x1536', aspect: '4:5', crop: { width: 1080, height: 1350 } },
    story: { size: '1024x1536', aspect: '9:16', crop: { width: 1080, height: 1920 } },
}

export const BRAND = {
    ink: '#1a1410',
    cream: '#f8f4ec',
    gold: '#c9a44e',
}

// The ceiling is not a style preference. Past this length the model
// starts dropping and inventing characters, and the post has to be
// thrown away rather than fixed.
export const MAX_TEXT_CHARS = 28

const HEBREW = /[֐-׿]/

/**
 * Is this string safe to hand to an image model?
 *
 * Rejects on three counts, each of which produced a bad render:
 * length, mixed scripts, and anything that is not a single line. Mixed
 * Hebrew and Latin in one string is the worst case — the model has to
 * switch direction mid-line and almost never does it correctly.
 */
export function checkText(text) {
    const s = String(text || '').trim()
    if (!s) return { ok: false, reason: 'empty' }
    if (s.length > MAX_TEXT_CHARS) return { ok: false, reason: 'too-long' }
    if (/[\n\r]/.test(s)) return { ok: false, reason: 'multiline' }
    if (!HEBREW.test(s)) return { ok: false, reason: 'not-hebrew' }
    if (/[A-Za-z]/.test(s)) return { ok: false, reason: 'mixed-script' }
    // Digits inside RTL text force a direction switch for the run and are
    // the second most common source of a scrambled line.
    if (/\d/.test(s)) return { ok: false, reason: 'contains-digits' }
    return { ok: true, reason: null }
}

/**
 * The verbatim contract.
 *
 * Written as its own block so it is identical in every request and can be
 * asserted on in a test. The character-by-character spelling matters more
 * than it looks: given only the word, models reach for a visually similar
 * word they have seen more often, and given the letters they copy. It is
 * ugly and it works.
 */
export function textContract(text) {
    const chars = [...String(text)].filter(c => c !== ' ').join(' ')
    return [
        `The image must contain exactly one line of Hebrew text and nothing else written anywhere.`,
        `That line is, character for character: "${text}"`,
        `Its letters in order are: ${chars}`,
        `Hebrew is written right to left. The first letter listed above must appear at the RIGHT edge of the line and the last at the LEFT edge.`,
        `Do not translate it, do not transliterate it, do not add a second line, do not add English, do not add a logo, a watermark, a website, a price, a phone number, a hashtag or any decorative lettering.`,
        `If the text cannot be rendered accurately, render the image with no text at all rather than approximate letterforms.`,
    ].join(' ')
}

// Where the line of text sits. Kept out of the scene descriptions so a
// scene can be reused for a post and for a story, which crop very
// differently and cover different parts of the frame with app UI.
const PLACEMENT = {
    post: `Place the line of text in the lower third, right-aligned, with clear space around it. Keep the bottom 8% of the frame empty.`,
    story: `Place the line of text in the upper-middle area, right-aligned. Keep the top 15% and bottom 20% of the frame completely empty, because the app covers them.`,
}

/**
 * Build the request for one post.
 *
 * `mode` is the important argument. `edit` sends a real photograph of a
 * book we printed and asks only for the text to be added; `generate`
 * synthesises the whole frame. Edit is preferred wherever a photo exists,
 * and generate is there for the days when the angle is about a mood
 * rather than about the object.
 */
export function buildImagePrompt(plan, { size = 'post', mode = 'edit', text } = {}) {
    if (!plan) return null
    const fmt = SIZES[size] || SIZES.post
    // An explicitly passed `text` is used exactly as given, including an
    // empty string, which is how a caller asks for a wordless picture.
    // Falling back on falsiness would quietly turn "" into the plan's
    // headline, and the one render meant to test the picture alone would
    // come back with words on it.
    const line = (text === undefined ? String(plan.headline || '') : String(text ?? '')).trim()
    const check = checkText(line)

    // The scene says what the picture is; the event style says what it
    // looks like. Both come from scenes.js so a caption angle and its
    // picture cannot drift apart.
    const scene = findScene(plan.sceneId) || findScene('flatlay')
    const style = eventStyle(plan.eventType)

    const parts = [`A ${fmt.aspect} image for an Instagram post.`]
    if (scene.free && mode !== 'edit') {
        // The open brief: the job of the post, the three facts that are
        // not style, and the rest is the model's call.
        parts.push(`The post has to communicate this: ${plan.job || plan.brief || 'what this product is and why it is worth keeping'}.`)
        parts.push(`The event is a ${(plan.eventType || 'wedding').replace(/_/g, ' ')}.`)
        parts.push(NON_NEGOTIABLE)
        parts.push(CREATIVE_LICENCE)
    } else if (mode === 'edit') {
        parts.push(scene.prompt)
        // Editing means the source is real and its content is the point.
        // The scene prompt says what to do with it; this says what not to.
        parts.push(
            `Work from the supplied image. Do not redraw, restyle or replace what is already in it; add only what these instructions ask for.`,
        )
    } else {
        parts.push(scene.prompt)
        parts.push(PRODUCT)
        parts.push(style.prompt)
        parts.push(CRAFT)
    }
    if (check.ok) {
        parts.push(textContract(line))
        parts.push(PLACEMENT[size] || PLACEMENT.post)
        parts.push(
            `Set the text in a clean modern Hebrew sans-serif, medium weight, high contrast against whatever is behind it, at a size a person reads without effort on a phone.`,
        )
    } else {
        // Rather than send a string we already know will render badly, ask
        // for the picture alone. A clean photo with the words in the
        // caption is a publishable post; a photo with broken Hebrew is not.
        parts.push(`The image must contain no text, no lettering, no logo and no watermark of any kind.`)
    }

    return {
        mode,
        size,
        model: IMAGE_MODEL,
        apiSize: fmt.size,
        crop: fmt.crop,
        sourceImage: mode === 'edit' ? plan.photo : null,
        text: check.ok ? line : null,
        textRejected: check.ok ? null : check.reason,
        angleId: plan.angleId,
        sceneId: scene.id,
        sceneLabel: scene.label,
        eventType: plan.eventType,
        eventLabel: style.label,
        prompt: parts.join('\n\n'),
    }
}

/**
 * The four renders that decide the architecture.
 *
 * Chosen to disagree with each other rather than to look good together:
 * an edit and a generate, a post and a story, a short caption and one at
 * the length ceiling. If Hebrew survives all four the model can be
 * trusted with the feed; if it survives only the short edit, the pipeline
 * gets narrower rather than being abandoned.
 */
export function testBatch(iso) {
    const day0 = planForDate(iso, { slot: 0 })
    const day1 = planForDate(iso, { slot: 1 })
    // Four renders chosen to disagree: the phone scene against a real
    // screenshot, and three generated scenes across three different event
    // stylings, so one look cannot pass for all of them.
    const phone = { ...day0, sceneId: 'phone_screen', eventType: 'bar_mitzvah', photo: GUEST_SCREEN }
    return [
        // Wordless on purpose: this render answers one question, which
        // is whether the real screenshot survives being placed in a
        // scene. A caption on top would only add a second variable.
        buildImagePrompt(phone, { size: 'post', mode: 'edit', text: '' }),
        buildImagePrompt({ ...day1, sceneId: 'flatlay', eventType: 'bat_mitzvah' }, { size: 'post', mode: 'generate', text: 'ככה זה נראה בסוף' }),
        buildImagePrompt({ ...day1, sceneId: 'shelf_years_later', eventType: 'birthday' }, { size: 'story', mode: 'generate', text: 'בעוד עשרים שנה' }),
        // Deliberately wordless: it is the one render that shows what the
        // picture is worth on its own, with the caption living under the
        // post where text is always safe.
        buildImagePrompt({ ...day0, sceneId: 'free', eventType: 'wedding' }, { size: 'post', mode: 'generate', text: '' }),
    ]
}

/** The caption that goes under the picture, where text is always safe. */
export function captionShell(plan) {
    return {
        brief: plan.brief,
        job: plan.job,
        hashtags: hashtagsFor(plan.eventType),
    }
}

export default { buildImagePrompt, checkText, textContract, testBatch, SIZES, MAX_TEXT_CHARS }
