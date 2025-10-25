import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import PDFDocument from 'pdfkit'
import getStream from 'get-stream'

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const qrData = await QRCode.toDataURL(guestLink)
    doc.fontSize(20).text('סרקו והעלו תמונות וברכות לחתונה שלכם 💍', { align: 'center' })
    doc.moveDown(1)
    doc.image(qrData, { fit: [250, 250], align: 'center', valign: 'center' })
    doc.moveDown(1)
    doc.fontSize(14).text(guestLink, { align: 'center', link: guestLink, underline: true })
    doc.end()

    const buffer = await getStream.buffer(doc)
    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename=WeddingTales-QR.pdf',
        },
    })
}
