// src/lib/salesAgent/eventType.js
//
// One reader for "which event is this", shared by the scripted opening
// and the decision policy. It used to live inside openingExperiment.js,
// which meant the model was the only thing turning "בר מצווה" into a
// fact once the opening was over, and the model missed it often enough
// that the bot asked again.

export function eventTypeOf(text) {
    const value = String(text || '')
    if (/הנצחה|אזכרה|לזכר|memorial|bereavement/i.test(value)) return 'memorial'
    if (/בר\s*מצו[וה]|בר\s*מצוו?ה|בר\s*מיצווה|bar\s*mitzva/i.test(value)) return 'bar_mitzvah'
    if (/בת\s*מצו[וה]|בת\s*מצוו?ה|בת\s*מיצווה|bat\s*mitzva/i.test(value)) return 'bat_mitzvah'
    if (/חתונ|חופה|wedding/i.test(value)) return 'wedding'
    if (/ברית|בריתה/i.test(value)) return 'brit'
    if (/יום\s*הולדת|יומולדת|birthday/i.test(value)) return 'birthday'
    return null
}

// How the bot names the event back to the customer, in one or two words.
export const EVENT_HE = Object.freeze({
    bar_mitzvah: 'בר מצווה',
    bat_mitzvah: 'בת מצווה',
    wedding: 'חתונה',
    brit: 'ברית',
    birthday: 'יום הולדת',
    memorial: 'הנצחה',
    other: 'אירוע',
})

export default eventTypeOf
