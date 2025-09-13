import Link from 'next/link'

export default function Home() {
    return (
        <div className='container'>
            <div className='card' style={{ textAlign: 'center' }}>
                <h1 className='title'>📖 ספר ברכות החתונה</h1>
                <p>ברוכים הבאים לספר הברכות הדיגיטלי שלנו</p>

                <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Link href='/text' className='btn btn-primary'>
                        ✍️ כתיבת ברכה
                    </Link>
                    <Link href='/photo' className='btn btn-gold'>
                        📷 צילום ברכה
                    </Link>
                    <Link href='/admin' className='btn'>
                        👑 לוח בקרה
                    </Link>
                    <Link href='/viewer' className='btn'>
                        📖 צפייה בספר
                    </Link>
                </div>
            </div>
        </div>
    )
}
