// The stickers of one page, drawn over it. Positions are percentages of the
// page, so the layer needs no size of its own: it fills the page and the
// stickers follow. Plain <img> elements on purpose: the print and PDF export
// renders the page with html2canvas, which draws them exactly as shown here.
import { stickerById, stickerStyle, stickerShownOn } from '@/lib/stickers'

export default function StickerLayer({ stickers, split }) {
    if (!Array.isArray(stickers) || !stickers.length) return null
    return (
        <div aria-hidden='true' style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 30 }}>
            {stickers.map((st, i) => {
                const def = stickerById(st.k)
                if (!def || !stickerShownOn(st, split)) return null
                return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${st.k}-${i}`} src={def.url} alt='' draggable={false} crossOrigin='anonymous' style={stickerStyle(st)} />
                )
            })}
        </div>
    )
}
