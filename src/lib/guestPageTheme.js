// Shared guest-page palette — the SINGLE source of truth for how the
// guest blessing form looks. Extracted verbatim from
// src/app/wedding/[weddingId]/photo/page.js (summer 2026) so the
// marketing landing can render a pixel-faithful replica of the real
// form (same background, card, inputs, button) driven by the SAME
// wedding doc fields: eventType, designVariant, and the studio's
// saved `guestDesign` override.
//
// Variants:
//   • Poker → dark felt-green page (real photo bg) + house-red button
//   • Night → lit glass panel on a Jerusalem terrace at dusk; cream
//     paper card, gold rules, and a photo card that stays a WINDOW
//     rather than becoming a second sheet of paper
//   • Dawn → the same panel at the Kotel in the morning. Same idea,
//     inverted: warm-white card and deep bronze on pale stone, because
//     gold-on-cream is invisible and a cream card on a cream wall is
//     not a card
//
// The two framed variants also carry their LAYOUT, not just colour:
// their background is a photograph of a frame, so the form has to sit
// inside that frame, and each asset's panel is in a different place.
// The form reads formPaddingTop / formMaxWidth / titleFontSize /
// titleShadow / hideSubtitle / textareaHeight and knows nothing about
// which variant is on. Every one falls back.
//   • Romantic wedding → botanical floral arch photo bg + cream form
//     card + dusty-pink accents + forest-green button
//   • Default (wedding/birthday/bar/bat/travel) → champagne-ivory
//     premium look
export function buildGuestPageTheme({ eventType, designVariant, guestDesign } = {}) {
    const isPoker = eventType === 'poker'
    // Not gated on eventType: a lit glass panel at dusk suits a wedding,
    // a bar mitzvah and a birthday equally, and gating it the way
    // 'romantic' is gated would have hidden it from the event it was
    // designed for.
    const isNight = designVariant === 'night'
    const isDawn = designVariant === 'dawn'
    const isRomantic = eventType === 'wedding' && designVariant === 'romantic'

    const baseTheme = isPoker
        ? {
              // Real poker-felt photograph — chips + cards already baked
              // into the corners of the asset, plus a subtle club/spade
              // pattern in the felt itself.
              pageBg: '#0a2818',
              pageBgImage: 'url(/backgrounds/pokerbg.webp)',
              pageBgSize: 'cover',
              pageBgPosition: 'center',
              pageBgRepeat: 'no-repeat',
              orbA: 'transparent',
              orbB: 'transparent',
              titleColor: '#fde9b3',
              subtitleColor: '#94b09b',
              accentColor: '#d4af37',
              cardBg: 'linear-gradient(180deg, #1c2820 0%, #131d17 100%)',
              cardBorder: '1px solid rgba(212,175,55,0.28)',
              cardShadow:
                  '0 28px 60px -28px rgba(0,0,0,0.65), 0 4px 12px -4px rgba(0,0,0,0.40), inset 0 1px 0 rgba(212,175,55,0.18)',
              cardLabelColor: '#e8d9a8',
              cardCounterColor: '#94a892',
              inputBg: '#0d1812',
              inputBorder: 'rgba(212,175,55,0.30)',
              inputFocusBorder: '#d4af37',
              inputTextColor: '#fde9b3',
              inputPlaceholderColor: '#5e7466',
              dividerLine: 'rgba(212,175,55,0.20)',
              buttonGradient: 'linear-gradient(180deg, #c43b3b 0%, #7d1414 100%)',
              buttonShadow:
                  '0 18px 38px -10px rgba(124,18,18,0.55), 0 4px 10px -4px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
              trustText: 'rgba(232,217,168,0.55)',
              showCrown: true,
              showRings: false,
          }
        : isNight
          ? {
                // A photograph, used as a photograph: the frame, the
                // string lights and the stone are IN the asset, and the
                // form sits inside them. Nothing here redraws the panel
                // in CSS — a second frame fighting the baked one is the
                // failure mode this variant exists to avoid.
                pageBg: '#0a1330',
                // Two layers: a scrim over the photo. Darkest at the
                // very top and bottom, almost absent across the middle
                // where the panel is — the gold type needs the contrast
                // and the string lights must survive.
                pageBgImage: [
                    'linear-gradient(180deg, rgba(8,16,40,0.30) 0%, rgba(8,16,40,0.10) 22%, rgba(8,16,40,0.35) 70%, rgba(8,16,40,0.72) 100%)',
                    'url(/backgrounds/nightglass.webp)',
                ].join(', '),
                pageBgSize: 'cover',
                pageBgPosition: 'center center',
                pageBgRepeat: 'no-repeat',
                orbA: 'transparent',
                orbB: 'transparent',
                titleColor: '#e9d7ab',
                subtitleColor: 'rgba(233,215,171,0.72)',
                accentColor: '#d9b877',
                // Warm paper, lit from above. The gradient is what stops
                // it reading as a flat beige rectangle pasted on a photo.
                cardBg: 'linear-gradient(180deg, #efe7d3 0%, #e6dcc4 100%)',
                cardBorder: '1.5px solid rgba(201,164,78,0.85)',
                cardShadow:
                    '0 18px 40px -16px rgba(0,0,0,0.65), 0 4px 12px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
                cardLabelColor: '#4a3c26',
                cardCounterColor: '#8b7f68',
                // The inputs do not draw their own boxes: on paper this
                // thin a nested border reads as a form inside a form.
                // A hairline rule is enough to say "type here".
                inputBg: 'transparent',
                inputBorder: 'rgba(201,164,78,0.40)',
                inputFocusBorder: '#c9a44e',
                inputTextColor: '#2a2118',
                inputPlaceholderColor: '#8b7f68',
                dividerLine: 'rgba(201,164,78,0.38)',
                buttonGradient: 'linear-gradient(180deg, #e6cd8d 0%, #c9a44e 55%, #ab8639 100%)',
                buttonShadow:
                    '0 16px 34px -12px rgba(201,164,78,0.55), 0 4px 10px -4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.45)',
                trustText: 'rgba(233,215,171,0.60)',
                showCrown: false,
                showRings: false,
                // ── Layout, measured off the asset ──────────────────
                //
                // The panel's top rail is at 13.5% of the image height
                // and it spans 77.6% of the width. Arrived at by
                // rendering the real form over the real asset at
                // 390×844 and 360×800 and looking at it.
                // Rails measured off the asset: top 14.4%, bottom
                // ~86.5%, sides 10.5% / 89.6% — a panel 79.1% wide.
                //
                // The width is part vh on purpose. `cover` on a tall
                // screen scales by HEIGHT, so the panel's on-screen
                // width is a fraction of the viewport's height, not its
                // width: 0.791 × 0.563 = 44.5vh. A column in vw alone
                // would drift against the rails on every other phone.
                // 37vh leaves an even margin inside them.
                formPaddingTop: '16vh',
                formMaxWidth: 'min(88vw, 37vh, 380px)',
                titleFont: 'frankRuhl',
                titleRule: true,
                titleFontSize: '23px',
                titleShadow: '0 2px 14px rgba(0,0,0,0.65)',
                hideSubtitle: true,
                hideNameField: true,
                hideTrust: true,
                shortPhotoWell: true,
                // The smaller of the two panels, so the smaller box.
                // Measured: at 96px the form clears the bottom rail on
                // a 360×800 by 7px; at 112 it crosses it.
                textareaHeight: '96px',
                // ── Night-only: the photo card is a window ──────────
                //
                // Every other variant makes both cards the same
                // surface. Here the second one must not: a cream slab
                // where the city view should be would block the only
                // part of the scene the guest can still see, and the
                // dashed gold edge is what makes it read as "drop a
                // photo here" instead of "another form".
                photoCardBg: 'rgba(10,20,48,0.22)',
                photoCardBorder: '2px dashed rgba(217,184,119,0.75)',
                photoWellBg: 'rgba(8,16,40,0.28)',
                photoWellBorder: 'rgba(217,184,119,0.38)',
            }
          : isDawn
            ? {
                  // The Kotel at golden hour. Everything the night
                  // variant does, inverted — a bright scene cannot
                  // carry gold type or a cream card, because both
                  // disappear into pale limestone. Deep bronze on
                  // warm white instead, and the button goes dark so it
                  // still reads as the one thing to press.
                  pageBg: '#efe6d5',
                  pageBgImage: [
                      // A pale scrim, not a dark one: it lifts the
                      // busy stone away from the form without touching
                      // the sunlight, which is the whole photograph.
                      'linear-gradient(180deg, rgba(255,250,240,0.20) 0%, rgba(255,250,240,0.00) 30%, rgba(255,250,240,0.18) 78%, rgba(255,250,240,0.42) 100%)',
                      'url(/backgrounds/dawnglass.webp)',
                  ].join(', '),
                  pageBgSize: 'cover',
                  pageBgPosition: 'center center',
                  pageBgRepeat: 'no-repeat',
                  orbA: 'transparent',
                  orbB: 'transparent',
                  titleColor: '#4a3a24',
                  subtitleColor: 'rgba(74,58,36,0.70)',
                  accentColor: '#a5762f',
                  cardBg: 'linear-gradient(180deg, rgba(255,253,247,0.96) 0%, rgba(251,245,234,0.93) 100%)',
                  cardBorder: '1.5px solid rgba(165,118,47,0.35)',
                  cardShadow:
                      '0 18px 44px -18px rgba(80,60,30,0.45), 0 4px 14px -6px rgba(80,60,30,0.20), inset 0 1px 0 rgba(255,255,255,0.90)',
                  cardLabelColor: '#4a3a24',
                  cardCounterColor: '#9a8768',
                  inputBg: 'transparent',
                  inputBorder: 'rgba(165,118,47,0.32)',
                  inputFocusBorder: '#a5762f',
                  inputTextColor: '#2f2517',
                  inputPlaceholderColor: '#a2937a',
                  dividerLine: 'rgba(165,118,47,0.28)',
                  // Dark bronze with white type. The night variant's
                  // pale gold button would vanish into this stone —
                  // the one control that must never be hard to find.
                  buttonGradient: 'linear-gradient(180deg, #c9a44e 0%, #a5762f 55%, #83581f 100%)',
                  buttonShadow:
                      '0 16px 34px -12px rgba(131,88,31,0.50), 0 4px 10px -4px rgba(80,60,30,0.25), inset 0 1px 0 rgba(255,255,255,0.35)',
                  trustText: 'rgba(74,58,36,0.62)',
                  showCrown: false,
                  showRings: false,
                  // Panel rails at 8.6% / 91.4% of the width and a top
                  // rail at 10.2% — a wider, higher panel than night's,
                  // which is exactly why these are theme values.
                  // Rails: top 10.2%, bottom ~89%, sides 8.6% / 91.4%
                  // — a wider, higher panel than night's, hence 39vh
                  // rather than 37 and 11.5vh rather than 16.
                  formPaddingTop: '11.5vh',
                  formMaxWidth: 'min(90vw, 39vh, 400px)',
                  titleFont: 'frankRuhl',
                  titleRule: true,
                  titleFontSize: '25px',
                  titleShadow: '0 1px 14px rgba(255,252,244,0.90), 0 1px 2px rgba(255,255,255,0.80)',
                  hideSubtitle: true,
                  hideNameField: true,
                  hideTrust: true,
                  shortPhotoWell: true,
                  // A taller panel than night's buys 32px more here.
                  textareaHeight: '128px',
                  photoCardBg: 'rgba(255,253,247,0.42)',
                  photoCardBorder: '2px dashed rgba(165,118,47,0.70)',
                  photoWellBg: 'rgba(255,252,244,0.35)',
                  photoWellBorder: 'rgba(165,118,47,0.30)',
              }
            : isRomantic
              ? {
                // Botanical floral arch photograph (white roses,
                // eucalyptus, dusty pink florals, hanging lights).
                pageBg: '#1f3527',
                pageBgImage: 'url(/backgrounds/weddingdesign1.webp)',
                pageBgSize: 'cover',
                pageBgPosition: 'center top',
                pageBgRepeat: 'no-repeat',
                orbA: 'transparent',
                orbB: 'transparent',
                titleColor: '#f5ead2',
                subtitleColor: '#e7d6b4',
                accentColor: '#d8a4a4',
                cardBg: 'url(/backgrounds/formbg.png) center/cover no-repeat, #fbf3e1',
                cardBorder: '1px solid rgba(255,255,255,0.35)',
                cardShadow: '0 28px 60px -28px rgba(31,53,39,0.55), 0 4px 12px -4px rgba(31,53,39,0.20)',
                cardLabelColor: '#2d4233',
                cardCounterColor: '#9a8870',
                inputBg: '#fffaf0',
                inputBorder: '#e8d3c5',
                inputFocusBorder: '#b07b7b',
                inputTextColor: '#2d4233',
                inputPlaceholderColor: '#c8b59e',
                dividerLine: '#e6c9c9',
                buttonGradient: 'linear-gradient(180deg, #4a6b54 0%, #2d4233 100%)',
                buttonShadow:
                    '0 18px 38px -10px rgba(45,66,51,0.55), 0 4px 10px -4px rgba(45,66,51,0.30), inset 0 1px 0 rgba(255,255,255,0.18)',
                trustText: 'rgba(245,234,210,0.85)',
                showCrown: false,
                showRings: true,
            }
              : {
                pageBg: '#f8f4ec',
                pageBgImage: [
                    'radial-gradient(ellipse 900px 480px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 520px 520px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                    'radial-gradient(ellipse 440px 440px at 8% 105%, rgba(186,156,108,0.05) 0%, rgba(186,156,108,0) 60%)',
                ].join(', '),
                pageBgSize: 'auto',
                pageBgPosition: 'center',
                pageBgRepeat: 'no-repeat',
                orbA: 'rgba(211,182,103,0.08)',
                orbB: 'rgba(170,136,64,0.06)',
                titleColor: '#1a1410',
                subtitleColor: '#9a8a72',
                accentColor: '#c9a44e',
                cardBg: '#ffffff',
                cardBorder: '1px solid rgba(212,184,103,0.22)',
                cardShadow: '0 24px 50px -28px rgba(170,136,64,0.28), 0 4px 12px -4px rgba(170,136,64,0.10)',
                cardLabelColor: '#1a1410',
                cardCounterColor: '#b9a684',
                inputBg: '#ffffff',
                inputBorder: '#ead9b3',
                inputFocusBorder: '#c9a44e',
                inputTextColor: '#1a1410',
                inputPlaceholderColor: '#c9b888',
                dividerLine: '#e1d4b4',
                buttonGradient: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                buttonShadow:
                    '0 14px 32px -10px rgba(170,136,64,0.55), 0 4px 10px -4px rgba(170,136,64,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
                trustText: '#b9a684',
                showCrown: false,
                showRings: false,
            }

    // A studio "guest page" preset (saved on the wedding doc as
    // `guestDesign`, or a live ?gd= preview) overrides the built-in
    // palette — merged over the eventType/variant base so a preset only
    // needs to specify the fields it changes.
    const theme =
        guestDesign && typeof guestDesign === 'object' ? { ...baseTheme, ...guestDesign } : baseTheme

    return { theme, isPoker, isRomantic, isNight, isDawn }
}
