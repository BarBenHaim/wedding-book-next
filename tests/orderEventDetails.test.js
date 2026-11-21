import { describe, it, expect } from 'vitest'
import { orderEventDetails } from '../src/lib/orderEventDetails'

const order = meta => ({ id: 1, meta_data: Object.entries(meta).map(([key, value]) => ({ key, value })) })

describe('orderEventDetails', () => {
    it('an order without the sales-page meta changes nothing', () => {
        expect(orderEventDetails({ id: 1 })).toEqual({ fields: {}, value: null, deposit: null })
        expect(orderEventDetails(order({ something: 'else' })).fields).toEqual({})
    })
    it('a bar mitzvah from the builder becomes a ready event', () => {
        const d = orderEventDetails(order({ wt_event: 'bar', wt_name1: '  נועם ', wt_date: '2027-01-14', wt_style: 'marble' }))
        expect(d.fields).toMatchObject({ eventType: 'bar_mitzvah', celebrantName: 'נועם', weddingDate: '2027-01-14', salesStyle: 'marble', locale: 'he' })
        expect(d.fields.themeColor).toBeTruthy()
        expect(d.value.celebrantName).toBe('נועם')
    })
    it('a wedding keeps both names, and a bad date is dropped', () => {
        const d = orderEventDetails(order({ wt_event: 'wedding', wt_name1: 'מיטל', wt_name2: 'בר', wt_date: '14/01/2027' }))
        expect(d.fields).toMatchObject({ eventType: 'wedding', brideName: 'מיטל', groomName: 'בר' })
        expect(d.fields.weddingDate).toBeUndefined()
    })
    it('the event type alone is enough; missing names are simply not written', () => {
        const d = orderEventDetails(order({ wt_event: 'birthday' }))
        expect(d.fields.eventType).toBe('birthday')
        expect('celebrantName' in d.fields).toBe(false)
    })
    it('an unknown event type is ignored', () => {
        expect(orderEventDetails(order({ wt_event: 'poker', wt_name1: 'x' })).fields).toEqual({})
    })
    it('a deposit order records what is still owed', () => {
        const d = orderEventDetails(order({ wt_deposit: '1', wt_balance_due: '800', wt_event: 'bat', wt_name1: 'ליאל' }))
        expect(d.deposit).toEqual({ balanceDue: 800 })
        expect(d.fields).toMatchObject({ paymentStage: 'deposit', balanceDue: 800, eventType: 'bat_mitzvah' })
    })
    it('the checkout date field is used when the builder gave none', () => {
        expect(orderEventDetails(order({ wt_event: 'bar', wt_name1: 'א', event_date: '2027-03-02' })).fields.weddingDate).toBe('2027-03-02')
    })
})
