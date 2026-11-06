export function prefersReducedMotion() {
    return typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isLowPowerDevice() {
    return typeof navigator !== 'undefined'
        && Number.isFinite(navigator.hardwareConcurrency)
        && navigator.hardwareConcurrency > 0
        && navigator.hardwareConcurrency <= 4
}

export function shouldSimplifyMotion() {
    return prefersReducedMotion() || isLowPowerDevice()
}
