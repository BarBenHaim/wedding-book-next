// src/lib/guestSignature.js — pure: the "Wedding Tales Signature" look of the blessing page.
//
// The blessing page (the "moment" layout in /wedding/[id]/photo) is themed by a flat
// `guestDesign` object on the event: colours and a few images, merged over built-in
// defaults. These two designs are the house look for new events, in the sales site's
// colours instead of the old garden: a deep-navy evening with string lights for
// bar/bat mitzvah, birthdays and the rest, and a cream paper with a lilac wash and
// dried flowers for weddings. A paid order gets one when its event is opened
// (createWedding). An owner's own choice in the design studio replaces it, and events
// that already exist are never touched.
//
// Images are small local webp files (10 and 23 KB): the page is opened at venues, on
// weak signal. `buttonRadius`, `buttonShadow` and `buttonTextShadow` are optional keys
// the page honours only when present, so designs painted around an image button are
// unchanged.

const SHARED = {
    pageBgRepeat: 'no-repeat',
    pageBgSize: 'cover',
    pageBgPosition: 'center top',
    cardBg: '#FBF8F2',
    cardFrame: 'rgba(255,255,255,0.92)',
    cardLabelColor: '#14183A',
    cardCounterColor: '#8A8DA3',
    inputBg: '#FFFFFF',
    inputBorder: '#CDD3F5',
    inputFocusBorder: '#2545E0',
    inputTextColor: '#14183A',
    inputPlaceholderColor: '#9A9DB0',
    // solid: the pill straddles the card's top edge, and a see-through one shows that edge through its text
    pillBg: '#E6EBFF',
    pillBorder: '#9FB2FF',
    pillText: '#2545E0',
    pillHeart: '#2545E0',
    wellBg: '#EEF1FF',
    wellBorder: '#C9D2FF',
    iconColor: '#6C74B8',
    uploadCircle: '#E6EBFF',
    uploadIcon: '#2545E0',
    accentColor: '#2545E0',
    cornerImage: 'none',
    buttonGradient: 'linear-gradient(180deg, #3358F0 0%, #2545E0 55%, #1B34B8 100%)',
    buttonTextColor: '#FFFFFF',
    buttonRadius: 16,
    buttonShadow: '0 16px 28px -14px rgba(28,52,184,0.75), inset 0 1px 0 rgba(255,255,255,0.25)',
    buttonTextShadow: 'none',
}

export const SIGNATURE = Object.freeze({
    night: Object.freeze({
        ...SHARED,
        pageBg: '#0C1030',
        pageBgImage: 'url(/backgrounds/signature-night.webp)',
        titleColor: '#FFFFFF',
        subtitleColor: '#C9CDEB',
        cardBorder: 'rgba(124,147,255,0.35)',
        trustText: '#9EA3CC',
    }),
    paper: Object.freeze({
        ...SHARED,
        pageBg: '#F3F0EA',
        pageBgImage: 'url(/backgrounds/signature-paper.webp)',
        titleColor: '#14183A',
        subtitleColor: '#5A5D75',
        cardBorder: 'rgba(37,69,224,0.18)',
        trustText: '#7A7D93',
    }),
})

/** 'paper' for a wedding, 'night' for everything else. */
export function signatureKeyFor(eventType) {
    return eventType === 'wedding' ? 'paper' : 'night'
}

/** A copy of the house design for an event type, ready to store as `guestDesign`. */
export function signatureDesign(eventType) {
    return { ...SIGNATURE[signatureKeyFor(eventType)] }
}
