// src/lib/orderEventDetails.js — pure: reads a WooCommerce order payload, no Firebase, no Next.
import { validateNewEvent } from './onboarding'

// What the buyer already chose on the sales page. The WordPress plugin
// copies the builder's choices onto the order as plain meta (wt_event,
// wt_name1, wt_name2, wt_date, wt_style) and marks a deposit order
// (wt_deposit, wt_balance_due). With these the event is ready the moment
// the payment lands: right type, right names, a working guest link —
// nobody has to set it up by hand. Orders without them (old links, the
// WhatsApp flow) behave exactly as before.
const SALES_EVENT_TYPES = { bar: 'bar_mitzvah', bat: 'bat_mitzvah', wedding: 'wedding', birthday: 'birthday' }

export function orderEventDetails(order) {
    const meta = Array.isArray(order?.meta_data) ? order.meta_data : []
    const get = (...keys) => {
        for (const k of keys) {
            const m = meta.find(x => x && x.key === k)
            if (m && (typeof m.value === 'string' || typeof m.value === 'number')) {
                const v = String(m.value).trim()
                if (v) return v
            }
        }
        return ''
    }
    const out = { fields: {}, value: null, deposit: null }
    if (get('wt_deposit') === '1') {
        const due = Number(get('wt_balance_due'))
        out.deposit = { balanceDue: Number.isFinite(due) && due > 0 ? due : null }
        out.fields.paymentStage = 'deposit'
        if (out.deposit.balanceDue) out.fields.balanceDue = out.deposit.balanceDue
    }
    // Who sent this buyer: the event whose guest page led them here (wt_ref), and the campaign source
    // (wt_src, e.g. guest_thanks or meta). Kept on the event so guest-sourced deposits can be counted.
    const ref = get('wt_ref')
    if (/^[A-Za-z0-9_-]{1,64}$/.test(ref)) out.fields.referredBy = ref
    const src = get('wt_src')
    if (/^[a-z0-9_]{1,30}$/.test(src)) out.fields.acquisitionSource = src
    const eventType = SALES_EVENT_TYPES[get('wt_event')] || ''
    if (!eventType) return out
    const date = get('wt_date', 'event_date', 'billing_event_date')
    const input = { eventType, weddingDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined }
    if (eventType === 'wedding') {
        input.brideName = get('wt_name1')
        input.groomName = get('wt_name2')
    } else {
        input.celebrantName = get('wt_name1')
    }
    const { value } = validateNewEvent(input)
    out.fields.eventType = value.eventType
    out.fields.themeColor = value.themeColor
    out.fields.locale = 'he'
    if (value.brideName) out.fields.brideName = value.brideName
    if (value.groomName) out.fields.groomName = value.groomName
    if (value.celebrantName) out.fields.celebrantName = value.celebrantName
    if (value.weddingDate) out.fields.weddingDate = value.weddingDate
    const style = get('wt_style')
    if (style) out.fields.salesStyle = style.slice(0, 40)
    out.value = value
    return out
}

// One plain meta value of an order, trimmed; '' when it is not there.
export function orderMeta(order, key) {
    const meta = Array.isArray(order?.meta_data) ? order.meta_data : []
    const m = meta.find(x => x && x.key === key)
    return m && (typeof m.value === 'string' || typeof m.value === 'number') ? String(m.value).trim() : ''
}

// A balance order pays the rest of a deposit for an event that already exists
// (wt_balance_for = that event's id). It must not open a second event.
export function balanceTarget(order) {
    const id = orderMeta(order, 'wt_balance_for')
    return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : ''
}
