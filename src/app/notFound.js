import Link from 'next/link'

export default function NotFound() {
    return (
        <div className='flex h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-white text-center px-6'>
            <h1 className='text-6xl font-serif text-pink-600 mb-4'>404</h1>
            <h2 className='text-2xl font-semibold text-gray-800 mb-2'>החתונה לא נמצאה 💍</h2>
            <p className='text-gray-600 max-w-md'>
                נראה שהקישור שהזנת לא מוביל לחתונה קיימת. בדוק את הכתובת או חזור לעמוד הראשי.
            </p>

            <Link href='/'>חזרה לעמוד הראשי</Link>
        </div>
    )
}
