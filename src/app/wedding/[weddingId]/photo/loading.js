// Photo route loading — most-trafficked segment in the app (every
// guest who scans the QR lands here). Matches the moment-layout's
// cream + floral wash so the transition from /wedding/[id] →
// /wedding/[id]/photo doesn't flash white on the way to the
// arch backdrop. Server component, no client JS.

export default function PhotoLoading() {
    return (
        <div
            className='min-h-[100svh] flex items-center justify-center px-4'
            style={{
                backgroundColor: '#fbf6ec',
                backgroundImage: 'url(/backgrounds/romanticgarden.webp)',
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
                backgroundRepeat: 'no-repeat',
            }}
        >
            <div className='flex flex-col items-center gap-3'>
                <div
                    className='w-11 h-11 rounded-full animate-spin'
                    style={{
                        border: '3px solid rgba(170,136,64,0.20)',
                        borderTopColor: '#aa8840',
                    }}
                />
                <p
                    className='text-[12.5px] font-semibold'
                    style={{ color: '#7a6a52', textShadow: '0 1px 4px rgba(255,255,255,0.6)' }}
                >
                    טוען...
                </p>
            </div>
        </div>
    )
}
