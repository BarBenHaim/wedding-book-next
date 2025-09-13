export function requestFullscreenForBody() {
    const elem = document.documentElement
    const anyElem = elem
    if (elem.requestFullscreen) return elem.requestFullscreen()
    if (anyElem.webkitRequestFullscreen) return anyElem.webkitRequestFullscreen()
    if (anyElem.msRequestFullscreen) return anyElem.msRequestFullscreen()
}

export function preventAccidentalNavigation() {
    const handler = e => {
        e.preventDefault()
        e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
}

export function preventBackNavigation() {
    const push = () => history.pushState(null, '', location.href)
    push()
    const handler = () => setTimeout(push, 0)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
}
