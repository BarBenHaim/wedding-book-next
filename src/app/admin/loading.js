// Admin loading — covers /admin and any unspecified /admin/* segment
// that doesn't have its own loading.js. Matches the ivory premium
// wash the admin dashboard uses so the transition doesn't flash
// white before the cards render.

export default function AdminLoading() {
    return (
        <div
            className='min-h-[100svh] flex items-center justify-center'
            style={{
                backgroundColor: '#f8f4ec',
                backgroundImage: [
                    'radial-gradient(ellipse 1100px 560px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 600px 600px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                ].join(', '),
            }}
        >
            <div
                className='w-11 h-11 rounded-full animate-spin'
                style={{
                    border: '3px solid rgba(170,136,64,0.18)',
                    borderTopColor: '#aa8840',
                }}
            />
        </div>
    )
}
