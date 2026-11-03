'use client'

import { useState, useMemo, useEffect } from 'react'
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

// Login is anonymous chrome — no wedding context to read locale from.
// We default to Hebrew (the SaaS's primary language) instead of sniffing
// the browser, which historically caused users with English-set browsers
// to see an English login screen even though they were Hebrew customers.

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    // "Remember me — 7 days per device" toggle. Default checked
    // because most users hit this from their personal device; the
    // box exists primarily so a user on a shared/public computer
    // can opt out into a tab-lifetime session instead.
    const [rememberMe, setRememberMe] = useState(true)
    const router = useRouter()
    // 'login' | 'reset' — the reset view asks for an email and mails a
    // choose-your-password link (/api/auth/password-link → /set-password).
    const [mode, setMode] = useState('login')
    const [resetState, setResetState] = useState('idle') // idle | sending | sent
    // Show "Continue with Google" only when the server says it is switched
    // on in Firebase (null = could not tell → show it, errors are handled).
    const [googleOn, setGoogleOn] = useState(false)

    const t = useMemo(() => getMessages('he').login, [])

    useEffect(() => {
        let cancelled = false
        fetch('/api/auth/providers', { cache: 'no-store' })
            .then(r => r.json())
            .then(j => { if (!cancelled) setGoogleOn(j?.google !== false) })
            .catch(() => {})
        // ?mode=reset — /set-password links here when a link has expired.
        try {
            if (new URLSearchParams(window.location.search).get('mode') === 'reset') setMode('reset')
        } catch { /* ignore */ }
        return () => { cancelled = true }
    }, [])

    // Every way in ends here: cookie, remember-me, and where to go.
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

    async function handleResetRequest(e) {
        e.preventDefault()
        setError('')
        setResetState('sending')
        try {
            const res = await fetch('/api/auth/password-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json.ok) {
                setError(json.error || authErrorMessage())
                setResetState('idle')
                return
            }
            setResetState('sent')
        } catch {
            setError(authErrorMessage('auth/network-request-failed'))
            setResetState('idle')
        }
    }

    async function handleLogin(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            // Match Firebase's persistence strategy to the checkbox
            // BEFORE the signIn call — that way the session is
            // stamped with the right persistence from the start.
            //   • Remember me ON  → browserLocalPersistence (survives
            //     restarts; we expire after 7 days via the helper).
            //   • Remember me OFF → browserSessionPersistence (auth
            //     dies when the tab/window closes). The 7-day key
            //     isn't needed in that case.
            await setPersistence(
                auth,
                rememberMe ? browserLocalPersistence : browserSessionPersistence
            )

            const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)
            await finish(userCredential.user)
        } catch (err) {
            setError(authErrorMessage(err?.code))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 sm:px-6 py-8 font-sans'>
            {/* Glow רקע */}
            <div className='absolute -top-24 left-10 h-72 w-72 rounded-full bg-[#AA8840]/10 blur-3xl'></div>
            <div className='absolute bottom-10 right-10 h-80 w-80 rounded-full bg-[#AA8840]/8 blur-3xl'></div>

            {/* כרטיס התחברות */}
            <div className='relative z-10 w-full max-w-md rounded-2xl bg-white/90 backdrop-blur-md p-6 sm:p-8 shadow-xl animate-scaleIn'>
                <img src='/logo-wt.png' alt='Wedding Tales' className='h-12 w-auto mx-auto mb-5 drop-shadow-[0_2px_8px_rgba(170,136,64,0.25)]' />

                {/* Decorative icon */}
                <div className='flex justify-center mb-3'>
                    <div className='w-12 h-12 rounded-full bg-[#AA8840]/10 flex items-center justify-center'>
                        <svg className='w-6 h-6 text-[#AA8840]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z' />
                        </svg>
                    </div>
                </div>

                <h1 className='mb-1.5 text-center text-2xl font-bold text-[#18140F]'>{mode === 'reset' ? t.resetTitle : t.title}</h1>
                <p className='text-center text-sm text-[#5a5040] mb-6'>{mode === 'reset' ? t.resetSubtitle : t.subtitle}</p>

                {mode === 'reset' ? (
                    <form onSubmit={handleResetRequest} className='space-y-4'>
                        <div className='text-start'>
                            <label className='block text-sm font-medium text-gray-700 mb-1'>{t.emailLabel}</label>
                            <input
                                type='email'
                                placeholder='name@example.com'
                                value={email}
                                onChange={e => { setEmail(e.target.value); setResetState('idle') }}
                                className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-700 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition-all'
                                dir='ltr'
                                required
                            />
                        </div>
                        {resetState === 'sent' ? (
                            <p className='text-center text-sm text-emerald-800 bg-emerald-50 rounded-xl py-3 px-3 leading-relaxed'>{t.resetSent}</p>
                        ) : (
                            <button
                                type='submit'
                                disabled={resetState === 'sending'}
                                className='w-full rounded-xl gold-shimmer px-6 py-3.5 text-lg font-semibold text-white shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
                            >
                                {resetState === 'sending' ? t.resetSending : t.resetSubmit}
                            </button>
                        )}
                        <button
                            type='button'
                            onClick={() => { setMode('login'); setResetState('idle'); setError('') }}
                            className='w-full text-center text-sm font-semibold text-[#AA8840] hover:underline'
                        >
                            {t.backToLogin}
                        </button>
                    </form>
                ) : (
                <>
                {googleOn && (
                    <>
                        <button
                            type='button'
                            onClick={handleGoogle}
                            disabled={loading}
                            className='w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-3 text-[15px] font-semibold text-gray-800 shadow-sm hover:bg-gray-50 transition-all disabled:opacity-60'
                        >
                            <svg className='w-5 h-5' viewBox='0 0 48 48' aria-hidden='true'>
                                <path fill='#EA4335' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z' />
                                <path fill='#4285F4' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z' />
                                <path fill='#FBBC05' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z' />
                                <path fill='#34A853' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z' />
                            </svg>
                            {t.googleButton}
                        </button>
                        <div className='flex items-center gap-3 my-4'>
                            <span className='h-px flex-1 bg-gray-200' />
                            <span className='text-xs text-gray-400'>{t.or}</span>
                            <span className='h-px flex-1 bg-gray-200' />
                        </div>
                    </>
                )}

                {/* טופס */}
                <form onSubmit={handleLogin} className='space-y-4'>
                    <div className='text-start'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>{t.emailLabel}</label>
                        <input
                            type='email'
                            placeholder='name@example.com'
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-700 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition-all'
                            dir='ltr'
                        />
                    </div>

                    <div className='text-start'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>{t.passwordLabel}</label>
                        <div className='relative'>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder='••••••••'
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 pl-12 text-gray-700 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition-all'
                                dir='ltr'
                            />
                            <button
                                type='button'
                                onClick={() => setShowPassword(!showPassword)}
                                className='absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#AA8840] transition-colors'
                                tabIndex={-1}
                            >
                                {showPassword ? (
                                    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.5}><path strokeLinecap='round' strokeLinejoin='round' d='M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88' /></svg>
                                ) : (
                                    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.5}><path strokeLinecap='round' strokeLinejoin='round' d='M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z' /><path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Remember me — 7 days per device. Default
                        checked. Sits right above the submit button
                        so the user reads the choice before clicking
                        submit. */}
                    <label className='flex items-center gap-2.5 cursor-pointer select-none text-start py-1'>
                        <input
                            type='checkbox'
                            checked={rememberMe}
                            onChange={e => setRememberMe(e.target.checked)}
                            className='w-4 h-4 rounded border-[#AA8840]/30 text-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/30 cursor-pointer accent-[#AA8840]'
                        />
                        <span className='text-sm text-gray-700'>
                            {t.rememberMe}
                        </span>
                    </label>

                    <button
                        type='submit'
                        disabled={loading}
                        className='w-full rounded-xl gold-shimmer px-6 py-3.5 text-lg font-semibold text-white shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
                    >
                        {loading ? (
                            <span className='flex items-center justify-center gap-2'>
                                <svg className='w-5 h-5 animate-spin' fill='none' viewBox='0 0 24 24'>
                                    <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'/>
                                    <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z'/>
                                </svg>
                                {t.submitting}
                            </span>
                        ) : t.submit}
                    </button>
                    <button
                        type='button'
                        onClick={() => { setMode('reset'); setError('') }}
                        className='w-full text-center text-sm font-semibold text-[#AA8840] hover:underline'
                    >
                        {t.forgotLink}
                    </button>
                </form>
                </>
                )}

                {error && <p className='mt-4 text-center text-sm text-red-600 bg-red-50 rounded-xl py-2.5 px-3'>{error}</p>}

                {/* Help text */}
                <div className='mt-6 pt-5 border-t border-gray-100 text-center'>
                    <p className='text-sm text-gray-400'>
                        {t.helpText}
                    </p>
                </div>
            </div>
        </div>
    )
}
