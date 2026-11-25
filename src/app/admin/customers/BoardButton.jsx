'use client'
// The small button of the customer board. With `href` it opens a link in a new
// tab, such as a WhatsApp chat.

import k from '../ui/kit.module.css'

export default function Button({ children, onClick, href, primary = false, disabled = false }) {
    const className = `${primary ? k.button : k.quiet} ${k.small}`
    return href
        ? <a href={href} target='_blank' rel='noopener noreferrer' className={className}>{children}</a>
        : <button type='button' onClick={onClick} disabled={disabled} className={className}>{children}</button>
}
