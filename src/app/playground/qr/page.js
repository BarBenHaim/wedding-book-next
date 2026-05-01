'use client'

// /playground/qr
//
// QR-code playground with a CUSTOM SVG renderer. We don't use
// qr-code-styling here — that library exposes only preset dot/corner
// types, not continuous control. Instead we use the raw `qrcode`
// library to compute the matrix and render every cell as our own
// <rect> in SVG, which lets us slide roundness from 0% (sharp square)
// to 100% (full circle) in one degree increments.
//
// Capabilities:
//   • Dot roundness slider (0–100%) — applied to ALL non-finder cells.
//   • Dot scale (70–100%) — controls the gap between dots.
//   • Dot color: solid OR linear gradient with adjustable angle.
//   • Background: solid color or transparent + corner roundness.
//   • Finder patterns (the 3 large corner squares) controlled
//     INDEPENDENTLY: outer ring roundness, inner pip roundness,
//     and a separate finder color.
//   • Center image: upload + default Wedding Tales logo. Adjustable
//     size (10–55%), margin around it, and optional rounded mask.
//     "Hide dots behind image" toggle keeps the QR readable.
//   • Quiet zone (margin) slider.
//   • Error correction level L/M/Q/H — bump to H if the logo is large.
//   • Optional decorative frame around the QR (color, thickness,
//     corner radius).
//   • Export: PNG (rasterized via canvas) and SVG (vector, scales
//     perfectly for print).

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'

const DEFAULT_DATA = 'https://app.weddingtales.co.il/w/abc123'
const DEFAULT_LOGO = '/logo-wt.png'

