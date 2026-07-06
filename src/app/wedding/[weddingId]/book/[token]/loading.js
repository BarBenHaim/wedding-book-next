// Public digital-book loading — the Suspense fallback that streams
// BEFORE the heavy book bundle downloads, then hands off to the
// client-side <LoadingScreen /> once page.js hydrates.
//
// It intentionally MATCHES <LoadingScreen />'s no-wedding-yet
// branch: same dark radial background, same mini-book animation,
// same gold caption. That way the switch from this server-rendered
// fallback to the client loader is visually invisible — the user
// doesn't see two different loaders overlap ("טוען את הספר…" from
// this file, then "טוען את הספר שלכם" from page.js) which used to
// happen for the ~300–600ms while the JS bundle downloaded.

export default function BookLoading() {
    return (
        <div
            className='flex items-center justify-center relative'
            style={{
                minHeight: '100dvh',
                padding: '24px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
                background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)',
            }}
        >
            <div className='relative z-10 flex flex-col items-center gap-7'>
                {/* Mini-book — matches the no-wedding-yet fallback in
                    LoadingScreen. Pure CSS; no client JS needed here
                    since animations are declarative. */}
                <div
                    className='relative'
                    style={{
                        width: 116,
                        height: 88,
                        animation: 'bookLoadFloat 3.8s ease-in-out infinite',
                    }}
                >
                    <div
                        className='absolute top-0 left-0 h-full'
                        style={{
                            width: '50%',
                            background: 'linear-gradient(180deg, #fdf6e8 0%, #f6ebd0 100%)',
                            borderRadius: '4px 0 0 4px',
                            transformOrigin: 'right center',
                            animation: 'bookLoadPageLeft 3.8s ease-in-out infinite',
                            boxShadow: 'inset -2px 0 4px rgba(170,136,64,0.15)',
                        }}
                    />
                    <div
                        className='absolute top-0 right-0 h-full'
                        style={{
                            width: '50%',
                            background: 'linear-gradient(180deg, #fdf6e8 0%, #f6ebd0 100%)',
                            borderRadius: '0 4px 4px 0',
                            transformOrigin: 'left center',
                            animation: 'bookLoadPageRight 3.8s ease-in-out infinite',
                            boxShadow: 'inset 2px 0 4px rgba(170,136,64,0.15)',
                        }}
                    />
                    <div
                        className='absolute top-1 bottom-1'
                        style={{
                            left: 'calc(50% - 0.5px)',
                            width: 1,
                            background: 'linear-gradient(180deg, transparent 0%, #c9a44e 50%, transparent 100%)',
                            opacity: 0.7,
                        }}
                    />
                    <svg
                        viewBox='0 0 24 24'
                        className='absolute'
                        style={{
                            width: 18,
                            height: 18,
                            top: -26,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fill: '#c9a44e',
                            animation: 'bookLoadHeartPulse 1.8s ease-in-out infinite',
                            filter: 'drop-shadow(0 2px 6px rgba(201,164,78,0.45))',
                        }}
                    >
                        <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                    </svg>
                </div>

                {/* Caption — kept identical to the in-page LoadingScreen so
                    the two loaders read as ONE screen even mid-hydration. */}
                <p
                    style={{
                        color: '#d4b86b',
                        fontSize: '11.5px',
                        letterSpacing: '0.32em',
                        textTransform: 'uppercase',
                        fontWeight: 500,
                    }}
                >
                    טוען את הספר שלכם
                </p>
            </div>

            <style>{`
                @keyframes bookLoadFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes bookLoadPageLeft {
                    0%, 100% { transform: rotateY(0deg); }
                    50% { transform: rotateY(-14deg); }
                }
                @keyframes bookLoadPageRight {
                    0%, 100% { transform: rotateY(0deg); }
                    50% { transform: rotateY(14deg); }
                }
                @keyframes bookLoadHeartPulse {
                    0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.85; }
                    50% { transform: translateX(-50%) scale(1.12); opacity: 1; }
                }
            `}</style>
        </div>
    )
}
