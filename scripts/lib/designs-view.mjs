// The pure rules of the PC side of the sign samples (scripts/designs.mjs).
// A lead's words are data: they never go into the drawing request as they are.
// Only a checked Hebrew name does, next to a direction written in the session.

const MAX_NAME = 24
// Hebrew letters, spaces, a hyphen and the geresh used in foreign names.
const NAME = /^[א-ת]([א-ת׳״'\- ]*[א-ת׳'])?$/
const OCCASION = { bar: 'בר מצווה', bat: 'בת מצווה' }

export function wordsSinceOffer(lead) {
    const from = Number(lead?.designSample?.offeredAt) || 0
    return (Array.isArray(lead?.turns) ? lead.turns : [])
        .filter(turn => turn.role === 'user' && Number(turn.at) > from)
        .map(turn => String(turn.text || '').trim())
        .filter(text => text && !text.startsWith('['))
}

export function cleanChildName(raw) {
    const name = String(raw || '').trim().replace(/ {2,}/g, ' ')
    if (name.length > MAX_NAME || !NAME.test(name)) throw new Error('the name must be a short Hebrew name and nothing else')
    return name
}

export function buildDrawPrompt({ name, kind, concept }) {
    const occasion = OCCASION[kind]
    if (!occasion) throw new Error('kind must be bar or bat: ask which it is')
    const direction = String(concept || '').trim()
    if (!direction) throw new Error('write an art direction for this child in concept.txt')
    const child = kind === 'bat' ? 'girl' : 'boy'
    return `Use $imagegen. Do not use any API or CLI fallback.
Make ONE portrait image (A4 proportions): the artwork of a printed celebration sign that greets guests at a ${kind} mitzvah.
The attached image is a photo of the ${child}. Keep the face accurately recognisable: do not change features, age, skin, hair or expression, and do not add other people. Clothing and pose may be adapted to the art direction, modest and respectful.
Hebrew text, spelled exactly, right to left, every letter correct, and nothing else written anywhere (no other words, numbers or letters): the large headline ברכו את ${cleanChildName(name)} and a small line ${occasion}.
Layout: all art and all text stay in the upper 58% of the page. The bottom 38% is one flat, calm, light, plain paper area with nothing in it at all: no shapes, no lines, no texture changes, no QR code (a real QR code is placed there later).
No logos, no flags, no watermark. This is an original composition made only for this child, not a template.
Art direction, made for this child:
${direction}
`
}
