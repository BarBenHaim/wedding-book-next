// The "straight into the book" blessing page: the guest fills the page of the
// book itself. Pure rules, so they are testable. An event gets it only by
// asking for it (designVariant, or ?dv= for a one-off look).

export const BOOK_VARIANT = 'book'

export function isBookVariant(eventType, designVariant) {
    return designVariant === BOOK_VARIANT && eventType !== 'poker'
}

export function filledParts({ text, name, photoUrl }) {
    return {
        text: Boolean((text || '').trim()),
        photo: Boolean(photoUrl),
        name: Boolean((name || '').trim()),
    }
}

// What a tap on the page itself opens.
export function nextToFill(filled) {
    return ['text', 'photo', 'name'].find(part => !filled[part]) || 'text'
}

// `label` is a key of the `photo` messages.
export function sendState({ text, submitting }) {
    if (submitting) return { disabled: true, label: 'submitting' }
    if (!(text || '').trim()) return { disabled: true, label: 'bookSendWrite' }
    return { disabled: false, label: 'bookSend' }
}

export function charactersLeft(text, max) {
    return Math.max(0, max - (text || '').length)
}

// The entry the book's own renderer draws, shaped as it will be saved.
export function previewEntry({ name, text, photoUrl }) {
    return { id: 'live-preview', name: (name || '').trim(), text: text || '', imageUrl: photoUrl || null }
}

export function thanksPreviewParam(search) {
    return new URLSearchParams(search || '').get('dv') === BOOK_VARIANT ? `&dv=${BOOK_VARIANT}` : ''
}
