import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Clock3, LocateFixed, MapPin, Navigation, PackageCheck, Radio, RefreshCw, Route as RouteIcon, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getDonorDisplayName } from '../lib/donorIdentity'
import { supabase } from '../lib/supabaseClient'
import { acceptPickup, cancelPickup, clearAvailabilityLocation, getActivePickup, getAvailablePickups, getPickupHistory, setVolunteerAvailability, updateAvailabilityLocation, updateVolunteerLocation, verifyPickupCode } from '../lib/volunteerApi'
import 'leaflet/dist/leaflet.css'
import './VolunteerDashboard.css'

const one = (value) => Array.isArray(value) ? value[0] : value
const coordinates = (lat, lng) => {
    const latitude = Number(lat)
    const longitude = Number(lng)
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? [latitude, longitude]
        : null
}

const pin = L.divIcon({ className: 'volunteer-pin volunteer-pin--pickup', html: '<span>↟</span>', iconSize: [40, 40], iconAnchor: [20, 36] })
const mePin = L.divIcon({ className: 'volunteer-pin volunteer-pin--me', html: '<span>V</span>', iconSize: [38, 38], iconAnchor: [19, 19] })

function FitMap({ points }) {
    const map = useMap()
    const key = points.map((point) => point.join(',')).join('|')
    const mapPoints = useMemo(() => key ? key.split('|').map((value) => value.split(',').map(Number)) : [], [key])
    const didFit = useRef(false)
    useEffect(() => {
        if (didFit.current || mapPoints.length === 0) return
        didFit.current = true
        if (mapPoints.length > 1) map.fitBounds(mapPoints, { padding: [40, 40], maxZoom: 15, animate: true })
        else if (mapPoints.length === 1) map.flyTo(mapPoints[0], 14, { duration: 0.5 })
    }, [key, map, mapPoints])
    return null
}

function SmoothMarker({ position, icon, children }) {
    const [displayPosition, setDisplayPosition] = useState(position)
    const current = useRef(position)
    const latitude = position?.[0]
    const longitude = position?.[1]
    useEffect(() => {
        if (latitude === undefined || longitude === undefined) return undefined
        const destination = [latitude, longitude]
        const from = current.current || destination
        const start = performance.now()
        let frame
        const animate = (now) => {
            const progress = Math.min(1, (now - start) / 800)
            const eased = 1 - (1 - progress) ** 3
            const next = [from[0] + (latitude - from[0]) * eased, from[1] + (longitude - from[1]) * eased]
            current.current = next
            setDisplayPosition(next)
            if (progress < 1) frame = requestAnimationFrame(animate)
        }
        frame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frame)
    }, [latitude, longitude])
    return <Marker position={displayPosition} icon={icon}>{children}</Marker>
}

