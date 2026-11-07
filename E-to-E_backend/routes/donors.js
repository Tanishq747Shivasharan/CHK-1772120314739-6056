const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { donorOnly, adminOnly, requireRole } = require('../middleware/roleGuards');
const { getDonorImpact } = require('../services/impactService');

const validText = (value, maxLength) => typeof value === 'string'
  && value.trim().length > 0
  && value.trim().length <= maxLength;
const validCoordinate = (value, maxAbs) => {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !value.trim())) return false;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= maxAbs;
};
const validCoordinates = (latitude, longitude) => {
  return validCoordinate(latitude, 90) && validCoordinate(longitude, 180);
};

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

    if (!validText(address, 500) || !validText(city, 100) || !validCoordinates(latitude, longitude)
      || (business_type !== undefined && business_type !== null && !validText(business_type, 100))
      || (csr_participant !== undefined && typeof csr_participant !== 'boolean')) {
      return res.status(400).json({
        error: 'Invalid donor profile details'
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
        business_type: business_type?.trim() || null,
        address: address.trim(),
        city: city.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        csr_participant: csr_participant ?? false,
        verification_status: false
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to create donor profile',
        message: 'The request could not be completed.'
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
      message: 'The request could not be completed.'
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
      message: 'The request could not be completed.'
    });
  }
});

router.put('/me', authenticateUser, donorOnly, async (req, res) => {
  try {
    const {
      full_name,
      phone,
      organization_name,
      business_type,
      address,
      city,
      latitude,
      longitude,
      csr_participant
    } = req.body;

    if ((business_type !== undefined && business_type !== null && !validText(business_type, 100))
      || (address !== undefined && !validText(address, 500))
      || (city !== undefined && !validText(city, 100))
      || (latitude !== undefined && !validCoordinate(latitude, 90))
      || (longitude !== undefined && !validCoordinate(longitude, 180))
      || (csr_participant !== undefined && typeof csr_participant !== 'boolean')
      || (full_name !== undefined && !validText(full_name, 120))
      || (phone !== undefined && !validText(phone, 32))
      || (organization_name !== undefined && organization_name !== null && !validText(organization_name, 160))) {
      return res.status(400).json({ error: 'Invalid donor profile details' });
    }

    const donorUpdates = {};
    if (business_type !== undefined) donorUpdates.business_type = business_type?.trim() || null;
    if (address !== undefined) donorUpdates.address = address.trim();
    if (city !== undefined) donorUpdates.city = city.trim();
    if (latitude !== undefined) donorUpdates.latitude = Number(latitude);
    if (longitude !== undefined) donorUpdates.longitude = Number(longitude);
    if (csr_participant !== undefined) donorUpdates.csr_participant = csr_participant;

    const profileUpdates = {};
    if (full_name !== undefined) profileUpdates.full_name = full_name.trim();
    if (phone !== undefined) profileUpdates.phone = phone.trim();
    if (organization_name !== undefined) profileUpdates.organization_name = organization_name?.trim() || null;

    if (Object.keys(profileUpdates).length === 0 && Object.keys(donorUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid donor profile updates provided' });
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', req.user.id);

      if (profileError) {
        return res.status(500).json({
          error: 'Failed to update profile details',
          message: 'The request could not be completed.'
        });
      }
    }

    if (Object.keys(donorUpdates).length > 0) {
      const { error: donorUpdateError } = await supabaseAdmin
        .from('donors')
        .update(donorUpdates)
        .eq('profile_id', req.user.id);

      if (donorUpdateError) {
        return res.status(500).json({
          error: 'Failed to update donor profile',
          message: 'The request could not be completed.'
        });
      }
    }

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
      message: 'Donor profile updated successfully',
      donor
    });

  } catch (error) {
    console.error('Update donor error:', error);
    res.status(500).json({
      error: 'Failed to update donor profile',
      message: 'The request could not be completed.'
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
        message: 'The request could not be completed.'
      });
    }

    res.json({
      impact: result.impact
    });

  } catch (error) {
    console.error('Get donor impact error:', error);
    res.status(500).json({
      error: 'Failed to get impact metrics',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/:donor_id', authenticateUser, requireRole('ngo', 'admin'), async (req, res) => {
  try {
    const { donor_id } = req.params;

    let query = supabaseAdmin
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
      .eq('donor_id', donor_id);
    if (req.user.role !== 'admin') query = query.eq('verification_status', true);
    const { data: donor, error } = await query.maybeSingle();

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
      message: 'The request could not be completed.'
    });
  }
});

router.get('/', authenticateUser, adminOnly, async (req, res) => {
  try {
    const { city, verified } = req.query;
    if (city !== undefined && (typeof city !== 'string' || city.length > 100)) {
      return res.status(400).json({ error: 'Invalid city filter' });
    }
    if (verified !== undefined && !['true', 'false'].includes(verified)) {
      return res.status(400).json({ error: 'Invalid verification filter' });
    }

    let query = supabaseAdmin
      .from('donors')
      .select(`
        donor_id,
        business_type,
        address,
        city,
        latitude,
        longitude,
        csr_participant,
        verification_status,
        created_at,
        profiles (
          organization_name,
          phone,
          email
        )
      `);

    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    if (verified !== undefined) {
      query = query.eq('verification_status', verified === 'true');
    }

    query = query.order('created_at', { ascending: false }).limit(100);

    const { data: donors, error } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch donors',
        message: 'Donor records could not be loaded.'
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
      message: 'Donor records could not be loaded.'
    });
  }
});

router.put('/:donor_id/verify', authenticateUser, adminOnly, async (req, res) => {
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
        message: 'The verification status could not be updated.'
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
      message: 'The request could not be completed.'
    });
  }
});

module.exports = router;
