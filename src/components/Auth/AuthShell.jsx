'use client'

// The frame of every "get into my book" screen (/login, /enter): the sales
// site's look (cream paper, navy ink, one blue accent, Heebo) so the customer
// does not feel the shop and the app are two different places. No site nav:
// this is a funnel page, and the only goal is the next tap.

import { Heebo } from 'next/font/google'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '600', '700', '800', '900'] })

export const AUTH = {
    ink: '#14183A',
    accent: '#2545E0',
    paper: '#F3F0EA',
    line: '#DAD6CC',
    muted: '#5A5D75',
}

export default function AuthShell({ children, title, subtitle }) {
    return (
        <div
            dir='rtl'
            className={`${heebo.className} min-h-[100dvh] flex flex-col items-center px-4 pt-8 pb-10`}
            style={{ background: AUTH.paper, color: AUTH.ink }}
        >
            <a href='https://weddingtales.co.il' aria-label='Wedding Tales' className='mb-7 select-none text-[22px] leading-none no-underline' style={{ color: AUTH.ink }}>
                <b className='font-black'>Wedding</b> Tales
            </a>
            <main
                className='w-full max-w-[420px] rounded-[26px] bg-white px-6 py-7 sm:px-8'
                style={{ boxShadow: '0 1px 2px rgba(20,24,58,.06), 0 24px 44px -28px rgba(20,24,58,.45)' }}
            >
                {title && <h1 className='m-0 text-[26px] font-extrabold leading-tight'>{title}</h1>}
                {subtitle && <p className='mt-2 mb-0 text-[15.5px] leading-relaxed' style={{ color: AUTH.muted }}>{subtitle}</p>}
                <div className={title || subtitle ? 'mt-6' : ''}>{children}</div>
            </main>
            <p className='mt-6 max-w-[420px] text-center text-[13.5px] leading-relaxed' style={{ color: AUTH.muted }}>
                בעיה בכניסה?{' '}
                <a href='https://wa.me/972515350253' target='_blank' rel='noopener noreferrer' className='font-bold underline underline-offset-4' style={{ color: AUTH.ink }}>
                    כתבו לנו בוואטסאפ
                </a>
            </p>
        </div>
    )
}

export const fieldCls =
    'w-full rounded-[14px] border bg-white px-4 py-3.5 text-[16px] font-medium outline-none transition-shadow placeholder:text-[#9A9DB0] focus:shadow-[0_0_0_3px_rgba(37,69,224,.18)]'

export const primaryBtnCls =
    'flex w-full items-center justify-center rounded-[14px] px-6 py-4 text-[17px] font-extrabold text-white transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60'

export const primaryBtnStyle = {
    background: 'linear-gradient(180deg,#252C68 0%,#171C47 48%,#101433 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22), 0 14px 26px -14px rgba(28,40,120,.62)',
}
