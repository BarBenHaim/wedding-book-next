// src/lib/welcomeEmail.js — pure: the first e-mail after a paid order. No Firebase, no Next, no mailer.
//
// One job: get the customer to send the guest link today. So the e-mail has
// one big action at the top (send it on WhatsApp), and everything else is a
// short card under it. Built from tables and inline styles because mail
// clients ignore most of modern CSS; images are plain JPGs from /email.

import { emailLogoImg } from './brandAssets'

const INK = '#1d1648'
const ACCENT = '#2c2473'
const PAPER = '#f3e2bd'
const LINE = '#dcc28a'
const MUTED = '#4f4668'
const FONT = "Arial,'Segoe UI',Helvetica,sans-serif"

export const SUPPORT_WHATSAPP = 'https://wa.me/972515350253'

export const escapeHtml = s =>
    String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// A button that survives Outlook: a padded table cell with a link inside.
function button(href, label, kind = 'solid') {
    const solid = kind === 'solid'
    const light = kind === 'light'
    const bg = solid ? INK : light ? '#FFFFFF' : '#FFFFFF'
    const color = solid ? '#FFFFFF' : INK
    const border = solid || light ? `1px solid ${solid ? INK : '#FFFFFF'}` : `1.5px solid ${INK}`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" bgcolor="${bg}" style="border-radius:14px;border:${border};"><a href="${href}" style="display:block;padding:15px 28px;font:700 16px/1.2 ${FONT};color:${color};text-decoration:none;border-radius:14px;">${label}</a></td></tr></table>`
}

function stepCard({ n, title, text, thumb, action, extra }) {
    const img = thumb
        ? `<td width="112" valign="top" style="padding:0 0 0 16px;"><img src="${thumb.src}" width="112" alt="${escapeHtml(thumb.alt)}" style="display:block;width:112px;height:auto;border-radius:12px;border:1px solid ${LINE};"></td>`
        : ''
    return `
<tr><td style="padding:0 20px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:20px;border:1px solid ${LINE};">
    <tr><td style="padding:20px 20px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${img}
        <td valign="top" style="text-align:right;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>
            <td width="30" height="30" align="center" bgcolor="${ACCENT}" style="width:30px;height:30px;border-radius:15px;background:${ACCENT};font:800 15px/30px ${FONT};color:#FFFFFF;">${n}</td>
            <td style="padding:0 10px 0 0;font:800 19px/1.25 ${FONT};color:${INK};">${title}</td>
          </tr></table>
          <p style="margin:0;font:400 15px/1.65 ${FONT};color:${MUTED};">${text}</p>
        </td>
      </tr></table>
      ${extra || ''}
      <div style="margin-top:16px;">${action}</div>
    </td></tr>
  </table>
</td></tr>`
}

export function renderWelcomeEmail({
    baseUrl,
    assetBase,
    name,
    email,
    setPasswordUrl,
    bookTitle,
    guestUrl,
    whatsappUrl,
    posterUrl,
    loginUrl,
    viewerUrl,
    deposit,
}) {
    const assets = `${String(assetBase || baseUrl || '').replace(/\/+$/, '')}/email`
    const title = bookTitle ? `ספר הברכות של ${bookTitle}` : 'ספר הברכות שלכם'
    const subject = bookTitle
        ? `ספר הברכות של ${bookTitle} נפתח. שולחים לאורחים?`
        : 'ספר הברכות שלכם נפתח. שולחים לאורחים?'
    const preheader = 'הקישור לאורחים מוכן. שליחה אחת בוואטסאפ, והברכות מתחילות להיכנס.'

    const depositBlock = deposit
        ? `<tr><td style="padding:0 20px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E9F6EF" style="background:#E9F6EF;border-radius:16px;"><tr><td style="padding:14px 18px;text-align:right;font:400 15px/1.6 ${FONT};color:#12402B;"><b>שילמתם מקדמה.</b> ${deposit.balanceDue ? `את ${deposit.balanceDue} ₪ הנותרים` : 'את היתרה'} משלמים רק כשהספר מוכן ואישרתם אותו להדפסה.</td></tr></table>
</td></tr>`
        : ''

    // No password travels by e-mail: the button above signs the owner in, and for
    // the next time there is the login page (a link by e-mail) or a password they
    // choose themselves (the phone app asks for one).
    const credentials = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};border-radius:14px;margin-top:14px;"><tr><td style="padding:12px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:4px 0;font:400 14px/1.4 ${FONT};color:${MUTED};text-align:right;">המייל שלכם</td><td style="padding:4px 0;font:700 15px/1.4 ${FONT};color:${INK};text-align:left;direction:ltr;">${escapeHtml(email)}</td></tr>
    <tr><td colspan="2" style="padding:8px 0 2px;font:400 14px/1.6 ${FONT};color:${MUTED};text-align:right;">בפעם הבאה נכנסים עם המייל הזה: מבקשים קישור במסך הכניסה, או <a href="${setPasswordUrl}" style="color:${ACCENT};font-weight:700;">בוחרים סיסמה</a> (צריך אותה לאפליקציה בטלפון).</td></tr>
  </table>
