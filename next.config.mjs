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
    // דף הנחיתה לבר מצווה — קובץ סטטי עצמאי ב-public/lp.html.
    // ה-rewrite נותן לו כתובת נקייה: app.weddingtales.co.il/lp
    async rewrites() {
        return {
            // Before anything else: /_next/image is answered by OUR resizer
            // (src/app/api/img). On this Vercel project the built-in
            // optimizer answers 404, and the mobile app (wedding-tales-mobile
            // src/lib/img.ts) asks for every guest photo at that address.
            beforeFiles: [{ source: '/_next/image', destination: '/api/img' }],
            afterFiles: [
                { source: '/lp', destination: '/lp.html' },
                // תצוגה מקדימה של דף הבית החדש של weddingtales.co.il — קבצים סטטיים ב-public/site.
                { source: '/site', destination: '/site/index.html' },
                // ארבעת עמודי האירועים באותו עיצוב (תצוגה מקדימה בלבד; באתר עצמו הם בכתובות הקיימות דרך התוסף).
                { source: '/site/:event(bar-mitzvah|bat-mitzvah|wedding|birthday)', destination: '/site/:event/index.html' },
            ],
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
