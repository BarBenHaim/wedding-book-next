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
            style={{ background: 'linear-gradient(180deg, #f8f4ec 0%, #efe3c9 100%)' }}
        >
            <div className='max-w-sm'>
                <div
                    className='w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center'
                    style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}
                >
                    <span className='text-2xl text-white'>!</span>
                </div>
                <h2 style={{ color: '#1a1410', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                    משהו השתבש
                </h2>
                <p style={{ color: '#7a6a52', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                    משהו לא עבד כצפוי. אנחנו כבר על זה. נסה לרענן את העמוד.
                </p>
                <button
                    onClick={reset}
                    className='inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-all'
                    style={{
                        background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                        boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                    }}
                >
                    נסה שוב
                </button>
            </div>
        </div>
    )
}
