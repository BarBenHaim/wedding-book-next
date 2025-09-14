'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Home() {
    const [weddingId, setWeddingId] = useState('')

    return (
        <div className='container'>
            <div className='card' style={{ textAlign: 'center' }}>
                <h1 className='title'>📖 ברוכים הבאים ל־Wedding Book</h1>
                <p>הכניסו מזהה חתונה או השתמשו בלינק שקיבלתם מהזוג:</p>

                <input
                    type='text'
                    placeholder='מזהה חתונה (w123)'
                    value={weddingId}
                    onChange={e => setWeddingId(e.target.value)}
                    style={{ padding: 12, marginTop: 12, borderRadius: 8, border: '1px solid #ccc' }}
                />

                {weddingId && (
                    <Link
                        href={`/wedding/${weddingId}`}
                        className='btn btn-primary'
                        style={{ marginTop: 16, display: 'inline-block' }}
                    >
                        עבור לחתונה
                    </Link>
                )}
            </div>
        </div>
    )
}
