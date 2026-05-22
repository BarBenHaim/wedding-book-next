// Studio loading — matches the studio's ivory premium wash so the
// transition to /admin/studio doesn't flash white before the
// three-column editor mounts. Same palette as the admin loading
// but kept as its own file so the studio can diverge visually if
// needed (e.g. show a "loading studio…" line, distinct from the
// admin list loader).

export default function StudioLoading() {
    return (
        <div
            className='min-h-[100svh] flex items-center justify-center'
            style={{
                backgroundColor: '#f8f4ec',
                backgroundImage:
                    'radial-gradient(ellipse 1100px 560px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
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
