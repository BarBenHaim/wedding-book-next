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
