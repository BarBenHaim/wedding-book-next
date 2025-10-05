import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'

export default async function WeddingHome({ params }) {
    const { weddingId } = params

    const ref = doc(db, 'weddings', weddingId)
    const snap = await getDoc(ref)

    return (
        <div className='relative min-h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 font-sans flex flex-col items-center justify-center px-6'>
            {/* Glow רקע */}
            <div className='absolute -top-32 left-0 h-96 w-96 rounded-full bg-purple-300/30 blur-3xl'></div>
            <div className='absolute bottom-0 right-0 h-96 w-96 rounded-full bg-pink-300/40 blur-3xl'></div>

            {/* Hero */}
            <div className='relative z-10 text-center max-w-3xl mb-12'>
                <h1 className='text-5xl font-extrabold text-gray-900 mb-6'>
                    ברוכים הבאים <br />
                    <span className='bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent'>
                        לספר הברכות
                    </span>
                </h1>
                <p className='text-lg text-gray-600'>
                    זהו המקום לשתף את הרגעים שלכם, לכתוב ברכות מרגשות ולהוסיף תמונות שישמרו לנצח.
                </p>
            </div>

            {/* פעולות ככרטיסים */}
            <div className='relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full'>
                <Link
                    href={`/wedding/${weddingId}/text`}
                    className='group rounded-2xl bg-white/90 backdrop-blur-md p-8 shadow-lg hover:shadow-2xl transition transform hover:-translate-y-1 text-center'
                >
                    <div className='text-5xl mb-4 group-hover:scale-110 transition'>✍️</div>
                    <h2 className='text-xl font-bold text-gray-800 mb-2'>כתיבת ברכה</h2>
                    <p className='text-gray-600 text-sm'>הוסיפו מילים מהלב שישארו עם הזוג לנצח.</p>
                </Link>

                <Link
                    href={`/wedding/${weddingId}/photo`}
                    className='group rounded-2xl bg-white/90 backdrop-blur-md p-8 shadow-lg hover:shadow-2xl transition transform hover:-translate-y-1 text-center'
                >
                    <div className='text-5xl mb-4 group-hover:scale-110 transition'>📷</div>
                    <h2 className='text-xl font-bold text-gray-800 mb-2'>העלאת תמונה</h2>
                    <p className='text-gray-600 text-sm'>שימרו את הרגעים היפים מהחתונה שלכם.</p>
                </Link>
            </div>
        </div>
    )
}
