// Branded not-found — a lost visitor is still a visitor. Warm page,
// two useful doors: the landing and a free book.
import Link from 'next/link'

export default function NotFound() {
    return (
        <div dir='rtl' style={{
            minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 14, textAlign: 'center', padding: '40px 20px',
            background: 'linear-gradient(180deg,#fdfaf2,#f6efdf)', color: '#241c10',
            fontFamily: "var(--font-assistant),'Assistant','Heebo',system-ui,sans-serif",
        }}>
            <img src='/logo-wt.png' alt='Wedding Tales' style={{ height: 52, width: 'auto' }} />
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>הדף הזה לא נמצא</h1>
            <p style={{ margin: 0, color: '#6d5a3d', fontSize: 15, lineHeight: 1.7, maxWidth: 380 }}>
                אולי הקישור השתנה או שהוקלד חלקית. אבל אם כבר הגעתם —
                אולי תפתחו ספר ברכות? 🙂
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href='/start' style={{
                    background: 'linear-gradient(180deg,#d3b46a,#b8893d)', color: '#fff', textDecoration: 'none',
                    padding: '13px 24px', borderRadius: 14, fontWeight: 800, fontSize: 15,
                    boxShadow: '0 14px 28px -12px rgba(170,136,64,0.6)',
                }}>
                    פתחו ספר בחינם ←
                </Link>
                <Link href='/landing' style={{
                    border: '1.5px solid rgba(170,136,64,0.4)', color: '#7c6027', textDecoration: 'none',
                    padding: '13px 24px', borderRadius: 14, fontWeight: 700, fontSize: 15, background: 'rgba(255,255,255,0.6)',
                }}>
                    לעמוד הבית
                </Link>
            </div>
        </div>
    )
}
