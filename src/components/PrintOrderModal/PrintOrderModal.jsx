'use client'

import { useState } from 'react'

const COUNTRIES = [
    { code: 'IL', label: 'ישראל' },
    { code: 'US', label: 'ארצות הברית' },
    { code: 'GB', label: 'בריטניה' },
    { code: 'FR', label: 'צרפת' },
    { code: 'DE', label: 'גרמניה' },
    { code: 'CA', label: 'קנדה' },
    { code: 'AU', label: 'אוסטרליה' },
]

export default function PrintOrderModal({ onClose, onSubmit, isLoading }) {
    const [form, setForm] = useState({
        name: '',
        street1: '',
        street2: '',
        city: '',
        stateCode: '',
        postcode: '',
        countryCode: 'IL',
        phone: '',
        email: '',
    })

    const [errors, setErrors] = useState({})

    function updateField(field, value) {
        setForm(prev => ({ ...prev, [field]: value }))
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
    }

    function validate() {
        const e = {}
        if (!form.name.trim()) e.name = 'שם מלא נדרש'
        if (!form.street1.trim()) e.street1 = 'כתובת נדרשת'
        if (!form.city.trim()) e.city = 'עיר נדרשת'
        if (!form.postcode.trim()) e.postcode = 'מיקוד נדרש'
        if (!form.phone.trim()) e.phone = 'טלפון נדרש'
        if (!form.email.trim()) e.email = 'אימייל נדרש'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    function handleSubmit(e) {
        e.preventDefault()
        if (!validate()) return
        onSubmit(form)
    }

    const inputCls = (field) =>
        `w-full rounded-xl border px-4 py-3 text-sm text-gray-700 outline-none transition-all ${
            errors[field]
                ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                : 'border-[#AA8840]/20 bg-[#AA8840]/5 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10'
        }`

    return (
        <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4' onClick={onClose}>
            <div
                className='relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-scaleIn'
                dir='rtl'
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className='bg-gradient-to-l from-[#AA8840] to-[#c9a44e] px-6 py-5 text-white'>
                    <div className='flex items-center justify-between'>
                        <div>
                            <h2 className='text-lg font-bold'>שליחה להדפסה</h2>
                            <p className='text-sm text-white/80 mt-0.5'>מלאו את פרטי המשלוח והספר ישלח אליכם</p>
                        </div>
                        <button onClick={onClose} className='w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors'>
                            <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' /></svg>
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className='p-6 space-y-4 max-h-[70vh] overflow-y-auto'>

                    {/* Name */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>שם מלא (נמען)</label>
                        <input type='text' value={form.name} onChange={e => updateField('name', e.target.value)}
                            placeholder='ישראל ישראלי' className={inputCls('name')} />
                        {errors.name && <p className='text-xs text-red-500 mt-1'>{errors.name}</p>}
                    </div>

                    {/* Email */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>אימייל ליצירת קשר</label>
                        <input type='email' value={form.email} onChange={e => updateField('email', e.target.value)}
                            placeholder='email@example.com' className={inputCls('email')} dir='ltr' />
                        {errors.email && <p className='text-xs text-red-500 mt-1'>{errors.email}</p>}
                    </div>

                    {/* Phone */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>טלפון</label>
                        <input type='tel' value={form.phone} onChange={e => updateField('phone', e.target.value)}
                            placeholder='+972 50 1234567' className={inputCls('phone')} dir='ltr' />
                        {errors.phone && <p className='text-xs text-red-500 mt-1'>{errors.phone}</p>}
                    </div>

                    <div className='w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent'></div>

                    {/* Country */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>מדינה</label>
                        <select value={form.countryCode} onChange={e => updateField('countryCode', e.target.value)}
                            className={inputCls('countryCode')}>
                            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                    </div>

                    {/* Street 1 */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>כתובת (רחוב ומספר)</label>
                        <input type='text' value={form.street1} onChange={e => updateField('street1', e.target.value)}
                            placeholder='הרצל 1, דירה 5' className={inputCls('street1')} />
                        {errors.street1 && <p className='text-xs text-red-500 mt-1'>{errors.street1}</p>}
                    </div>

                    {/* Street 2 (optional) */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>שורה נוספת (אופציונלי)</label>
                        <input type='text' value={form.street2} onChange={e => updateField('street2', e.target.value)}
                            placeholder='קומה, כניסה, וכו׳' className={inputCls('street2')} />
                    </div>

                    {/* City + Postcode row */}
                    <div className='grid grid-cols-2 gap-3'>
                        <div>
                            <label className='block text-sm font-medium text-gray-700 mb-1'>עיר</label>
                            <input type='text' value={form.city} onChange={e => updateField('city', e.target.value)}
                                placeholder='תל אביב' className={inputCls('city')} />
                            {errors.city && <p className='text-xs text-red-500 mt-1'>{errors.city}</p>}
                        </div>
                        <div>
                            <label className='block text-sm font-medium text-gray-700 mb-1'>מיקוד</label>
                            <input type='text' value={form.postcode} onChange={e => updateField('postcode', e.target.value)}
                                placeholder='6100000' className={inputCls('postcode')} dir='ltr' />
                            {errors.postcode && <p className='text-xs text-red-500 mt-1'>{errors.postcode}</p>}
                        </div>
                    </div>

                    {/* State (for US/CA/AU) */}
                    {['US', 'CA', 'AU'].includes(form.countryCode) && (
                        <div>
                            <label className='block text-sm font-medium text-gray-700 mb-1'>מדינה/מחוז (State)</label>
                            <input type='text' value={form.stateCode} onChange={e => updateField('stateCode', e.target.value)}
                                placeholder='CA / NY / TX...' className={inputCls('stateCode')} dir='ltr' maxLength={3} />
                        </div>
                    )}

                    {/* Info box */}
                    <div className='bg-[#AA8840]/5 border border-[#AA8840]/15 rounded-xl p-4 flex items-start gap-3'>
                        <svg className='w-5 h-5 text-[#AA8840] flex-shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' />
                        </svg>
                        <div className='text-xs text-[#AA8840]/80 leading-relaxed'>
                            <p className='font-semibold text-[#AA8840] mb-1'>איך זה עובד?</p>
                            <p>הספר יודפס ויישלח ישירות לכתובת שמילאתם. המשלוח לוקח בדרך כלל 5-14 ימי עסקים בהתאם ליעד.</p>
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        type='submit'
                        disabled={isLoading}
                        className='w-full py-4 px-6 rounded-2xl gold-shimmer text-white font-bold text-base shadow-lg hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100'
                    >
                        {isLoading ? (
                            <>
                                <div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
                                <span>מעבד ושולח להדפסה...</span>
                            </>
                        ) : (
                            <>
                                <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z' />
                                </svg>
                                <span>שלח להדפסה</span>
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
