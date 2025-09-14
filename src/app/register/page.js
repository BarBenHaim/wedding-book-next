'use client'
import '../login/login.css'

import { useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, db } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function RegisterPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    async function handleRegister(e) {
        e.preventDefault()
        setError('')
        try {
            if (password.length < 6) {
                setError('הסיסמה חייבת להיות לפחות 6 תווים')
                return
            }

            // הרשמה
            const userCredential = await createUserWithEmailAndPassword(auth, email, password)
            const userId = userCredential.user.uid
            const weddingId = userId // אפשר גם `wedding-${userId}` אם אתה רוצה תחילית

            // יצירת מסמך חתונה חדש
            await setDoc(doc(db, 'weddings', weddingId), {
                ownerEmail: email,
                createdAt: serverTimestamp(),
            })

            // שמור את ה־weddingId בלוקאל סטורג'
            localStorage.setItem('weddingId', weddingId)

            // הפניה ללוח הניהול עם ה־weddingId
            router.push(`wedding/${weddingId}/admin`)
        } catch (err) {
            setError('שגיאה בהרשמה: ' + err.message)
        }
    }

    return (
        <div className='auth-container'>
            <h1>הרשמה לחתן ולכלה</h1>
            <form onSubmit={handleRegister} className='auth-form'>
                <input type='email' placeholder='אימייל' value={email} onChange={e => setEmail(e.target.value)} />
                <input
                    type='password'
                    placeholder='סיסמה'
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />
                <button type='submit'>הרשם</button>
            </form>
            {error && <p className='auth-error'>{error}</p>}
        </div>
    )
}
