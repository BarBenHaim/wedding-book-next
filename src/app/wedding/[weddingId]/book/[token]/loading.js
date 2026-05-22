// Public digital-book loading — what visitors see between clicking
// the shared link and the heavy book bundle arriving. Matches the
// book's warm cream-and-gold palette so there's no white flash
// before the floral backdrop materializes. Server component.

export default function BookLoading() {
    return (
        <div
            className='h-[100dvh] flex items-center justify-center px-6 text-center'
            style={{ background: 'linear-gradient(180deg, #f5ead2 0%, #ebd9b3 100%)' }}
        >
            <div className='flex flex-col items-center gap-3'>
                <div
                    className='w-12 h-12 rounded-full animate-spin'
                    style={{
                        border: '3px solid rgba(170,136,64,0.20)',
                        borderTopColor: '#aa8840',
                    }}
                />
                <p
                    className='text-[13px] font-semibold'
                    style={{ color: '#7a6a52', letterSpacing: '0.04em' }}
                >
                    טוען את הספר...
                </p>
            </div>
        </div>
    )
}
