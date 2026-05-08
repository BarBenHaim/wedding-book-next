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
