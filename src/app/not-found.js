// Branded not-found — a lost visitor is still a visitor. Warm page,
// two useful doors: the landing and a free book.
import Link from 'next/link'

export default function NotFound() {
    return (
        <div dir='rtl' className='wt-lost' style={{
            minHeight: 'calc(100dvh - 66px)', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', gap: 14, textAlign: 'center', padding: 'clamp(318px, 27vw, 360px) 20px 40px',
            background: "linear-gradient(180deg, rgba(243,226,189,0) 24%, #f3e2bd 44%) , url('/admin-theme/hero.webp') center top / max(100%, 900px) auto no-repeat, #f3e2bd url('/admin-theme/parchment.webp') repeat", color: '#1d1648',
            fontFamily: "var(--font-assistant),'Assistant','Heebo',system-ui,sans-serif",
        }}>
            <img src='/logo-wt.png' alt='Wedding Tales' style={{ height: 52, width: 'auto' }} />
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, fontFamily: "'Noto Serif Hebrew', 'Frank Ruhl Libre', var(--font-frank), serif" }}>הדף הזה לא נמצא</h1>
            <p style={{ margin: 0, color: '#4f4668', fontSize: 15, lineHeight: 1.7, maxWidth: 380 }}>
                אולי הקישור השתנה או שהוקלד חלקית. אבל אם כבר הגעתם —
                אולי תפתחו ספר ברכות? 🙂
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href='/start' style={{
                    background: 'linear-gradient(180deg,#2c2473,#171049 58%,#1f1860)', color: '#fff3d8', border: '2px solid #d9b265', textDecoration: 'none',
                    padding: '13px 24px', borderRadius: 14, fontWeight: 800, fontSize: 15,
                    boxShadow: '0 14px 28px -12px rgba(30,16,66,0.55)',
                }}>
                    פתחו ספר בחינם ←
                </Link>
                <Link href='https://weddingtales.co.il' style={{
                    border: '1.5px solid #c9a460', color: '#1d1648', textDecoration: 'none',
                    padding: '13px 24px', borderRadius: 14, fontWeight: 700, fontSize: 15, background: 'rgba(255,250,240,0.85)',
                }}>
                    לעמוד הבית
                </Link>
            </div>
        </div>
    )
}
