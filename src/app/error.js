'use client'

// Root error boundary — catches anything thrown during render in any
// route below `/`. Renders a calm Hebrew apology with a retry button
// (Next.js gives us `reset` which re-mounts the segment) and logs
// the error to the console for debugging. Production-ready
// monitoring (Sentry et al) plugs in here by adding the SDK's
// captureException call.

import { useEffect } from 'react'

export default function RootError({ error, reset }) {
    useEffect(() => {
        console.error('[app/error] uncaught render error:', error)
    }, [error])

    return (
        <div
            className='min-h-[100svh] flex items-center justify-center px-6 text-center'
            style={{ background: "#f3e2bd url('/admin-theme/parchment.webp') repeat" }}
        >
            <div className='max-w-sm'>
                <div
                    className='w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center'
                    style={{ background: 'linear-gradient(180deg, #2c2473 0%, #171049 100%)', border: '2px solid #d9b265' }}
                >
                    <span className='text-2xl text-white'>!</span>
                </div>
                <h2 style={{ color: '#1d1648', fontSize: 24, fontWeight: 900, marginBottom: 8, fontFamily: "'Noto Serif Hebrew', 'Frank Ruhl Libre', var(--font-frank), serif" }}>
                    משהו השתבש
                </h2>
                <p style={{ color: '#4f4668', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                    משהו לא עבד כצפוי. אנחנו כבר על זה. נסה לרענן את העמוד.
                </p>
                <button
                    onClick={reset}
                    className='inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-all'
                    style={{
                        background: 'linear-gradient(180deg, #2c2473 0%, #171049 58%, #1f1860 100%)',
                        border: '2px solid #d9b265',
                        boxShadow: '0 12px 22px -10px rgba(30,16,66,0.55)',
                    }}
                >
                    נסה שוב
                </button>
            </div>
        </div>
    )
}
