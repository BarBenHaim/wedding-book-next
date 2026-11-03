'use client'

// /set-password?code=… — the customer picks their own password.
//
// Opened from the email /api/auth/password-link sends (or the super-admin's
// "send a set-password link"). The code is a Firebase password-reset code;
// we check it, save the new password, sign the customer in with it and send
// them to their book — one screen, no Firebase-branded detour.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPasswordResetCode, confirmPasswordReset, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { getMessages } from '@/i18n/getMessages'
import { afterSignIn, signOutQuietly } from '@/lib/afterSignIn'
import { passwordProblem, authErrorMessage, MIN_PASSWORD_LENGTH } from '@/lib/passwordLink'

const inputCls =
    'w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-700 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition-all'

export default function SetPasswordPage() {
    const router = useRouter()
    const t = useMemo(() => getMessages('he').setPassword, [])
    const tl = useMemo(() => getMessages('he').login, [])

    const [code, setCode] = useState('')
    const [phase, setPhase] = useState('checking') // checking | ready | saving | done | invalid
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [show, setShow] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let c = ''
        try {
            c = new URLSearchParams(window.location.search).get('code') || ''
        } catch { /* ignore */ }
        setCode(c)
        if (!c) {
            setPhase('invalid')
            return
        }
        verifyPasswordResetCode(auth, c)
            .then(addr => {
                setEmail(addr)
                setPhase('ready')
            })
            .catch(() => setPhase('invalid'))
    }, [])

    async function onSubmit(e) {
        e.preventDefault()
        const problem = passwordProblem(password, confirm)
        if (problem) {
            setError(problem)
            return
        }
        setError('')
        setPhase('saving')
        try {
            await confirmPasswordReset(auth, code, password)
            const cred = await signInWithEmailAndPassword(auth, email, password)
            setPhase('done')
            const { path } = await afterSignIn(cred.user, { rememberMe: true })
            if (!path) {
                await signOutQuietly()
                setPhase('ready')
                setError(tl.noEvent.replace('{email}', email))
                return
            }
            router.push(path)
        } catch (err) {
            const code = err?.code
            if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') setPhase('invalid')
            else setPhase('ready')
            setError(authErrorMessage(code))
        }
    }

    return (
        <div className='relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 sm:px-6 py-8 font-sans' dir='rtl'>
            <div className='absolute -top-24 left-10 h-72 w-72 rounded-full bg-[#AA8840]/10 blur-3xl'></div>
            <div className='absolute bottom-10 right-10 h-80 w-80 rounded-full bg-[#AA8840]/8 blur-3xl'></div>

            <div className='relative z-10 w-full max-w-md rounded-2xl bg-white/90 backdrop-blur-md p-6 sm:p-8 shadow-xl animate-scaleIn'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src='/logo-wt.png' alt='Wedding Tales' className='h-12 w-auto mx-auto mb-5 drop-shadow-[0_2px_8px_rgba(170,136,64,0.25)]' />
                <h1 className='mb-1.5 text-center text-2xl font-bold text-[#18140F]'>{t.title}</h1>

                {phase === 'checking' && <p className='text-center text-sm text-[#5a5040] py-6'>{t.checking}</p>}

                {phase === 'invalid' && (
                    <div className='text-center py-4'>
                        <p className='text-sm text-[#5a5040] mb-5'>{t.invalid}</p>
                        <a
                            href='/login?mode=reset'
                            className='inline-block rounded-xl gold-shimmer px-6 py-3 text-base font-semibold text-white shadow-lg'
                        >
                            {t.requestNew}
                        </a>
                    </div>
                )}

                {(phase === 'ready' || phase === 'saving' || phase === 'done') && (
                    <>
                        <p className='text-center text-sm text-[#5a5040] mb-6'>
                            {t.subtitle.split('{email}')[0]}
                            <span dir='ltr' className='font-semibold'>{email}</span>
                            {t.subtitle.split('{email}')[1]}
                        </p>
                        <form onSubmit={onSubmit} className='space-y-4'>
                            <div className='text-start'>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>{t.passwordLabel}</label>
                                <input
                                    type={show ? 'text' : 'password'}
                                    autoComplete='new-password'
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}
                                    className={inputCls}
                                    dir='ltr'
                                />
                            </div>
                            <div className='text-start'>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>{t.confirmLabel}</label>
                                <input
                                    type={show ? 'text' : 'password'}
                                    autoComplete='new-password'
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    className={inputCls}
                                    dir='ltr'
                                />
                            </div>
                            <label className='flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none'>
                                <input type='checkbox' checked={show} onChange={e => setShow(e.target.checked)} className='accent-[#AA8840]' />
                                הצגת הסיסמה
                            </label>
                            <button
                                type='submit'
                                disabled={phase !== 'ready'}
                                className='w-full rounded-xl gold-shimmer px-6 py-3.5 text-lg font-semibold text-white shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
                            >
                                {phase === 'saving' ? t.submitting : phase === 'done' ? t.done : t.submit}
                            </button>
                        </form>
                    </>
                )}

                {error && <p className='mt-4 text-center text-sm text-red-600 bg-red-50 rounded-xl py-2.5 px-3'>{error}</p>}
            </div>
        </div>
    )
}
