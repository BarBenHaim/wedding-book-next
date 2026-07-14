'use client'

// BookLoader — THE loading state of Wedding Tales, everywhere.
//
// A little gold-bound book floats over a warm ink stage, its pages
// turning one after another under a rotating champagne aurora, gold
// dust drifting up around it. Based on the "wow book loader" concept,
// re-tailored to the brand: champagne/gold/rose on deep ink instead
// of neon, a gilded cover (the same gradient the product's gold
// buttons wear), cream ruled pages with a tiny gold heart, and the
// gold bookmark ribbon from the printed book.
//
// Props:
//   label      — optional caption under the book (e.g. 'טוען את הספר שלכם')
//   fullScreen — true (default): fills the viewport with the ink stage.
//                false: transparent, sized to `size` — for embedding
//                inside an existing dark surface (portal iframe well…)
//   size       — book-scene width in px (default 300)
//
// Pure CSS animation (no JS), respects prefers-reduced-motion.

export default function BookLoader({ label = '', fullScreen = true, size = 300 }) {
    return (
        <div
            className={`bl ${fullScreen ? 'bl--full' : 'bl--bare'}`}
            role='status'
            aria-label={label || 'טוען'}
            style={{ '--size': `${size}px` }}
        >
            <div className='bl__scene' aria-hidden='true'>
                <div className='bl__aurora' />
                <div className='bl__pulse' />
                <span className='bl__particle bl__p1' />
                <span className='bl__particle bl__p2' />
                <span className='bl__particle bl__p3' />
                <span className='bl__particle bl__p4' />
                <span className='bl__particle bl__p5' />
                <div className='bl__book-wrap'>
                    <div className='bl__book'>
                        <div className='bl__cover' />
                        <div className='bl__page bl__page--left' />
                        <div className='bl__page bl__page--right' />
                        <div className='bl__sheet' />
                        <div className='bl__sheet' />
                        <div className='bl__sheet' />
                        <div className='bl__sheet' />
                        <div className='bl__sheet' />
                        <div className='bl__spine' />
                        <div className='bl__ribbon' />
                    </div>
                </div>
            </div>
            {label ? <p className='bl__label'>{label}</p> : null}

            <style jsx>{`
                .bl {
                    --speed: 3.3s;
                    --gold: #c9a44e;
                    --gold-soft: #e2c377;
                    --gold-deep: #a8843a;
                    --rose: #d8a4a4;
                    --cream: #f5ead2;
                    --paper: #fffdf8;
                    position: relative;
                    display: grid;
                    place-items: center;
                    gap: 18px;
                    isolation: isolate;
                    overflow: hidden;
                }
                .bl--full {
                    min-height: 100vh;
                    min-height: 100dvh;
                    width: 100%;
                    background:
                        radial-gradient(circle at 50% 38%, rgba(201, 164, 78, 0.14), transparent 30%),
                        radial-gradient(circle at 14% 16%, rgba(216, 164, 164, 0.1), transparent 32%),
                        radial-gradient(circle at 86% 84%, rgba(226, 195, 119, 0.08), transparent 34%),
                        linear-gradient(150deg, #171017 0%, #241a14 52%, #1a130c 100%);
                }
                /* slow-breathing warmth across the whole stage */
                .bl--full::before {
                    content: '';
                    position: absolute;
                    z-index: -3;
                    width: 72vmax;
                    aspect-ratio: 1;
                    border-radius: 42% 58% 65% 35% / 37% 40% 60% 63%;
                    background: conic-gradient(
                        from 0deg,
                        rgba(201, 164, 78, 0.14),
                        rgba(216, 164, 164, 0.08),
                        rgba(226, 195, 119, 0.12),
                        rgba(245, 234, 210, 0.05),
                        rgba(201, 164, 78, 0.14)
                    );
                    filter: blur(74px);
                    animation: bl-bg-turn 18s linear infinite;
                }
                /* gold-dust grain, fading out from the center */
                .bl--full::after {
                    content: '';
                    position: absolute;
                    z-index: -2;
                    inset: 0;
                    opacity: 0.14;
                    background-image: radial-gradient(rgba(245, 234, 210, 0.9) 0.7px, transparent 0.8px);
                    background-size: 23px 23px;
                    -webkit-mask-image: radial-gradient(circle at center, #000 4%, transparent 70%);
                    mask-image: radial-gradient(circle at center, #000 4%, transparent 70%);
                }
                .bl__scene {
                    position: relative;
                    width: min(var(--size), 84vw);
                    aspect-ratio: 1.12;
                    display: grid;
                    place-items: center;
                    perspective: 1100px;
                }
                /* rotating champagne aurora behind the book */
                .bl__aurora {
                    position: absolute;
                    width: 84%;
                    aspect-ratio: 1;
                    border-radius: 50%;
                    background: conic-gradient(
                        from 20deg,
                        transparent 0 9%,
                        var(--rose) 14%,
                        var(--gold) 32%,
                        transparent 42% 54%,
                        var(--gold-soft) 65%,
                        var(--cream) 78%,
                        transparent 88%
                    );
                    opacity: 0.55;
                    filter: blur(13px);
                    animation: bl-aurora-turn 5.6s linear infinite;
                }
                .bl__aurora::before {
                    content: '';
                    position: absolute;
                    inset: 19px;
                    border-radius: inherit;
                    background: #1d150e;
                    box-shadow: inset 0 0 36px rgba(201, 164, 78, 0.28);
                }
                /* bare mode sits on whatever surface hosts it — the aurora
                   becomes a pure ring (no dark disc), so it works on light
                   cards and dark wells alike */
                .bl--bare .bl__aurora::before {
                    background: transparent;
                    box-shadow: inset 0 0 30px rgba(201, 164, 78, 0.22);
                }
                .bl--bare .bl__aurora {
                    opacity: 0.4;
                }
                .bl__pulse {
                    position: absolute;
                    width: 72%;
                    height: 46%;
                    bottom: 18%;
                    border-radius: 50%;
                    background: linear-gradient(90deg, var(--rose), var(--gold), var(--gold-soft));
                    opacity: 0.26;
                    filter: blur(32px);
                    animation: bl-pulse 2.8s ease-in-out infinite;
                }
                .bl__book-wrap {
                    position: relative;
                    z-index: 4;
                    width: 92%;
                    height: 58%;
                    animation: bl-book-float 3s ease-in-out infinite;
                    transform-style: preserve-3d;
                }
                .bl__book {
                    position: absolute;
                    inset: 0;
                    transform: rotateX(11deg);
                    transform-style: preserve-3d;
                    filter: drop-shadow(0 22px 16px rgba(8, 5, 2, 0.5))
                        drop-shadow(0 0 16px rgba(201, 164, 78, 0.28));
                }
                /* gilded cover — the product's gold-button gradient */
                .bl__cover {
                    position: absolute;
                    inset: 0;
                    border-radius: 13px 13px 21px 21px;
                    overflow: hidden;
                    background: linear-gradient(
                        115deg,
                        #8a6320 0%,
                        var(--gold-deep) 14%,
                        var(--gold) 42%,
                        #eed9a4 55%,
                        var(--gold) 68%,
                        var(--gold-deep) 92%,
                        #7a5619 100%
                    );
                    box-shadow:
                        inset 0 0 0 1px rgba(255, 248, 226, 0.32),
                        inset 0 -7px 0 rgba(46, 30, 8, 0.35),
                        0 5px 0 #4a3512;
                }
                .bl__cover::before {
                    content: '';
                    position: absolute;
                    inset: 7px;
                    border: 1px solid rgba(255, 244, 214, 0.55);
                    border-radius: 8px 8px 16px 16px;
                }
                .bl__cover::after {
                    content: '';
                    position: absolute;
                    top: -80%;
                    bottom: -80%;
                    left: -35%;
                    width: 26%;
                    background: linear-gradient(90deg, transparent, rgba(255, 252, 240, 0.6), transparent);
                    transform: rotate(15deg);
                    animation: bl-cover-shine var(--speed) ease-in-out infinite;
                }
                .bl__page {
                    position: absolute;
                    top: 8px;
                    bottom: 10px;
                    width: calc(50% - 4px);
                    overflow: hidden;
                    background:
                        radial-gradient(circle at 50% 34%, rgba(201, 164, 78, 0.1) 0 18px, transparent 19px),
                        repeating-linear-gradient(to bottom, transparent 0 5px, rgba(154, 134, 101, 0.12) 6px, transparent 7px),
                        linear-gradient(135deg, #ffffff, #fdf7ea 72%, #f7efdd);
                    box-shadow:
                        inset 0 0 17px rgba(120, 96, 60, 0.1),
                        0 2px 0 #e9dfc9,
                        0 4px 0 #d4c6a8;
                }
                .bl__page--left {
                    left: 8px;
                    border-radius: 9px 2px 3px 13px;
                    transform: rotateY(2deg);
                    transform-origin: right center;
                }
                .bl__page--right {
                    right: 8px;
                    border-radius: 2px 9px 13px 3px;
                    transform: rotateY(-2deg);
                    transform-origin: left center;
                }
                /* a small gold heart resting on the open pages */
                .bl__page::before {
                    content: '♥';
                    position: absolute;
                    top: 25%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: var(--gold);
                    font-size: 15px;
                    text-shadow: 0 0 12px rgba(201, 164, 78, 0.45);
                }
                /* the turning sheets */
                .bl__sheet {
                    --delay: 0s;
                    position: absolute;
                    z-index: 8;
                    top: 8px;
                    bottom: 10px;
                    left: 50%;
                    width: calc(50% - 8px);
                    border: 1px solid rgba(154, 128, 84, 0.16);
                    border-radius: 2px 9px 13px 2px;
                    opacity: 0;
                    overflow: hidden;
                    transform-origin: left center;
                    transform-style: preserve-3d;
                    backface-visibility: visible;
                    background:
                        linear-gradient(90deg, rgba(120, 94, 52, 0.1), transparent 17%),
                        radial-gradient(circle at 74% 28%, rgba(216, 164, 164, 0.2) 0 2px, transparent 3px),
                        linear-gradient(135deg, #fff, #fdf7ea 68%, #f8f0de);
                    box-shadow:
                        inset 13px 0 17px rgba(110, 84, 42, 0.07),
                        2px 2px 5px rgba(10, 7, 3, 0.14);
                    animation: bl-page-turn var(--speed) cubic-bezier(0.58, 0.05, 0.2, 0.98) infinite;
                    animation-delay: var(--delay);
                }
                /* faint "written lines" on each sheet */
                .bl__sheet::before {
                    content: '';
                    position: absolute;
                    inset: 16px 16px auto;
                    height: 2px;
                    border-radius: 99px;
                    background: linear-gradient(90deg, var(--rose), var(--gold), var(--gold-soft));
                    opacity: 0.32;
                    box-shadow:
                        0 10px 0 rgba(140, 116, 78, 0.14),
                        0 20px 0 rgba(140, 116, 78, 0.11),
                        0 30px 0 rgba(140, 116, 78, 0.09),
                        0 40px 0 rgba(140, 116, 78, 0.07);
                }
                .bl__sheet::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    background: linear-gradient(100deg, transparent 25%, rgba(255, 255, 255, 0.95) 48%, transparent 72%);
                    transform: translateX(-120%);
                    animation: bl-page-glint var(--speed) ease-in-out infinite;
                    animation-delay: var(--delay);
                }
                .bl__sheet:nth-of-type(4) { --delay: 0s; }
                .bl__sheet:nth-of-type(5) { --delay: 0.52s; }
                .bl__sheet:nth-of-type(6) { --delay: 1.04s; }
                .bl__sheet:nth-of-type(7) { --delay: 1.56s; }
                .bl__sheet:nth-of-type(8) { --delay: 2.08s; }
                .bl__spine {
                    position: absolute;
                    z-index: 20;
                    top: 6px;
                    bottom: 7px;
                    left: 50%;
                    width: 11px;
                    transform: translateX(-50%);
                    border-radius: 50%;
                    background: linear-gradient(
                        90deg,
                        rgba(58, 40, 12, 0.24),
                        rgba(255, 250, 236, 0.85) 49%,
                        rgba(58, 40, 12, 0.2)
                    );
                    pointer-events: none;
                }
                .bl__ribbon {
                    position: absolute;
                    z-index: 21;
                    top: 6px;
                    left: 50%;
                    width: 9px;
                    height: 76%;
                    transform: translateX(-1px);
                    background: linear-gradient(90deg, #b98a2e, var(--gold-soft), #c29433);
                    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%);
                    filter: drop-shadow(0 0 6px rgba(226, 195, 119, 0.45));
                    opacity: 0.92;
                }
                .bl__particle {
                    --x: 0px;
                    --y: -18px;
                    --delay: 0s;
                    --color: var(--gold);
                    position: absolute;
                    z-index: 7;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--color);
                    box-shadow: 0 0 12px var(--color), 0 0 24px var(--color);
                    opacity: 0;
                    animation: bl-particle 2.5s ease-out infinite;
                    animation-delay: var(--delay);
                }
                .bl__p1 { top: 30%; left: 12%; --x: -12px; --y: -26px; --color: var(--rose); }
                .bl__p2 { top: 18%; right: 19%; --x: 15px; --y: -18px; --delay: 0.65s; --color: var(--gold-soft); width: 4px; height: 4px; }
                .bl__p3 { bottom: 20%; right: 7%; --x: 19px; --y: -22px; --delay: 1.2s; --color: var(--gold); }
                .bl__p4 { bottom: 23%; left: 16%; --x: -16px; --y: -21px; --delay: 1.75s; --color: var(--cream); width: 4px; height: 4px; }
                .bl__p5 { top: 10%; left: 42%; --x: 5px; --y: -17px; --delay: 2.05s; --color: #fff; width: 3px; height: 3px; }
                .bl__label {
                    position: relative;
                    z-index: 5;
                    margin: 0;
                    color: var(--cream);
                    font-size: 13.5px;
                    font-weight: 700;
                    letter-spacing: 0.14em;
                    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
                    animation: bl-label-breathe 2.6s ease-in-out infinite;
                }
                @keyframes bl-page-turn {
                    0%, 5% { opacity: 0; transform: rotateY(0deg) translateZ(2px); }
                    11%, 43% { opacity: 1; }
                    55% { opacity: 0; transform: rotateY(-180deg) translateZ(2px); }
                    100% { opacity: 0; transform: rotateY(-180deg) translateZ(2px); }
                }
                @keyframes bl-page-glint {
                    0%, 8% { transform: translateX(-120%); opacity: 0; }
                    24% { opacity: 0.85; }
                    50%, 100% { transform: translateX(120%); opacity: 0; }
                }
                @keyframes bl-book-float {
                    0%, 100% { transform: translateY(3px) rotateZ(-0.5deg); }
                    50% { transform: translateY(-9px) rotateZ(0.5deg); }
                }
                @keyframes bl-cover-shine {
                    0%, 22% { transform: translateX(0) rotate(15deg); opacity: 0; }
                    45% { opacity: 0.85; }
                    75%, 100% { transform: translateX(560%) rotate(15deg); opacity: 0; }
                }
                @keyframes bl-aurora-turn {
                    to { transform: rotate(360deg); }
                }
                @keyframes bl-bg-turn {
                    to { transform: rotate(360deg) scale(1.04); }
                }
                @keyframes bl-pulse {
                    0%, 100% { transform: scale(0.84); opacity: 0.18; }
                    50% { transform: scale(1.12); opacity: 0.4; }
                }
                @keyframes bl-particle {
                    0% { opacity: 0; transform: translate(0, 0) scale(0.2); }
                    28% { opacity: 1; transform: translate(calc(var(--x) * 0.35), calc(var(--y) * 0.35)) scale(1); }
                    100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(0.15); }
                }
                @keyframes bl-label-breathe {
                    0%, 100% { opacity: 0.65; }
                    50% { opacity: 1; }
                }
                @media (max-width: 480px) {
                    .bl { --size: 260px; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .bl :global(*),
                    .bl::before,
                    .bl::after {
                        animation-duration: 0.001ms !important;
                        animation-iteration-count: 1 !important;
                    }
                    .bl__sheet { display: none; }
                }
            `}</style>
        </div>
    )
}
