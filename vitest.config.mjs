import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest config for wedding-book.
//
// Scope: pure-JS unit tests of /src/lib utilities + i18n parity. We
// don't load Next, React, or any browser globals here — that's by
// design. Component tests would need a heavier setup (jsdom, RTL)
// and aren't pulling weight yet at the current scale.

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(process.cwd(), 'src'),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.{test,spec}.{js,mjs}'],
        reporters: 'default',
    },
})