// Finder patterns are at fixed positions inside any QR matrix:
// top-left (0,0), top-right (0, N-7), bottom-left (N-7, 0). Each spans
// 7×7 cells. We use this to skip dot rendering inside their boxes and
// draw them with their own controls instead.
function isInFinder(r, c, N) {
    if (r < 7 && c < 7) return true
    if (r < 7 && c >= N - 7) return true
    if (r >= N - 7 && c < 7) return true
    return false
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function QrPlayground() {
    // Source data + qr math
    const [data, setData] = useState(DEFAULT_DATA)
    const [errorCorrectionLevel, setEcl] = useState('Q')
    const [size, setSize] = useState(480)
    const [quietZone, setQuietZone] = useState(2) // in cells

    // Dot styling
    const [dotRoundness, setDotRoundness] = useState(45) // 0..100
    const [dotScale, setDotScale] = useState(0.96) // 0.7..1
    const [dotColor, setDotColor] = useState('#aa8840')
    const [useGradient, setUseGradient] = useState(false)
    const [gradColor1, setGradColor1] = useState('#aa8840')
    const [gradColor2, setGradColor2] = useState('#c9a44e')
    const [gradAngle, setGradAngle] = useState(45)

    // Background
    const [bgColor, setBgColor] = useState('#ffffff')
    const [transparent, setTransparent] = useState(false)
    const [bgRoundness, setBgRoundness] = useState(0) // 0..50, % of size

    // Finder patterns
    const [finderOuterRound, setFinderOuterRound] = useState(35)
    const [finderInnerRound, setFinderInnerRound] = useState(50)
    const [finderColor, setFinderColor] = useState('#aa8840')
    const [finderUseDot, setFinderUseDot] = useState(true) // false = solid 3x3 square

    // Image
    const [showImage, setShowImage] = useState(true)
    const [imageSrc, setImageSrc] = useState(DEFAULT_LOGO)
    const [imageSizePct, setImageSizePct] = useState(28) // 10..55 percent of QR
    const [imageMargin, setImageMargin] = useState(8) // px of white "halo" around image
    const [imageRoundness, setImageRoundness] = useState(20) // 0..50 corner radius %
    const [hideDotsBehind, setHideDotsBehind] = useState(true)

    // Frame
    const [frameOn, setFrameOn] = useState(false)
    const [frameColor, setFrameColor] = useState('#aa8840')
    const [frameThickness, setFrameThickness] = useState(4)
    const [frameRound, setFrameRound] = useState(20)
    const [framePadding, setFramePadding] = useState(16)

    // ── Compute QR matrix when data/ecl changes ────────────────────────
    const matrix = useMemo(() => {
        try {
            const code = QRCode.create(data || ' ', { errorCorrectionLevel })
            const N = code.modules.size
            const grid = []
            for (let r = 0; r < N; r++) {
                const row = []
                for (let c = 0; c < N; c++) row.push(code.modules.get(r, c))
                grid.push(row)
            }
            return { N, grid }
        } catch {
            return { N: 21, grid: [] }
        }
    }, [data, errorCorrectionLevel])

    const N = matrix.N
    const totalCells = N + quietZone * 2 // viewBox in "cell units"

    // ── File upload ────────────────────────────────────────────────────
    function handleImageUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onloadend = () => setImageSrc(reader.result)
        reader.readAsDataURL(file)
    }
    function resetImage() {
        setImageSrc(DEFAULT_LOGO)
    }

    // ── Download helpers ───────────────────────────────────────────────
    const svgRef = useRef(null)

    function downloadSVG() {
        if (!svgRef.current) return
        // Clone and inline xmlns for portability
        const clone = svgRef.current.cloneNode(true)
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const str = new XMLSerializer().serializeToString(clone)
        const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'wedding-qr.svg'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
    }

    function downloadPNG(scale = 2) {
        if (!svgRef.current) return
        const clone = svgRef.current.cloneNode(true)
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const str = new XMLSerializer().serializeToString(clone)
        const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = size * scale
            canvas.height = size * scale
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            canvas.toBlob(b => {
                const u = URL.createObjectURL(b)
                const a = document.createElement('a')
                a.href = u
                a.download = 'wedding-qr.png'
                a.click()
                setTimeout(() => {
                    URL.revokeObjectURL(u)
                    URL.revokeObjectURL(url)
                }, 0)
            })
        }
        img.src = url
    }

    // ── Compute the area covered by the center image (in cell units)
    //    so we can hide dots behind it when the toggle is on. Note: this
    //    is a SQUARE area, even when imageRoundness is high. Good enough
    //    for QR-readability purposes — the image's rounded corners just
    //    show a tiny strip of dots, which scanners tolerate. ─────────
    const imageHideRect = useMemo(() => {
        if (!showImage || !hideDotsBehind) return null
        const px = (size - quietZone * 2 * (size / totalCells)) // QR area in px
        const cellSize = size / totalCells
        const sidePx = (imageSizePct / 100) * px + imageMargin * 2
        const sideCells = sidePx / cellSize
        const start = (totalCells - sideCells) / 2
        return { start, side: sideCells }
    }, [showImage, hideDotsBehind, imageSizePct, imageMargin, totalCells, size])

    function isHiddenBehindImage(r, c) {
        if (!imageHideRect) return false
        const cellR = r + quietZone
        const cellC = c + quietZone
        return (
            cellR >= imageHideRect.start &&
            cellR < imageHideRect.start + imageHideRect.side &&
            cellC >= imageHideRect.start &&
            cellC < imageHideRect.start + imageHideRect.side
        )
    }

    // ── Render ──────────────────────────────────────────────────────────
    const dotFill = useGradient ? 'url(#dotGrad)' : dotColor
    // Convert dot scale + roundness to actual rect parameters
    const cellInset = (1 - dotScale) / 2
    const dotR = (dotRoundness / 100) * (dotScale / 2) // rx in cell units

    // Image placement (in viewBox cell units)
    const imgSidePx = (imageSizePct / 100) * size
    const imgSideCells = imgSidePx / (size / totalCells)
    const imgStartCells = (totalCells - imgSideCells) / 2
    const imgMarginCells = imageMargin / (size / totalCells)
    const imgRadiusCells = (imageRoundness / 100) * (imgSideCells / 2)

    return (
        <div
            dir='rtl'
            style={{
                background: '#f5f0e8',
                minHeight: '100vh',
                padding: '32px 16px',
                color: '#1a1410',
            }}
        >
            <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                <header style={{ marginBottom: 20 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>עורך QR מתקדם</h1>
                    <p style={{ color: '#7a6548', marginTop: 6, fontSize: 14 }}>
                        שליטה רציפה על עגוליות הנקודות, פינות, צבעים, gradient, תמונה במרכז ועוד. תצוגה חיה — הורדה כ-PNG או SVG.
                    </p>
                </header>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) 380px',
                        gap: 24,
                        alignItems: 'start',
                    }}
                >
                    {/* Preview */}
                    <section
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            border: '1px solid rgba(170,136,64,0.15)',
                            padding: 32,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 600,
                        }}
                    >
                        {/* Optional decorative frame around the QR */}
                        <div
                            style={{
                                background: transparent
                                    ? 'repeating-conic-gradient(#eee 0% 25%, #f8f8f8 0% 50%) 50% / 18px 18px'
                                    : 'transparent',
                                padding: frameOn ? framePadding : 0,
                                borderRadius: frameOn ? frameRound : 0,
                                border: frameOn ? frameThickness + 'px solid ' + frameColor : 'none',
                            }}
                        >
                            <svg
                                ref={svgRef}
                                viewBox={`0 0 ${totalCells} ${totalCells}`}
                                width={size}
                                height={size}
                                style={{ display: 'block' }}
                                xmlns='http://www.w3.org/2000/svg'
                            >
                                <defs>
                                    {useGradient && (
                                        <linearGradient
                                            id='dotGrad'
                                            gradientUnits='userSpaceOnUse'
                                            x1='0'
                                            y1='0'
                                            x2={Math.cos((gradAngle * Math.PI) / 180) * totalCells}
                                            y2={Math.sin((gradAngle * Math.PI) / 180) * totalCells}
                                        >
                                            <stop offset='0%' stopColor={gradColor1} />
                                            <stop offset='100%' stopColor={gradColor2} />
                                        </linearGradient>
                                    )}
                                </defs>

                                {/* Background */}
                                {!transparent && (
                                    <rect
                                        width={totalCells}
                                        height={totalCells}
                                        fill={bgColor}
                                        rx={(bgRoundness / 100) * (totalCells / 2)}
                                        ry={(bgRoundness / 100) * (totalCells / 2)}
                                    />
                                )}

                                {/* Dots (skip finder cells) */}
                                {matrix.grid.map((row, r) =>
                                    row.map((on, c) => {
                                        if (!on) return null
                                        if (isInFinder(r, c, N)) return null
                                        if (isHiddenBehindImage(r, c)) return null
                                        return (
                                            <rect
                                                key={r + ':' + c}
                                                x={c + quietZone + cellInset}
                                                y={r + quietZone + cellInset}
                                                width={dotScale}
                                                height={dotScale}
                                                rx={dotR}
                                                ry={dotR}
                                                fill={dotFill}
                                            />
                                        )
                                    })
                                )}

                                {/* Finder patterns — 3 corners */}
                                <Finder
                                    x={quietZone}
                                    y={quietZone}
                                    color={finderColor}
                                    outerRound={finderOuterRound}
                                    innerRound={finderInnerRound}
                                    innerIsDot={finderUseDot}
                                />
                                <Finder
                                    x={quietZone + N - 7}
                                    y={quietZone}
                                    color={finderColor}
                                    outerRound={finderOuterRound}
                                    innerRound={finderInnerRound}
                                    innerIsDot={finderUseDot}
                                />
                                <Finder
                                    x={quietZone}
                                    y={quietZone + N - 7}
                                    color={finderColor}
                                    outerRound={finderOuterRound}
                                    innerRound={finderInnerRound}
                                    innerIsDot={finderUseDot}
                                />

                                {/* Center image */}
                                {showImage && imageSrc && (
                                    <>
                                        {/* White halo padding so logo sits cleanly */}
                                        {imageMargin > 0 && (
                                            <rect
                                                x={imgStartCells - imgMarginCells}
                                                y={imgStartCells - imgMarginCells}
                                                width={imgSideCells + imgMarginCells * 2}
                                                height={imgSideCells + imgMarginCells * 2}
                                                rx={imgRadiusCells + imgMarginCells / 2}
                                                ry={imgRadiusCells + imgMarginCells / 2}
                                                fill={transparent ? 'transparent' : bgColor}
                                            />
                                        )}
                                        <image
                                            href={imageSrc}
                                            x={imgStartCells}
                                            y={imgStartCells}
                                            width={imgSideCells}
                                            height={imgSideCells}
                                            preserveAspectRatio='xMidYMid meet'
                                            clipPath={imgRadiusCells > 0 ? 'url(#imgClip)' : undefined}
                                        />
                                        {imgRadiusCells > 0 && (
                                            <defs>
                                                <clipPath id='imgClip'>
                                                    <rect
                                                        x={imgStartCells}
                                                        y={imgStartCells}
                                                        width={imgSideCells}
                                                        height={imgSideCells}
                                                        rx={imgRadiusCells}
                                                        ry={imgRadiusCells}
                                                    />
                                                </clipPath>
                                            </defs>
                                        )}
                                    </>
                                )}
                            </svg>
                        </div>

                        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                            <button onClick={() => downloadPNG(2)} style={btnPrimary}>
                                ⬇ הורדת PNG (×2)
                            </button>
                            <button onClick={() => downloadPNG(4)} style={btnSecondary}>
                                ⬇ PNG (×4 לדפוס)
                            </button>
                            <button onClick={downloadSVG} style={btnSecondary}>
                                ⬇ SVG
                            </button>
                        </div>
                        <p style={{ marginTop: 10, fontSize: 11, color: '#7a6548' }}>
                            SVG וקטורי — מומלץ להדפסה גדולה. PNG ×4 יוצא בגודל {size * 4}px (נקי גם על שלט גדול).
                        </p>
                    </section>

                    {/* Controls */}
                    <aside
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            border: '1px solid rgba(170,136,64,0.15)',
                            padding: 20,
                            maxHeight: 'calc(100vh - 80px)',
                            overflowY: 'auto',
                        }}
                    >
                        <Section title='נתונים'>
                            <Field label='קישור / טקסט' value={data} onChange={setData} ltr />
                            <Slider label='גודל תצוגה' min={240} max={900} value={size} onChange={setSize} suffix='px' />
                            <Slider label='שולי quiet-zone' min={0} max={6} value={quietZone} onChange={setQuietZone} suffix=' תאים' />
                            <Select
                                label='רמת תיקון שגיאות'
                                options={['L', 'M', 'Q', 'H']}
                                value={errorCorrectionLevel}
                                onChange={setEcl}
                                hint='Q ומעלה אם יש לוגו במרכז. H = הכי עמיד'
                            />
                        </Section>

                        <Section title='נקודות'>
                            <Slider
                                label='עגוליות נקודה'
                                min={0}
                                max={100}
                                value={dotRoundness}
                                onChange={setDotRoundness}
                                suffix='%'
                                hint='0 = ריבוע חד · 50 = פינות מעוגלות · 100 = עיגול מלא'
                            />
                            <Slider
                                label='גודל נקודה (מילוי תא)'
                                min={70}
                                max={100}
                                step={1}
                                value={Math.round(dotScale * 100)}
                                onChange={v => setDotScale(v / 100)}
                                suffix='%'
                                hint='פחות מ-100% = רווחים בין הנקודות'
                            />
                            <Toggle label='Gradient' checked={useGradient} onChange={setUseGradient} />
                            {useGradient ? (
                                <>
                                    <ColorField label='צבע 1' value={gradColor1} onChange={setGradColor1} />
                                    <ColorField label='צבע 2' value={gradColor2} onChange={setGradColor2} />
                                    <Slider label='זווית' min={0} max={360} value={gradAngle} onChange={setGradAngle} suffix='°' />
                                </>
                            ) : (
                                <ColorField label='צבע' value={dotColor} onChange={setDotColor} />
                            )}
                        </Section>

                        <Section title='פינות (finders)'>
                            <Slider
                                label='עגוליות מסגרת חיצונית'
                                min={0}
                                max={50}
                                value={finderOuterRound}
                                onChange={setFinderOuterRound}
                                suffix='%'
                            />
                            <Slider
                                label='עגוליות פיפ פנימי'
                                min={0}
                                max={50}
                                value={finderInnerRound}
                                onChange={setFinderInnerRound}
                                suffix='%'
                            />
                            <Toggle label='פיפ עגול במלואו (במקום ריבוע)' checked={finderUseDot} onChange={setFinderUseDot} />
                            <ColorField label='צבע פינות' value={finderColor} onChange={setFinderColor} />
                        </Section>

                        <Section title='רקע'>
                            <Toggle label='רקע שקוף' checked={transparent} onChange={setTransparent} />
                            <ColorField label='צבע רקע' value={bgColor} onChange={setBgColor} disabled={transparent} />
                            <Slider
                                label='עגוליות פינות רקע'
                                min={0}
                                max={50}
                                value={bgRoundness}
                                onChange={setBgRoundness}
                                suffix='%'
                            />
                        </Section>

                        <Section title='תמונה במרכז'>
                            <Toggle label='הצג תמונה' checked={showImage} onChange={setShowImage} />
                            {showImage && (
                                <>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <label style={{ ...btnSmall, cursor: 'pointer' }}>
                                            העלאה
                                            <input type='file' accept='image/*' onChange={handleImageUpload} style={{ display: 'none' }} />
                                        </label>
                                        <button onClick={resetImage} style={btnSmallGhost}>
                                            ↺ לוגו ברירת מחדל
                                        </button>
                                    </div>
                                    {imageSrc && (
                                        <div style={{ marginTop: 6 }}>
                                            <img
                                                src={imageSrc}
                                                alt='preview'
                                                style={{
                                                    width: 60,
                                                    height: 60,
                                                    objectFit: 'contain',
                                                    border: '1px solid rgba(170,136,64,0.2)',
                                                    borderRadius: 6,
                                                    background: '#faf8f5',
                                                    padding: 4,
                                                }}
                                            />
                                        </div>
                                    )}
                                    <Slider
                                        label='גודל תמונה'
                                        min={10}
                                        max={55}
                                        value={imageSizePct}
                                        onChange={setImageSizePct}
                                        suffix='%'
                                    />
                                    <Slider
                                        label='שולי תמונה (halo)'
                                        min={0}
                                        max={30}
                                        value={imageMargin}
                                        onChange={setImageMargin}
                                        suffix='px'
                                    />
                                    <Slider
                                        label='עגוליות תמונה'
                                        min={0}
                                        max={50}
                                        value={imageRoundness}
                                        onChange={setImageRoundness}
                                        suffix='%'
                                    />
                                    <Toggle
                                        label='הסתר נקודות מאחורי תמונה'
                                        checked={hideDotsBehind}
                                        onChange={setHideDotsBehind}
                                    />
                                </>
                            )}
                        </Section>

                        <Section title='מסגרת חיצונית'>
                            <Toggle label='הוסף מסגרת' checked={frameOn} onChange={setFrameOn} />
                            {frameOn && (
                                <>
                                    <ColorField label='צבע מסגרת' value={frameColor} onChange={setFrameColor} />
                                    <Slider label='עובי' min={1} max={20} value={frameThickness} onChange={setFrameThickness} suffix='px' />
                                    <Slider label='פינות מעוגלות' min={0} max={50} value={frameRound} onChange={setFrameRound} suffix='px' />
                                    <Slider label='ריווח פנימי' min={0} max={40} value={framePadding} onChange={setFramePadding} suffix='px' />
                                </>
                            )}
                        </Section>

                        <p style={{ fontSize: 11, color: '#7a6548', marginTop: 16, lineHeight: 1.5 }}>
                            כל שינוי משתקף בתצוגה בזמן אמת. אם הוספת לוגו גדול → העלה תיקון שגיאות ל-H. אם בחרת רקע שקוף → ה-PNG ישמור על השקיפות.
                        </p>
                    </aside>
                </div>
            </div>
        </div>
    )
}

