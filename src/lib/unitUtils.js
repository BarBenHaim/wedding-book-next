export const BASE_SIZE = 2362

// מקבל viewerSize (הגודל של הספר במסך)
// מחזיר פונקציה שממירה ערכי פיקסל אמיתיים לגודל viewer
export function makeScale(viewerSize) {
    return value => (value / BASE_SIZE) * viewerSize
}
