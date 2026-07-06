'use client'

import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter, usePathname } from 'next/navigation'
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'
import { isSuperAdmin } from '@/lib/superAdmin'

// Drawer menu item icons
const ViewerIcon = () => (
    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
        />
    </svg>
)
const AdminIcon = () => (
    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z'
        />
    </svg>
)
const PortalIcon = () => (
    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5Z'
        />
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5Z'
        />
    </svg>
)
const LogoutIcon = () => (
    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9'
        />
    </svg>
)
const SuperAdminIcon = () => (
    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z'
        />
        <path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 11-6 0 3 3 0 016 0Z' />
    </svg>
)

export default function Header() {
    const [user, setUser] = useState(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    // Locale resolution. The Header lives in the root layout and never
    // unmounts, so reading navigator.language once at mount caused it to
    // stick on whatever the browser language was — even after logout +
    // login. Now we drive it off the active wedding doc instead:
    //
    //   • Anonymous / no wedding → Hebrew (system default).
    //   • Logged-in with a wedding → wedding.locale from Firestore.
    //
    // The effect below re-runs whenever the active wedding id flips, so
    // logging out (id becomes null) restores Hebrew, and logging back in
    // picks the doc's locale fresh.
    const [locale, setLocale] = useState('he')
    const t = useMemo(() => getMessages(locale).header, [locale])

    const weddingIdFromUrl = pathname.startsWith('/wedding/') ? pathname.split('/')[2] : null
    const [personalWeddingId, setPersonalWeddingId] = useState(null)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async currentUser => {
            setUser(currentUser)
            if (currentUser) {
                let id = localStorage.getItem('weddingId')
                if (!id) {
                    // חיפוש חתונה לפי ownerId ב-Firestore
                    try {
                        const q = query(collection(db, 'weddings'), where('ownerId', '==', currentUser.uid), limit(1))
                        const snap = await getDocs(q)
                        if (!snap.empty) {
                            id = snap.docs[0].id
                            localStorage.setItem('weddingId', id)
                        }
                    } catch (err) {
                        console.error('Error finding wedding:', err)
                    }
                }
                setPersonalWeddingId(id || null)
            } else {
                setPersonalWeddingId(null)
            }
        })
        return () => unsub()
    }, [])

    const activeId = weddingIdFromUrl ?? personalWeddingId
    // Renamed local var so it doesn't shadow the imported helper.
    const userIsSuperAdmin = isSuperAdmin(user?.email)

    // Resolve Header locale from the active wedding's locale. Re-runs on
    // login/logout (activeId flips) and on cross-event navigation. Falls
    // back to Hebrew when there's no active wedding.
    useEffect(() => {
        if (!activeId) {
            setLocale('he')
            return
        }
        let cancelled = false
        ;(async () => {
            try {
                const snap = await getDoc(doc(db, 'weddings', activeId))
                if (cancelled) return
                if (snap.exists()) {
                    setLocale(normalizeLocale(snap.data().locale))
                } else {
                    setLocale('he')
                }
            } catch {
                setLocale('he')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [activeId])

    async function handleLogout() {
        await signOut(auth)
        localStorage.removeItem('weddingId')
        await fetch('/api/logout', { method: 'POST' })
        router.push('/')
    }

    function handleLogoClick() {
        if (weddingIdFromUrl) {
            router.push(`/wedding/${weddingIdFromUrl}`)
        } else {
            router.push(personalWeddingId ? `/wedding/${personalWeddingId}` : '/')
        }
    }

    // Close drawer on route change
    useEffect(() => {
        setMenuOpen(false)
    }, [pathname])

    // Funnel pages are immersive — no site chrome. The wizard (/start)
    // and the events hub (/my) carry their own branded headers, and the
    // mobile app embeds /start in a WebView where a nav bar is noise.
    if (pathname === '/start' || pathname === '/my') return null

    return (
        <>
            <header className='sticky top-0 left-0 right-0 z-50 bg-[#F5F5F5]/80 backdrop-blur-md shadow-sm border-b border-[#AA8840]/10'>
                <nav className='mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3'>
                    {/* Hamburger — premium gold style */}
                    {user && activeId && (
                        <div className='md:hidden'>
                            <button
                                onClick={() => setMenuOpen(prev => !prev)}
                                className='relative w-11 h-11 flex flex-col justify-center items-center rounded-xl border border-[#AA8840]/20 bg-white/60 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-[#AA8840]/40 active:scale-95 transition-all duration-200'
                                aria-label={t.menuOpen}
                            >
                                <span
                                    className={`block h-[1.5px] rounded-full transition-all duration-300 ease-out ${menuOpen ? 'w-[18px] bg-[#AA8840] rotate-45 translate-y-[5px]' : 'w-[18px] bg-[#AA8840]/70'}`}
                                />
                                <span
                                    className={`block h-[1.5px] rounded-full transition-all duration-300 ease-out mt-[4px] ${menuOpen ? 'w-0 opacity-0' : 'w-[12px] bg-[#AA8840]/50'}`}
                                />
                                <span
                                    className={`block h-[1.5px] rounded-full transition-all duration-300 ease-out mt-[4px] ${menuOpen ? 'w-[18px] bg-[#AA8840] -rotate-45 -translate-y-[5px]' : 'w-[18px] bg-[#AA8840]/70'}`}
                                />
                            </button>
                        </div>
                    )}

                    {/* Desktop buttons */}
                    <div className='hidden md:flex items-center gap-3'>
                        {!user && !weddingIdFromUrl && (
                            <button
                                onClick={() => router.push('/login')}
                                className='rounded-full bg-gradient-to-r from-[#AA8840] to-[#c9a44e] px-5 py-2 text-sm font-medium text-white shadow-md cursor-pointer'
                            >
                                {t.login}
                            </button>
                        )}

                        {user && activeId && (
                            <>
                                <button
                                    onClick={() => router.push(`/wedding/${activeId}/viewer`)}
                                    className='rounded-full bg-[#AA8840]/10 px-4 py-2 text-sm font-medium text-[#AA8840] hover:bg-[#AA8840]/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer'
                                >
                                    {t.designBook}
                                </button>

                                <button
                                    onClick={() => router.push(`/wedding/${activeId}/admin`)}
                                    className='rounded-full bg-[#f0ebe3] px-4 py-2 text-sm font-medium text-[#18140F] hover:bg-[#ebe5da] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer'
                                >
                                    {t.manageBlessings}
                                </button>

                                <button
                                    onClick={() => router.push(`/wedding/${activeId}/portal`)}
                                    className='rounded-full bg-gradient-to-r from-[#AA8840] to-[#c9a44e] px-4 py-2 text-sm font-medium text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer'
                                >
                                    {t.qrShare}
                                </button>
                            </>
                        )}

                        {userIsSuperAdmin && (
                            <button
                                onClick={() => router.push('/admin')}
                                className='rounded-full bg-[#18140F]/10 px-4 py-2 text-sm font-medium text-[#18140F] hover:bg-[#18140F]/20 transition cursor-pointer'
                            >
                                Super Admin
                            </button>
                        )}

                        {user && (
                            <button
                                onClick={handleLogout}
                                className='rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition cursor-pointer'
                            >
                                {t.logout}
                            </button>
                        )}
                    </div>

                    {/* Logo */}
                    <button className='cursor-pointer group' onClick={handleLogoClick}>
                        <img
                            src='/logo-wt.png'
                            alt='Wedding Tales'
                            className='h-16 md:h-16 w-auto transition-all duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_0_8px_rgba(170,136,64,0.4)]'
                        />
                    </button>
                </nav>
            </header>

            {/* Overlay */}
            {menuOpen && (
                <div
                    className='fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden'
                    onClick={() => setMenuOpen(false)}
                />
            )}

            {/* Premium mobile drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-72 max-w-[85vw] bg-gradient-to-b from-[#F5F5F5] to-[#f0ebe3] shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
                    menuOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className='flex flex-col h-full p-6'>
                    {/* Drawer header */}
                    <div className='flex items-center justify-between mb-6'>
                        <button
                            onClick={() => setMenuOpen(false)}
                            className='w-11 h-11 flex items-center justify-center rounded-xl bg-white/80 shadow-sm hover:bg-white active:scale-95 transition-all'
                            aria-label={t.menuClose}
                        >
                            <svg
                                className='w-5 h-5 text-gray-500'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'
                                strokeWidth={2}
                            >
                                <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                            </svg>
                        </button>
                        <img src='/logo-wt.png' alt='WT' className='h-9 w-auto' />
                    </div>

                    {/* Gold accent line */}
                    <div className='w-full h-px bg-gradient-to-r from-[#AA8840]/30 via-[#AA8840]/15 to-transparent mb-6'></div>

                    {/* Menu items */}
                    <div className='flex-1 space-y-1'>
                        {!user && !weddingIdFromUrl && (
                            <DrawerItem
                                icon={<LogoutIcon />}
                                label={t.login}
                                onClick={() => router.push('/login')}
                                gold
                            />
                        )}

                        {user && activeId && (
                            <>
                                <DrawerItem
                                    icon={<ViewerIcon />}
                                    label={t.designBook}
                                    onClick={() => router.push(`/wedding/${activeId}/viewer`)}
                                    active={pathname?.includes('/viewer')}
                                />
                                <DrawerItem
                                    icon={<AdminIcon />}
                                    label={t.manageBlessings}
                                    onClick={() => router.push(`/wedding/${activeId}/admin`)}
                                    active={pathname?.includes('/admin')}
                                />
                                <DrawerItem
                                    icon={<PortalIcon />}
                                    label={t.qrShare}
                                    onClick={() => router.push(`/wedding/${activeId}/portal`)}
                                    active={pathname?.includes('/portal')}
                                    gold
                                />
                            </>
                        )}

                        {userIsSuperAdmin && (
                            <DrawerItem
                                icon={<SuperAdminIcon />}
                                label='Super Admin'
                                onClick={() => router.push('/admin')}
                            />
                        )}
                    </div>

                    {/* Bottom logout */}
                    {user && (
                        <div className='pt-4 border-t border-[#AA8840]/10'>
                            <DrawerItem icon={<LogoutIcon />} label={t.logout} onClick={handleLogout} muted />
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

// Reusable drawer menu item
function DrawerItem({ icon, label, onClick, active, gold, muted }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-start transition-all duration-200 ${
                active
                    ? 'bg-[#AA8840]/10 text-[#AA8840] font-bold'
                    : gold
                      ? 'text-[#AA8840] font-semibold hover:bg-[#AA8840]/5'
                      : muted
                        ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        : 'text-gray-700 font-medium hover:bg-white/80 hover:text-[#AA8840]'
            }`}
        >
            <span
                className={`flex-shrink-0 ${active ? 'text-[#AA8840]' : gold ? 'text-[#AA8840]' : muted ? 'text-gray-400' : 'text-gray-500'}`}
            >
                {icon}
            </span>
            <span className='text-base'>{label}</span>
            {active && <span className='ms-auto w-1.5 h-1.5 rounded-full bg-[#AA8840]'></span>}
        </button>
    )
}
