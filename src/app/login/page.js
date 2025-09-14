'use client'
import '../login/login.css'

import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    async function handleLogin(e) {
        e.preventDefault()
        try {
            await signInWithEmailAndPassword(auth, email, password)
            router.push('/admin')
        } catch (err) {
            setError('שגיאה בהתחברות: ' + err.message)
        }
    }

    return (
        <div className='auth-container'>
            <h1>התחברות לחתן ולכלה</h1>
            <form onSubmit={handleLogin} className='auth-form'>
                <input type='email' placeholder='אימייל' value={email} onChange={e => setEmail(e.target.value)} />
                <input
                    type='password'
                    placeholder='סיסמה'
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />
                <button type='submit'>התחבר</button>
            </form>
            {error && <p className='auth-error'>{error}</p>}
        </div>
    )
}
