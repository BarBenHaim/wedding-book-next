'use client'

export default function BookPageDownloadButton({ onClick, disabled, busy, label, busyLabel }) {
    const stop = event => event.stopPropagation()
    return (
        <button
            type='button'
            data-page-download
            aria-disabled={disabled || undefined}
            aria-busy={busy || undefined}
            aria-label={label}
            onPointerDownCapture={stop}
            onMouseDownCapture={stop}
            onMouseUpCapture={stop}
            onTouchStartCapture={stop}
            onTouchEndCapture={stop}
            onPointerDown={stop}
            onMouseDown={stop}
            onMouseUp={stop}
            onTouchStart={stop}
            onTouchEnd={stop}
            onKeyDown={stop}
            onKeyUp={stop}
            onClick={event => { event.stopPropagation(); if (!disabled) onClick() }}
            style={disabled ? { opacity: 0.6, cursor: 'wait' } : undefined}
            className='absolute bottom-2 left-2 z-[31] flex min-h-11 min-w-11 items-center gap-1 rounded-lg border border-[#ead9b3] bg-white/95 px-3 py-2 text-[12px] font-bold text-[#7a6a52] shadow-sm hover:bg-[#fbf6ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a6a52]'
        >
            <svg style={{ pointerEvents: 'none' }} aria-hidden='true' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5' />
            </svg>
            {busy ? busyLabel : label}
        </button>
    )
}
