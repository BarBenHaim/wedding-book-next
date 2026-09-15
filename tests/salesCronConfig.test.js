import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('sales follow-up schedule', () => {
    it('runs morning and evening so the first nudge stays inside the WhatsApp service window', () => {
        const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
        const followups = config.crons.filter(row => row.path === '/api/sales-agent/followups')

        expect(followups).toEqual([
            { path: '/api/sales-agent/followups', schedule: '30 7 * * *' },
            { path: '/api/sales-agent/followups', schedule: '30 17 * * *' },
        ])
    })

    it('checks owner revenue status morning and evening using Hobby-compatible daily cron expressions', () => {
        const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
        const ownerStatus = config.crons.filter(row => row.path === '/api/cron/sales-model-status')

        expect(ownerStatus).toEqual([
            { path: '/api/cron/sales-model-status', schedule: '15 8 * * *' },
            { path: '/api/cron/sales-model-status', schedule: '15 18 * * *' },
        ])
        expect(ownerStatus.every(row => !row.schedule.includes('*/'))).toBe(true)
    })
})