// ─── Finder pattern (one corner) ─────────────────────────────────────────
function Finder({ x, y, color, outerRound, innerRound, innerIsDot }) {
    // 7×7 grid in cell units. Outer ring is the 7×7 outline; inner pip
    // is the central 3×3 block.
    const outerR = (outerRound / 100) * 3.5
    const innerR = innerIsDot ? 1.5 : (innerRound / 100) * 1.5
    return (
        <g transform={`translate(${x},${y})`}>
            {/* Outer ring as a stroke (thickness = 1 cell) */}
            <rect
                x={0.5}
                y={0.5}
                width={6}
                height={6}
                rx={outerR}
                ry={outerR}
                fill='none'
                stroke={color}
                strokeWidth={1}
            />
            {/* Inner pip 3×3 in cell coords (offset 2,2) */}
            <rect
                x={2}
                y={2}
                width={3}
                height={3}
                rx={innerR}
                ry={innerR}
                fill={color}
            />
        </g>
    )
}

// ─── Building blocks ─────────────────────────────────────────────────────

function Section({ title, children }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: '#aa8840', margin: '0 0 8px 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {title}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
        </div>
    )
}

function Field({ label, value, onChange, ltr }) {
    return (
        <label style={fieldWrap}>
            <span style={fieldLabel}>{label}</span>
            <input value={value} onChange={e => onChange(e.target.value)} dir={ltr ? 'ltr' : 'rtl'} style={inputStyle} />
        </label>
    )
}

