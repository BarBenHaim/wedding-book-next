'use client'

// A screen that knows its event says which world it is in; the whole page,
// site bar included, takes that world's painting and colours until it leaves.

import { useEffect } from 'react'

export default function useWorld(world) {
    useEffect(() => {
        if (!world) return undefined
        const root = document.documentElement
        root.dataset.world = world
        return () => { delete root.dataset.world }
    }, [world])
}
