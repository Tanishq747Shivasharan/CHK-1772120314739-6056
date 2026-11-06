import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Clock3, Copy, LocateFixed, MapPin, Navigation, RefreshCw, Route as RouteIcon, Utensils } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { getMyDonorDeliveries, resendPickupCode } from '../../lib/donorApi'
import 'leaflet/dist/leaflet.css'

const one = (value) => Array.isArray(value) ? value[0] : value
const coordinates = (lat, lng) => {
    const latitude = Number(lat)
    const longitude = Number(lng)
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? [latitude, longitude]
        : null
}
const decodePointKey = (key) => key ? key.split(',').map(Number) : null
const isFresh = (value, maxAge = 90_000) => value && Date.now() - new Date(value).getTime() <= maxAge
const minutesAgo = (value) => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)) : null

const pickupIcon = L.divIcon({
    className: 'live-map-icon live-map-icon--pickup',
    html: '<span aria-hidden="true">♧</span>',
    iconSize: [42, 42],
    iconAnchor: [21, 38],
})

function volunteerIcon(name, stale = false) {
    const initial = String(name || 'V').trim().slice(0, 1).toUpperCase().replace(/[&<>"']/g, '') || 'V'
    return L.divIcon({
        className: `live-map-icon live-map-icon--volunteer${stale ? ' live-map-icon--stale' : ''}`,
        html: `<span>${initial}</span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
    })
}

function MapViewport({ pickup, volunteer, candidates, focus, fitKey }) {
    const map = useMap()
    const pickupKey = pickup?.join(',') || ''
    const volunteerKey = volunteer?.join(',') || ''
    const candidateKey = (candidates || []).map((point) => point.join(',')).join(';')
    const points = useMemo(() => [
        decodePointKey(pickupKey),
        decodePointKey(volunteerKey),
        ...(candidateKey ? candidateKey.split(';').map(decodePointKey) : []),
    ].filter(Boolean), [pickupKey, volunteerKey, candidateKey])
    useEffect(() => {
        if (points.length > 1) map.fitBounds(points, { padding: [50, 50], maxZoom: 15, animate: true })
        else if (points.length === 1) map.flyTo(points[0], 15, { duration: 0.6 })
    }, [map, fitKey, points])

    useEffect(() => {
        if (focus === 'pickup' && pickupKey) map.flyTo(decodePointKey(pickupKey), 16, { duration: 0.6 })
        const firstCandidateKey = candidateKey.split(';')[0]
        const focusVolunteer = volunteerKey || firstCandidateKey
        if (focus === 'volunteer' && focusVolunteer) map.flyTo(decodePointKey(focusVolunteer), 16, { duration: 0.6 })
    }, [focus, map, pickupKey, volunteerKey, candidateKey])
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
        const duration = 800
        let frame
        const animate = (now) => {
            const progress = Math.min(1, (now - start) / duration)
            const eased = 1 - (1 - progress) ** 3
            const next = [
                from[0] + (latitude - from[0]) * eased,
                from[1] + (longitude - from[1]) * eased,
            ]
            current.current = next
            setDisplayPosition(next)
            if (progress < 1) frame = requestAnimationFrame(animate)
        }
        frame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frame)
    }, [latitude, longitude])
    return <Marker position={displayPosition} icon={icon}>{children}</Marker>
}

const timelineLabels = [
    'Donation created',
    'NGO approved',
    'Volunteer assigned',
    'Volunteer on the way',
    'Volunteer arrived',
    'OTP verified',
    'Food collected',
    'Donation completed',
]

function formatTime(value) {
    if (!value) return ''
    return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function haversineKm(a, b) {
    const rad = (degrees) => degrees * Math.PI / 180
    const dLat = rad(b[0] - a[0])
    const dLng = rad(b[1] - a[1])
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export default function TrackingMap({ listings = [], deliveries = [] }) {
    const [selectedId, setSelectedId] = useState(deliveries.find((delivery) => !['delivered', 'failed'].includes(delivery.delivery_status))?.delivery_id || deliveries[0]?.delivery_id || '')
    const selected = deliveries.find((delivery) => delivery.delivery_id === selectedId) || deliveries.find((delivery) => !['delivered', 'failed'].includes(delivery.delivery_status)) || deliveries[0] || null
    const [liveOverrides, setLiveOverrides] = useState({})
    const selectedDeliveryId = selected?.delivery_id || ''
    const liveDelivery = selected ? { ...selected, ...(liveOverrides[selectedDeliveryId] || {}) } : null
    const [routeData, setRouteData] = useState(null)
    const [routeFailure, setRouteFailure] = useState(null)
    const [focus, setFocus] = useState('')
    const [resendState, setResendState] = useState('')
    const lastRouteOrigin = useRef(null)
    const routeController = useRef(null)
    const lastRouteDelivery = useRef('')
    const codeFetchForDelivery = useRef('')

    useEffect(() => () => routeController.current?.abort(), [])

    useEffect(() => {
        if (!selectedDeliveryId || ['delivered', 'failed'].includes(liveDelivery?.delivery_status)) return undefined
        let channel
        let cancelled = false
        const token = localStorage.getItem('access_token')
        if (token) supabase.realtime.setAuth(token)
        channel = supabase
            .channel(`donor-delivery-${selectedDeliveryId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'deliveries',
                filter: `delivery_id=eq.${selectedDeliveryId}`,
            }, (payload) => {
                if (!cancelled && payload.new) {
                    setLiveOverrides((current) => ({
                        ...current,
                        [selectedDeliveryId]: { ...current[selectedDeliveryId], ...payload.new },
                    }))
                }
            })
            .subscribe()
        return () => {
            cancelled = true
            if (channel) supabase.removeChannel(channel)
        }
    }, [selectedDeliveryId, liveDelivery?.delivery_status])

    useEffect(() => {
        if (!selectedDeliveryId || !liveDelivery?.volunteer_id || liveDelivery?.collection_code
            || codeFetchForDelivery.current === selectedDeliveryId) return undefined
        let cancelled = false
        codeFetchForDelivery.current = selectedDeliveryId
        getMyDonorDeliveries()
            .then(({ deliveries: currentDeliveries = [] }) => {
                if (cancelled) return
                const currentDelivery = currentDeliveries.find((delivery) => delivery.delivery_id === selectedDeliveryId)
                if (currentDelivery) {
                    setLiveOverrides((current) => ({
                        ...current,
                        [selectedDeliveryId]: { ...current[selectedDeliveryId], ...currentDelivery },
                    }))
                }
            })
            .catch(() => {
                if (!cancelled) codeFetchForDelivery.current = ''
            })
        return () => {
            cancelled = true
            if (codeFetchForDelivery.current === selectedDeliveryId) codeFetchForDelivery.current = ''
        }
    }, [selectedDeliveryId, liveDelivery?.volunteer_id, liveDelivery?.collection_code])

    const claim = one(selected?.ngo_claims)
    const listing = one(claim?.food_listings) || listings.find((row) => row.listing_id === selected?.listing_id) || null
    const volunteer = one(selected?.volunteers)
    const pickup = coordinates(listing?.latitude, listing?.longitude)
    const livePoint = coordinates(liveDelivery?.location_latitude, liveDelivery?.location_longitude)
    const locationFresh = isFresh(liveDelivery?.location_updated_at)
    const liveVolunteer = locationFresh ? livePoint : null
    const pickupCode = liveDelivery?.collection_code
        && isFresh(liveDelivery.collection_code_expires_at, 0)
        ? liveDelivery.collection_code
        : null
    const availableCandidates = liveDelivery?.volunteer_id ? [] : (selected?.available_volunteers || []).map((candidate) => ({
            ...candidate,
            point: coordinates(candidate.latitude, candidate.longitude),
        })).filter((candidate) => candidate.point && isFresh(candidate.location_updated_at, 5 * 60_000))
    const nearestCandidate = pickup && availableCandidates.length
        ? availableCandidates
            .map((candidate) => ({ ...candidate, distanceKm: haversineKm(candidate.point, pickup) }))
            .sort((a, b) => a.distanceKm - b.distanceKm)[0]
        : null
    const routeOrigin = liveVolunteer || nearestCandidate?.point || null
    const pickupKey = pickup?.join(',') || ''
    const routeOriginKey = routeOrigin?.join(',') || ''
    const candidatePoints = availableCandidates.map((candidate) => candidate.point)
    const mapPoints = pickup ? [pickup, ...(livePoint ? [livePoint] : candidatePoints)] : []
    const candidateKey = availableCandidates.map((candidate) => candidate.volunteer_id).join('|')
    const mapFitKey = `${selected?.delivery_id || ''}:${livePoint ? 'assigned-volunteer' : candidateKey}`
    const isComplete = liveDelivery?.delivery_status === 'delivered'
    const selectedVolunteerId = liveDelivery?.volunteer_id || ''
    const routeMatches = routeData?.deliveryId === selectedDeliveryId
        && routeData?.pickupKey === pickupKey
        && routeData?.origin
        && routeOrigin
        && haversineKm(routeData.origin, routeOrigin) < 0.08
    const route = routeMatches ? routeData.route : null
    const eta = routeMatches ? routeData.eta : null
    const routeError = routeFailure?.deliveryId === selectedDeliveryId && routeFailure?.pickupKey === pickupKey
        ? routeFailure.message
        : ''

    useEffect(() => {
        if (lastRouteDelivery.current !== selectedDeliveryId) {
            routeController.current?.abort()
            lastRouteOrigin.current = null
            lastRouteDelivery.current = selectedDeliveryId
        }
        const routePickup = decodePointKey(pickupKey)
        const routeStart = decodePointKey(routeOriginKey)
        if (!routePickup || !routeStart || (selectedVolunteerId && !locationFresh) || isComplete) {
            routeController.current?.abort()
            lastRouteOrigin.current = null
            return undefined
        }
        const movedKm = lastRouteOrigin.current ? haversineKm(lastRouteOrigin.current, routeStart) : Infinity
        if (movedKm < 0.08) return undefined

        routeController.current?.abort()
        const controller = new AbortController()
        routeController.current = controller
        const routingUrl = (import.meta.env.VITE_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving').replace(/\/$/, '')
        const url = `${routingUrl}/${routeStart[1]},${routeStart[0]};${routePickup[1]},${routePickup[0]}?overview=full&geometries=geojson`
        lastRouteOrigin.current = routeStart
        fetch(url, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error('Routing service is unavailable')
                return response.json()
            })
            .then((result) => {
                const firstRoute = result.routes?.[0]
                if (!firstRoute?.geometry?.coordinates?.length) throw new Error('No road route found')
                setRouteData({
                    deliveryId: selectedDeliveryId,
                    pickupKey,
                    origin: routeStart,
                    route: firstRoute.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
                    eta: { km: firstRoute.distance / 1000, minutes: Math.max(1, Math.ceil(firstRoute.duration / 60)) },
                })
                setRouteFailure(null)
            })
            .catch((error) => {
                if (error.name !== 'AbortError' && !controller.signal.aborted) {
                    setRouteFailure({ deliveryId: selectedDeliveryId, pickupKey, message: 'Road route is temporarily unavailable' })
                }
            })
    }, [pickupKey, routeOriginKey, locationFresh, isComplete, selectedVolunteerId, selectedDeliveryId])

    const handleResend = async () => {
        if (!selectedDeliveryId) return
        setResendState('Sending…')
        try {
            const result = await resendPickupCode(selectedDeliveryId)
            setLiveOverrides((current) => ({
                ...current,
                [selectedDeliveryId]: {
                    ...current[selectedDeliveryId],
                    collection_code: result.collection_code,
                    collection_code_expires_at: result.collection_code_expires_at,
                },
            }))
            setResendState(result.message || 'Code sent to your registered email.')
        } catch (error) {
            setResendState(error.message || 'Could not resend the pickup code yet.')
        }
    }

    const handleCopyCode = async () => {
        if (!pickupCode) return
        try {
            await navigator.clipboard.writeText(pickupCode)
            setResendState('Pickup code copied.')
        } catch {
            setResendState('Select the code to copy it.')
        }
    }

    const stages = [
        Boolean(listing?.created_at),
        Boolean(claim?.acceptance_time || claim?.claim_id),
        Boolean(liveDelivery?.volunteer_id),
        Boolean(liveDelivery?.volunteer_id && livePoint),
        Boolean(liveDelivery?.collection_verified_at),
        Boolean(liveDelivery?.collection_verified_at),
        Boolean(liveDelivery?.pickup_time || liveDelivery?.collection_verified_at),
        isComplete,
    ]
    const timestamps = [
        listing?.created_at,
        claim?.acceptance_time,
        liveDelivery?.volunteer_assigned_at || (liveDelivery?.volunteer_id ? liveDelivery?.created_at : null),
        liveDelivery?.location_updated_at,
        liveDelivery?.collection_verified_at,
        liveDelivery?.collection_verified_at,
        liveDelivery?.pickup_time,
        liveDelivery?.delivery_time,
    ]

    if (!deliveries.length) {
        return (
            <section className="live-tracking-empty">
                <div className="live-tracking-empty__icon"><Utensils size={22} /></div>
                <h3>No active pickups to track</h3>
                <p>After an NGO approves a donation, a volunteer can accept it and live tracking will appear here.</p>
            </section>
        )
    }

    return (
        <section className="live-tracking-card" aria-label="Live donation tracking">
            {deliveries.length > 1 && (
                <label className="live-tracking-select-label">
                    Donation
                    <select value={selected?.delivery_id || ''} onChange={(event) => setSelectedId(event.target.value)}>
                        {deliveries.map((delivery) => {
                            const food = one(one(delivery.ngo_claims)?.food_listings)?.food_type || 'Donation'
                            return <option key={delivery.delivery_id} value={delivery.delivery_id}>{food}</option>
                        })}
                    </select>
                </label>
            )}
            <div className="live-tracking-grid">
                <div className="live-tracking-map-column">
                    <div className="live-tracking-map-wrap">
                        {pickup ? (
                            <MapContainer center={pickup} zoom={14} className="dd-tracking-map" scrollWheelZoom>
                                <TileLayer
                                    url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                />
                                <MapViewport pickup={pickup} volunteer={livePoint} candidates={candidatePoints} focus={focus} fitKey={mapFitKey} />
                                <SmoothMarker position={pickup} icon={pickupIcon}>
                                    <Popup><strong>Food pickup</strong><br />{listing?.pickup_address || 'Pickup address'}</Popup>
                                </SmoothMarker>
                                {livePoint && (
                                    <SmoothMarker position={livePoint} icon={volunteerIcon(volunteer?.full_name, !locationFresh)}>
                                        <Popup>
                                            <strong>{volunteer?.full_name || 'Assigned volunteer'}</strong><br />
                                            {locationFresh ? 'Location updated just now' : `Last GPS update ${minutesAgo(liveDelivery?.location_updated_at)} min ago · location may be stale`}
                                        </Popup>
                                    </SmoothMarker>
                                )}
                                {availableCandidates.map((candidate) => (
                                    <Marker key={candidate.volunteer_id} position={candidate.point} icon={volunteerIcon(candidate.full_name)}>
                                        <Popup>
                                            <strong>{candidate.full_name}</strong><br />
                                            {candidate.vehicle_type || 'Available volunteer'}<br />
                                            {haversineKm(candidate.point, pickup).toFixed(1)} km from pickup · GPS shared {minutesAgo(candidate.location_updated_at)} min ago
                                        </Popup>
                                    </Marker>
                                ))}
                                {route && <Polyline positions={route} pathOptions={{ color: '#597c4d', weight: 5, opacity: 0.88, className: 'live-route-line' }} />}
                            </MapContainer>
                        ) : (
                            <div className="live-tracking-map-missing"><MapPin size={22} /><span>Pickup coordinates are not available for this donation.</span></div>
                        )}
                        <div className="live-map-controls" aria-label="Map controls">
                            <button type="button" onClick={() => setFocus('pickup')} disabled={!pickup} aria-label="Center map on pickup"><MapPin size={17} /></button>
                            <button type="button" onClick={() => setFocus('volunteer')} disabled={!livePoint && !availableCandidates.length} aria-label="Center map on volunteers"><LocateFixed size={17} /></button>
                        </div>
                        <div className="live-map-status">
                            <span className={`live-status-dot ${locationFresh ? 'is-live' : ''}`} />
                            {locationFresh ? 'Live location' : livePoint ? `Location updated ${minutesAgo(liveDelivery?.location_updated_at)} min ago` : availableCandidates.length ? `${availableCandidates.length} available volunteer${availableCandidates.length === 1 ? '' : 's'} nearby` : 'Waiting for volunteer GPS'}
                        </div>
                    </div>
                    <div className="live-tracking-map-footer">
                        <span><MapPin size={15} />{listing?.pickup_address || 'Pickup address unavailable'}</span>
                        {eta && <strong><RouteIcon size={15} />{eta.km.toFixed(1)} km · {eta.minutes} min {volunteer ? 'away' : 'for nearest volunteer'}</strong>}
                        {routeError && <span className="live-map-warning">{routeError}</span>}
                    </div>
                </div>

                <aside className="live-tracking-details">
                    <div className="live-tracking-title-row">
                        <div>
                            <span className="live-tracking-eyebrow">DONATION TRACKING</span>
                            <h3>{listing?.food_type || 'Food donation'}</h3>
                        </div>
                        <span className={`live-tracking-status ${isComplete ? 'is-complete' : ''}`}>
                            {isComplete ? 'Completed' : liveDelivery?.volunteer_id ? liveDelivery?.delivery_status?.replace('_', ' ') : 'Finding volunteer'}
                        </span>
                    </div>
                    <div className="live-tracking-food"><Utensils size={16} />{listing?.quantity_kg ?? '—'} kg <span>·</span> {one(claim?.ngos)?.ngo_name || 'NGO pickup'}</div>

                    {volunteer ? (
                        <div className="live-volunteer-card">
                            <div className="live-volunteer-avatar">{String(volunteer.full_name || 'V').slice(0, 1).toUpperCase()}</div>
                            <div className="live-volunteer-info">
                                <strong>{volunteer.full_name || 'Volunteer'}</strong>
                                <span>{volunteer.vehicle_type || 'Pickup volunteer'}{locationFresh ? ' · online' : ' · location pending'}</span>
                                <small>Volunteer with {one(claim?.ngos)?.ngo_name || 'the NGO team'}</small>
                            </div>
                            {volunteer.phone && <a className="live-call-button" href={`tel:${volunteer.phone}`} aria-label={`Call ${volunteer.full_name}`}><Navigation size={16} /></a>}
                        </div>
                    ) : (
                        <div className="live-waiting-volunteer"><span className="live-status-dot" />Waiting for an eligible volunteer to accept this pickup.</div>
                    )}

                    {!volunteer && availableCandidates.length > 0 && (
                        <div className="live-candidate-list">
                            <h4>Available volunteers nearby</h4>
                            {availableCandidates.map((candidate) => (
                                <div key={candidate.volunteer_id} className="live-candidate-row">
                                    <span className="live-volunteer-avatar">{String(candidate.full_name || 'V').slice(0, 1).toUpperCase()}</span>
                                    <div><strong>{candidate.full_name}</strong><small>{candidate.vehicle_type || 'Volunteer'} · {haversineKm(candidate.point, pickup).toFixed(1)} km away</small></div>
                                </div>
                            ))}
                        </div>
                    )}

                    {eta && <div className="live-eta-card"><Clock3 size={18} /><div><strong>{eta.minutes} min</strong><span>{eta.km.toFixed(1)} km by road{!volunteer ? ' for nearest volunteer' : ''}</span></div></div>}
                    {liveDelivery?.collection_tracking_enabled && !liveDelivery?.collection_verified_at
                        && !['delivered', 'failed'].includes(liveDelivery?.delivery_status) && (
                        <div className="live-code-card">
                            {pickupCode ? (
                                <div className="live-code-display">
                                    <div><span>PICKUP CODE</span><strong aria-label={`Pickup code ${pickupCode.split('').join(' ')}`}>{pickupCode}</strong></div>
                                    <button type="button" onClick={handleCopyCode} aria-label="Copy pickup code"><Copy size={15} /><span>Copy</span></button>
                                </div>
                            ) : (
                                <p>Your current code is unavailable or expired. Resend it to create a fresh code shown here.</p>
                            )}
                            <p>Share the six-digit code with the volunteer when they arrive. It expires after 10 minutes.</p>
                            <button type="button" onClick={handleResend}><RefreshCw size={14} />Send code again</button>
                            {resendState && <span role="status">{resendState}</span>}
                        </div>
                    )}

                    <div className="live-timeline">
                        <h4>Pickup progress</h4>
                        {timelineLabels.map((label, index) => {
                            const arrived = index === 4 && liveVolunteer && pickup && locationFresh && haversineKm(liveVolunteer, pickup) <= 0.25
                            const complete = stages[index] || arrived
                            return (
                                <div className={`live-timeline-step ${complete ? 'is-complete' : ''}`} key={label}>
                                    <span className="live-timeline-node" />
                                    <div><strong>{label}</strong>{timestamps[index] && <small>{formatTime(timestamps[index])}</small>}</div>
                                </div>
                            )
                        })}
                    </div>
                </aside>
            </div>
            {!mapPoints.length && pickup && <span className="sr-only">Map shows the donation pickup location.</span>}
        </section>
    )
}
