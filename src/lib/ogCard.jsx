import { ImageResponse } from 'next/og'
import { buildShareCopy } from '@/lib/shareCopy'

// Renders the 1200x630 branded share card for a wedding/event. Hebrew
// glyphs need a real font passed to satori, so we fetch the bundled
// NotoSansHebrew from /public at request time (works on Vercel — it's a
// publicly served static asset). If the fetch fails we still return an
// image (Latin fallback) rather than throwing.
export async function eventOgImage(data, origin) {
    const { prefix, names, imageLine } = buildShareCopy(data)
    let fonts
    try {
        if (origin) {
            const res = await fetch(`${origin}/fonts/NotoSansHebrew-Regular.ttf`)
            if (res.ok) {
                const buf = await res.arrayBuffer()
                fonts = [{ name: 'NotoHe', data: buf, style: 'normal', weight: 400 }]
            }
        }
    } catch {
        fonts = undefined
    }

    const display = names || 'ספר הברכות'
    const bigSize = display.length > 16 ? 58 : 82

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg,#2b2117 0%,#3d2e1a 55%,#241b12 100%)',
                    fontFamily: 'NotoHe',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        top: 28,
                        left: 28,
                        right: 28,
                        bottom: 28,
                        border: '2px solid rgba(201,164,78,0.55)',
                        borderRadius: 24,
                        display: 'flex',
                    }}
                />
                <div style={{ display: 'flex', color: '#d8b876', fontSize: 32, letterSpacing: 6, marginBottom: 20, direction: 'rtl' }}>
                    {prefix}
                </div>
                <div
                    style={{
                        display: 'flex',
                        color: '#fdf6e3',
                        fontSize: bigSize,
                        textAlign: 'center',
                        maxWidth: 1000,
                        direction: 'rtl',
                        lineHeight: 1.12,
                        padding: '0 40px',
                    }}
                >
                    {display}
                </div>
                <div style={{ display: 'flex', width: 130, height: 3, background: '#c9a44e', margin: '34px 0' }} />
                <div style={{ display: 'flex', color: '#d8ccb2', fontSize: 30, textAlign: 'center', maxWidth: 920, direction: 'rtl', padding: '0 40px' }}>
                    {imageLine}
                </div>
                <div style={{ display: 'flex', position: 'absolute', bottom: 46, color: '#c9a44e', fontSize: 24, letterSpacing: 8 }}>
                    WEDDING TALES
                </div>
            </div>
        ),
        { width: 1200, height: 630, ...(fonts ? { fonts } : {}) }
    )
}
