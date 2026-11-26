'use client'
// The frame around the super admin: the menu, and the windows that open from
// it on any screen (the bot, the spend, "more").

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { Calendar, CalendarDays, Coins, LogOut, Menu, MessageCircle, MessagesSquare, Palette } from 'lucide-react'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import { NAV, activeNav, adminShell, tabsFor } from '@/lib/adminShell'
import BotWindow from '../today/BotWindow'
import SpendWindow from '../today/SpendWindow'
import Window from './Window'
import { adminApi } from './api'
import { jerusalemSerif } from './font'
import s from './shell.module.css'
import './theme.css'

const ICONS = {
    '/admin/customers': Calendar, '/admin': CalendarDays, '/admin/sales-leads': MessagesSquare,
    '/admin/studio': Palette, bot: MessageCircle, spend: Coins,
}
// On a phone the bottom bar holds only these; the rest sit under "more".
const ON_PHONE = ['/admin/customers', '/admin', '/admin/sales-leads', 'bot']
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
    const tabs = tabsFor(pathname)
    const item = (entry, extra = {}) => {
        const key = keyOf(entry)
        const Icon = ICONS[key] || Menu
        const inside = <><span>{entry.label}</span><Icon size={26} strokeWidth={2.2} aria-hidden='true' /></>
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
                        <Link href='/admin/customers' className={s.brand}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src='/brand/logo-on-dark.png' alt='Wedding Tales' />
                        </Link>
                        <div className={s.rule} aria-hidden='true' />
                        <nav aria-label='ניווט ראשי'>
                            {NAV.map(entry => item(entry))}
                            {/* on a phone: what the bottom bar has no room for */}
                            <button type='button' className={s.item} data-more title='עוד' aria-current={lit && !ON_PHONE.includes(lit) ? 'page' : undefined} onClick={() => setView({ type: 'more' })}>
                                <span>עוד</span><Menu size={26} strokeWidth={2.2} aria-hidden='true' />
                            </button>
                            <button type='button' className={s.item} data-out title='יציאה' onClick={logout}>
                                <span>יציאה</span><LogOut size={26} strokeWidth={2.2} aria-hidden='true' />
                            </button>
                        </nav>
                        <div className={s.rule} aria-hidden='true' />
                        <div className={s.alley} aria-hidden='true' />
                    </aside>
                )}
                <div className={framed ? `${s.content} ${shell.serif ? s.serif : ''} ${shell.themed ? 'wt-theme' : ''}` : undefined}>
                    {framed && tabs.length > 0 && (
                        <nav className={s.tabs} aria-label='המסכים של האזור'>
                            {tabs.map(tab => <Link key={tab.href} href={tab.href} aria-current={tab.current ? 'page' : undefined}>{tab.label}</Link>)}
                        </nav>
                    )}
                    {children}
                </div>

                {view?.type === 'bot' && <BotWindow bot={today?.bot} firstTab={view.tab} api={adminApi} onChanged={changed} onClose={close} />}
                {view?.type === 'spend' && <SpendWindow month={today?.spend} api={adminApi} onClose={close} />}
                {view?.type === 'more' && (
                    <Window title='עוד' onClose={close}>
                        <div className={s.tiles}>
                            {NAV.filter(entry => !ON_PHONE.includes(keyOf(entry))).map(entry => {
                                const Icon = ICONS[keyOf(entry)] || Menu
                                const inside = <><Icon size={34} strokeWidth={1.9} aria-hidden='true' /><b>{entry.label}</b></>
                                return entry.open
                                    ? <button key={entry.label} type='button' onClick={() => (entry.open === 'bot' ? openBot() : openSpend())}>{inside}</button>
                                    : <Link key={entry.label} href={entry.href} onClick={close} aria-current={lit === entry.href ? 'page' : undefined}>{inside}</Link>
                            })}
                            <button type='button' onClick={logout}><LogOut size={34} strokeWidth={1.9} aria-hidden='true' /><b>יציאה</b></button>
                        </div>
                    </Window>
                )}
            </div>
        </AdminContext.Provider>
    )
}
