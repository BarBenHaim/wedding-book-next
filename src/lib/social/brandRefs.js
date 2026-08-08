// src/lib/social/brandRefs.js
//
// The brand's real work, handed to the model as pictures.
//
// I spent a while writing English art direction - "textured linen
// surface", "50mm at a wide aperture" - for photographs of a square
// book. Then Lord sent three actual posters and the mistake was
// obvious twice over.
//
// The first mistake was subject. The hero asset of this business is not
// a photograph of the book, it is the POSTER that stands on the table at
// the event: the celebrant's name in huge letters, a real photo of them,
// a QR code, three numbered steps, styled to that specific family's
// world - the Kotel, a desert on a quad bike, a wedding venue at dusk.
// That is what people see, and what makes an Instagram grid look like a
// business rather than a stock account.
//
// The second was method. A paragraph of adjectives is a lossy
// description of a design that already exists. The model can be shown
// the design instead. These three files are the house style, and they
// carry things no prompt of mine would have thought to say: the gold
// script accent beside the name, the numbered steps reading right to
// left, the way the photo bleeds into the background rather than sitting
// in a box.
//
// So the references are the direction, and the words are only the brief.
const ORIGIN = 'https://app.weddingtales.co.il'
const DIR = `${ORIGIN}/imgs/social/refs`

export const BRAND_REFS = [
    {
        id: 'wedding_gamos',
        url: `${DIR}/poster-wedding-gamos.jpg`,
        eventType: 'wedding',
        // What each one is FOR, so a brief can pick the closest rather
        // than always sending all three and averaging them into mush.
        shows: 'the poster standing in an acrylic holder on a table at the venue, warm gold on cream, four numbered steps, a client logo at the top',
    },
    {
        id: 'bar_mitzvah_kotel',
        url: `${DIR}/poster-bar-mitzvah-kotel.jpg`,
        eventType: 'bar_mitzvah',
        shows: 'navy and gold, a crown above the name, the Kotel washed into the background, three numbered steps along the bottom',
    },
    {
        id: 'bar_mitzvah_desert',
        url: `${DIR}/poster-bar-mitzvah-desert.jpg`,
        eventType: 'bar_mitzvah',
        shows: 'the same structure taken somewhere completely different - grunge navy, a desert and a quad bike, torn brush edges - which is the proof that the layout carries any world you put it in',
    },
]

export const REF_URLS = BRAND_REFS.map(r => r.url)

/**
 * The references to send for a given event type.
 *
 * Always at least two, and never only the one that matches: showing the
 * model a wedding poster AND a bar mitzvah poster is what teaches it
 * that the layout is the constant and the world is the variable. Given
 * one example it copies that example.
 */
export function refsFor(eventType) {
    const match = BRAND_REFS.filter(r => r.eventType === eventType)
    const rest = BRAND_REFS.filter(r => r.eventType !== eventType)
    return [...match, ...rest].slice(0, 3)
}

// What the three have in common, written down because it is the part the
// model should keep while changing everything else.
export const HOUSE_STYLE = [
    'These images are existing posters made by this business. They are the house style, not a picture to copy.',
    'What they share: the celebrant\'s name set very large in Hebrew as the loudest thing on the poster, a real photograph of the person blended into a themed background rather than boxed, a QR code with a short call to action, and numbered steps reading right to left along the bottom.',
    'Warm gold as the accent on every one, against either cream or deep navy.',
].join(' ')

/**
 * The brief for a new poster.
 *
 * Deliberately short. The references carry the look; this only has to
 * say what is different this time, and then get out of the way - which
 * is the whole point Lord was making when he said not to box the model
 * into a template.
 */
export function posterBrief({ eventType = 'wedding', world = null, name = null } = {}) {
    const lines = [
        HOUSE_STYLE,
        `Design a NEW poster in this spirit for a ${String(eventType).replace(/_/g, ' ')}. Do not reproduce any of the references: new layout, new palette within the family, new world.`,
    ]
    if (world) lines.push(`The world of this one is: ${world}.`)
    if (name) lines.push(`The large name on the poster is "${name}".`)
    lines.push(
        'Everything else is your call - composition, colour, texture, type, how the photograph meets the background. Make it look like it was designed by a person who was excited about it.',
    )
    return lines.join('\n\n')
}

// ── The one thing that is not a style choice ─────────────────────────
//
// The reference posters show real customers, including children, used
// with their families' permission. A generated poster showing an
// invented child, posted as if it were a real bar mitzvah, is a claim
// about a customer that is not true - and inventing children's faces for
// marketing is not something to do casually even when it is legal.
//
// So generated posters carry the DESIGN without a fabricated person:
// the photo area holds a figure seen from behind, or hands, or the
// landscape itself. When Lord wants a poster with a face on it, the face
// should be a real customer who agreed, exactly like these three.
export const NO_INVENTED_PEOPLE = [
    'Do not generate a photograph of an identifiable person, and never of a child.',
    'Where the reference posters place a portrait, use instead: a figure seen from behind, a pair of hands, an object that carries the theme, or let the landscape fill that area.',
    'The poster must still feel personal - the name and the world do that work.',
].join(' ')

export default { BRAND_REFS, REF_URLS, refsFor, posterBrief, HOUSE_STYLE, NO_INVENTED_PEOPLE }
