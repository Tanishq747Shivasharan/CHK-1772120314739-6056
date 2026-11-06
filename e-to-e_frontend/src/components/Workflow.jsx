import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { shouldSimplifyMotion } from '../lib/motionPreferences'
import './Workflow.css'

gsap.registerPlugin(ScrollTrigger)

const steps = [
    {
        id: 'donor',
        label: 'Donor',
        description: 'Surplus food identified and listed for rescue',
        icon: (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 16H22M10 20H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="16" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        ),
    },
    {
        id: 'platform',
        label: 'Platform',
        description: 'Smart matching and logistics coordination',
        icon: (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 10H21M11 14H21M11 18H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="21" cy="22" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M23 24L25 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: 'ngo',
        label: 'NGO',
        description: 'Verified organizations accept and coordinate',
        icon: (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L4 12V28H28V12L16 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M12 28V20H20V28" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="16" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        ),
    },
    {
        id: 'volunteer',
        label: 'Volunteer',
        description: 'Last-mile delivery to communities in need',
        icon: (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 26C8 22 11.5 18 16 18C20.5 18 24 22 24 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M20 14L24 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: 'beneficiary',
        label: 'Beneficiary',
        description: 'Nutritious meals reach those who need them most',
        icon: (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M14 6C14 6 8 10 8 16C8 22 14 26 16 26C18 26 24 22 24 16C24 10 18 6 18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 12V20M12 16H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
    },
]

const Workflow = () => {
    const sectionRef = useRef(null)
    const stepsRef = useRef([])
    const linesRef = useRef([])

    useEffect(() => {
        if (shouldSimplifyMotion()) return undefined

        const mountedSteps = stepsRef.current
        const mountedConnectors = linesRef.current
        const ctx = gsap.context(() => {
            // Title animation
            gsap.from('.workflow__label, .workflow__title, .workflow__subtitle', {
                y: 40,
                opacity: 0,
                duration: 0.8,
                stagger: 0.15,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: 'top 80%',
                    toggleActions: 'play none none reverse',
                },
            })

            // Steps from left with stagger
            mountedSteps.forEach((step, i) => {
                if (!step) return
                gsap.from(step, {
                    y: 50,
                    opacity: 0,
                    duration: 0.7,
                    delay: i * 0.15,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        start: 'top 60%',
                        toggleActions: 'play none none reverse',
                    },
                })
            })

            const progress = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: 'top 72%',
                    end: 'bottom 32%',
                    scrub: 0.8,
                },
            })

            mountedSteps.forEach((step, i) => {
                if (!step) return
                const icon = step.querySelector('.workflow__step-icon')
                const position = i * 0.24
                if (icon) {
                    progress.to(icon, {
                        scale: 1.08,
                        backgroundColor: '#443c3c',
                        color: '#ffffff',
                        duration: 0.12,
                        ease: 'none',
                    }, position)
                    progress.to(icon, {
                        scale: 1,
                        backgroundColor: '#d4ccca',
                        color: '#443c3c',
                        duration: 0.12,
                        ease: 'none',
                    }, position + 0.12)
                }
                const connector = mountedConnectors[i]
                if (connector) {
                    progress.fromTo(connector,
                        { scaleX: 0, transformOrigin: 'left center' },
                        { scaleX: 1, duration: 0.18, ease: 'none' },
                        position + 0.12
                    )
                }
            })

            const syncActiveStep = () => {
                const index = Math.min(mountedSteps.length - 1, Math.floor(progress.progress() * mountedSteps.length))
                mountedSteps.forEach((step, stepIndex) => step?.classList.toggle('is-active', stepIndex === index))
            }
            progress.eventCallback('onUpdate', syncActiveStep)
            progress.eventCallback('onComplete', syncActiveStep)
            progress.eventCallback('onReverseComplete', syncActiveStep)
        }, sectionRef)

        return () => {
            mountedSteps.forEach((step) => step?.classList.remove('is-active'))
            ctx.revert()
        }
    }, [])

    return (
        <section ref={sectionRef} className="workflow section section--white" id="workflow">
            <div className="container">
                <div className="text-center">
                    <span className="section__label workflow__label">How It Works</span>
                    <h2 className="section__title workflow__title">From Surplus to Sustenance</h2>
                    <p className="section__subtitle workflow__subtitle mx-auto">
                        A seamless journey from excess to impact — tracked, verified, and transparent.
                    </p>
                </div>

                <div className="workflow__flow">
                    {steps.map((step, i) => (
                        <div key={step.id} className="workflow__step-wrapper">
                            <div
                                className="workflow__step"
                                ref={(el) => (stepsRef.current[i] = el)}
                                id={`workflow-${step.id}`}
                            >
                                <div className="workflow__step-icon">{step.icon}</div>
                                <h3 className="workflow__step-label">{step.label}</h3>
                                <p className="workflow__step-desc">{step.description}</p>
                            </div>
                            {i < steps.length - 1 && (
                                <div
                                    className="workflow__connector"
                                    ref={(el) => (linesRef.current[i] = el)}
                                >
                                    <svg width="100%" height="2" viewBox="0 0 100 2" preserveAspectRatio="none">
                                        <line x1="0" y1="1" x2="100" y2="1" stroke="var(--swiss-coffee)" strokeWidth="2" strokeDasharray="6 4" />
                                    </svg>
                                    <div className="workflow__connector-dot"></div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default Workflow
