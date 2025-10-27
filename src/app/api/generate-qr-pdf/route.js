import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ✅ תמיכה בעברית
function fixHebrew(text) {
    const hebrewRegex = /[\u0590-\u05FF]/
    if (!hebrewRegex.test(text)) return text
    const parts = text.match(/[^\s]+|\s+/g) || []
    return parts.reverse().join('')
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const weddingId = searchParams.get('weddingId')
        const fg = searchParams.get('fg') || '8B5CF6' // צבע קדמי (סגול)
        const bg = searchParams.get('bg') || 'FFFFFF' // רקע לבן
        const includeLogo = searchParams.get('logo') === 'true'

        const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

        // ✅ טעינת פונט עברי
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
        if (!fs.existsSync(fontPath)) throw new Error('Font not found')
        const fontBuffer = fs.readFileSync(fontPath)

        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            font: fontBuffer,
        })

        doc.registerFont('hebrew', fontPath)
        doc.font('hebrew')

        const buffers = []
        doc.on('data', buffers.push.bind(buffers))
        const { width, height } = doc.page

        /* -------------------- רקע אלגנטי רך -------------------- */
        // שכבת בסיס לבנה
        doc.rect(0, 0, width, height).fill('#FFFFFF')

        // גרדיאנט אנכי רך בין #F8F5FF ל-#FFFFFF
        const gradientSteps = 42
        for (let i = 0; i < gradientSteps; i++) {
            const t = i / gradientSteps
            const r = 248 + (255 - 248) * t
            const g = 245 + (255 - 245) * t
            const b = 255 + (255 - 255) * t
            doc.save()
            doc.fillColor(`rgb(${r},${g},${b})`)
                .rect(0, (height / gradientSteps) * i, width, height / gradientSteps)
                .fill()
            doc.restore()
        }

        // וינייטה עדינה (טבעות לבנדר שקופות)
        doc.save()
        doc.fillColor('#8B5CF6').opacity(0.05)
        const cx = width / 2
        const cy = height * 0.25
        for (let i = 0; i < 4; i++) {
            doc.circle(cx, cy, 220 + i * 60).fill()
        }
        doc.restore()

        /* -------------------- מסגרת כפולה אלגנטית -------------------- */
        // חישוב ריבוע פנימי
        const padOuter = 28
        const padInner = 36
        const radius = 22

        // קו חיצוני לבנדר
        doc.save()
        doc.lineWidth(1.5).strokeColor('#E5D8FF')
        doc.roundedRect(padOuter, padOuter, width - padOuter * 2, height - padOuter * 2, radius).stroke()
        doc.restore()

        // קו פנימי זהב רך
        doc.save()
        doc.lineWidth(0.8).strokeColor('#E9D5FF')
        doc.roundedRect(padInner, padInner, width - padInner * 2, height - padInner * 2, radius - 6).stroke()
        doc.restore()

        /* -------------------- קישוטי לב קטנים בפינות -------------------- */
        function drawHeart(x, y, s = 8, color = '#E9D5FF', rot = 0) {
            // ציור לב פשוט עם bezier
            doc.save()
            doc.translate(x, y).rotate(rot).fillColor(color).opacity(0.65)
            doc.moveTo(0, s * 0.6)
            doc.bezierCurveTo(-s, 0, -s, -s * 0.8, 0, -s * 0.3)
            doc.bezierCurveTo(s, -s * 0.8, s, 0, 0, s * 0.6).fill()
            doc.restore()
        }
        drawHeart(padInner + 14, padInner + 14, 7, '#EBDCFD', -10)
        drawHeart(width - padInner - 14, padInner + 14, 7, '#F5E8FF', 10)
        drawHeart(padInner + 14, height - padInner - 14, 7, '#F5E8FF', -170)
        drawHeart(width - padInner - 14, height - padInner - 14, 7, '#EBDCFD', 170)

        /* -------------------- כותרת וטקסט משנה (ללא שינוי טקסט) -------------------- */
        doc.fontSize(36).fillColor('#8B5CF6').text(fixHebrew(' סרקו והעלו לנו תמונה או ברכה'), 0, 96, {
            align: 'center',
            width,
        })

        // קו מפריד מעודן עם נקודות זהב
        const lineY = 150
        doc.save()
        doc.lineWidth(1)
            .strokeColor('#555555ff')
            .moveTo(width / 2 - 72, lineY)
            .lineTo(width / 2 + 72, lineY)
            .stroke()
        doc.restore()

        doc.fontSize(16).fillColor('#666666').text(fixHebrew(' צלמו, ברכו או שתפו רגע קטן שלכם מהחתונה שלנו'), 0, 172, {
            align: 'center',
            width,
        })

        /* -------------------- כרטיס QR עם “צל” עדין -------------------- */
        // צל רך מאחור (Layer)
        const qrCardW = 300
        const qrCardH = 300
        const qrX = width / 2 - qrCardW / 2
        const qrY = 260

        doc.save()
        doc.fillColor('#000000').opacity(0.06)
        doc.roundedRect(qrX + 6, qrY + 10, qrCardW, qrCardH, 16).fill()
        doc.restore()

        // כרטיס מקדמי
        doc.save()
        doc.lineWidth(1)
            .fillColor('#FFFFFF')
            .strokeColor('#EDE9FE')
            .roundedRect(qrX, qrY, qrCardW, qrCardH, 16)
            .fillAndStroke()
        doc.restore()

        // מסגרת פנימית דקיקה זהב
        doc.save()
        doc.lineWidth(0.6).strokeColor('#E5D8FF')
        doc.roundedRect(qrX + 8, qrY + 8, qrCardW - 16, qrCardH - 16, 12).stroke()
        doc.restore()

        // לולאות עליונות קטנות (קישוט)
        doc.save()
        doc.strokeColor('#E5D8FF').lineWidth(1)
        const decoY = qrY - 14
        doc.moveTo(qrX + 40, decoY)
            .quadraticCurveTo(qrX + qrCardW / 2, decoY - 10, qrX + qrCardW - 40, decoY)
            .stroke()
        doc.restore()

        /* -------------------- QR צבעוני (ללא שינוי לוגיקה/טקסט) -------------------- */
        let qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(
            guestLink
        )}&color=${fg}&bgcolor=${bg}`

        if (includeLogo) {
            const logoPath = path.join(process.cwd(), 'public', 'logo-gradient.png')
            const qrResponse = await fetch(qrUrl)
            const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())

            const innerImgW = 280
            const innerX = width / 2 - innerImgW / 2
            const innerY = qrY + 10

            doc.image(qrBuffer, innerX, innerY, { width: innerImgW })

            if (fs.existsSync(logoPath)) {
                // עיגול לבן קטן במרכז + לוגו
                doc.save()
                doc.circle(width / 2, innerY + innerImgW / 2, 25).fill('#FFFFFF')
                doc.image(logoPath, width / 2 - 20, innerY + innerImgW / 2 - 20, { width: 40 })
                doc.restore()
            }
        } else {
            const qrResponse = await fetch(qrUrl)
            const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())
            const innerImgW = 280
            const innerX = width / 2 - innerImgW / 2
            const innerY = qrY + 10
            doc.image(qrBuffer, innerX, innerY, { width: innerImgW })
        }

        /* -------------------- חתימת מותג (ללא שינוי טקסט) -------------------- */
        doc.fontSize(12)
            .fillColor('#a1a1aa')
            .text(fixHebrew('נוצר באהבה עם Tales Wedding'), 0, height - 80, {
                align: 'center',
                width,
            })

        doc.end()

        const pdfBuffer = await new Promise(resolve => {
            doc.on('end', () => resolve(Buffer.concat(buffers)))
        })

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename=WeddingTales-${weddingId}.pdf`,
                'Cache-Control': 'no-store',
            },
        })
    } catch (err) {
        console.error('❌ PDF Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
