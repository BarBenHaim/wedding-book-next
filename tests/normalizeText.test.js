import { describe, it, expect } from 'vitest'
import { normalizeBlessing } from '../src/lib/normalizeText.js'

// normalizeBlessing is on the hot path — every guest blessing goes
// through it before being persisted to Firestore. Whitespace handling
// drives whether the book page layout overflows, so the contract
// here is load-bearing.

describe('normalizeBlessing', () => {
    it('returns empty string for nullish or non-string input', () => {
        expect(normalizeBlessing(null)).toBe('')
        expect(normalizeBlessing(undefined)).toBe('')
        expect(normalizeBlessing('')).toBe('')
        expect(normalizeBlessing(123)).toBe('')
        expect(normalizeBlessing({})).toBe('')
    })

    it('collapses every whitespace run (newlines, tabs, multi-space) to a single space', () => {
        expect(normalizeBlessing('שלום   עולם')).toBe('שלום עולם')
        expect(normalizeBlessing('שלום\n\n\nעולם')).toBe('שלום עולם')
        expect(normalizeBlessing('שלום\tעולם')).toBe('שלום עולם')
        expect(normalizeBlessing('שלום \n \t עולם')).toBe('שלום עולם')
    })

    it('trims leading and trailing whitespace', () => {
        expect(normalizeBlessing('   שלום   ')).toBe('שלום')
        expect(normalizeBlessing('\nשלום\n')).toBe('שלום')
    })

    it('flattens NBSP and other exotic spaces just like ordinary whitespace', () => {
        // U+00A0 NO-BREAK SPACE — mobile keyboards sometimes insert this.
        expect(normalizeBlessing('שלום  עולם')).toBe('שלום עולם')
    })

    it('is idempotent — running it again on already-normalised text is a no-op', () => {
        const once = normalizeBlessing('  שלום   עולם  ')
        const twice = normalizeBlessing(once)
        expect(twice).toBe(once)
    })

    it('preserves single-space text unchanged', () => {
        expect(normalizeBlessing('a single line of text')).toBe('a single line of text')
    })
})
