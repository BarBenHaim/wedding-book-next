'use client'

// /login — three ways in, the simplest first:
//   1. Google (shown only when it is switched on in Firebase),
//   2. "send me a link": type the e-mail, tap the link that arrives, done
//      (/api/auth/enter-link → /enter), and
//   3. "I have a password": e-mail + password, with "forgot" one tap away.
// Everything ends in afterSignIn(): session cookie, remember-me, and the
// right place to land (src/lib/afterSignIn.js).

import { useState, useMemo, useEffect, useRef } from 'react'
import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
} from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'
import { getMessages } from '@/i18n/getMessages'
import { afterSignIn, signOutQuietly } from '@/lib/afterSignIn'
import { authErrorMessage, isUserCancel } from '@/lib/passwordLink'
import AuthShell, { AUTH, fieldCls, primaryBtnCls, primaryBtnStyle } from '@/components/Auth/AuthShell'

// Login is anonymous chrome, no wedding context to read a locale from. It is
// Hebrew: this is a Hebrew-first product, and a browser set to English used to
// show Hebrew customers an English login.

const WAIT_SECONDS = 45 // before "send again" is offered

export default function LoginPage() {
    const router = useRouter()
    const t = useMemo(() => getMessages('he').login, [])
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(true)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    // 'start' | 'sent' | 'password' | 'reset' | 'resetSent'
    const [view, setView] = useState('start')
    const [googleOn, setGoogleOn] = useState(false)
    const [seconds, setSeconds] = useState(0)
    const emailRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        fetch('/api/auth/providers', { cache: 'no-store' })
            .then(r => r.json())
            .then(j => { if (!cancelled) setGoogleOn(j?.google !== false) })
            .catch(() => {})
        try {
            const q = new URLSearchParams(window.location.search)
            if (q.get('mode') === 'reset') setView('reset') // /set-password links here when a link has expired
            const e = q.get('email')
            if (e) setEmail(e)
        } catch { /* ignore */ }
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (seconds <= 0) return undefined
        const id = setTimeout(() => setSeconds(s => s - 1), 1000)
        return () => clearTimeout(id)
    }, [seconds])

    async function finish(user) {
        const { path, email: who } = await afterSignIn(user, { rememberMe })
        if (!path) {
            await signOutQuietly()
            setError(t.noEvent.replace('{email}', who || ''))
            return
        }
        router.push(path)
    }

    async function handleGoogle() {
        setError('')
        setLoading(true)
        try {
            await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
            const provider = new GoogleAuthProvider()
            provider.setCustomParameters({ prompt: 'select_account' })
            const cred = await signInWithPopup(auth, provider)
            await finish(cred.user)
        } catch (err) {
            if (!isUserCancel(err?.code)) setError(authErrorMessage(err?.code))
        } finally {
            setLoading(false)
        }
    }

    async function postEmail(url, okView) {
        setError('')
        setLoading(true)
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json.ok) {
                setError(json.error || authErrorMessage())
                return
            }
            setSeconds(WAIT_SECONDS)
            setView(okView)
        } catch {
            setError(authErrorMessage('auth/network-request-failed'))
        } finally {
            setLoading(false)
        }
    }

    const sendEnterLink = e => {
        e?.preventDefault?.()
        if (!email.trim()) { setError('כתבו את כתובת המייל'); emailRef.current?.focus(); return }
        postEmail('/api/auth/enter-link', 'sent')
    }
    const sendResetLink = e => {
        e?.preventDefault?.()
        if (!email.trim()) { setError('כתבו את כתובת המייל'); return }
        postEmail('/api/auth/password-link', 'resetSent')
    }

    async function handlePassword(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            // Persistence is set BEFORE the sign-in so the session is stamped
            // right from the start: remember-me keeps it across restarts
            // (it expires after a week, src/lib/sessionExpiry.js), otherwise
            // it ends with the tab.
            await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
            const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
            await finish(cred.user)
        } catch (err) {
            setError(authErrorMessage(err?.code))
        } finally {
            setLoading(false)
        }
    }

    const emailField = (
        <div>
            <label htmlFor='login-email' className='mb-1.5 block text-[14.5px] font-semibold'>המייל שלכם</label>
            <input
                id='login-email'
                ref={emailRef}
                type='email'
                inputMode='email'
                autoComplete='email'
                autoCapitalize='none'
                placeholder='name@example.com'
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                className={fieldCls}
                style={{ borderColor: AUTH.line, direction: 'ltr', textAlign: 'start' }}
            />
        </div>
    )

    const errorBox = error && (
        <p role='alert' className='mt-4 mb-0 rounded-[12px] bg-[#FDECEC] px-3.5 py-3 text-center text-[14.5px] leading-snug text-[#9B1C1C]'>
            {error}
        </p>
    )

    const link = (label, onClick) => (
        <button
            type='button'
            onClick={onClick}
            className='block w-full cursor-pointer border-0 bg-transparent py-1 text-center text-[14.5px] font-bold underline underline-offset-4'
            style={{ color: AUTH.ink }}
        >
            {label}
        </button>
    )

    // ── the link is on its way ──
    if (view === 'sent' || view === 'resetSent') {
        const isReset = view === 'resetSent'
        return (
            <AuthShell
                title={isReset ? 'שלחנו קישור לבחירת סיסמה' : 'שלחנו לכם קישור'}
                subtitle={isReset ? 'לוחצים עליו ובוחרים סיסמה חדשה.' : 'לוחצים עליו במייל, ונכנסים. בלי סיסמה.'}
            >
                <div className='rounded-[16px] px-4 py-3.5 text-[15px] leading-relaxed' style={{ background: '#ECF7F1', color: '#12402B' }}>
                    נשלח אל <b dir='ltr' className='break-all'>{email.trim()}</b>. אם המייל לא מגיע תוך דקה, כדאי לבדוק בספאם.
                </div>
                <div className='mt-5 space-y-3'>
                    {seconds > 0 ? (
                        <p className='m-0 text-center text-[14px]' style={{ color: AUTH.muted }}>אפשר לשלוח שוב בעוד {seconds} שניות</p>
                    ) : (
                        link('שלחו שוב', isReset ? sendResetLink : sendEnterLink)
                    )}
                    {link('לשנות כתובת', () => { setView('start'); setError('') })}
                </div>
                {errorBox}
            </AuthShell>
        )
    }

    // ── forgot the password ──
    if (view === 'reset') {
        return (
            <AuthShell title='בחירת סיסמה חדשה' subtitle='נשלח קישור למייל, שבו בוחרים סיסמה.'>
                <form onSubmit={sendResetLink} className='space-y-4'>
                    {emailField}
                    <button type='submit' disabled={loading} className={primaryBtnCls} style={primaryBtnStyle}>
                        {loading ? 'שולחים…' : 'שלחו לי קישור'}
                    </button>
                    {link('חזרה', () => { setView('password'); setError('') })}
                </form>
                {errorBox}
            </AuthShell>
        )
    }

    // ── e-mail and password ──
    if (view === 'password') {
        return (
            <AuthShell title='כניסה עם סיסמה'>
                <form onSubmit={handlePassword} className='space-y-4'>
                    {emailField}
                    <div>
                        <label htmlFor='login-pass' className='mb-1.5 block text-[14.5px] font-semibold'>סיסמה</label>
                        <div className='relative'>
                            <input
                                id='login-pass'
                                type={showPassword ? 'text' : 'password'}
                                autoComplete='current-password'
                                placeholder='••••••••'
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError('') }}
                                className={`${fieldCls} pl-20`}
                                style={{ borderColor: AUTH.line, direction: 'ltr', textAlign: 'start' }}
                            />
                            <button
                                type='button'
                                onClick={() => setShowPassword(v => !v)}
                                className='absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-[13.5px] font-bold'
                                style={{ color: AUTH.accent }}
                                aria-label={showPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
                            >
                                {showPassword ? 'הסתר' : 'הצג'}
                            </button>
                        </div>
                    </div>
                    <label className='flex cursor-pointer select-none items-center gap-2.5 py-1 text-[14.5px]'>
                        <input
                            type='checkbox'
                            checked={rememberMe}
                            onChange={e => setRememberMe(e.target.checked)}
                            className='h-[18px] w-[18px] cursor-pointer'
                            style={{ accentColor: AUTH.ink }}
                        />
                        {t.rememberMe}
                    </label>
                    <button type='submit' disabled={loading} className={primaryBtnCls} style={primaryBtnStyle}>
                        {loading ? 'נכנסים…' : 'כניסה'}
                    </button>
                    {link('שכחתי סיסמה', () => { setView('reset'); setError('') })}
                    {link('עדיף קישור במייל', () => { setView('start'); setError('') })}
                </form>
                {errorBox}
            </AuthShell>
        )
    }

    // ── start: the simplest way first ──
    return (
        <AuthShell title='כניסה לספר שלכם' subtitle='כותבים את המייל, ונשלח קישור כניסה. בלי סיסמה.'>
            {googleOn && (
                <>
                    <button
                        type='button'
                        onClick={handleGoogle}
                        disabled={loading}
                        className='flex w-full cursor-pointer items-center justify-center gap-3 rounded-[14px] border bg-white px-6 py-3.5 text-[16px] font-bold transition active:scale-[.98] disabled:opacity-60'
                        style={{ borderColor: AUTH.line, color: AUTH.ink }}
                    >
                        <svg className='h-5 w-5' viewBox='0 0 48 48' aria-hidden='true'>
                            <path fill='#EA4335' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z' />
                            <path fill='#4285F4' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z' />
                            <path fill='#FBBC05' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z' />
                            <path fill='#34A853' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z' />
                        </svg>
                        המשך עם Google
                    </button>
                    <div className='my-5 flex items-center gap-3' aria-hidden='true'>
                        <span className='h-px flex-1' style={{ background: AUTH.line }} />
                        <span className='text-[13px]' style={{ color: AUTH.muted }}>או</span>
                        <span className='h-px flex-1' style={{ background: AUTH.line }} />
                    </div>
                </>
            )}
            <form onSubmit={sendEnterLink} className='space-y-4' noValidate>
                {emailField}
                <button type='submit' disabled={loading} className={primaryBtnCls} style={primaryBtnStyle}>
                    {loading ? 'שולחים…' : 'שלחו לי קישור כניסה'}
                </button>
            </form>
            {errorBox}
            <div className='mt-5 border-t pt-4' style={{ borderColor: AUTH.line }}>
                {link('יש לי סיסמה', () => { setView('password'); setError('') })}
            </div>
        </AuthShell>
    )
}