function Slider({ label, min, max, step = 1, value, onChange, suffix = '', hint }) {
    return (
        <label style={fieldWrap}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={fieldLabel}>{label}</span>
                <span style={{ fontSize: 11, color: '#aa8840', fontWeight: 700 }}>
                    {value}
                    {suffix}
                </span>
            </div>
            <input
                type='range'
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#aa8840' }}
            />
            {hint && <span style={{ fontSize: 10, color: '#7a6548' }}>{hint}</span>}
        </label>
    )
}

function Select({ label, options, value, onChange, hint }) {
    return (
        <label style={fieldWrap}>
            <span style={fieldLabel}>{label}</span>
            <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
                {options.map(o => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
            {hint && <span style={{ fontSize: 10, color: '#7a6548' }}>{hint}</span>}
        </label>
    )
}

function ColorField({ label, value, onChange, disabled }) {
    return (
        <label style={{ ...fieldWrap, opacity: disabled ? 0.4 : 1 }}>
            <span style={fieldLabel}>{label}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type='color'
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    style={{
                        width: 40,
                        height: 32,
                        padding: 0,
                        border: '1px solid rgba(170,136,64,0.3)',
                        borderRadius: 6,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        background: '#fff',
                    }}
                />
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                    dir='ltr'
                />
            </div>
        </label>
    )
}

function Toggle({ label, checked, onChange }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <span>{label}</span>
            <button
                type='button'
                onClick={() => onChange(!checked)}
                style={{
                    position: 'relative',
                    width: 38,
                    height: 22,
                    background: checked ? '#aa8840' : '#d6d2c8',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        top: 2,
                        left: checked ? 18 : 2,
                        width: 18,
                        height: 18,
                        background: '#fff',
                        borderRadius: '50%',
                        transition: 'left 0.2s',
                    }}
                />
            </button>
        </label>
    )
}

// ─── Style tokens ────────────────────────────────────────────────────────

const fieldWrap = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel = { fontSize: 11, fontWeight: 700, color: '#7a6548', letterSpacing: '0.05em' }
const inputStyle = {
    background: '#faf8f5',
    color: '#1a1410',
    border: '1px solid rgba(170,136,64,0.25)',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
}
const btnPrimary = {
    background: 'linear-gradient(90deg,#aa8840 0%,#c9a44e 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '11px 22px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(170,136,64,0.30)',
}
const btnSecondary = {
    background: '#fff',
    color: '#aa8840',
    border: '1px solid rgba(170,136,64,0.4)',
    borderRadius: 12,
    padding: '11px 22px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
}
const btnSmall = {
    background: '#aa8840',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
}
const btnSmallGhost = {
    background: 'transparent',
    color: '#aa8840',
    border: '1px solid rgba(170,136,64,0.4)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
}
