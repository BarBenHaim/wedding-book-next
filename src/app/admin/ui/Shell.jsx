'use client'
// The frame around the super admin: the menu, and the windows that open from
// it on any screen (the bot, the spend, "more").

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
    BookImage, Calendar, CalendarDays, Coins, GraduationCap, Instagram, LogOut, Mail, Menu, MessageCircle,
    MessagesSquare, Palette, QrCode, Sparkles, Users,
} from 'lucide-react'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import { MORE, NAV, activeNav, adminShell } from '@/lib/adminShell'
import BotWindow from '../today/BotWindow'
import SpendWindow from '../today/SpendWindow'
import Window from './Window'
import { adminApi } from './api'
import { jerusalemSerif } from './font'
import s from './shell.module.css'
import './theme.css'

const ICONS = {
    '/admin/today': Calendar, '/admin/customers': Users, '/admin': CalendarDays, '/admin/sales-leads': MessagesSquare,
    bot: MessageCircle, spend: Coins, '/admin/studio': Palette,
    '/admin/qrcodes': QrCode, '/admin/emails': Mail, '/admin/social-preview': Instagram,
    '/admin/guest-design': Sparkles, '/admin/album-studio': BookImage, '/admin/project': GraduationCap,
}
// On a phone the bottom bar holds only these; the rest sit under "more".
const ON_PHONE = ['/admin/today', '/admin/customers', '/admin', 'bot']
const keyOf = item => item.href || item.open

const AdminContext = createContext({ openBot: () => {}, openSpend: () => {}, onRefresh: () => () => {} })
export const useAdmin = () => useContext(AdminContext)

export default function Shell({ children }) {
    const pathname = usePathname()
    const router = useRouter()
    const shell = adminShell(pathname)
    // null while the sign-in is still being checked.
    const [admin, setAdmin] = useState(null)
    const [view, setView] = useState(null)
    // What the bot and spend windows show beside their own reads.
    const [today, setToday] = useState(null)
    const refreshers = useRef(new Set())

    useEffect(() => onAuthStateChanged(auth, user => setAdmin(Boolean(user && isSuperAdmin(user.email)))), [])
    useEffect(() => setView(null), [pathname])

    const readToday = useCallback(() => adminApi('/api/admin/today').then(setToday).catch(() => setToday(null)), [])
    const openBot = useCallback((tab = 'state') => { setView({ type: 'bot', tab }); readToday() }, [readToday])
    const openSpend = useCallback(() => { setView({ type: 'spend' }); readToday() }, [readToday])
    // A screen registers how to read itself again after a change made in a window.
    const onRefresh = useCallback(refresh => {
        refreshers.current.add(refresh)
        return () => refreshers.current.delete(refresh)
    }, [])
    const changed = useCallback(() => Promise.all([readToday(), ...[...refreshers.current].map(refresh => refresh())]), [readToday])
    const close = useCallback(() => setView(null), [])

    const logout = async () => {
        await signOut(auth)
        localStorage.removeItem('weddingId')
        await fetch('/api/logout', { method: 'POST' })
        router.push('/')
    }

    // Print outputs get nothing around them.
    if (!shell) return children

    // Someone who is not a super admin sees the screen's own refusal, bare.
    const framed = admin !== false
    const lit = activeNav(pathname)
    const item = (entry, extra = {}) => {
        const key = keyOf(entry)
        const Icon = ICONS[key] || Menu
        const inside = <><span>{entry.label}</span><Icon size={26} strokeWidth={2.2} fill={Icon === Users ? 'currentColor' : 'none'} aria-hidden='true' /></>
        const phone = ON_PHONE.includes(key) ? undefined : 'no'
        return entry.open
            ? <button key={key} type='button' className={s.item} data-phone={phone} title={entry.label} onClick={() => (entry.open === 'bot' ? openBot() : openSpend())} {...extra}>{inside}</button>
            : <Link key={key} href={entry.href} className={s.item} data-phone={phone} title={entry.label} aria-current={lit === entry.href ? 'page' : undefined} {...extra}>{inside}</Link>
    }

    return (
        <AdminContext.Provider value={{ openBot, openSpend, onRefresh }}>
            <div
                dir='rtl'
                className={framed ? `wt-admin ${s.root} ${shell.themed ? s.parchment : ''}` : undefined}
                style={{ '--serif': jerusalemSerif.style.fontFamily }}
            >
                {framed && (
                    <aside className={s.rail} data-rail={shell.rail}>
                        <Link href='/admin/today' className={s.brand}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src='/brand/logo-on-dark.png' alt='Wedding Tales' />
                        </Link>
                        <div className={s.rule} aria-hidden='true' />
                        <nav aria-label='ניווט ראשי'>
                            {NAV.map(entry => item(entry))}
                            <button type='button' className={s.item} data-more title='עוד' aria-current={lit === 'more' ? 'page' : undefined} onClick={() => setView({ type: 'more' })}>
                                <span>עוד</span><Menu size={26} strokeWidth={2.2} aria-hidden='true' />
                            </button>
                        </nav>
                        <div className={s.rule} aria-hidden='true' />
                        <div className={s.alley} aria-hidden='true' />
                    </aside>
                )}
                <div className={framed ? `${s.content} ${shell.serif ? s.serif : ''} ${shell.themed ? 'wt-theme' : ''}` : undefined}>
                    {children}
                </div>

                {view?.type === 'bot' && <BotWindow bot={today?.bot} firstTab={view.tab} api={adminApi} onChanged={changed} onClose={close} />}
                {view?.type === 'spend' && <SpendWindow month={today?.spend} api={adminApi} onClose={close} />}
                {view?.type === 'more' && (
                    <Window title='עוד' onClose={close}>
                        <div className={s.tiles}>
                            {[...NAV.filter(entry => !ON_PHONE.includes(keyOf(entry))).map(entry => ({ ...entry, phoneOnly: true })), ...MORE].map(entry => {
                                const Icon = ICONS[keyOf(entry)] || Menu
                                const inside = <><Icon size={34} strokeWidth={1.9} aria-hidden='true' /><b>{entry.label}</b></>
                                return entry.open
                                    ? <button key={entry.label} type='button' data-phone-only={entry.phoneOnly} onClick={() => (entry.open === 'bot' ? openBot() : openSpend())}>{inside}</button>
                                    : <Link key={entry.label} href={entry.href} data-phone-only={entry.phoneOnly} onClick={close} aria-current={pathname === entry.href ? 'page' : undefined}>{inside}</Link>
                            })}
                            <button type='button' onClick={logout}><LogOut size={34} strokeWidth={1.9} aria-hidden='true' /><b>יציאה</b></button>
                        </div>
                    </Window>
                )}
            </div>
        </AdminContext.Provider>
    )
}
