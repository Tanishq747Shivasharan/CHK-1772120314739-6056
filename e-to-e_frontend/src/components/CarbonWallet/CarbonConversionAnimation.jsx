import { useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'
import './carbonWallet.css'

/**
 * CarbonConversionAnimation
 *
 * Cinematic 5-step sequence: dim → dissolve → coin form → transfer → settle.
 * Trigger only when `trigger` transitions true→false→true (edge-detected externally).
 *
 * @param {boolean} trigger   - Set to true once to fire the animation sequence.
 * @param {function} onComplete - Called when sequence finishes (to reset trigger).
 */
export default function CarbonConversionAnimation({ trigger, onComplete }) {
    const overlayRef = useRef(null)
    const particleRef = useRef(null)
    const coinRef = useRef(null)
    const tlRef = useRef(null)
    const hasRun = useRef(false)

    // Respect reduced-motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const runSequence = useCallback(() => {
        if (hasRun.current || prefersReduced) {
            if (prefersReduced && onComplete) onComplete()
            return
        }
        hasRun.current = true

        const overlay = overlayRef.current
        const particles = particleRef.current
        const coin = coinRef.current
        if (!overlay || !particles || !coin) return

        // Kill any dangling tween
        if (tlRef.current) tlRef.current.kill()

        // Spawn particle elements
        particles.innerHTML = ''
        const NUM_PARTICLES = 18
        for (let i = 0; i < NUM_PARTICLES; i++) {
            const p = document.createElement('span')
            p.className = 'cca-particle'
            particles.appendChild(p)
        }
        const dots = particles.querySelectorAll('.cca-particle')

        const tl = gsap.timeline({
            defaults: { ease: 'cubic-bezier(0.16, 1, 0.3, 1)' },
            onComplete: () => {
                // Quietly clean up
                gsap.set(overlay, { autoAlpha: 0 })
                gsap.set(coin, { autoAlpha: 0 })
                gsap.set(particles, { autoAlpha: 0 })
                particles.innerHTML = ''
                hasRun.current = false
                if (onComplete) onComplete()
            },
        })
        tlRef.current = tl

        /* ─── Step 1 — Dim overlay appears ─── */
        tl.set([overlay, particles, coin], { autoAlpha: 0 })
        tl.to(overlay, { autoAlpha: 1, duration: 0.3 })

        /* ─── Step 2 — Particles scatter from centre ─── */
        tl.set(particles, { autoAlpha: 1 })
        tl.fromTo(
            dots,
            {
                x: 0,
                y: 0,
                scale: 1,
                opacity: 1,
            },
            {
                x: () => (Math.random() - 0.5) * 260,
                y: () => (Math.random() - 0.5) * 260,
                scale: () => 0.3 + Math.random() * 0.7,
                opacity: 0.8,
                duration: 0.5,
                stagger: { each: 0.02, from: 'center' },
            },
            '<'
        )

        /* ─── Step 3 — Particles converge → coin forms ─── */
        tl.to(
            dots,
            {
                x: 0,
                y: 0,
                scale: 0,
                opacity: 0,
                duration: 0.7,
                stagger: { each: 0.02, from: 'random' },
                ease: 'power3.in',
            },
            '+=0.1'
        )

        // Coin materialises
        tl.set(coin, { autoAlpha: 1, rotateY: -90, scale: 0.4 })
        tl.to(
            coin,
            {
                rotateY: 0,
                scale: 1,
                duration: 1.2,
                ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
            },
            '-=0.3'
        )

        /* ─── Step 4 — Coin glides to credit card ─── */
        tl.to(
            coin,
            {
                y: 80,
                x: 60,
                scale: 0.5,
                duration: 0.6,
                ease: 'power3.in',
            },
            '+=0.4'
        )
        tl.to(coin, { autoAlpha: 0, duration: 0.25 }, '-=0.2')

        /* ─── Step 5 — Overlay dissolves ─── */
        tl.to(overlay, { autoAlpha: 0, duration: 0.4 })
    }, [onComplete, prefersReduced])

    useEffect(() => {
        if (trigger) runSequence()
    }, [trigger, runSequence])

    return (
        <div
            ref={overlayRef}
            className="cca-overlay"
            aria-hidden="true"
            style={{ opacity: 0, visibility: 'hidden' }}
        >
            {/* Particle field */}
            <div ref={particleRef} className="cca-particles" />

            {/* Gold coin */}
            <div ref={coinRef} className="cca-coin" style={{ opacity: 0, visibility: 'hidden' }}>
                <span className="cca-coin__label">1 CC</span>
            </div>
        </div>
    )
}
