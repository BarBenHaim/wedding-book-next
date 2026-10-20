// Explicit response shapes: never return an entire wedding/entry document
// from a server route when the portal needs only a handful of fields.
function pick(data, keys) {
    return Object.fromEntries(keys.filter(key => data?.[key] !== undefined).map(key => [key, data[key]]))
}

const COVER_FIELDS = ['coverImage', 'coverTexture', 'texture']

export function ownerWeddingView(wedding) {
    return {
        ...pick(wedding, ['customTitle', 'brideNameHe', 'brideName', 'groomNameHe', 'groomName', 'celebrantNameHe', 'celebrantName', 'slug']),
        // An owner-only response, never the public guest metadata endpoint.
        digitalTokens: typeof wedding.digitalTokens?.[0] === 'string' ? [wedding.digitalTokens[0]] : [],
        coverDesign: pick(wedding.coverDesign, COVER_FIELDS),
        book: { designSettings: pick(wedding.book?.designSettings, COVER_FIELDS) },
    }
}

export function ownerEntryView(id, entry) {
    return {
        id,
        ...pick(entry, ['name', 'text', 'imageUrl', 'photoUrl', 'imageUrlOverride', 'imgAspect', 'imgAspectOverride', 'photoPosition', 'photoRotation', 'orderIndex', 'kind', 'forceSplit', 'preserveLineBreaks', 'pageStyle']),
        timestamp: typeof entry.timestamp?.seconds === 'number'
            ? { seconds: entry.timestamp.seconds, nanoseconds: entry.timestamp.nanoseconds || 0 }
            : (typeof entry.timestamp === 'number' ? { seconds: Math.floor(entry.timestamp / 1000), nanoseconds: 0 } : null),
    }
}
