/** @type {import('next').NextConfig} */
const nextConfig = {
    // Don't fail production builds on ESLint warnings.
    // Next 15.5+ treats warnings as build failures, but our remaining
    // warnings are pre-existing (`<img>` tags + stable react-hook deps)
    // and would require a focused cleanup pass to remove. Keep them
    // surfacing during local `npm run lint`, just don't block deploys.
    eslint: {
        ignoreDuringBuilds: true,
    },
    // The front door is the sales site (weddingtales.co.il). The old marketing pages that
    // used to live on this domain (the home page, /lp, /bar-mitzvah, /landing, /demo,
    // /survey, the /site and /site2 previews) sold the old full-price offer and are gone;
    // only the pages redirect: /site2/assets/img/og.jpg stays, because the sales site's
    // link preview (og:image) still points at it, and it now shows the new logo;
    // every old link, ad and WhatsApp message lands on the sales site instead. Not
    // permanent (307), so any of them can be brought back without a cached redirect.
    // /portal (look an event up by phone number) is gone too: signing in is /login.
    async redirects() {
        const SALES = 'https://weddingtales.co.il'
        const gone = ['/', '/landing', '/lp', '/bar-mitzvah', '/demo', '/survey', '/site', '/site2']
        return [
            ...gone.map(source => ({ source, destination: SALES, permanent: false })),
            { source: '/portal', destination: '/login', permanent: false },
            // The old sign-up page only forwarded to the wizard.
            { source: '/register', destination: '/start', permanent: false },
        ]
    },
    async rewrites() {
        return {
            // Before anything else: /_next/image is answered by OUR resizer
            // (src/app/api/img). On this Vercel project the built-in
            // optimizer answers 404, and the mobile app (wedding-tales-mobile
            // src/lib/img.ts) asks for every guest photo at that address.
            beforeFiles: [{ source: '/_next/image', destination: '/api/img' }],
            afterFiles: [],
            fallback: [],
        };
    },
    // Kept in step with src/lib/imgProxy.js (ALLOWED_HOSTS), which is what
    // actually serves /_next/image now — see the rewrite above. Firebase
    // Storage hosts the uploads; our own domain covers /api/book-photo
    // proxy URLs passed absolutely.
    images: {
        qualities: [72, 75],
        remotePatterns: [
            { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
            { protocol: 'https', hostname: 'app.weddingtales.co.il' },
        ],
    },
    // Bundle the Hebrew TTF into any serverless function that reads it
    // (src/lib/ogImage.js → /api/og/[weddingId]). On Vercel, files in
    // /public are served via the CDN but NOT auto-included in the
    // Lambda's filesystem — without this, readFileSync('public/fonts/…')
    // throws ENOENT and the OG image render falls back to its catch
    // branch.
    outputFileTracingIncludes: {
        'src/app/api/og/[weddingId]/route': ['./public/fonts/NotoSansHebrew-Regular.ttf'],
    },
    webpack(config) {
        config.module.rules.push({
            test: /\.svg$/i,
            issuer: /\.[jt]sx?$/,
            use: ['@svgr/webpack'],
        })
        return config
    },
}

export default nextConfig
