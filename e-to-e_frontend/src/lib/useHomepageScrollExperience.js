import { useLayoutEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { isLowPowerDevice, prefersReducedMotion } from './motionPreferences'

gsap.registerPlugin(ScrollTrigger)

export function useHomepageScrollExperience(mainRef) {
    useLayoutEffect(() => {
        const main = mainRef.current
        if (!main || prefersReducedMotion()) return undefined

        const ctx = gsap.context(() => {
            const contentTargets = Array.from(
                main.querySelectorAll(':scope > section:not(.hero) > .container')
            )
            const footerContent = main.nextElementSibling?.querySelector('.footer__inner')
            if (footerContent) contentTargets.push(footerContent)

            contentTargets.forEach((content) => {
                const section = content.closest('section, footer')
                if (!section) return

                const supportsCircleClip = typeof CSS !== 'undefined'
                    && CSS.supports('clip-path', 'circle(10% at 50% 50%)')
                if (isLowPowerDevice() || !supportsCircleClip) {
                    gsap.fromTo(content,
                        { y: 14, autoAlpha: 0.82 },
                        {
                            y: 0,
                            autoAlpha: 1,
                            ease: 'none',
                            scrollTrigger: {
                                trigger: section,
                                start: 'top 90%',
                                end: 'top 48%',
                                scrub: 0.6,
                            },
                        }
                    )
                    return
                }

                gsap.fromTo(content,
                    { clipPath: 'circle(0% at 50% 12%)' },
                    {
                        clipPath: 'circle(160% at 50% 12%)',
                        ease: 'none',
                        scrollTrigger: {
                            trigger: section,
                            start: 'top 90%',
                            end: 'top 42%',
                            scrub: 0.75,
                        },
                    }
                )
            })
        }, main)

        return () => ctx.revert()
    }, [mainRef])
}
