// Root loading boundary — Next.js renders this during any segment
// transition below `/` that hasn't been overridden by a more
// specific loading.js. Server component (no hooks, no client JS) so
// it streams before the route's bundle arrives. Per-route variants
// (photo, book, admin, studio) override this with palette-matched
// versions where the white→themed transition would flash.

export default function RootLoading() {
    return (
        <div
            className='min-h-[100svh] flex items-center justify-center'
            style={{ background: 'linear-gradient(180deg, #f8f4ec 0%, #efe3c9 100%)' }}
        >
            <div
                className='w-10 h-10 rounded-full animate-spin'
                style={{
                    border: '3px solid rgba(170,136,64,0.18)',
                    borderTopColor: '#aa8840',
                }}
            />
        </div>
    )
}
