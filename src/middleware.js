import { NextResponse } from 'next/server'

export function middleware(req) {
    const url = req.nextUrl

    if (url.pathname.startsWith('/api/entries')) {
        url.pathname = url.pathname.replace('/api', '/_api')
        return NextResponse.rewrite(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/api/entries/:path*'],
}
