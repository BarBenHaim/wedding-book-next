// Each kind of celebration has its own design world: its painting and colours.
// The values live in components/Hall/worlds.css; this only says which one.

export const WORLDS = ['jerusalem', 'wedding', 'batmitzvah', 'birthday']

const BY_TYPE = {
    wedding: 'wedding',
    bat_mitzvah: 'batmitzvah',
    birthday: 'birthday',
    poker: 'birthday',
    bar_mitzvah: 'jerusalem',
    twins_bar_mitzvah: 'jerusalem',
}

export function worldFor(eventType) {
    return BY_TYPE[eventType] || 'jerusalem'
}

// For an event document. Events from before event kinds were recorded are
// weddings when they carry a couple's names. Null until the event is read.
export function worldOfEvent(event) {
    if (!event) return null
    if (event.eventType) return worldFor(event.eventType)
    const couple = event.brideName || event.brideNameHe || event.groomName || event.groomNameHe
    return couple ? 'wedding' : 'jerusalem'
}
