import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'

export async function POST(req) {
    try {
        const { token } = await req.json()
        const decoded = await adminAuth.verifyIdToken(token)

        const res = NextResponse.json({ success: true, uid: decoded.uid })

        // הוספת קוקי אמיתי
        res.cookies.set({
            name: 'session',
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24, // יום
        })

        return res
    } catch (err) {
        console.error('❌ Error in /api/login:', err)
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
}
