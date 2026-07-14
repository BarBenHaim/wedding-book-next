// Digital-book route loading — the shared brand book loader replaces
// the old bespoke ring spinner, so route-level and in-page loading
// look identical (no loader-swap flash when the page code lands).
import BookLoader from '@/components/BookLoader/BookLoader'

export default function BookLoading() {
    return <BookLoader label='טוען את הספר שלכם' />
}
