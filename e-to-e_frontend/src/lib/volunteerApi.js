const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('access_token')
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        },
    })
    const data = await response.json()
    if (!response.ok) throw { status: response.status, ...data }
    return data
}

export const getAvailablePickups = () => apiFetch('/deliveries/volunteer/available')
export const getActivePickup = () => apiFetch('/deliveries/volunteer/active')
export const getPickupHistory = () => apiFetch('/deliveries/volunteer/history')
export const setVolunteerAvailability = (available) => apiFetch('/deliveries/volunteer/availability', {
    method: 'PUT',
    body: JSON.stringify({ available }),
})
export const updateAvailabilityLocation = ({ latitude, longitude }) => apiFetch('/deliveries/volunteer/availability-location', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
})
export const clearAvailabilityLocation = () => apiFetch('/deliveries/volunteer/availability-location', {
    method: 'DELETE',
})

export const acceptPickup = (deliveryId) => apiFetch(`/deliveries/${deliveryId}/accept`, {
    method: 'POST',
})

export const cancelPickup = (deliveryId) => apiFetch(`/deliveries/${deliveryId}/cancel`, {
    method: 'POST',
})

export const updateVolunteerLocation = (deliveryId, { latitude, longitude, accuracy_m }) =>
    apiFetch(`/deliveries/${deliveryId}/location`, {
        method: 'POST',
        body: JSON.stringify({ latitude, longitude, accuracy_m }),
    })

export const verifyPickupCode = (deliveryId, code) => apiFetch(`/deliveries/${deliveryId}/verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ code }),
})
