import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
    getCurrentUserForSession,
    getDonorProfileForSession,
    getNGOProfileForSession,
} from '../../lib/api'
import { supabase } from '../../lib/supabaseClient'

function isProfileMissing(error) {
    return error?.status === 404 && error?.error === 'Profile not found'
}

async function hasCompletedOnboarding(user, accessToken) {
    if (user.role === 'donor') {
        try {
            await getDonorProfileForSession(accessToken)
            return true
        } catch (error) {
            if (error?.status === 404) return false
            throw error
        }
    }

    if (user.role === 'ngo') {
        const result = await getNGOProfileForSession(accessToken)
        return Boolean(result?.ngo)
    }

    return true
}

export default function OAuthCallbackPage() {
    const navigate = useNavigate()
    const { login, getDashboardPath, clearSession } = useAuth()
    const startedRef = useRef(false)

    useEffect(() => {
        if (startedRef.current) return
        startedRef.current = true

        const finishOAuth = async () => {
            const params = new URLSearchParams(window.location.search)
            const oauthError = params.get('error_description') || params.get('error')

            if (oauthError) {
                const cancelled = params.get('error') === 'access_denied'
                navigate('/login', {
                    replace: true,
                    state: {
                        authError: cancelled
                            ? 'Google sign-in was cancelled. You can try again when ready.'
                            : oauthError,
                    },
                })
                return
            }

            let session
            const code = params.get('code')

            if (!code) {
                navigate('/login', {
                    replace: true,
                    state: { authError: 'Google sign-in did not complete. Please try again.' },
                })
                return
            }

            const { data, error } = await supabase.auth.exchangeCodeForSession(code)
            if (error) throw error
            session = data.session

            if (!session?.access_token) {
                throw new Error('Google sign-in did not return an authenticated session.')
            }

            try {
                const { user } = await getCurrentUserForSession(session.access_token)
                const onboardingComplete = await hasCompletedOnboarding(user, session.access_token)

                if (!onboardingComplete) {
                    clearSession()
                    navigate('/auth/onboarding', { replace: true })
                    return
                }

                login(user, session)
                navigate(getDashboardPath(user.role), { replace: true })
            } catch (error) {
                if (isProfileMissing(error)) {
                    clearSession()
                    navigate('/auth/onboarding', { replace: true })
                    return
                }
                throw error
            }
        }

        finishOAuth().catch((error) => {
            navigate('/login', {
                replace: true,
                state: {
                    authError: error.message || 'Google sign-in failed. Please try again.',
                },
            })
        })
    }, [clearSession, getDashboardPath, login, navigate])

    return (
        <main className="auth-oauth-status" role="status" aria-live="polite">
            <span className="auth-btn-spinner" />
            <p>Signing you in with Google…</p>
        </main>
    )
}
