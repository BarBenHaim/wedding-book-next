import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('sales follow-up schedule', () => {
    it('uses two Hobby-compatible daily runs that keep a same-day-scheduled lead inside the service window', () => {
        const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
        const followups = config.crons.filter(row => row.path === '/api/sales-agent/followups')

        // Hobby crons fire anywhere inside a one-hour window after the
        // scheduled minute. 17:30 UTC is 20:30 in Israel, so a late fire
        // landed after the 21:00 sendable cutoff and the evening run sent
        // nothing (20.9: ten same-day leads, zero follow-ups). 15:30 UTC
        // is 18:30 in summer and 17:30 in winter, with the whole window
        // inside sending hours either way.
        expect(followups).toEqual([
            { path: '/api/sales-agent/followups', schedule: '30 7 * * *' },
            { path: '/api/sales-agent/followups', schedule: '30 15 * * *' },
        ])
        expect(followups.every(row => !row.schedule.includes('*/'))).toBe(true)
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
