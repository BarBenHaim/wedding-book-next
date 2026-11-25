'use client'
// The shared pieces of an admin screen: the sky header, gold plaques and the
// framed panel. Styles in kit.module.css.

import k from './kit.module.css'

export function Page({ children, className = '' }) {
    return (
        <main className={`${k.main} ${className}`}>
            <div className={k.sky} aria-hidden='true' />
            <div className={`${k.olive} ${k.oliveSide}`} aria-hidden='true' />
            <div className={`${k.olive} ${k.oliveFoot}`} aria-hidden='true' />
            {children}
        </main>
    )
}

export const Sheet = ({ children }) => <div className={k.sheetPage}>{children}</div>

export function Hero({ title, under, figures }) {
    return (
        <div className={k.hero}>
            <h1>{title}</h1>
            <div className={k.flourish} aria-hidden='true' />
            {under && <div className={k.under}>{under}</div>}
            {figures && <div className={k.figures}>{figures}</div>}
        </div>
    )
}

// `long` is for values such as sums, which need a smaller size. With `onClick`
// the plaque is a filter, and `pressed` marks the chosen one.
export function Plaque({ value, label, Icon, solid = false, long = false, onClick, pressed }) {
    const inside = <>
        <b>{Icon && <Icon size={34} strokeWidth={2} fill={solid ? 'currentColor' : 'none'} aria-hidden='true' />}{value}</b>
        <span>{label}</span>
    </>
    const className = `${k.plaque} ${long ? k.long : ''}`
    return onClick
        ? <button type='button' className={className} aria-pressed={pressed === true} onClick={onClick}>{inside}</button>
        : <div className={className}>{inside}</div>
}

export function Panel({ title, Icon, aside, children, className = '', onOpen, centered = false }) {
    return (
        <section className={`${k.panel} ${centered ? k.centered : ''} ${className}`} onClick={onOpen}>
            {(title || aside) && (
                <header className={k.panelHead}>
                    {title && <h2>{Icon && <Icon size={28} strokeWidth={2.1} aria-hidden='true' />}{title}</h2>}
                    {aside}
                </header>
            )}
            {children}
        </section>
    )
}
