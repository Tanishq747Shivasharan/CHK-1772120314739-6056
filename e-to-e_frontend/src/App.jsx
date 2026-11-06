import { useEffect, useRef, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import StoriesPage from './pages/StoriesPage'
import ContactPage from './pages/ContactPage'
import DonorDashboard from './DonorDashboard/pages/DonorDashboard'
import NGODashboard from './modules/NGODashboard/pages/NGODashboard'
import AdminDashboard from './admin/AdminDashboard'
import VolunteerDashboard from './VolunteerDashboard/VolunteerDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import OAuthCallbackPage from './components/auth/OAuthCallbackPage'
import CinematicPreloader from './components/CinematicPreloader'
import { prefersReducedMotion } from './lib/motionPreferences'

gsap.registerPlugin(ScrollTrigger)

const DASHBOARD_PREFIXES = ['/donor-dashboard', '/ngo-dashboard', '/admin-dashboard', '/volunteer-dashboard']

import { useAuth } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'

function App() {
  const lenisRef = useRef(null)
  const location = useLocation()
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion)
  const [loading, setLoading] = useState(() => {
    return !prefersReducedMotion() && !sessionStorage.getItem('preloader-session-shown')
  })

  const handlePreloaderComplete = () => {
    setLoading(false)
    sessionStorage.setItem('preloader-session-shown', 'true')
  }
  const { user } = useAuth()

  const isDashboard = DASHBOARD_PREFIXES.some((p) =>
    location.pathname.startsWith(p)
  )
  const isHomepage = location.pathname === '/'

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handlePreferenceChange = (event) => setReduceMotion(event.matches)
    media.addEventListener('change', handlePreferenceChange)
    return () => media.removeEventListener('change', handlePreferenceChange)
  }, [])

  useEffect(() => {
    if (isDashboard || !isHomepage || reduceMotion) {
      if (lenisRef.current) {
        lenisRef.current.destroy()
        lenisRef.current = null
      }
      return
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    })

    lenisRef.current = lenis

    const handleLenisScroll = () => ScrollTrigger.update()
    const tickerCallback = (time) => lenis.raf(time * 1000)
    lenis.on('scroll', handleLenisScroll)

    gsap.ticker.add(tickerCallback)

    gsap.ticker.lagSmoothing(0)
    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh())

    return () => {
      cancelAnimationFrame(refreshFrame)
      lenis.off('scroll', handleLenisScroll)
      gsap.ticker.remove(tickerCallback)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [isDashboard, isHomepage, reduceMotion])

  return (
    <>
      {loading && (
        <CinematicPreloader onComplete={handlePreloaderComplete} />
      )}
      {/* While loading, we can keep the app content hidden or let it mount in background.
          For a portal reveal, content needs to be rendered but maybe covered. 
          The preloader is z-index 9999 over everything. 
          When loading is false, preloader unmounts. */}

      <div style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.5s ease' }}>
        <SocketProvider userId={user?.id}>
          <Routes>
            {/* ── Public routes ── */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />
            <Route path="/auth/onboarding" element={<AuthPage oauthOnboarding />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/contact" element={<ContactPage />} />

            {/* ── Protected dashboard routes ── */}
            <Route
              path="/donor-dashboard"
              element={
                <ProtectedRoute allowedRoles={['donor']}>
                  <DonorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ngo-dashboard"
              element={
                <ProtectedRoute allowedRoles={['ngo', 'volunteer']}>
                  <NGODashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/volunteer-dashboard"
              element={
                <ProtectedRoute allowedRoles={['volunteer']}>
                  <VolunteerDashboard />
                </ProtectedRoute>
              }
            />

          </Routes>
        </SocketProvider>
      </div>
    </>
  )
}

export default App
