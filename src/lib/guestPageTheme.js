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
//   • Romantic wedding → botanical floral arch photo bg + cream form
//     card + dusty-pink accents + forest-green button
//   • Default (wedding/birthday/bar/bat/travel) → champagne-ivory
//     premium look
export function buildGuestPageTheme({ eventType, designVariant, guestDesign } = {}) {
    const isPoker = eventType === 'poker'
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

    return { theme, isPoker, isRomantic }
}
