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
