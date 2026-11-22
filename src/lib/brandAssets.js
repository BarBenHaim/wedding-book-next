// src/lib/brandAssets.js — pure: where the brand pictures live, for e-mails (which need absolute URLs).

export const EMAIL_LOGO_URL = 'https://app.weddingtales.co.il/email/logo.png'

/** The logo as an e-mail header cell's content. The alt text is the name, for clients that block images. */
export function emailLogoImg(width = 200) {
    return `<img src="${EMAIL_LOGO_URL}" width="${width}" alt="Wedding Tales" style="display:block;margin:0 auto;width:${width}px;max-width:100%;height:auto;border:0;font:800 22px Arial,sans-serif;color:#14183A;">`
}
