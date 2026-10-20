import { NextResponse } from 'next/server'
import { authorizeWeddingAccess } from '@/app/api/guests/_auth'
import { ownerWeddingView } from '@/lib/server/ownerViews'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req) {
    const weddingId = new URL(req.url).searchParams.get('weddingId')
    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
    return NextResponse.json({ ok: true, wedding: ownerWeddingView(auth.wedding) }, {
        headers: { 'Cache-Control': 'private, no-store' },
    })
}
