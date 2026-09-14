import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('sales follow-up schedule', () => {
    it('runs morning and evening so the first nudge stays inside the WhatsApp service window', () => {
        const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
        const followups = config.crons.find(row => row.path === '/api/sales-agent/followups')

        expect(followups).toEqual({
            path: '/api/sales-agent/followups',
            schedule: '30 7,17 * * *',
        })
    })
})