function haversineKm(a, b) {
    const rad = (value) => value * Math.PI / 180
    const dLat = rad(b[0] - a[0])
    const dLng = rad(b[1] - a[1])
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export default function VolunteerDashboard() {
    const { user, logout } = useAuth()
    const [tasks, setTasks] = useState([])
    const [history, setHistory] = useState([])
    const [volunteer, setVolunteer] = useState(null)
    const [active, setActive] = useState(null)
    const [loading, setLoading] = useState(true)
    const [acceptingId, setAcceptingId] = useState('')
    const [cancelling, setCancelling] = useState(false)
    const [code, setCode] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [sharingAvailable, setSharingAvailable] = useState(false)
    const [availabilityLocationState, setAvailabilityLocationState] = useState('')
    const [activeLocationState, setActiveLocationState] = useState('')
    const [availabilityPoint, setAvailabilityPoint] = useState(null)
    const [activePoint, setActivePoint] = useState(null)
    const [availabilityBusy, setAvailabilityBusy] = useState(false)
    const [route, setRoute] = useState(null)
    const [eta, setEta] = useState(null)
    const lastActiveSent = useRef(null)
    const lastActiveSentAt = useRef(0)
    const lastAvailabilitySent = useRef(null)
    const lastAvailabilitySentAt = useRef(0)
    const routeController = useRef(null)
    const lastRouteOrigin = useRef(null)
    const routeDeliveryId = useRef('')

    useEffect(() => () => routeController.current?.abort(), [])

    const refresh = useCallback(async () => {
        try {
            const [availableResult, activeResult, historyResult] = await Promise.all([
                getAvailablePickups(),
                getActivePickup(),
                getPickupHistory().catch(() => ({ deliveries: [] })),
            ])
            setTasks(availableResult.deliveries || [])
            setHistory(historyResult.deliveries || [])
            setVolunteer(availableResult.volunteer || activeResult.volunteer || null)
            setActive(activeResult.delivery || null)
            setError('')
        } catch (failure) {
            setError(failure.message || failure.error || 'Could not load volunteer pickups.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        refresh()
        const timer = setInterval(refresh, 30_000)
        return () => clearInterval(timer)
    }, [refresh])

    useEffect(() => {
        if (!active?.delivery_id) return undefined
        const token = localStorage.getItem('access_token')
        if (token) supabase.realtime.setAuth(token)
        const channel = supabase
            .channel(`volunteer-delivery-${active.delivery_id}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'deliveries',
                filter: `delivery_id=eq.${active.delivery_id}`,
            }, (payload) => {
                if (!payload.new) return
                if (['delivered', 'failed'].includes(payload.new.delivery_status)) {
                    setActive(null)
                    setActivePoint(null)
                    setAvailabilityLocationState('Volunteer available. Location sharing is stopped.')
                    setMessage('This pickup is complete. GPS sharing has stopped.')
                    refresh()
                } else {
                    setActive((current) => current ? { ...current, ...payload.new } : current)
                }
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [active?.delivery_id, refresh])

    const activeClaim = one(active?.ngo_claims)
    const activeListing = one(activeClaim?.food_listings)
    const activeDonor = one(one(activeListing?.donors)?.profiles)
    const activeDonorName = getDonorDisplayName(activeDonor, 'Donor')
    const activePickup = coordinates(activeListing?.latitude, activeListing?.longitude)
    const activeLocation = activePoint || coordinates(active?.location_latitude, active?.location_longitude)
    const activePickupKey = activePickup?.join(',') || ''
    const activeLocationKey = activeLocation?.join(',') || ''

    useEffect(() => {
        if (!active?.delivery_id || !navigator.geolocation) {
            if (active?.delivery_id) setActiveLocationState('GPS unavailable in this browser.')
            return undefined
        }

        setActiveLocationState('Waiting for GPS permission…')
        const watchId = navigator.geolocation.watchPosition(async (position) => {
            const point = [position.coords.latitude, position.coords.longitude]
            const movedMeters = lastActiveSent.current ? haversineKm(lastActiveSent.current, point) * 1000 : Infinity
            if (Date.now() - lastActiveSentAt.current < 5000 && movedMeters < 25) return
            lastActiveSent.current = point
            lastActiveSentAt.current = Date.now()
            setActivePoint(point)
            setActive((current) => current ? {
                ...current,
                location_latitude: point[0],
                location_longitude: point[1],
                location_updated_at: new Date().toISOString(),
            } : current)
            setActiveLocationState('Sharing live location with the donor.')
            try {
                await updateVolunteerLocation(active.delivery_id, {
                    latitude: point[0], longitude: point[1], accuracy_m: position.coords.accuracy,
                })
            } catch (failure) {
                setActiveLocationState(failure.message || 'Location update failed. Retrying…')
            }
        }, (failure) => {
            const reason = failure.code === 1 ? 'Location permission denied. Enable access to share your route.' : 'GPS unavailable. Move outdoors or retry.'
            setActiveLocationState(reason)
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 })
        return () => navigator.geolocation.clearWatch(watchId)
    }, [active?.delivery_id])

    useEffect(() => {
        if (active?.delivery_id) {
            setAvailabilityLocationState('Volunteer unavailable while on an active pickup.')
            return undefined
        }
        if (!volunteer?.availability_status) {
            setAvailabilityLocationState('Volunteer unavailable.')
            return undefined
        }
        if (!sharingAvailable) {
            setAvailabilityLocationState((current) => current || 'Location sharing stopped.')
            return undefined
        }
        if (!navigator.geolocation) {
            setAvailabilityLocationState('GPS unavailable in this browser.')
            setSharingAvailable(false)
            setAvailabilityPoint(null)
            clearAvailabilityLocation().catch(() => setError('Could not clear the last shared location.'))
            return undefined
        }
        setAvailabilityLocationState('Waiting for GPS permission…')
        const watchId = navigator.geolocation.watchPosition(async (position) => {
            const point = [position.coords.latitude, position.coords.longitude]
            const movedMeters = lastAvailabilitySent.current ? haversineKm(lastAvailabilitySent.current, point) * 1000 : Infinity
            if (Date.now() - lastAvailabilitySentAt.current < 5000 && movedMeters < 25) return
            lastAvailabilitySent.current = point
            lastAvailabilitySentAt.current = Date.now()
            setAvailabilityPoint(point)
            setAvailabilityLocationState('Sharing location with your NGO.')
            try {
                await updateAvailabilityLocation({ latitude: point[0], longitude: point[1] })
            } catch (failure) {
                setAvailabilityLocationState(failure.message || 'Location update failed. Retrying…')
            }
        }, (failure) => {
            setAvailabilityLocationState(failure.code === 1 ? 'Location permission denied. Enable access to appear on the pickup map.' : 'GPS unavailable. Move outdoors or retry.')
            setSharingAvailable(false)
            setAvailabilityPoint(null)
            clearAvailabilityLocation().catch(() => setError('Could not clear the last shared location.'))
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 })
        return () => navigator.geolocation.clearWatch(watchId)
    }, [sharingAvailable, active?.delivery_id, volunteer?.availability_status])

    useEffect(() => {
        if (routeDeliveryId.current !== active?.delivery_id) {
            routeController.current?.abort()
            lastRouteOrigin.current = null
            routeDeliveryId.current = active?.delivery_id || ''
        }
        const pickupPoint = activePickupKey ? activePickupKey.split(',').map(Number) : null
        const locationPoint = activeLocationKey ? activeLocationKey.split(',').map(Number) : null
        if (!pickupPoint || !locationPoint || active?.delivery_status !== 'assigned') {
            routeController.current?.abort()
            setRoute(null)
            setEta(null)
            return undefined
        }
        const movedKm = lastRouteOrigin.current ? haversineKm(lastRouteOrigin.current, locationPoint) : Infinity
        if (movedKm < 0.08) return undefined

        routeController.current?.abort()
        const controller = new AbortController()
        routeController.current = controller
        lastRouteOrigin.current = locationPoint
        const routingUrl = (import.meta.env.VITE_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving').replace(/\/$/, '')
        const url = `${routingUrl}/${locationPoint[1]},${locationPoint[0]};${pickupPoint[1]},${pickupPoint[0]}?overview=full&geometries=geojson`
        fetch(url, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error('Routing service is unavailable')
                return response.json()
            })
            .then((result) => {
                const routeResult = result.routes?.[0]
                if (!routeResult) return
                setRoute(routeResult.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]))
                setEta({ km: routeResult.distance / 1000, minutes: Math.max(1, Math.ceil(routeResult.duration / 60)) })
            })
            .catch((failure) => { if (failure.name !== 'AbortError' && !controller.signal.aborted) { setRoute(null); setEta(null) } })
    }, [activePickupKey, activeLocationKey, active?.delivery_status, active?.delivery_id])

    const taskRows = useMemo(() => tasks.map((task) => {
        const listing = one(one(task.ngo_claims)?.food_listings)
        return { ...task, listing, donorName: getDonorDisplayName(listing, 'Donor'), point: coordinates(listing?.latitude, listing?.longitude) }
    }).filter((task) => task.point), [tasks])
    const linkedNgoName = one(volunteer?.ngos)?.ngo_name
        || one(activeClaim?.ngos)?.ngo_name
        || one(one(taskRows[0]?.ngo_claims)?.ngos)?.ngo_name
        || 'NGO not linked'

    const handleAccept = async (deliveryId) => {
        setAcceptingId(deliveryId)
        setError('')
        setMessage('')
        try {
            const result = await acceptPickup(deliveryId)
            setSharingAvailable(false)
            setAvailabilityPoint(null)
            setAvailabilityLocationState('Volunteer unavailable while on an active pickup.')
            setMessage(result.otp_email_sent
                ? 'Pickup accepted. The donor received a secure collection code by email.'
                : 'Pickup accepted. The donor can request a fresh collection code from the donor dashboard.')
            await refresh()
        } catch (failure) {
            setError(failure.message || failure.error || 'This pickup could not be accepted.')
            await refresh()
        } finally {
            setAcceptingId('')
        }
    }

    const handleVerify = async (event) => {
        event.preventDefault()
        if (!active?.delivery_id) return
        setError('')
        setMessage('')
        try {
            const result = await verifyPickupCode(active.delivery_id, code)
            setMessage(result.message || 'Pickup verified. The food is now in transit.')
            setCode('')
            await refresh()
        } catch (failure) {
            setError(failure.message || failure.error || 'The pickup code could not be verified.')
        }
    }

    const handleCancelPickup = async () => {
        if (!active?.delivery_id) return
        const confirmed = window.confirm('Cancel this pickup? It will return to the available pickups list for other volunteers.')
        if (!confirmed) return
        setCancelling(true)
        setError('')
        setMessage('')
        try {
            const result = await cancelPickup(active.delivery_id)
            setActive(null)
            setCode('')
            setActivePoint(null)
            setAvailabilityPoint(null)
            lastActiveSent.current = null
            lastActiveSentAt.current = 0
            setSharingAvailable(false)
            setAvailabilityLocationState('Location sharing stopped.')
            setMessage(result.message || 'Pickup cancelled and returned to available pickups.')
            await refresh()
        } catch (failure) {
            setError(failure.message || failure.error || 'This pickup could not be cancelled.')
        } finally {
            setCancelling(false)
        }
    }

    const toggleAvailabilitySharing = async () => {
        if (!sharingAvailable) {
            setAvailabilityLocationState('Waiting for GPS permission…')
            setSharingAvailable(true)
            return
        }
        setSharingAvailable(false)
        setAvailabilityPoint(null)
        lastAvailabilitySent.current = null
        lastAvailabilitySentAt.current = 0
        setAvailabilityLocationState('Location sharing stopped.')
        try {
            await clearAvailabilityLocation()
        } catch (failure) {
            setError(failure.message || 'Could not clear the last shared location.')
        }
    }

    const toggleVolunteerAvailability = async () => {
        if (!volunteer || availabilityBusy) return
        const nextAvailable = !volunteer.availability_status
        setAvailabilityBusy(true)
        setError('')
        try {
            const result = await setVolunteerAvailability(nextAvailable)
            setVolunteer((current) => ({ ...current, ...result.volunteer }))
            if (!nextAvailable) {
                setSharingAvailable(false)
                setAvailabilityPoint(null)
                lastAvailabilitySent.current = null
                lastAvailabilitySentAt.current = 0
                setAvailabilityLocationState('Volunteer unavailable.')
            } else {
                setAvailabilityLocationState('Volunteer available. Start location sharing to appear on the pickup map.')
            }
            await refresh()
        } catch (failure) {
            setError(failure.message || failure.error || 'Could not update availability.')
        } finally {
            setAvailabilityBusy(false)
        }
    }

    const mapPoints = activePickup
        ? [activePickup, ...(activeLocation ? [activeLocation] : [])]
        : [...taskRows.map((task) => task.point), ...(availabilityPoint ? [availabilityPoint] : [])]

    return (
        <main className="volunteer-dashboard">
            <header className="volunteer-topbar">
                <div className="volunteer-brand"><span className="volunteer-brand-mark">E</span><div><strong>Extra-To-Essential</strong><small>Volunteer pickup desk</small></div></div>
                <div className="volunteer-user">
                    <div className="volunteer-user-info">
                        <strong>{volunteer?.full_name || user?.full_name || 'Volunteer'}</strong>
                        <small>{linkedNgoName === 'NGO not linked' ? linkedNgoName : `Working with ${linkedNgoName}`}</small>
                    </div>
                    <button type="button" onClick={logout}>Sign out</button>
                </div>
            </header>

            <div className="volunteer-main">
                <section className="volunteer-heading">
                    <div><span>COMMUNITY PICKUPS</span><h1>{active ? 'Your pickup in progress' : 'Available pickups'}</h1><p>Manage availability, accept NGO-approved donations, and share your GPS route during pickup.</p></div>
                    <button type="button" className="volunteer-refresh" onClick={refresh}><RefreshCw size={15} />Refresh</button>
                </section>

                {error && <div className="volunteer-alert volunteer-alert--error" role="alert">{error}</div>}
                {message && <div className="volunteer-alert volunteer-alert--success" role="status">{message}</div>}

                {active ? (
                    <section className="volunteer-active-layout">
                        <div className="volunteer-map-card">
                            {activePickup ? (
                                <MapContainer center={activePickup} zoom={14} className="volunteer-map" scrollWheelZoom>
                                    <TileLayer url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                                    <FitMap points={mapPoints} />
                                    <SmoothMarker position={activePickup} icon={pin}><Popup><strong>Pickup</strong><br />{activeListing?.pickup_address}</Popup></SmoothMarker>
                                    {activeLocation && <SmoothMarker position={activeLocation} icon={mePin}><Popup>Your last shared GPS location</Popup></SmoothMarker>}
                                    {route && <Polyline positions={route} pathOptions={{ color: '#597c4d', weight: 5, opacity: 0.9, className: 'live-route-line' }} />}
                                </MapContainer>
                            ) : <div className="volunteer-map-missing"><MapPin size={20} />Pickup coordinates are unavailable.</div>}
                            <div className="volunteer-location-badge"><span className="volunteer-online-dot" />{activeLocationState || 'Starting GPS tracking…'}</div>
                        </div>
                        <aside className="volunteer-task-panel">
                            <span className="volunteer-panel-label">ACTIVE PICKUP · {active?.delivery_status === 'in_transit' ? 'IN TRANSIT' : 'ASSIGNED'}</span>
                            <h2>{activeListing?.food_type || 'Food donation'}</h2>
                            <p className="volunteer-quantity">{activeListing?.quantity_kg ?? '—'} kg · {activeListing?.meal_equivalent ?? '—'} meals · {one(activeClaim?.ngos)?.ngo_name || 'NGO'}</p>
                            <p className="volunteer-donor-name">Donor: {activeDonorName}</p>
                            <div className="volunteer-address"><MapPin size={17} /><span>{activeListing?.pickup_address || 'Pickup address unavailable'}</span></div>
                            {activeDonor?.phone && <a className="volunteer-call-donor" href={`tel:${activeDonor.phone}`}><Navigation size={15} />Call {activeDonorName}</a>}
                            {eta && active?.delivery_status === 'assigned' && <div className="volunteer-eta"><Clock3 size={19} /><div><strong>{eta.minutes} min</strong><small>{eta.km.toFixed(1)} km by road</small></div></div>}
                            {active?.collection_verified_at ? (
                                <div className="volunteer-verified"><ShieldCheck size={20} /><span>Pickup verified. The donation is in transit.</span></div>
                            ) : active?.collection_tracking_enabled ? (
                                <form className="volunteer-code-form" onSubmit={handleVerify}>
                                    <label htmlFor="pickup-code">Donor pickup code</label>
                                    <p>Ask the donor for the code when you arrive. It expires after 10 minutes.</p>
                                    <input id="pickup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required />
                                    <button type="submit" disabled={code.length !== 6}><PackageCheck size={16} />Verify pickup</button>
                                </form>
                            ) : (
                                <div className="volunteer-help-note"><ShieldCheck size={16} /><span>This pickup uses the NGO's existing assignment flow. Continue to share GPS and update the NGO when collection is complete.</span></div>
                            )}
                            {active?.delivery_status === 'assigned' && !active?.collection_verified_at && (
                                <button type="button" className="volunteer-cancel-button" onClick={handleCancelPickup} disabled={cancelling}>
                                    <X size={15} />{cancelling ? 'Cancelling pickup…' : 'Cancel pickup'}
                                </button>
                            )}
                            <div className="volunteer-help-note"><Radio size={16} /><span>Keep this page open so your location can update for the donor.</span></div>
                        </aside>
                    </section>
                ) : (
                    <>
                        <div className="volunteer-share-card">
                            <div className="volunteer-share-icon"><LocateFixed size={19} /></div>
                            <div className="volunteer-share-copy">
                                <strong>{volunteer?.availability_status ? 'Available for new pickups' : 'Unavailable for new pickups'}</strong>
                                <p>Location: {availabilityLocationState || (sharingAvailable ? 'Waiting for GPS permission…' : 'Location sharing stopped.')}</p>
                            </div>
                            {volunteer && <div className="volunteer-share-actions">
                                <button type="button" className="volunteer-availability-button" onClick={toggleVolunteerAvailability} disabled={availabilityBusy}>
                                    {availabilityBusy ? 'Updating…' : volunteer.availability_status ? 'Set unavailable' : 'Set available'}
                                </button>
                                {volunteer.availability_status && <button type="button" onClick={toggleAvailabilitySharing}>
                                    {sharingAvailable ? 'Stop sharing location' : 'Share location'}
                                </button>}
                            </div>}
                        </div>
                        <section className="volunteer-open-layout">
                            <div className="volunteer-open-list">
                                {loading ? <div className="volunteer-empty">Loading approved pickups…</div> : taskRows.length === 0 ? (
                                    <div className="volunteer-empty"><PackageCheck size={25} /><strong>No pickups available right now</strong><span>NGO-approved donations will appear here when they are ready for collection.</span></div>
                                ) : taskRows.map((task) => {
                                    const ngo = one(task.ngo_claims)?.ngos
                                    const distance = availabilityPoint ? haversineKm(availabilityPoint, task.point).toFixed(1) : null
                                    return (
                                        <article className="volunteer-open-card" key={task.delivery_id}>
                                            <div className="volunteer-open-card__top"><div><span>{ngo?.ngo_name || 'NGO-approved donation'}</span><h2>{task.listing.food_type}</h2></div><span className="volunteer-open-tag">Ready for pickup</span></div>
                                            <p className="volunteer-open-donor">Donor: {task.donorName}</p>
                                            <p className="volunteer-open-meta">{task.listing.quantity_kg} kg · {task.listing.meal_equivalent || '—'} meals</p>
                                            <div className="volunteer-address"><MapPin size={16} /><span>{task.listing.pickup_address}</span></div>
                                            {distance && <small className="volunteer-distance">Approx. {distance} km away in a straight line</small>}
                                            <button type="button" className="volunteer-accept-button" onClick={() => handleAccept(task.delivery_id)} disabled={Boolean(acceptingId) || !volunteer?.availability_status}>
                                                {acceptingId === task.delivery_id ? 'Accepting…' : 'Accept pickup'}
                                            </button>
                                        </article>
                                    )
                                })}
                            </div>
                            <div className="volunteer-open-map-card">
                                {taskRows.length ? (
                                    <MapContainer center={taskRows[0].point} zoom={11} className="volunteer-open-map" scrollWheelZoom>
                                        <TileLayer url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                                        <FitMap points={mapPoints} />
                                        {taskRows.map((task) => (
                                            <Marker key={task.delivery_id} position={task.point} icon={pin}>
                                                <Popup><strong>{task.listing.food_type}</strong><br />Donor: {task.donorName}<br />{task.listing.pickup_address}<br />{one(task.ngo_claims)?.ngos?.ngo_name}</Popup>
                                            </Marker>
                                        ))}
                                        {availabilityPoint && <Marker position={availabilityPoint} icon={mePin}><Popup>Your shared location</Popup></Marker>}
                                    </MapContainer>
                                ) : <div className="volunteer-map-missing"><MapPin size={20} />Pickup map will appear when a donation is approved.</div>}
                            </div>
                        </section>
                    </>
                )}
                <section className="volunteer-history">
                    <div className="volunteer-history__heading"><div><span className="volunteer-panel-label">PICKUP HISTORY</span><h2>Completed and failed pickups</h2></div><small>{history.length} records</small></div>
                    {history.length === 0 ? (
                        <div className="volunteer-history-empty">Completed or failed pickups will appear here.</div>
                    ) : (
                        <div className="volunteer-history-list">
                            {history.map((delivery) => {
                                const claim = one(delivery.ngo_claims)
                                const listing = one(claim?.food_listings)
                                const donor = one(one(listing?.donors)?.profiles)
                                const donorName = getDonorDisplayName(donor, 'Donor')
                                const status = delivery.delivery_status === 'delivered' ? 'Delivered' : 'Failed'
                                const timestamp = delivery.delivery_time || delivery.created_at
                                return (
                                    <article className="volunteer-history-card" key={delivery.delivery_id}>
                                        <div className="volunteer-history-card__top"><div><strong>{listing?.food_type || 'Food donation'}</strong><span>{one(claim?.ngos)?.ngo_name || 'NGO'}</span></div><span className={`volunteer-history-status volunteer-history-status--${delivery.delivery_status}`}>{status}</span></div>
                                        <p className="volunteer-history-meta">{listing?.quantity_kg ?? '—'} kg · {listing?.meal_equivalent ?? '—'} meals · Donor: {donorName}</p>
                                        <p className="volunteer-history-address">{listing?.pickup_address || 'Pickup address unavailable'}</p>
                                        <small>{timestamp ? new Date(timestamp).toLocaleString() : 'Date unavailable'} · Trip distance not recorded</small>
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </section>
            </div>
        </main>
    )
}
