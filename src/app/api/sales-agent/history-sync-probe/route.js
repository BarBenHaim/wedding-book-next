import { NextResponse } from 'next/server'
import { handleHistorySyncProbe } from '@/lib/salesAgent/historySyncProbe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(request) {
    const result = await handleHistorySyncProbe(request)
    return NextResponse.json(result.body, { status: result.status })
}
