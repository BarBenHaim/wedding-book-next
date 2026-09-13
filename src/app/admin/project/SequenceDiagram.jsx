'use client'

// Sequence Diagram — the blessing-assist flow, end to end.
//
// This is the flow the course asks to trace: a guest asks for help, the
// request reaches Python, a PROMPT is built, a model answers, and the
// answer comes back cleaned. The fallback arrow is drawn too, because a
// diagram that only shows the happy path describes a system nobody runs.

// The canvas is LTR because the coordinates are. A label that MIXES
// Hebrew and Latin still needs an RTL base direction or the bidi
// algorithm orders its runs backwards - "Flask לא זמין" comes out with
// the Latin word on the wrong side. Pure-Latin labels must stay LTR, so
// the direction follows the content.
// Only MIXED strings need it. A pure-Hebrew run already renders
// right-to-left inside an LTR canvas - what an RTL base would change is
// where the ANCHOR sits, which pushes an anchor-start label leftwards
// over the arrow it belongs to.
const isMixed = s => /[\u0590-\u05FF]/.test(String(s || '')) && /[A-Za-z]/.test(String(s || ''))
const dirFor = s => (isMixed(s) ? 'rtl' : 'ltr')

const LANES = [
    { id: 'guest', label: 'אורח', sub: 'דפדפן' },
    { id: 'next', label: 'Next.js', sub: 'API route' },
    { id: 'db', label: 'Firestore', sub: 'נתוני האירוע' },
    { id: 'flask', label: 'Flask', sub: 'Python' },
    { id: 'gemini', label: 'Gemini', sub: 'LLM' },
]

const X = { guest: 80, next: 270, db: 440, flask: 620, gemini: 810 }

const STEPS = [
    { from: 'guest', to: 'next', y: 128, label: 'POST /api/blessing-assist' },
    { from: 'next', to: 'db', y: 166, label: 'קריאת סוג האירוע והשמות' },
    { from: 'db', to: 'next', y: 200, label: 'wedding · "דנה ויוסי" · 210 תווים', dashed: true },
    { from: 'next', to: 'flask', y: 244, label: 'POST /assist  {mode, eventType, names…}' },
    { from: 'flask', to: 'flask', y: 284, label: 'build_system_prompt()', note: 'הפרומפט נבנה כאן', self: true },
    { from: 'flask', to: 'gemini', y: 330, label: 'generateContent  (system + user, temp 0.85)' },
    { from: 'gemini', to: 'flask', y: 368, label: 'טקסט גולמי', dashed: true },
    { from: 'flask', to: 'flask', y: 404, label: 'parse_list() · strip_wrap()', note: 'ניקוי הפלט', self: true },
    { from: 'flask', to: 'next', y: 448, label: '{ suggestions: [3] }', dashed: true },
    { from: 'next', to: 'guest', y: 486, label: 'שלוש הצעות לבחירה', dashed: true },
]

export default function SequenceDiagram() {
    const H = 580
    return (
        <svg viewBox='0 0 900 580' width='100%' style={{ maxWidth: 900, direction: 'ltr' /* the coordinates are LTR; the page around them is
                not, and an inherited RTL base direction sends every
                anchor-start label off the left edge of the canvas */, display: 'block', margin: '0 auto' }}>
            <defs>
                <marker id='seqArrow' markerWidth='9' markerHeight='7' refX='8.5' refY='3.5' orient='auto'>
                    <polygon points='0 0, 9 3.5, 0 7' fill='#8a6d40' />
                </marker>
            </defs>

            {LANES.map(l => (
                <g key={l.id}>
                    <rect x={X[l.id] - 62} y={20} width={124} height={46} rx={9}
                        fill={l.id === 'flask' ? '#eef5ec' : '#f6efe0'}
                        stroke={l.id === 'flask' ? '#8fae86' : '#e0cfa8'}
                        strokeWidth={l.id === 'flask' ? 2 : 1.5} />
                    <text x={X[l.id]} y={40} textAnchor='middle' fontSize='13' fontWeight='700'
                        fill={l.id === 'flask' ? '#24421d' : '#2b2317'}>{l.label}</text>
                    <text x={X[l.id]} y={55} textAnchor='middle' fontSize='10' opacity='0.65'
                        fill={l.id === 'flask' ? '#24421d' : '#2b2317'}>{l.sub}</text>
                    <line x1={X[l.id]} y1={66} x2={X[l.id]} y2={H - 40} stroke='#d8c49a'
                        strokeWidth='1.2' strokeDasharray='4 5' />
                </g>
            ))}

            {STEPS.map((s, i) => {
                if (s.self) {
                    const x = X[s.from]
                    return (
                        <g key={i}>
                            <path d={`M ${x} ${s.y - 12} h 42 v 24 h -42`} fill='none' stroke='#5d8052'
                                strokeWidth='1.6' markerEnd='url(#seqArrow)' />
                            <text x={x + 52} y={s.y} fontSize='10.5' fill='#3d6133' fontWeight='600'>{s.label}</text>
                            {s.note && (
                                <text x={x + 52} y={s.y + 13} fontSize='9.5' fill='#5d8052' opacity='0.85'
                                    direction={dirFor(s.note)}>{s.note}</text>
                            )}
                        </g>
                    )
                }
                const x1 = X[s.from]
                const x2 = X[s.to]
                const dir = x2 > x1 ? 1 : -1
                return (
                    <g key={i}>
                        <line x1={x1 + 3 * dir} y1={s.y} x2={x2 - 7 * dir} y2={s.y} stroke='#8a6d40'
                            strokeWidth='1.6' markerEnd='url(#seqArrow)'
                            strokeDasharray={s.dashed ? '5 4' : undefined} />
                        <text x={(x1 + x2) / 2} y={s.y - 7} textAnchor='middle' fontSize='10.5'
                            fill='#6b5836' direction={dirFor(s.label)}>{s.label}</text>
                    </g>
                )
            })}

            {/* The path that runs when Python is unreachable. */}
            <g>
                <rect x={200} y={516} width={430} height={30} rx={7} fill='#fdf3e3' stroke='#e8c98a' />
                <text x={415} y={535} textAnchor='middle' fontSize='10.5' fill='#6b5836'>
                    ↯ אם Flask לא זמין — Next.js נופל חזרה ל-Claude, והאורח לא רואה שגיאה
                </text>
            </g>
        </svg>
    )
}
