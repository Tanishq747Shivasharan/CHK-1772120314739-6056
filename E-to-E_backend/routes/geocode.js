const express = require('express');
const router = express.Router();
const { createRateLimiter } = require('../middleware/rateLimit');

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
router.use(createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Too many geocoding requests. Please try again shortly.'
}));

async function fetchNominatim(url) {
    return fetch(url, {
        headers: {
            'User-Agent': 'ExtraToEssential-FoodRedistribution/1.0',
            'Accept': 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
    });
}

router.get('/reverse', async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lon = Number(req.query.lon);
        if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
            return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
        }
        const zoom = req.query.zoom === undefined ? 18 : Number(req.query.zoom);
        if (!Number.isInteger(zoom) || zoom < 1 || zoom > 18) {
            return res.status(400).json({ error: 'Invalid zoom value.' });
        }
        const params = new URLSearchParams({
            format: 'jsonv2',
            lat: String(lat),
            lon: String(lon),
            zoom: String(zoom),
            addressdetails: '1',
        }).toString();
        const url = `${NOMINATIM_BASE}/reverse?${params}`;
        const response = await fetchNominatim(url);

        if (!response) {
            return res.status(500).json({
                error: 'No response received from geocoding service'
            });
        }

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Geocoding request failed',
                status: response.status,
            });
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            return res.status(500).json({
                error: 'Invalid JSON received from geocoding service',
                message: 'The geocoding service returned an invalid response.'
            });
        }

        res.json(data);

    } catch (error) {
        console.error('Reverse geocode proxy error:', error);
        res.status(500).json({
            error: 'Geocoding proxy error',
            message: 'The geocoding service is temporarily unavailable.',
        });
    }
});

router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (typeof query !== 'string' || query.trim().length < 3 || query.trim().length > 200) {
            return res.status(400).json({ error: 'Search text must be between 3 and 200 characters.' });
        }
        const params = new URLSearchParams({
            format: 'jsonv2',
            q: query.trim(),
            limit: '5',
            addressdetails: '1',
            countrycodes: 'in',
        }).toString();
        const url = `${NOMINATIM_BASE}/search?${params}`;
        const response = await fetchNominatim(url);

        if (!response) {
            return res.status(500).json({
                error: 'No response received from geocoding service'
            });
        }

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Geocoding search failed',
                status: response.status,
            });
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            return res.status(500).json({
                error: 'Invalid JSON received from geocoding service',
                message: 'The geocoding service returned an invalid response.'
            });
        }

        res.json(data);

    } catch (error) {
        console.error('Search geocode proxy error:', error);
        res.status(500).json({
            error: 'Geocoding proxy error',
            message: 'The geocoding service is temporarily unavailable.',
        });
    }
});

module.exports = router;
