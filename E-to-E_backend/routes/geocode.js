const express = require('express');
const router = express.Router();

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

router.get('/reverse', async (req, res) => {
    try {

        if (!req.query || Object.keys(req.query).length === 0) {
            return res.status(400).json({
                error: 'Missing query parameters'
            });
        }

        const params = new URLSearchParams(req.query).toString();
        const url = `${NOMINATIM_BASE}/reverse?${params}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'ExtraToEssential-FoodRedistribution/1.0',
                'Accept': 'application/json',
            },
        });

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
                message: jsonError.message
            });
        }

        res.json(data);

    } catch (error) {
        console.error('Reverse geocode proxy error:', error);
        res.status(500).json({
            error: 'Geocoding proxy error',
            message: error.message,
        });
    }
});

router.get('/search', async (req, res) => {
    try {

        if (!req.query || Object.keys(req.query).length === 0) {
            return res.status(400).json({
                error: 'Missing query parameters'
            });
        }

        const params = new URLSearchParams(req.query).toString();
        const url = `${NOMINATIM_BASE}/search?${params}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'ExtraToEssential-FoodRedistribution/1.0',
                'Accept': 'application/json',
            },
        });

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
                message: jsonError.message
            });
        }

        res.json(data);

    } catch (error) {
        console.error('Search geocode proxy error:', error);
        res.status(500).json({
            error: 'Geocoding proxy error',
            message: error.message,
        });
    }
});

module.exports = router;