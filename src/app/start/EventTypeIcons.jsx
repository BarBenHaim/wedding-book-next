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

// PNG-icon URLs — the actual mobile Page1 medallion art copied into
// public/start-assets. Used as the tile face so the web reads 1:1 with
// the mobile create screen. SVGs above stay as fallbacks / alt uses.
export const EVENT_PNG_ICON = {
    wedding: '/start-assets/wed_icon.png',
    bar_mitzvah: '/start-assets/Bar_Mitzva_Icon.png',
    bat_mitzvah: '/start-assets/Bat_Mitzva_Icon.png',
    birthday: '/start-assets/Birthday_Icon.png',
}

// WT monogram — gold-gradient serif letters in a gold ring. Used in the
// top bar. Reliable at 40–60px.
export function WTMonogram({ size = 46 }) {
    const u = useId().replace(/:/g, '')
    const g = `g${u}`
    return (
        <svg width={size} height={size} viewBox='0 0 64 64' fill='none' aria-hidden='true'>
            <defs><GoldGrad id={g} /></defs>
            <circle cx='32' cy='32' r='30' stroke={`url(#${g})`} strokeWidth='1.6' fill='rgba(184,137,61,0.06)' />
            <text x='32.8' y='43.5' fontSize='27' fill='rgba(0,0,0,0.13)' textAnchor='middle' fontFamily='serif' fontWeight='700'>WT</text>
            <text x='32' y='42.5' fontSize='27' fill={`url(#${g})`} textAnchor='middle' fontFamily='serif' fontWeight='700'>WT</text>
        </svg>
    )
}

// The chosen event icon on a marbled pedestal with floral flourishes —
// mobile's EventPedestal, verbatim in dimensions.
export function EventPedestal({ icon: Icon, size = 96 }) {
    const u = useId().replace(/:/g, '')
    const m = `m${u}`
    const GOLD = '#b8893d'
    return (
        <svg width={size} height={size} viewBox='0 0 120 120' fill='none' aria-hidden='true'>
            <defs>
                <linearGradient id={m} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#f1e6cd' />
                    <stop offset='1' stopColor='#dcc79a' />
                </linearGradient>
            </defs>
            <g stroke={GOLD} strokeWidth='2' strokeLinecap='round' fill='none' opacity={0.45}>
                <path d='M28 62c9-5 16-4 23 2' />
                <path d='M92 62c-9-5-16-4-23 2' />
            </g>
            <g fill={GOLD} opacity={0.45}>
                <circle cx='28' cy='62' r='3' /><circle cx='92' cy='62' r='3' />
                <circle cx='36' cy='58' r='2' /><circle cx='84' cy='58' r='2' />
            </g>
            <path d='M42 92h36l-4 12H46z' fill={`url(#${m})`} />
            <rect x='38' y='86' width='44' height='7' rx='3.5' fill={`url(#${m})`} />
            <rect x='34' y='104' width='52' height='6' rx='3' fill={`url(#${m})`} />
            <line x1='38' y1='89.5' x2='82' y2='89.5' stroke='#fff' strokeWidth='1' opacity={0.5} />
            {/* the event icon sits centred on the pedestal top */}
            {Icon ? (
                <g transform='translate(36 30)'>
                    <foreignObject width='48' height='48'>
                        <Icon size={48} />
                    </foreignObject>
                </g>
            ) : null}
        </svg>
    )
}

// Open-book illustration behind the covers fan — photo on the left page,
// text lines + heart on the right. Ported verbatim from mobile.
export function OpenBook({ width = 240 }) {
    const u = useId().replace(/:/g, '')
    const p = `p${u}`
    const h = width * 0.62
    const GOLD = '#b8893d'
    return (
        <svg width={width} height={h} viewBox='0 0 240 150' fill='none' aria-hidden='true'>
            <defs>
                <linearGradient id={p} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#fffef9' />
                    <stop offset='1' stopColor='#f6ecd6' />
                </linearGradient>
            </defs>
            <path d='M120 26C96 16 66 14 30 20v104c34-6 66-4 90 6 24-10 56-12 90-6V20c-36-6-66-4-90 6z'
                fill={`url(#${p})`} stroke={GOLD} strokeWidth='1.5' />
            <line x1='120' y1='26' x2='120' y2='130' stroke={GOLD} strokeWidth='1.5' opacity={0.5} />
            <g stroke={GOLD} strokeWidth='1' fill='none' opacity={0.45}>
                <path d='M40 30c-4 0-6 2-6 6' /><path d='M200 30c4 0 6 2 6 6' />
            </g>
            <rect x='48' y='40' width='56' height='44' rx='5' fill={GOLD} opacity={0.15} />
            <rect x='48' y='40' width='56' height='44' rx='5' stroke={GOLD} strokeWidth='1.3' fill='none' />
            <circle cx='64' cy='56' r='5' fill={GOLD} opacity={0.55} />
            <path d='M52 82l14-14 10 9 8-6 14 11' stroke={GOLD} strokeWidth='1.3' fill='none' opacity={0.6} />
            <g stroke={GOLD} strokeWidth='1.4' strokeLinecap='round' opacity={0.5}>
                <line x1='138' y1='48' x2='196' y2='48' /><line x1='138' y1='58' x2='202' y2='58' /><line x1='138' y1='68' x2='190' y2='68' />
            </g>
            <path d='M170 96c-2.6-4.4-7-5.4-9.8-2.8-2.8 2.6-2.2 6.6 0 8.8 1.6 1.6 6 4.8 9.8 7.2 3.8-2.4 8.2-5.6 9.8-7.2 2.2-2.2 2.8-6.2 0-8.8-2.8-2.6-7.2-1.6-9.8 2.8z'
                fill={GOLD} opacity={0.7} />
        </svg>
    )
}
