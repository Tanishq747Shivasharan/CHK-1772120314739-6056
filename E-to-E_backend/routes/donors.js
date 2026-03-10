const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { donorOnly } = require('../middleware/roleGuards');
const { getDonorImpact } = require('../services/impactService');

router.post('/', authenticateUser, donorOnly, async (req, res) => {
  try {
    const {
      business_type,
      address,
      city,
      latitude,
      longitude,
      csr_participant
    } = req.body;

    if (!address || !city || !latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['address', 'city', 'latitude', 'longitude']
      });
    }

    const { data: existing } = await supabaseAdmin
      .from('donors')
      .select('donor_id')
      .eq('profile_id', req.user.id)
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'Donor profile already exists',
        donor_id: existing.donor_id
      });
    }

    const { data: donor, error } = await supabaseAdmin
      .from('donors')
      .insert({
        profile_id: req.user.id,
        business_type,
        address,
        city,
        latitude,
        longitude,
        csr_participant: csr_participant || false,
        verification_status: false
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to create donor profile',
        message: error.message
      });
    }

    res.status(201).json({
      message: 'Donor profile created successfully',
      donor
    });

  } catch (error) {
    console.error('Create donor error:', error);
    res.status(500).json({
      error: 'Failed to create donor profile',
      message: error.message
    });
  }
});

router.get('/me', authenticateUser, donorOnly, async (req, res) => {
  try {
    const { data: donor, error } = await supabaseAdmin
      .from('donors')
      .select(`
        *,
        profiles (
          full_name,
          email,
          phone,
          organization_name
        )
      `)
      .eq('profile_id', req.user.id)
      .single();

    if (error || !donor) {
      return res.status(404).json({
        error: 'Donor profile not found'
      });
    }

    res.json({
      donor
    });

  } catch (error) {
    console.error('Get donor error:', error);
    res.status(500).json({
      error: 'Failed to get donor profile',
      message: error.message
    });
  }
});

router.put('/me', authenticateUser, donorOnly, async (req, res) => {
  try {
    const {
      business_type,
      address,
      city,
      latitude,
      longitude,
      csr_participant
    } = req.body;

    const updates = {};
    if (business_type !== undefined) updates.business_type = business_type;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (csr_participant !== undefined) updates.csr_participant = csr_participant;

    const { data: donor, error } = await supabaseAdmin
      .from('donors')
      .update(updates)
      .eq('profile_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to update donor profile',
        message: error.message
      });
    }

    res.json({
      message: 'Donor profile updated successfully',
      donor
    });

  } catch (error) {
    console.error('Update donor error:', error);
    res.status(500).json({
      error: 'Failed to update donor profile',
      message: error.message
    });
  }
});

router.get('/me/impact', authenticateUser, donorOnly, async (req, res) => {
  try {
    const { data: donor } = await supabaseAdmin
      .from('donors')
      .select('donor_id')
      .eq('profile_id', req.user.id)
      .single();

    if (!donor) {
      return res.status(404).json({
        error: 'Donor profile not found'
      });
    }

    const result = await getDonorImpact(donor.donor_id);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get impact metrics',
        message: result.error
      });
    }

    res.json({
      impact: result.impact
    });

  } catch (error) {
    console.error('Get donor impact error:', error);
    res.status(500).json({
      error: 'Failed to get impact metrics',
      message: error.message
    });
  }
});

router.get('/:donor_id', async (req, res) => {
  try {
    const { donor_id } = req.params;

    const { data: donor, error } = await supabaseAdmin
      .from('donors')
      .select(`
        donor_id,
        business_type,
        city,
        verification_status,
        profiles (
          organization_name
        )
      `)
      .eq('donor_id', donor_id)
      .single();

    if (error || !donor) {
      return res.status(404).json({
        error: 'Donor not found'
      });
    }

    res.json({
      donor
    });

  } catch (error) {
    console.error('Get donor error:', error);
    res.status(500).json({
      error: 'Failed to get donor',
      message: error.message
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const { city, verified } = req.query;

    let query = supabaseAdmin
      .from('donors')
      .select(`
        donor_id,
        business_type,
        city,
        verification_status,
        created_at,
        profiles (
          organization_name
        )
      `);

    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    if (verified !== undefined) {
      query = query.eq('verification_status', verified === 'true');
    }

    query = query.order('created_at', { ascending: false });

    const { data: donors, error } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch donors',
        message: error.message
      });
    }

    res.json({
      donors,
      count: donors.length
    });

  } catch (error) {
    console.error('List donors error:', error);
    res.status(500).json({
      error: 'Failed to list donors',
      message: error.message
    });
  }
});

router.put('/:donor_id/verify', authenticateUser, async (req, res) => {
  try {
    const { donor_id } = req.params;
    const { verification_status } = req.body;

    if (typeof verification_status !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['verification_status (boolean)']
      });
    }

    const { data: donor, error } = await supabaseAdmin
      .from('donors')
      .update({ verification_status })
      .eq('donor_id', donor_id)
      .select()
      .single();

    if (error || !donor) {
      return res.status(404).json({
        error: 'Donor not found or update failed',
        message: error?.message
      });
    }

    res.json({
      message: `Donor ${verification_status ? 'approved' : 'denied'} successfully`,
      donor
    });

  } catch (error) {
    console.error('Verify donor error:', error);
    res.status(500).json({
      error: 'Failed to update donor verification',
      message: error.message
    });
  }
});

module.exports = router;