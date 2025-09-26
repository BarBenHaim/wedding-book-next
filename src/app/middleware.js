// middleware.js
import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'

export async function middleware(req) {
    const path = req.nextUrl.pathname

    if (path.includes('/admin') || path.includes('/viewer')) {
        const token = req.cookies.get('session')?.value

        if (!token) {
            return NextResponse.redirect(new URL('/login', req.url))
        }

        try {
            await adminAuth.verifyIdToken(token)
            return NextResponse.next()
        } catch {
            return NextResponse.redirect(new URL('/login', req.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/wedding/:*/admin', '/wedding/:*/viewer'],
}
