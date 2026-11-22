'use client'

// /enter?t=… — the one-tap way in. The first e-mail and the "send me a link"
// button on /login both point here: we trade the signed token for a Firebase
// custom token, sign in, and go to the customer's book. Nothing to type.

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithCustomToken, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { afterSignIn, signOutQuietly } from '@/lib/afterSignIn'
import AuthShell, { AUTH, primaryBtnCls, primaryBtnStyle } from '@/components/Auth/AuthShell'

function Enter() {
    const router = useRouter()
    const params = useSearchParams()
    const token = params?.get('t') || ''
    const [problem, setProblem] = useState('')
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true
        if (!token) {
            setProblem('הקישור לא תקין')
            return
        }
        ;(async () => {
            try {
                const res = await fetch('/api/auth/enter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ t: token }),
                })
                const json = await res.json().catch(() => ({}))
                if (!res.ok || !json.ok || !json.customToken) {
                    setProblem(json.error || 'לא הצלחנו להכניס אתכם')
                    return
                }
                await setPersistence(auth, browserLocalPersistence)
                const cred = await signInWithCustomToken(auth, json.customToken)
                const { path } = await afterSignIn(cred.user, { rememberMe: true })
                if (!path) {
                    await signOutQuietly()
                    setProblem('לא מצאנו ספר שמחובר לחשבון הזה')
                    return
                }
                router.replace(path)
            } catch {
                setProblem('לא הצלחנו להכניס אתכם. נסו שוב.')
            }
        })()
    }, [token, router])

    if (problem) {
        return (
            <AuthShell title='הקישור לא עבד' subtitle={problem}>
                <p className='m-0 mb-5 text-[15px] leading-relaxed' style={{ color: AUTH.muted }}>
                    קישורי כניסה תקפים לזמן מוגבל. אפשר לבקש חדש בכל רגע, במייל בלבד.
                </p>
                <a href='/login' className={primaryBtnCls} style={{ ...primaryBtnStyle, textDecoration: 'none' }}>
                    לבקש קישור חדש
                </a>
            </AuthShell>
        )
    }

    return (
        <AuthShell title='נכנסים לספר שלכם' subtitle='עוד רגע זה מוכן.'>
            <div className='flex justify-center py-4' role='status' aria-label='טוען'>
                <div className='h-10 w-10 animate-spin rounded-full border-[3px]' style={{ borderColor: 'rgba(37,69,224,.2)', borderTopColor: AUTH.accent }} />
            </div>
        </AuthShell>
    )
}

export default function EnterPage() {
    return (
        <Suspense fallback={null}>
            <Enter />
        </Suspense>
    )
}
