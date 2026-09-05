// src/lib/albumLanguages.js
//
// A design language is a world, not a colour scheme.
//
// The recipes in albumRecipes.js describe composition — where pictures
// sit, what shapes they want. A language describes everything else: the
// paper, the ink, which ornaments exist at all, how much a photograph
// is allowed to tilt, what the type looks like, and which treatments
// are permitted. The same recipe rendered in two languages produces two
// genuinely different pages, which is why thirty roughs and three
// languages is a large album system rather than thirty pages.
//
// `rotationBudget` deserves a note. It multiplies every tilt a recipe
// asks for, and setting it to 0 does not disable a feature — it changes
// the world. An editorial book where nothing is crooked and a travel
// scrapbook where everything is are the same layouts under different
// physics.

export const LANGUAGES = {
    editorial: {
        id: 'editorial',
        label: 'עריכתי — לבן, שקט, בלי קישוט',
        hint: 'נייר לבן, בלי מסגרות ובלי הטיות. הכול תלוי בטיפוגרפיה ובחלל. הכי רחוק מאלבום מסחרי.',
        paper: '#ffffff',
        paperEdge: '#f4f4f2',
        ink: '#131417',
        muted: '#9b9b96',
        accent: '#131417',
        frame: '#ffffff',
        ornaments: [],           // deliberately none
        // A hairline rule and corner brackets are not decoration, they
        // are measure — which is why the world with no ornaments still
        // has frames.
        pageFrames: ['rule', 'brackets', 'sides'],
        ornamentColor: '#131417',
        rotationBudget: 0,
        treatments: ['plain', 'soft-edge'],
        type: {
            family: "'Frank Ruhl Libre', Georgia, serif",
            weight: 500,
            transform: 'none',
            letterSpacing: '0.02em',
            sizes: { small: 2.0, medium: 3.2, large: 5.0 }, // % of page height
        },
        swatch: ['#ffffff', '#e6e6e4', '#131417'],
    },

    travel: {
        id: 'travel',
        label: 'מסע — נייר, מפות, חותמות',
        hint: 'נייר קרם עם קווי מפה, נייר דבק, חותמת דרכון ומסלול. תמונות מוטות ומודבקות — עמוד שנראה כאילו הורכב ביד.',
        paper: '#f6efe1',
        paperEdge: '#eee4d1',
        ink: '#3a2c1c',
        muted: '#a2917a',
        accent: '#8a5a3b',
        frame: '#fffdf7',
        ornaments: ['tape', 'stamp', 'mapLines', 'route', 'pin', 'tornStrip'],
        pageFrames: ['double', 'brackets'],
        ornamentColor: '#8a5a3b',
        rotationBudget: 1,
        treatments: ['framed', 'card', 'soft-edge', 'plain'],
        // Every page gets the faintest chart behind it. It is the thing
        // that makes twelve different layouts read as one book.
        wallpaper: { name: 'mapLines', opacity: 1, seedBase: 900 },
        type: {
            family: "'Frank Ruhl Libre', Georgia, serif",
            weight: 700,
            transform: 'uppercase',
            letterSpacing: '0.14em',
            sizes: { small: 1.9, medium: 3.0, large: 4.6 },
        },
        swatch: ['#f6efe1', '#d8c4a4', '#8a5a3b'],
    },

    heritage: {
        id: 'heritage',
        label: 'קרם וזהב — השפה של Wedding Tales',
        hint: 'אותה פלטה של ספרי הברכות: קרם, זהב, מסגרות דקות והטיה כמעט בלתי מורגשת.',
        paper: '#fbf6ec',
        paperEdge: '#f3ead6',
        ink: '#3d2e1a',
        muted: '#b9a684',
        accent: '#aa8840',
        frame: '#ffffff',
        ornaments: ['cornerRule', 'tornStrip'],
        pageFrames: ['double', 'rule', 'brackets', 'sides'],
        ornamentColor: '#aa8840',
        rotationBudget: 0.35,
        treatments: ['framed', 'plain', 'soft-edge'],
        type: {
            family: "'Frank Ruhl Libre', Georgia, serif",
            weight: 500,
            transform: 'none',
            letterSpacing: '0.10em',
            sizes: { small: 1.9, medium: 3.0, large: 4.4 },
        },
        swatch: ['#fbf6ec', '#e7dcc6', '#aa8840'],
    },
}

export const LANGUAGE_ORDER = ['editorial', 'travel', 'heritage']

export function getLanguage(id) {
    return LANGUAGES[id] || LANGUAGES.editorial
}
