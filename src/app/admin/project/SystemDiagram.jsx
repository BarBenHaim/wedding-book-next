'use client'

// System Diagram — inline SVG rather than a library.
//
// Mermaid would have been fewer lines, but this page has to render in a
// classroom on whatever network is in the room, and a CDN that does not
// load turns the diagram into an error message at the worst moment. SVG
// in the bundle always draws.

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

const BOX = { rx: 10, strokeWidth: 1.5 }

function Node({ x, y, w, h, title, sub, fill, stroke, ink = '#2b2317' }) {
    return (
        <g>
            <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} {...BOX} />
            <text x={x + w / 2} y={y + (sub ? h / 2 - 5 : h / 2 + 5)} textAnchor='middle'
                fontSize='13.5' fontWeight='700' fill={ink}>{title}</text>
            {sub && (
                <text x={x + w / 2} y={y + h / 2 + 13} textAnchor='middle'
                    fontSize='10.5' fill={ink} opacity='0.65'>{sub}</text>
            )}
        </g>
    )
}

function Arrow({ x1, y1, x2, y2, label, dashed, color = '#8a6d40' }) {
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    return (
        <g>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth='1.6'
                markerEnd='url(#arrowhead)' strokeDasharray={dashed ? '5 4' : undefined} />
            {label && (
                <>
                    <rect x={mx - label.length * 3.1 - 4} y={my - 9} width={label.length * 6.2 + 8}
                        height='16' rx='4' fill='#fdfaf3' opacity='0.95' />
                    <text x={mx} y={my + 3} textAnchor='middle' fontSize='10' fill='#6b5836'
                        direction={dirFor(label)}>{label}</text>
                </>
            )}
        </g>
    )
}

export default function SystemDiagram() {
    return (
        <svg viewBox='0 0 900 560' width='100%' style={{ maxWidth: 900, direction: 'ltr' /* the coordinates are LTR; the page around them is
                not, and an inherited RTL base direction sends every
                anchor-start label off the left edge of the canvas */, display: 'block', margin: '0 auto' }}>
            <defs>
                <marker id='arrowhead' markerWidth='9' markerHeight='7' refX='8.5' refY='3.5' orient='auto'>
                    <polygon points='0 0, 9 3.5, 0 7' fill='#8a6d40' />
                </marker>
            </defs>

            {/* ── Clients ── */}
            <text x='20' y='26' fontSize='11' fontWeight='700' fill='#a89378' letterSpacing='1.5'>CLIENTS</text>
            <Node x={20} y={38} w={180} h={62} title='דפדפן האורח' sub='סורק QR · כותב ברכה'
                fill='#f6efe0' stroke='#e0cfa8' />
            <Node x={220} y={38} w={180} h={62} title='דפדפן בעל האירוע' sub='סטודיו · ניהול הספר'
                fill='#f6efe0' stroke='#e0cfa8' />
            <Node x={420} y={38} w={170} h={62} title='אפליקציית מובייל' sub='React Native / Expo'
                fill='#f6efe0' stroke='#e0cfa8' />
            <Node x={610} y={38} w={170} h={62} title='סופר-אדמין' sub='Next.js · ניהול כולל'
                fill='#f6efe0' stroke='#e0cfa8' />

            {/* ── App tier ── */}
            <text x='20' y='154' fontSize='11' fontWeight='700' fill='#a89378' letterSpacing='1.5'>APPLICATION</text>
            <rect x={20} y={172} width={560} height={116} rx={12} fill='#fbf6ea' stroke='#d8c49a' strokeWidth='1.5' />
            <text x={40} y={196} fontSize='13.5' fontWeight='800' fill='#2b2317'>Next.js 15 · App Router</text>
            <text x={40} y={213} fontSize='10.5' fill='#6b5836'>Vercel · React 18 · Tailwind v4</text>
            <Node x={40} y={226} w={160} h={46} title='Pages / SSR' sub='37 מסכים'
                fill='#fff' stroke='#e0cfa8' />
            <Node x={212} y={226} w={160} h={46} title='API Routes' sub='59 נקודות קצה'
                fill='#fff' stroke='#e0cfa8' />
            <Node x={384} y={226} w={176} h={46} title='מנוע הספר' sub='פריסה · PDF · הדפסה'
                fill='#fff' stroke='#e0cfa8' />

            {/* ── Python service — the one this course is about ── */}
            <rect x={610} y={172} width={270} height={116} rx={12} fill='#eef5ec' stroke='#8fae86' strokeWidth='2' />
            <text x={630} y={196} fontSize='13.5' fontWeight='800' fill='#24421d'>שירות עוזר הברכות</text>
            <text x={630} y={213} fontSize='10.5' fill='#3d6133'>Python · Flask · stateless</text>
            <Node x={630} y={226} w={110} h={46} title='prompts.py' sub='בניית פרומפט'
                fill='#fff' stroke='#a9c4a1' ink='#24421d' />
            <Node x={750} y={226} w={110} h={46} title='gemini.py' sub='קריאת API'
                fill='#fff' stroke='#a9c4a1' ink='#24421d' />

            {/* ── External ── */}
            <text x='20' y='346' fontSize='11' fontWeight='700' fill='#a89378' letterSpacing='1.5'>EXTERNAL SERVICES</text>
            <Node x={20} y={366} w={165} h={70} title='Firestore' sub='אירועים · ברכות · לידים'
                fill='#fdf3e3' stroke='#e8c98a' />
            <Node x={200} y={366} w={165} h={70} title='Firebase Storage' sub='תמונות האורחים'
                fill='#fdf3e3' stroke='#e8c98a' />
            <Node x={380} y={366} w={165} h={70} title='Firebase Auth' sub='התחברות בעלי אירוע'
                fill='#fdf3e3' stroke='#e8c98a' />
            <Node x={610} y={366} w={270} h={70} title='Google Gemini API' sub='gemini-2.0-flash'
                fill='#e6efe4' stroke='#8fae86' ink='#24421d' />

            <Node x={20} y={470} w={165} h={56} title='Lulu Print API' sub='הדפסת הספר'
                fill='#f4eee3' stroke='#ddcdb0' />
            <Node x={200} y={470} w={165} h={56} title='WhatsApp / Email' sub='סוכן מכירות · התראות'
                fill='#f4eee3' stroke='#ddcdb0' />
            <Node x={380} y={470} w={165} h={56} title='Expo Push' sub='התראה על ברכה חדשה'
                fill='#f4eee3' stroke='#ddcdb0' />

            {/* ── Edges ── */}
            <Arrow x1={110} y1={100} x2={110} y2={172} label='HTTPS' />
            <Arrow x1={310} y1={100} x2={250} y2={172} />
            <Arrow x1={505} y1={100} x2={400} y2={172} label='REST' />
            <Arrow x1={695} y1={100} x2={520} y2={172} />

            <Arrow x1={580} y1={230} x2={610} y2={230} label='POST /assist' />
            <Arrow x1={745} y1={288} x2={745} y2={366} label='HTTPS + prompt' color='#5d8052' />

            <Arrow x1={140} y1={288} x2={110} y2={366} label='Admin SDK' />
            <Arrow x1={280} y1={288} x2={282} y2={366} />
            <Arrow x1={420} y1={288} x2={462} y2={366} />
            <Arrow x1={90} y1={436} x2={90} y2={470} dashed />
            <Arrow x1={282} y1={436} x2={282} y2={470} dashed />
            <Arrow x1={462} y1={436} x2={462} y2={470} dashed />
        </svg>
    )
}
