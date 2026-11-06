import { useRef } from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import LiveDashboard from '../components/LiveDashboard'
import BlogSection from '../components/BlogSection'
import Workflow from '../components/Workflow'
import CarbonCreditSection from '../components/CarbonCreditSection'
import ImpactSection from '../components/ImpactSection'
import Footer from '../components/Footer'
import { useHomepageScrollExperience } from '../lib/useHomepageScrollExperience'

const LandingPage = () => {
    const mainRef = useRef(null)
    useHomepageScrollExperience(mainRef)

    return (
        <>
            <Navbar />
            <main ref={mainRef} className="homepage-story">
                <Hero />
                <LiveDashboard />
                <BlogSection />
                <Workflow />
                <CarbonCreditSection />
                <ImpactSection />
            </main>
            <Footer />
        </>
    )
}

export default LandingPage
