// Photo route loading — most-trafficked segment in the app (every
// guest who scans the QR lands here). Shows the brand's book loader
// (gold-bound book, turning pages) on the ink stage.
import BookLoader from '@/components/BookLoader/BookLoader'

export default function PhotoLoading() {
    return <BookLoader label='עוד רגע…' />
}