</td></tr></table>`

    const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${PAPER};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};"><tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;direction:rtl;text-align:right;font-family:${FONT};color:${INK};">

  <tr><td align="center" style="padding:6px 0 20px;">${emailLogoImg(200)}</td></tr>

  <tr><td style="padding:0 20px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};border-radius:24px;overflow:hidden;">
      <tr><td align="center" style="padding:34px 24px 10px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1F8F58" style="background:#1F8F58;border-radius:999px;padding:6px 14px;font:700 13px/1 ${FONT};color:#FFFFFF;">&#10003;&nbsp; ההזמנה התקבלה</td></tr></table>
      </td></tr>
      <tr><td align="center" style="padding:10px 26px 0;font:800 31px/1.2 ${FONT};color:#FFFFFF;">${escapeHtml(title)}<br>נפתח</td></tr>
      <tr><td align="center" style="padding:12px 30px 26px;font:400 17px/1.6 ${FONT};color:#e8dcf0;">עכשיו נשאר דבר אחד: לשלוח לאורחים את הקישור.<br>הם כותבים ברכה ומוסיפים תמונה, בשתי דקות מהטלפון.</td></tr>
      <tr><td style="padding:0 24px 12px;">${button(whatsappUrl, 'שליחה לאורחים בוואטסאפ', 'light')}</td></tr>
      <tr><td align="center" style="padding:6px 24px 30px;font:400 13px/1.5 ${FONT};color:#cbb8dd;direction:ltr;word-break:break-all;"><a href="${guestUrl}" style="color:#cbb8dd;text-decoration:underline;">${escapeHtml(guestUrl.replace(/^https?:\/\//, ''))}</a></td></tr>
    </table>
  </td></tr>

  ${depositBlock}

  <tr><td style="padding:10px 24px 12px;font:800 22px/1.2 ${FONT};color:${INK};">מה יש בפנים</td></tr>

  ${stepCard({
      n: 1,
      title: 'הקישור לאורחים',
      text: 'בלי אפליקציה ובלי הרשמה. אפשר לשלוח אותו כבר עכשיו, וגם אחרי האירוע.',
      thumb: { src: `${assets}/mail-guest.jpg`, alt: 'עמוד הברכה של האורחים' },
      action: button(guestUrl, 'פתיחת הקישור', 'outline'),
  })}

  ${stepCard({
      n: 2,
      title: 'שלט להדפסה',
      text: 'שלט "ברכו את" עם השמות, התאריך וה־QR של הספר. בוחרים צבע, מדפיסים A4 וממקמים בכניסה או על השולחנות.',
      thumb: { src: `${assets}/mail-sign.jpg`, alt: 'דוגמה לשלט ברכו את' },
      action: button(posterUrl, 'פתיחת השלט', 'outline'),
  })}

  ${stepCard({
      n: 3,
      title: 'האזור האישי',
      text: 'שם רואים כל ברכה שנכנסת, מעלים תמונה לכריכה, בוחרים עיצוב ומאשרים את העמודים לפני ההדפסה. הכפתור מכניס אתכם בלחיצה אחת.',
      extra: credentials,
      action: `${button(loginUrl, 'כניסה לאזור האישי', 'solid')}<p style="margin:12px 0 0;text-align:center;font:400 14px/1.5 ${FONT};"><a href="${viewerUrl}" style="color:${ACCENT};text-decoration:underline;">צפייה בספר, בלי להתחבר</a></p>`,
  })}

  <tr><td align="center" style="padding:6px 24px 8px;font:400 15px/1.7 ${FONT};color:${MUTED};">משהו לא ברור? עונים למייל הזה, או <a href="${SUPPORT_WHATSAPP}" style="color:${INK};font-weight:700;">כותבים לנו בוואטסאפ</a>.</td></tr>
  <tr><td align="center" style="padding:4px 24px 0;font:400 12px/1.5 ${FONT};color:#857a9c;">Wedding Tales · ספרי ברכות מהאירוע</td></tr>

</table>
</td></tr></table>
</body></html>`

    const text = [
        `${name ? `${name}, ` : ''}${title} נפתח.`,
        '',
        'עכשיו נשאר דבר אחד: לשלוח לאורחים את הקישור. הם כותבים ברכה ומוסיפים תמונה, בשתי דקות מהטלפון.',
        `שליחה בוואטסאפ: ${whatsappUrl}`,
        `הקישור לאורחים: ${guestUrl}`,
        ...(deposit
            ? ['', `שילמתם מקדמה. ${deposit.balanceDue ? `את ${deposit.balanceDue} ₪ הנותרים` : 'את היתרה'} משלמים רק כשהספר מוכן ואישרתם אותו להדפסה.`]
            : []),
        '',
        `שלט להדפסה: ${posterUrl}`,
        '',
        `האזור האישי: ${loginUrl}`,
        `אימייל: ${email}`,
        `בפעם הבאה: מבקשים קישור כניסה במסך הכניסה, או בוחרים סיסמה: ${setPasswordUrl}`,
        `צפייה בספר בלי להתחבר: ${viewerUrl}`,
        '',
        `משהו לא ברור? עונים למייל הזה או כותבים בוואטסאפ: ${SUPPORT_WHATSAPP}`,
    ].join('\n')

    return { subject, html, text }
}
