import { useEffect, useRef, forwardRef, useState } from 'react'
import { gsap } from 'gsap'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    loginUser,
    registerUser,
    createDonorProfile,
    createNGOProfile,
    createOAuthProfile,
    getCurrentUserForSession,
    getDonorProfileForSession,
    getNGOProfileForSession,
} from '../lib/api'
import { verifyDonor, verifyNGO } from '../lib/adminApi'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import StepIndicator from './auth/StepIndicator'
import RoleSelector from './auth/RoleSelector'
import LocationPicker from './auth/LocationPicker'
import GoogleAuthButton from './auth/GoogleAuthButton'


/* ─── Country Codes Data ─── */
const COUNTRY_CODES = [
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+1', country: 'United States', flag: '🇺🇸' },
    { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
    { code: '+61', country: 'Australia', flag: '🇦🇺' },
    { code: '+81', country: 'Japan', flag: '🇯🇵' },
    { code: '+49', country: 'Germany', flag: '🇩🇪' },
    { code: '+33', country: 'France', flag: '🇫🇷' },
    { code: '+86', country: 'China', flag: '🇨🇳' },
    { code: '+971', country: 'UAE', flag: '🇦🇪' },
    { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
    { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+27', country: 'South Africa', flag: '🇿🇦' },
    { code: '+55', country: 'Brazil', flag: '🇧🇷' },
    { code: '+7', country: 'Russia', flag: '🇷🇺' },
]

/* ─── Password Eye Icon SVGs ─── */
const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
)

const EyeOffIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
)

/* ─── Terms & Conditions Modal ─── */
function TermsModal({ onClose, onAccept }) {
    const { t } = useTranslation('forms')
    
    return (
        <div className="auth-terms-overlay">
            <div className="auth-terms-modal">
                <div className="auth-terms-header">
                    <h3>{t('termsAndConditionsTitle')}</h3>
                    <button className="auth-terms-close" onClick={onClose} type="button">×</button>
                </div>
                <div className="auth-terms-content">
                    <p>{t('termsIntro')}</p>
                    <ul>
                        <li>{t('termsFacilitator')}</li>
                        <li>{t('termsSafety')}</li>
                        <li>{t('termsNoGuarantee')}</li>
                        <li>{t('termsLiability')}</li>
                        <li>{t('termsParticipation')}</li>
                    </ul>
                    <p>{t('termsRelease')}</p>
                </div>
                <div className="auth-terms-footer">
                    <button className="auth-terms-accept-btn" onClick={onAccept} type="button">
                        {t('iAccept')}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─────────────────────────────────────────────
   LOGIN FORM
   ───────────────────────────────────────────── */
export const LoginForm = forwardRef(function LoginForm({ onToggle }, ref) {
    const { t } = useTranslation('forms')
    const headingRef = useRef(null)
    const subtitleRef = useRef(null)
    const fieldsRef = useRef(null)
    const btnRef = useRef(null)
    const toggleRef = useRef(null)

    const navigate = useNavigate()
    const location = useLocation()
    const auth = useAuth()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(location.state?.authError || '')

    useEffect(() => {
        // --- GSAP Animations ---
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ delay: 0.5 })
            // Heading
            const chars = headingRef.current?.querySelectorAll('.char')
            if (chars?.length) tl.fromTo(chars, { y: 40, opacity: 0, rotateX: -40 }, { y: 0, opacity: 1, rotateX: 0, duration: 0.8, ease: 'power3.out', stagger: 0.035 }, 0)
            // Subtitle
            tl.fromTo(subtitleRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 0.35)
            // Fields
            const inputs = fieldsRef.current?.children
            if (inputs?.length) tl.fromTo(inputs, { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.1 }, 0.5)
            // Button
            tl.fromTo(btnRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, 0.8)
            // Toggle
            tl.fromTo(toggleRef.current, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.95)
        })

        return () => ctx.revert()
    }, [])

    // Split title text into characters
    const titleChars = t('welcomeBack').split('').map((char, i) => (
        <span className="char" key={i} style={{ display: 'inline-block' }}>
            {char === ' ' ? '\u00A0' : char}
        </span>
    ))

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')

        if (!email || !password) {
            setError(t('pleaseFillAllFields'))
            return
        }

        setLoading(true)
        try {
            const data = await loginUser({ email, password })

            // Sync auth state globally so ProtectedRoute sees the user immediately
            auth.login(data.user, data.session)

            // Redirect based on role
            const role = data.user?.role
            navigate(auth.getDashboardPath(role))
        } catch (err) {
            setError(err.message || t('loginFailed'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-form-block" ref={ref}>
            <h1 className="auth-heading" ref={headingRef}>
                {titleChars}
            </h1>
            <p className="auth-subtitle" ref={subtitleRef}>
                {t('continueYourMission')}
            </p>

            {error && <div className="auth-error-msg">{error}</div>}



            <form onSubmit={handleLogin}>

                <div className="auth-fields" ref={fieldsRef}>
                    <div className="auth-input-group">
                        <label htmlFor="login-email">{t('email')}</label>
                        <input
                            type="email"
                            id="login-email"
                            placeholder={t('emailPlaceholder')}
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <span className="auth-input-line" />
                    </div>

                    <div className="auth-input-group">
                        <label htmlFor="login-password">{t('password')}</label>
                        <div className="auth-password-wrapper">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="login-password"
                                placeholder={t('passwordPlaceholder')}
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="auth-password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                        <span className="auth-input-line" />
                    </div>
                </div>

                <button
                    className={`auth-submit-btn ${loading ? 'auth-submit-btn--loading' : ''}`}
                    ref={btnRef}
                    type="submit"
                    disabled={loading}
                >
                    {loading ? (
                        <span className="auth-btn-spinner" />
                    ) : (
                        t('login')
                    )}
                </button>
            </form>

            <div className="auth-social-divider"><span>or continue with</span></div>
            <GoogleAuthButton onError={setError} disabled={loading} />

            <div className="auth-toggle" ref={toggleRef}>
                {t('dontHaveAccount')}
                <button
                    className="auth-toggle-link"
                    type="button"
                    onClick={onToggle}
                >
                    {t('createOne')}
                </button>
            </div>
        </div>
    )
})

/* ─────────────────────────────────────────────
   REGISTER FORM — Multi-Step
   ───────────────────────────────────────────── */
export const RegisterForm = forwardRef(function RegisterForm(
    { onToggle, oauthOnboarding = false },
    ref
) {
    const { t } = useTranslation('forms')
    const navigate = useNavigate()
    const auth = useAuth()

    /* Step state */
    const [step, setStep] = useState(1) // 1 = common, 2 = role-specific

    /* Step 1 fields */
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [countryCode, setCountryCode] = useState('+91')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [organizationName, setOrganizationName] = useState('')
    const [role, setRole] = useState('donor')

    /* Step 1 — Terms State */
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const [showTerms, setShowTerms] = useState(false)

    /* Step 2 — Donor fields */
    const [businessType, setBusinessType] = useState('')
    const [donorAddress, setDonorAddress] = useState('')
    const [donorCity, setDonorCity] = useState('')
    const [donorLat, setDonorLat] = useState(null)
    const [donorLng, setDonorLng] = useState(null)
    const [csrParticipant, setCsrParticipant] = useState(false)

    /* Step 2 — NGO fields */
    const [ngoName, setNgoName] = useState('')
    const [registrationNumber, setRegistrationNumber] = useState('')
    const [contactPerson, setContactPerson] = useState('')
    const [ngoAddress, setNgoAddress] = useState('')
    const [ngoCity, setNgoCity] = useState('')
    const [ngoLat, setNgoLat] = useState(17.674553)
    const [ngoLng, setNgoLng] = useState(75.323726)
    const [serviceRadius, setServiceRadius] = useState(10)

    /* General UI state */
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [oauthSession, setOAuthSession] = useState(null)
    const [oauthLoading, setOAuthLoading] = useState(oauthOnboarding)
    const [oauthProfileExists, setOAuthProfileExists] = useState(false)

    /* Refs for GSAP animations */
    const step2Ref = useRef(null)
    const { login, getDashboardPath } = auth

    useEffect(() => {
        if (!oauthOnboarding) return

        let cancelled = false
        const prepareOAuthOnboarding = async () => {
            setOAuthLoading(true)
            setError('')

            try {
                const { data, error: sessionError } = await supabase.auth.getSession()
                if (sessionError) throw sessionError

                const session = data.session
                if (!session?.access_token || !session.user) {
                    navigate('/login', {
                        replace: true,
                        state: { authError: 'Your Google session expired. Please continue with Google again.' },
                    })
                    return
                }

                if (cancelled) return
                setOAuthSession(session)
                setFullName(
                    session.user.user_metadata?.full_name ||
                    session.user.user_metadata?.name ||
                    ''
                )
                setEmail(session.user.email || '')

                let existingUser
                try {
                    const result = await getCurrentUserForSession(session.access_token)
                    existingUser = result.user
                } catch (profileError) {
                    if (profileError?.status !== 404 || profileError?.error !== 'Profile not found') {
                        throw profileError
                    }
                }

                if (!existingUser || cancelled) return

                setFullName(existingUser.full_name || '')
                setEmail(existingUser.email || '')
                setPhoneNumber(existingUser.phone || '')
                setOrganizationName(existingUser.organization_name || '')
                setRole(existingUser.role)
                setAcceptedTerms(true)
                window.sessionStorage.setItem('pending_session', JSON.stringify({
                    user: existingUser,
                    session,
                }))

                let onboardingComplete = existingUser.role === 'volunteer' || existingUser.role === 'admin'
                if (existingUser.role === 'donor') {
                    try {
                        await getDonorProfileForSession(session.access_token)
                        onboardingComplete = true
                    } catch (profileError) {
                        if (profileError?.status !== 404) throw profileError
                    }
                } else if (existingUser.role === 'ngo') {
                    const result = await getNGOProfileForSession(session.access_token)
                    onboardingComplete = Boolean(result?.ngo)
                }

                if (onboardingComplete) {
                    login(existingUser, session)
                    navigate(getDashboardPath(existingUser.role), { replace: true })
                    return
                }

                setOAuthProfileExists(true)
                setStep(2)
            } catch (prepareError) {
                if (!cancelled) {
                    setError(prepareError.message || 'Unable to continue Google registration.')
                }
            } finally {
                if (!cancelled) setOAuthLoading(false)
            }
        }

        prepareOAuthOnboarding()
        return () => {
            cancelled = true
        }
    }, [oauthOnboarding, navigate, login, getDashboardPath])

    // Split title text into characters
    const step1TitleChars = t('joinMovement').split('').map((char, i) => (
        <span className="char" key={i} style={{ display: 'inline-block' }}>
            {char === ' ' ? '\u00A0' : char}
        </span>
    ))

    const step2Titles = {
        donor: t('donorProfile'),
        ngo: t('ngoProfile'),
        volunteer: t('volunteerProfile'),
        admin: t('almostDone'),
    }

    const step2TitleChars = (step2Titles[role] || t('volunteerProfile')).split('').map((char, i) => (
        <span className="char" key={i} style={{ display: 'inline-block' }}>
            {char === ' ' ? '\u00A0' : char}
        </span>
    ))

    // Whether the non-India warning should show
    const showCountryWarning = countryCode !== '+91'

    /* ── Step 1 Validation & Submit ── */
    const handleStep1Submit = async (e) => {
        e.preventDefault()
        setError('')

        // Validation
        const hasOrg = ['donor', 'ngo'].includes(role)
        if (
            !fullName ||
            (!oauthOnboarding && (!email || !password || !confirmPassword)) ||
            !phoneNumber
        ) {
            setError(t('pleaseFillAllFields'))
            return
        }
        if (hasOrg && !organizationName) {
            setError(t('pleaseFillOrgName'))
            return
        }

        if (!acceptedTerms) {
            setError(t('youMustAcceptTerms'))
            return
        }

        if (!oauthOnboarding && password !== confirmPassword) {
            setError(t('passwordsMustMatch'))
            return
        }

        if (!oauthOnboarding && password.length < 12) {
            setError(t('passwordMinLength'))
            return
        }

        const phone = `${countryCode} ${phoneNumber}`

        if (oauthOnboarding && !oauthSession?.access_token) {
            setError('Your Google session is not ready. Please try again.')
            return
        }

        if (oauthOnboarding) {
            setLoading(true)
            try {
                const data = await createOAuthProfile({
                    full_name: fullName,
                    phone,
                    role,
                    organization_name: organizationName || null,
                    accepted_terms: true,
                }, oauthSession.access_token)
                setRole(data.user?.role || role)
                setFullName(data.user?.full_name || fullName)
                setOrganizationName(data.user?.organization_name || '')
                window.sessionStorage.setItem('pending_session', JSON.stringify({
                    user: data.user,
                    session: oauthSession,
                }))
                setOAuthProfileExists(true)
                setStep(2)
            } catch (err) {
                setError(err.message || t('registrationFailed'))
            } finally {
                setLoading(false)
            }
            return
        }

        // For admin — no step 2 needed, register directly
        if (role === 'admin') {
            setLoading(true)
            try {
                const data = await registerUser({
                    full_name: fullName,
                    email,
                    password,
                    phone,
                    role,
                    organization_name: null, // Admin doesn't need organization name
                    accepted_terms: true,
                    accepted_terms_timestamp: new Date().toISOString()
                })
                // Store session data temporarily
                window.sessionStorage.setItem('pending_session', JSON.stringify({
                    user: data.user,
                    session: data.session
                }))

                // Navigate to step 2 to show success
                setStep(2)
            } catch (err) {
                setError(err.message || 'Registration failed.')
            } finally {
                setLoading(false)
            }
            return
        }

        // For donor/ngo/volunteer — register user first, then go to step 2
        setLoading(true)
        try {
            const data = await registerUser({
                full_name: fullName,
                email,
                password,
                phone,
                role,
                organization_name: organizationName || null,
                accepted_terms: true,
                accepted_terms_timestamp: new Date().toISOString()
            })
            // Store session data temporarily - DON'T login yet!
            // We'll login after Step 2 is completed
            window.sessionStorage.setItem('pending_session', JSON.stringify({
                user: data.user,
                session: data.session
            }))

            setStep(2)

            // Animate step 2 entrance
            requestAnimationFrame(() => {
                if (step2Ref.current) {
                    const fields = step2Ref.current.querySelectorAll('.auth-input-group, .auth-location-picker, .auth-checkbox-group, .auth-role-specific-section')
                    if (fields.length) {
                        gsap.fromTo(
                            fields,
                            { y: 25, opacity: 0 },
                            {
                                y: 0,
                                opacity: 1,
                                duration: 0.5,
                                ease: 'power3.out',
                                stagger: 0.08,
                            }
                        )
                    }
                }
            })
        } catch (err) {
            setError(err.message || t('registrationFailed'))
        } finally {
            setLoading(false)
        }
    }

    /* ── Step 2 — Donor Submit ── */
    const handleDonorSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!donorAddress || !donorCity || donorLat == null || donorLng == null) {
            setError(t('selectAddressFromSuggestions'))
            return
        }

        if (!businessType) {
            setError(t('selectBusinessTypeRequired'))
            return
        }

        setLoading(true)
        try {
            const result = await createDonorProfile({
                business_type: businessType,
                address: donorAddress,
                city: donorCity,
                latitude: donorLat,
                longitude: donorLng,
                csr_participant: csrParticipant,
            }, oauthOnboarding ? oauthSession?.access_token : undefined)

            // Auto-verify the donor to reduce admin manual work
            if (!oauthOnboarding) {
                try {
                    if (result?.donor?.donor_id) {
                        await verifyDonor(result.donor.donor_id, true)
                    }
                } catch (verifyErr) {
                    console.warn('Auto-verification failed (admin can verify later):', verifyErr)
                }
            }

            // Now login the user with the pending session
            const pendingSession = JSON.parse(window.sessionStorage.getItem('pending_session') || '{}')
            if (pendingSession.user && pendingSession.session) {
                auth.login(pendingSession.user, pendingSession.session)
                window.sessionStorage.removeItem('pending_session')
            }

            navigate(auth.getDashboardPath('donor'))
        } catch (err) {
            setError(err.message || t('profileCreationFailed'))
        } finally {
            setLoading(false)
        }
    }

    /* ── Step 2 — NGO Submit ── */
    const handleNGOSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!ngoName || !contactPerson) {
            setError(t('fillNGONameAndContact'))
            return
        }
        if (!ngoAddress || !ngoCity || ngoLat == null || ngoLng == null) {
            setError(t('selectAddressFromSuggestions'))
            return
        }

        setLoading(true)
        try {
            const result = await createNGOProfile({
                ngo_name: ngoName,
                registration_number: registrationNumber || null,
                contact_person: contactPerson,
                address: ngoAddress,
                city: ngoCity,
                latitude: ngoLat,
                longitude: ngoLng,
                service_radius_km: serviceRadius,
            }, oauthOnboarding ? oauthSession?.access_token : undefined)

            // Auto-verify the NGO to reduce admin manual work
            if (!oauthOnboarding) {
                try {
                    if (result?.ngo?.ngo_id) {
                        await verifyNGO(result.ngo.ngo_id, true)
                    }
                } catch (verifyErr) {
                    console.warn('Auto-verification failed (admin can verify later):', verifyErr)
                }
            }

            // Now login the user with the pending session
            const pendingSession = JSON.parse(window.sessionStorage.getItem('pending_session') || '{}')
            if (pendingSession.user && pendingSession.session) {
                auth.login(pendingSession.user, pendingSession.session)
                window.sessionStorage.removeItem('pending_session')
            }

            navigate(auth.getDashboardPath('ngo'))
        } catch (err) {
            setError(err.message || t('profileCreationFailed'))
        } finally {
            setLoading(false)
        }
    }

    /* ── Step 2 — Volunteer Submit (redirect to dashboard, profile saved in user table) ── */
    const handleVolunteerComplete = () => {
        // Volunteers don't need a separate profile table entry for now
        // They are already registered with role=volunteer in profiles

        // Login the user with the pending session
        const pendingSession = JSON.parse(window.sessionStorage.getItem('pending_session') || '{}')
        if (pendingSession.user && pendingSession.session) {
            auth.login(pendingSession.user, pendingSession.session)
            window.sessionStorage.removeItem('pending_session')
        }

        navigate(auth.getDashboardPath('volunteer'))
    }

    /* ── Step 2 — Admin (already registered, just redirect) ── */
    const handleAdminComplete = () => {
        // Login the user with the pending session
        const pendingSession = JSON.parse(window.sessionStorage.getItem('pending_session') || '{}')
        if (pendingSession.user && pendingSession.session) {
            auth.login(pendingSession.user, pendingSession.session)
            window.sessionStorage.removeItem('pending_session')
        }

        navigate(auth.getDashboardPath('admin'))
    }

    /* ── Render ── */
    const noStep2 = role === 'admin'
    const totalSteps = noStep2 ? 1 : 2
    const stepLabels = noStep2
        ? ['Account']
        : ['Account', role === 'donor' ? 'Donor Details' : role === 'ngo' ? 'NGO Details' : 'Volunteer Details']

    if (oauthLoading) {
        return (
            <div className="auth-form-block" ref={ref}>
                <div className="auth-oauth-status" role="status" aria-live="polite">
                    <span className="auth-btn-spinner" />
                    <p>Preparing your Google account…</p>
                </div>
            </div>
        )
    }

    return (
        <div className={`auth-form-block ${oauthOnboarding ? '' : 'auth-form-block--hidden'}`} ref={ref}>
            {/* Step Indicator */}
            {step === 1 && !noStep2 && (
                <StepIndicator currentStep={step} totalSteps={totalSteps} labels={stepLabels} />
            )}
            {step === 2 && (
                <StepIndicator currentStep={step} totalSteps={totalSteps} labels={stepLabels} />
            )}

            {/* ═══════════ STEP 1 — Common Registration ═══════════ */}
            {step === 1 && (
                <>
                    <h1 className="auth-heading">{step1TitleChars}</h1>
                    <p className="auth-subtitle">
                        {t('bePart')}
                    </p>

                    {!oauthOnboarding && (
                        <>
                            <div className="auth-social-divider"><span>or continue with</span></div>
                            <GoogleAuthButton onError={setError} disabled={loading} />
                        </>
                    )}

                    {error && <div className="auth-error-msg">{error}</div>}

                    {!oauthProfileExists && (
                        <div className="auth-input-group">
                            <label>{t('selectYourRole')}</label>
                            <RoleSelector value={role} onChange={setRole} />
                        </div>
                    )}

                    <form onSubmit={handleStep1Submit}>
                        <div className="auth-fields">
                            <div className="auth-input-group">
                                <label htmlFor="register-name">{t('fullName')}</label>
                                <input
                                    type="text"
                                    id="register-name"
                                    placeholder={t('fullNamePlaceholder')}
                                    autoComplete="name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                />
                                <span className="auth-input-line" />
                            </div>

                            <div className="auth-input-group">
                                <label htmlFor="register-email">{t('email')}</label>
                                <input
                                    type="email"
                                    id="register-email"
                                    placeholder={t('emailPlaceholder')}
                                    autoComplete="email"
                                    value={email}
                                    readOnly={oauthOnboarding}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <span className="auth-input-line" />
                            </div>

                            {!oauthOnboarding && <div className="auth-fields-row">
                                <div className="auth-input-group">
                                    <label htmlFor="register-password">{t('password')}</label>
                                    <div className="auth-password-wrapper">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="register-password"
                                            placeholder={t('passwordPlaceholder')}
                                            autoComplete="new-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="auth-password-toggle"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                    <span className="auth-input-line" />
                                </div>

                                <div className="auth-input-group">
                                    <label htmlFor="register-confirm-password">{t('confirmPassword')}</label>
                                    <div className="auth-password-wrapper">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            id="register-confirm-password"
                                            placeholder={t('confirmPasswordPlaceholder')}
                                            autoComplete="new-password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="auth-password-toggle"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                                            tabIndex={-1}
                                        >
                                            {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                    <span className="auth-input-line" />
                                </div>
                            </div>}

                            <div className="auth-input-group">
                                <label htmlFor="register-phone">{t('phoneNumber')}</label>
                                <div className="auth-phone-wrapper">
                                    <select
                                        className="auth-phone-code"
                                        value={countryCode}
                                        onChange={(e) => setCountryCode(e.target.value)}
                                        id="register-country-code"
                                    >
                                        {COUNTRY_CODES.map((c) => (
                                            <option key={c.code} value={c.code}>
                                                {c.flag} {c.code}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="tel"
                                        id="register-phone"
                                        placeholder={t('phoneNumberPlaceholder')}
                                        autoComplete="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                    />
                                </div>
                                {showCountryWarning && (
                                    <p className="auth-country-warning">
                                        {t('countryWarning')}
                                    </p>
                                )}
                                <span className="auth-input-line" />
                            </div>

                            {/* Organization Name — only for donor & ngo */}
                            {['donor', 'ngo'].includes(role) && (
                                <div className="auth-input-group">
                                    <label htmlFor="register-org">{t('organizationName')}</label>
                                    <input
                                        type="text"
                                        id="register-org"
                                        placeholder={t('organizationPlaceholder')}
                                        autoComplete="organization"
                                        value={organizationName}
                                        onChange={(e) => setOrganizationName(e.target.value)}
                                    />
                                    <span className="auth-input-line" />
                                </div>
                            )}

                        </div>

                        {/* Terms & Conditions Checkbox */}
                        <div className="auth-checkbox-wrapper">
                            <input
                                type="checkbox"
                                id="terms-checkbox"
                                className="auth-checkbox-input"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                            />
                            <label htmlFor="terms-checkbox" className="auth-terms-label">
                                {t('iAgreeToThe')} <button type="button" className="auth-terms-link" onClick={() => setShowTerms(true)}>{t('termsAndConditions')}</button>
                            </label>
                        </div>

                        <button
                            className={`auth-submit-btn ${loading ? 'auth-submit-btn--loading' : ''}`}
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="auth-btn-spinner" />
                            ) : role === 'admin' ? (
                                t('createAdminAccount')
                            ) : (
                                t('continue')
                            )}
                        </button>
                    </form>

                    {!oauthOnboarding && (
                        <div className="auth-toggle">
                            {t('alreadyHaveAccount')}
                            <button
                                className="auth-toggle-link"
                                type="button"
                                onClick={onToggle}
                            >
                                {t('login')}
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ═══════════ STEP 2 — DONOR ═══════════ */}
            {
                step === 2 && role === 'donor' && (
                    <div ref={step2Ref}>
                        <button
                            type="button"
                            className="auth-back-btn"
                            onClick={() => setStep(1)}
                            disabled
                            title={t('youveAlreadyRegistered')}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>

                        <h1 className="auth-heading">{step2TitleChars}</h1>
                        <p className="auth-subtitle">
                            {t('completeDonorProfile')}
                        </p>

                        {error && <div className="auth-error-msg">{error}</div>}

                        <form onSubmit={handleDonorSubmit}>
                            <div className="auth-fields">
                                {/* Business Type Dropdown */}
                                <div className="auth-input-group">
                                    <label htmlFor="donor-business-type">{t('businessType')}</label>
                                    <select
                                        id="donor-business-type"
                                        value={businessType}
                                        onChange={(e) => setBusinessType(e.target.value)}
                                        className="auth-select"
                                    >
                                        <option value="">{t('selectBusinessType')}</option>
                                        <option value="restaurant">{t('restaurant')}</option>
                                        <option value="catering">{t('catering')}</option>
                                        <option value="hotel">{t('hotel')}</option>
                                        <option value="individual">{t('individual')}</option>
                                        <option value="other">{t('other')}</option>
                                    </select>
                                    <span className="auth-input-line" />
                                </div>

                                {/* Location Picker */}
                                <div className="auth-role-specific-section">
                                    <LocationPicker
                                        address={donorAddress}
                                        onAddressChange={setDonorAddress}
                                        onCityChange={setDonorCity}
                                        onCoordsChange={(lat, lng) => {
                                            setDonorLat(lat)
                                            setDonorLng(lng)
                                        }}
                                    />
                                </div>

                                {/* Hidden coordinate display */}
                                {donorLat && donorLng && (
                                    <div className="auth-coords-display">
                                        <span className="auth-coords-badge">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" /></svg>
                                            {donorLat.toFixed(6)}, {donorLng.toFixed(6)}
                                        </span>
                                        {donorCity && <span className="auth-coords-city">{donorCity}</span>}
                                    </div>
                                )}

                                {/* CSR Participant Checkbox */}
                                <div className="auth-checkbox-group">
                                    <label className="auth-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={csrParticipant}
                                            onChange={(e) => setCsrParticipant(e.target.checked)}
                                            className="auth-checkbox"
                                        />
                                        <span className="auth-checkbox-custom" />
                                        <span className="auth-checkbox-text">
                                            {t('csrParticipant')}
                                            <small>{t('csrParticipantDesc')}</small>
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <button
                                className={`auth-submit-btn ${loading ? 'auth-submit-btn--loading' : ''}`}
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? <span className="auth-btn-spinner" /> : t('completeVerifyRegistration')}
                            </button>
                        </form>
                    </div>
                )
            }

            {/* ═══════════ STEP 2 — NGO ═══════════ */}
            {
                step === 2 && role === 'ngo' && (
                    <div ref={step2Ref}>
                        <button
                            type="button"
                            className="auth-back-btn"
                            onClick={() => setStep(1)}
                            disabled
                            title={t('youveAlreadyRegistered')}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>

                        <h1 className="auth-heading">{step2TitleChars}</h1>
                        <p className="auth-subtitle">
                            {t('completeNGOProfile')}
                        </p>

                        {error && <div className="auth-error-msg">{error}</div>}

                        <form onSubmit={handleNGOSubmit}>
                            <div className="auth-fields">
                                <div className="auth-input-group">
                                    <label htmlFor="ngo-name">{t('ngoName')}</label>
                                    <input
                                        type="text"
                                        id="ngo-name"
                                        placeholder={t('ngoNamePlaceholder')}
                                        value={ngoName}
                                        onChange={(e) => setNgoName(e.target.value)}
                                    />
                                    <span className="auth-input-line" />
                                </div>

                                <div className="auth-input-group">
                                    <label htmlFor="ngo-regnumber">{t('registrationNumber')} <span className="auth-optional">({t('optional')})</span></label>
                                    <input
                                        type="text"
                                        id="ngo-regnumber"
                                        placeholder={t('registrationNumberPlaceholder')}
                                        value={registrationNumber}
                                        onChange={(e) => setRegistrationNumber(e.target.value)}
                                    />
                                    <span className="auth-input-line" />
                                </div>

                                <div className="auth-input-group">
                                    <label htmlFor="ngo-contact">{t('contactPersonName')}</label>
                                    <input
                                        type="text"
                                        id="ngo-contact"
                                        placeholder={t('contactPersonPlaceholder')}
                                        value={contactPerson}
                                        onChange={(e) => setContactPerson(e.target.value)}
                                    />
                                    <span className="auth-input-line" />
                                </div>

                                {/* Location Picker with Radius */}
                                <div className="auth-role-specific-section">
                                    <LocationPicker
                                        address={ngoAddress}
                                        onAddressChange={setNgoAddress}
                                        onCityChange={setNgoCity}
                                        onCoordsChange={(lat, lng) => {
                                            setNgoLat(lat)
                                            setNgoLng(lng)
                                        }}
                                        showRadius
                                        radius={serviceRadius}
                                        onRadiusChange={setServiceRadius}
                                    />
                                </div>

                                {/* Hidden coordinate display */}
                                {ngoLat && ngoLng && (
                                    <div className="auth-coords-display">
                                        <span className="auth-coords-badge">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" /></svg>
                                            {ngoLat.toFixed(6)}, {ngoLng.toFixed(6)}
                                        </span>
                                        {ngoCity && <span className="auth-coords-city">{ngoCity}</span>}
                                    </div>
                                )}
                            </div>

                            <button
                                className={`auth-submit-btn ${loading ? 'auth-submit-btn--loading' : ''}`}
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? <span className="auth-btn-spinner" /> : t('completeVerifyRegistration')}
                            </button>
                        </form>
                    </div>
                )
            }

            {/* ═══════════ STEP 2 — VOLUNTEER ═══════════ */}
            {
                step === 2 && role === 'volunteer' && (
                    <div ref={step2Ref} className="auth-success-block">
                        <div className="auth-success-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--tundora)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                        </div>
                        <h1 className="auth-heading">{step2TitleChars}</h1>
                        <p className="auth-subtitle">
                            {t('volunteerAccountCreated')}
                        </p>
                        <button
                            className="auth-submit-btn"
                            type="button"
                            onClick={handleVolunteerComplete}
                        >
                            {t('goToDashboard')}
                        </button>
                    </div>
                )
            }

            {/* ═══════════ STEP 2 — ADMIN (Success) ═══════════ */}
            {
                step === 2 && role === 'admin' && (
                    <div className="auth-success-block" ref={step2Ref}>
                        <div className="auth-success-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--tundora)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                        </div>
                        <h1 className="auth-heading">{step2TitleChars}</h1>
                        <p className="auth-subtitle">
                            {t('adminAccountCreated')}
                        </p>
                        <button
                            className="auth-submit-btn"
                            type="button"
                            onClick={handleAdminComplete}
                        >
                            {t('goToDashboard')}
                        </button>
                    </div>
                )
            }
            {/* Terms Modal */}
            {
                showTerms && (
                    <TermsModal
                        onClose={() => setShowTerms(false)}
                        onAccept={() => {
                            setAcceptedTerms(true)
                            setShowTerms(false)
                        }}
                    />
                )
            }
        </div >
    )
})
