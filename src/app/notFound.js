export default function NotFound() {
    return (
        <div className='flex h-screen flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-white text-center px-6'>
            <h1 className='text-6xl font-serif text-pink-600 mb-4'>404</h1>
            <h2 className='text-2xl font-semibold text-gray-800 mb-2'>החתונה לא נמצאה 💍</h2>
            <p className='text-gray-600 max-w-md'>
                נראה שהקישור שהזנת לא מוביל לחתונה קיימת. בדוק את הכתובת או חזור לעמוד הראשי.
            </p>

            <a
                href='/'
                className='mt-8 inline-block rounded-lg bg-pink-500 px-8 py-3 text-lg font-medium text-white shadow hover:bg-pink-600 transition'
            >
                חזרה לעמוד הבית
            </a>
        </div>
    )
}
