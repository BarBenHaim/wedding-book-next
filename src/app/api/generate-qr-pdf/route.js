import { NextResponse } from 'next/server'
import { PDFDocument, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import fontkit from '@pdf-lib/fontkit'

const sizes = {
    a4: [595.28, 841.89],
    landscape: [841.89, 595.28],
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const weddingId = searchParams.get('weddingId')
        const sizeParam = searchParams.get('size') || 'a4'
        const [width, height] = sizes[sizeParam.toLowerCase()] || sizes.a4

        const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

        // ✅ קריאת הפונט
        const hebrewFontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
        const hebrewFontBytes = fs.readFileSync(hebrewFontPath)

        const pdfDoc = await PDFDocument.create()
        pdfDoc.registerFontkit(fontkit)
        const hebrewFont = await pdfDoc.embedFont(hebrewFontBytes, { subset: true })

        const page = pdfDoc.addPage([width, height])

        // 🎨 צבעים
        const pink = rgb(0.925, 0.286, 0.6)
        const purple = rgb(0.576, 0.2, 0.918)
        const bg = rgb(0.99, 0.985, 1)

        // רקע רך
        page.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: bg,
        })

        // מסגרת עדינה
        page.drawRectangle({
            x: 30,
            y: 30,
            width: width - 60,
            height: height - 60,
            borderColor: rgb(0.8, 0.7, 0.95),
            borderWidth: 1.5,
        })

        // ✨ לוגו כתמונה עם שמירת יחס מקורי ואיכות מלאה
        const logoPath = path.join(process.cwd(), 'public', 'logo-gradient.png')
        const logoBytes = fs.readFileSync(logoPath)
        const logoImage = await pdfDoc.embedPng(logoBytes)

        const originalWidth = logoImage.width
        const originalHeight = logoImage.height
        const maxWidth = width * 0.55 // עד חצי מהרוחב
        const scale = maxWidth / originalWidth

        const logoWidth = originalWidth * scale
        const logoHeight = originalHeight * scale

        page.drawImage(logoImage, {
            x: width / 2 - logoWidth / 2,
            y: height - logoHeight - 100,
            width: logoWidth,
            height: logoHeight,
        })

        // 🩷 כותרת קצרה וברורה
        const title = 'ברכו את הזוג 👇'
        const titleSize = 22
        const titleWidth = hebrewFont.widthOfTextAtSize(title, titleSize)
        page.drawText(title, {
            x: width / 2 - titleWidth / 2,
            y: height - logoHeight - 130,
            size: titleSize,
            font: hebrewFont,
            color: purple,
        })

        // ✅ QR במרכז
        const qrData = await QRCode.toDataURL(guestLink)
        const qrBase64 = qrData.split(',')[1]
        const qrBytes = Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0))
        const qrImage = await pdfDoc.embedPng(qrBytes)
        const qrSize = Math.min(width, height) / 2.3

        page.drawImage(qrImage, {
            x: (width - qrSize) / 2,
            y: height / 2 - qrSize / 2 - 10,
            width: qrSize,
            height: qrSize,
        })

        // משפט חתימה רך
        const cta = 'הסריקה תוביל אתכם לעמוד הברכות 🎉'
        const ctaSize = 14
        const ctaWidth = hebrewFont.widthOfTextAtSize(cta, ctaSize)
        page.drawText(cta, {
            x: width / 2 - ctaWidth / 2,
            y: height / 2 - qrSize / 2 - 60,
            size: ctaSize,
            font: hebrewFont,
            color: pink,
        })

        // לינק קטן
        const linkSize = 10
        const linkWidth = hebrewFont.widthOfTextAtSize(guestLink, linkSize)
        page.drawText(guestLink, {
            x: width / 2 - linkWidth / 2,
            y: 35,
            size: linkSize,
            font: hebrewFont,
            color: rgb(0.4, 0.4, 0.4),
        })

        // 🔽 יצירת הקובץ הסופי
        const pdfBytes = await pdfDoc.save()

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename=WeddingTales-QR-${weddingId}-${sizeParam}.pdf`,
            },
        })
    } catch (err) {
        console.error('❌ PDF Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
