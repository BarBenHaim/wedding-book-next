// Event-type medallion icons for the /start wizard — 1:1 SVG ports of
// the mobile app's EventIcons.tsx (wedding-tales-mobile/src/components).
// Each icon uses a per-instance gradient id so multiple copies in the
// same page never collide. The gold gradient is fixed
// (#d9b06a → #b8893d → #8f6a2a) — a printed-metallic feel that reads
// as premium at 44–72px on cream stationery.
import { useId } from 'react'

function GoldGrad({ id }) {
    return (
        <linearGradient id={id} x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stopColor='#d9b06a' />
            <stop offset='0.5' stopColor='#b8893d' />
            <stop offset='1' stopColor='#8f6a2a' />
        </linearGradient>
    )
}

// 🎂 Birthday — three-tier cake with a lit candle and icing bands.
export function CakeIcon({ size = 30 }) {
    const u = useId().replace(/:/g, '')
    const g = `g${u}`, fl = `f${u}`
    return (
        <svg width={size} height={size} viewBox='0 0 48 48' fill='none' aria-hidden='true'>
            <defs>
                <GoldGrad id={g} />
                <radialGradient id={fl} cx='0.5' cy='0.35' r='0.7'>
                    <stop offset='0' stopColor='#ffe9a8' />
                    <stop offset='1' stopColor='#e79a2e' />
                </radialGradient>
            </defs>
            <path d='M24 5c2 2.4 2.6 4.2 0 6.4-2.6-2.2-2-4 0-6.4z' fill={`url(#${fl})`} />
            <rect x='23' y='11' width='2' height='5' rx='1' fill={`url(#${g})`} />
            <rect x='19' y='16.5' width='10' height='6' rx='2' fill={`url(#${g})`} />
            <rect x='14.5' y='22.5' width='19' height='7' rx='2.5' fill={`url(#${g})`} />
            <rect x='10' y='29.5' width='28' height='9' rx='3' fill={`url(#${g})`} />
            <g stroke='#fdfaf2' strokeWidth='1.4' strokeLinecap='round' fill='none' opacity={0.85}>
                <path d='M15 22.5c1.7 1.6 3.2 1.6 4.9 0s3.2-1.6 4.9 0 3.2 1.6 4.9 0' />
                <path d='M10.5 29.5c2.2 1.9 4 1.9 6.2 0s4-1.9 6.2 0 4-1.9 6.2 0 4-1.9 6.2 0' />
            </g>
        </svg>
    )
}

// 🌸 Bat Mitzvah — layered lotus petals with a light-catching diamond.
export function LotusIcon({ size = 30 }) {
    const u = useId().replace(/:/g, '')
    const g = `g${u}`, d = `d${u}`
    const petal = 'M24 25c-3.2-5-3.2-11.5 0-16.5 3.2 5 3.2 11.5 0 16.5z'
    return (
        <svg width={size} height={size} viewBox='0 0 48 48' fill='none' aria-hidden='true'>
            <defs>
                <GoldGrad id={g} />
                <radialGradient id={d} cx='0.5' cy='0.35' r='0.7'>
                    <stop offset='0' stopColor='#fff4d6' />
                    <stop offset='1' stopColor='#c79a44' />
                </radialGradient>
            </defs>
            {[0, 51, 102, 153, 204, 255, 306].map((a, i) => (
                <path
                    key={a}
                    d={petal}
                    fill={`url(#${g})`}
                    opacity={i % 2 === 0 ? 0.95 : 0.62}
                    transform={`rotate(${a} 24 24)`}
                />
            ))}
            <path d='M24 19.5l3.6 4.5-3.6 4.5-3.6-4.5z' fill={`url(#${d})`} stroke='#fff4d6' strokeWidth='0.6' />
        </svg>
    )
}

// 📜 Bar Mitzvah — gold rollers, parchment, and a Star of David.
export function TorahIcon({ size = 30 }) {
    const u = useId().replace(/:/g, '')
    const g = `g${u}`
    return (
        <svg width={size} height={size} viewBox='0 0 48 48' fill='none' aria-hidden='true'>
            <defs><GoldGrad id={g} /></defs>
            <rect x='16' y='12' width='16' height='24' rx='1' fill='#b8893d' opacity={0.12} />
            <g stroke={`url(#${g})`} strokeWidth='1.5' fill='none' opacity={0.9}>
                <polygon points='24,17 27.5,23 20.5,23' />
                <polygon points='24,29 27.5,23 20.5,23' />
            </g>
            <rect x='10.5' y='9' width='5' height='30' rx='2.5' fill={`url(#${g})`} />
            <rect x='32.5' y='9' width='5' height='30' rx='2.5' fill={`url(#${g})`} />
            <g fill={`url(#${g})`}>
                <circle cx='13' cy='9' r='2.6' /><circle cx='13' cy='39' r='2.6' />
                <circle cx='35' cy='9' r='2.6' /><circle cx='35' cy='39' r='2.6' />
            </g>
        </svg>
    )
}

// 💍 Wedding — two interlocked rings with a faceted solitaire.
export function RingsIcon({ size = 30 }) {
    const u = useId().replace(/:/g, '')
    const g = `g${u}`, d = `d${u}`
    return (
        <svg width={size} height={size} viewBox='0 0 48 48' fill='none' aria-hidden='true'>
            <defs>
                <GoldGrad id={g} />
                <radialGradient id={d} cx='0.5' cy='0.3' r='0.8'>
                    <stop offset='0' stopColor='#ffffff' />
                    <stop offset='1' stopColor='#cdb7e6' />
                </radialGradient>
            </defs>
            <circle cx='19' cy='29' r='9' stroke={`url(#${g})`} strokeWidth='2.8' fill='none' />
            <circle cx='30' cy='29' r='9' stroke={`url(#${g})`} strokeWidth='2.8' fill='none' opacity={0.9} />
            <polygon points='30,10 33,13.4 30,18 27,13.4' fill={`url(#${d})`} stroke={`url(#${g})`} strokeWidth='0.7' />
            <line x1='27' y1='13.4' x2='33' y2='13.4' stroke='#fff' strokeWidth='0.5' opacity={0.8} />
        </svg>
    )
}

export const EVENT_ICON = {
    birthday: CakeIcon,
    bat_mitzvah: LotusIcon,
    bar_mitzvah: TorahIcon,
    wedding: RingsIcon,
}
