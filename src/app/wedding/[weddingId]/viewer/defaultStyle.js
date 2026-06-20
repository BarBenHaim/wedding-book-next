'use client'

// Renamed from defultStyle.js (typo). The viewer page uses this as the
// fallback styleSettings when a Firestore wedding doc has no design
// override yet. Keep the export name + shape stable — anything else
// would propagate breakage.

const BASE_DEFAULTS = {
    backgroundColor: '#ffffff',
    fontFamily: `'Noto Serif Hebrew', 'David Libre', serif`,
    fontSize: 3, // % of page height
    fontColor: '#000000',
    borderColor: '#d8bfa4',
    borderWidth: 0, // % of page width
    borderRadius: 0, // % of page width
    pagePadding: 0, // % of page height
    textureUrl: '',
    imageStyle: {
        width: 90, // % of page width
        height: 70, // % of page height
        marginTop: 0, // % of page height
        borderRadius: '0%',
        borderWidth: '0px',
        borderStyle: 'none',
        boxShadow: 'none',
    },
}

export default BASE_DEFAULTS

// Resolve the design used for the book's INTERIOR pages from a wedding doc.
//
// Priority: bookDesign → coverDesign (pre-split docs) → book.designSettings
// → null. The important nuance: when there is no dedicated `bookDesign`
// and we fall back to `coverDesign`, we DROP the cover's `imageStyle`.
// The cover's imageStyle is tuned for the single cover photo (often a
// smaller width like 55%), and reusing it on interior pages shrinks every
// photo and leaves an unexplained cream gap around it. Stripping it lets
// interior photos use the default ~90% width while still inheriting the
// cover's background / colours for a cohesive look.
export function resolveInteriorDesign(wedding) {
    if (!wedding) return null
    if (wedding.bookDesign) return wedding.bookDesign
    if (wedding.coverDesign) {
        const { imageStyle, ...rest } = wedding.coverDesign  
        return rest
    }
    if (wedding.book?.designSettings) return wedding.book.designSettings
    return null
}
