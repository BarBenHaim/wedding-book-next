import { NextResponse } from 'next/server'
import { handleWhatsAppTemplateBootstrap } from '@/lib/salesAgent/whatsappTemplateBootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function POST(request) {
    const result = await handleWhatsAppTemplateBootstrap(request)
    return NextResponse.json(result.body, { status: result.status })
}
