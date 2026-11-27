'use client'

// The frame of every "get into my book" screen (/login, /enter), in the house
// design: a Jerusalem evening over parchment, navy and gold. No site nav:
// this is a funnel page, and the only goal is the next tap.

import { Heebo, Noto_Serif_Hebrew } from 'next/font/google'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '600', '700', '800', '900'] })
const serif = Noto_Serif_Hebrew({ subsets: ['hebrew', 'latin'], weight: ['800', '900'], display: 'swap', preload: false })

export const AUTH = {
    ink: '#1d1648',
    accent: '#52247f',
    paper: '#f3e2bd',
    line: '#c9a460',
    muted: '#4f4668',
}

export default function AuthShell({ children, title, subtitle }) {
    return (
        <div
            dir='rtl'
            className={`${heebo.className} relative isolate min-h-[100dvh] flex flex-col items-center px-4 pt-9 pb-10`}
            style={{ background: `${AUTH.paper} url('/admin-theme/parchment.webp') repeat`, color: AUTH.ink }}
        >
            <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-[330px]'
                style={{
                    background: "url('/admin-theme/hero.webp') center bottom / cover no-repeat",
                    WebkitMaskImage: 'linear-gradient(180deg, #000 60%, transparent)',
                    maskImage: 'linear-gradient(180deg, #000 60%, transparent)',
                }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src='/admin-theme/olive.webp' alt='' aria-hidden='true' className='pointer-events-none fixed -left-6 bottom-2 hidden w-[200px] -rotate-12 lg:block' />
            <a href='https://weddingtales.co.il' aria-label='Wedding Tales' className='mb-10 block select-none no-underline'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src='/brand/logo-on-dark.png' alt='Wedding Tales' width='278' height='46' className='block h-[46px] w-auto drop-shadow-[0_3px_8px_rgba(8,3,35,.8)]' />
            </a>
            {/* the silver frame of the admin's "today" screen, drawn from its art */}
            <main className='relative isolate w-full max-w-[440px] px-7 py-8 sm:px-10'>
                <div
                    aria-hidden='true'
                    className='pointer-events-none absolute -inset-1 -z-10'
                    style={{ border: 'solid transparent', borderWidth: '44px 54px', borderImage: "url('/admin-theme/frame.webp') 150 185 fill stretch", filter: 'drop-shadow(0 16px 22px rgba(75,38,15,.38))' }}
                />
                {title && <h1 className='m-0 text-center text-[29px] font-black leading-tight' style={{ fontFamily: serif.style.fontFamily }}>{title}</h1>}
                {title && <div aria-hidden='true' className='mx-auto mt-1 h-[22px] w-[210px]' style={{ background: "url('/admin-theme/divider.webp') center / contain no-repeat" }} />}
                {subtitle && <p className='mt-2 mb-0 text-center text-[15.5px] leading-relaxed' style={{ color: AUTH.muted }}>{subtitle}</p>}
                <div className={title || subtitle ? 'mt-5' : ''}>{children}</div>
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
    'w-full rounded-[14px] border bg-[#fffaf0] px-4 py-3.5 text-[16px] font-medium outline-none transition-shadow placeholder:text-[#8d84a0] focus:shadow-[0_0_0_3px_rgba(82,36,127,.22)]'

export const primaryBtnCls =
    'flex w-full items-center justify-center rounded-[14px] px-6 py-4 text-[17px] font-extrabold text-white transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60'

export const primaryBtnStyle = {
    color: '#fff3d8',
    border: '2px solid #d9b265',
    background: 'linear-gradient(180deg,#2c2473 0%,#171049 58%,#1f1860 100%)',
    boxShadow: '0 0 0 1px #86621f, inset 0 0 0 1px rgba(255,229,170,.3), 0 14px 26px -14px rgba(30,16,66,.65)',
}
