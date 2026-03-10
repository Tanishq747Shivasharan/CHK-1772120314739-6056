const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { ngoOnly, adminOnly } = require('../middleware/roleGuards');
const { getNGOImpact } = require('../services/impactService');

router.post('/', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const {
      ngo_name,
      registration_number,
      address,
      city,
      latitude,
      longitude,
      service_radius_km,
      contact_person
    } = req.body;

    if (!ngo_name || !address || !city || !latitude || !longitude || !contact_person) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['ngo_name', 'address', 'city', 'latitude', 'longitude', 'contact_person']
      });
    }

    const { data: existing } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id')
      .eq('profile_id', req.user.id)
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'NGO profile already exists',
        ngo_id: existing.ngo_id
      });
    }

    const { data: ngo, error } = await supabaseAdmin
      .from('ngos')
      .insert({
        profile_id: req.user.id,
        ngo_name,
        registration_number,
        address,
        city,
        latitude,
        longitude,
        service_radius_km: service_radius_km || 10.0,
        contact_person,
        verification_status: false
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to create NGO profile',
        message: error.message
      });
    }

    res.status(201).json({
      message: 'NGO profile created successfully',
      ngo
    });

  } catch (error) {
    console.error('Create NGO error:', error);
    res.status(500).json({
      error: 'Failed to create NGO profile',
      message: error.message
    });
  }
});

router.get('/me', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { data: ngo, error } = await supabaseAdmin
      .from('ngos')
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

    if (error || !ngo) {
      return res.json({
        ngo: null,
        message: 'NGO profile not found'
      });
    }

    res.json({
      ngo
    });

  } catch (error) {
    console.error('Get NGO error:', error);
    res.status(500).json({
      error: 'Failed to get NGO profile',
      message: error.message
    });
  }
});

router.put('/me', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const {
      ngo_name,
      registration_number,
      address,
      city,
      latitude,
      longitude,
      service_radius_km,
      contact_person
    } = req.body;

    const updates = {};
    if (ngo_name !== undefined) updates.ngo_name = ngo_name;
    if (registration_number !== undefined) updates.registration_number = registration_number;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (service_radius_km !== undefined) updates.service_radius_km = service_radius_km;
    if (contact_person !== undefined) updates.contact_person = contact_person;

    const { data: ngo, error } = await supabaseAdmin
      .from('ngos')
      .update(updates)
      .eq('profile_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to update NGO profile',
        message: error.message
      });
    }

    res.json({
      message: 'NGO profile updated successfully',
      ngo
    });

  } catch (error) {
    console.error('Update NGO error:', error);
    res.status(500).json({
      error: 'Failed to update NGO profile',
      message: error.message
    });
  }
});

router.get('/me/impact', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }

    const result = await getNGOImpact(ngo.ngo_id);

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
    console.error('Get NGO impact error:', error);
    res.status(500).json({
      error: 'Failed to get impact metrics',
      message: error.message
    });
  }
});

router.get('/', authenticateUser, async (req, res) => {
  try {
    const { city, verified } = req.query;

    let query = supabaseAdmin
      .from('ngos')
      .select(`
        ngo_id,
        ngo_name,
        address,
        city,
        latitude,
        longitude,
        service_radius_km,
        verification_status,
        contact_person,
        created_at,
        profiles (
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

    query = query.order('created_at', { ascending: false });

    const { data: ngos, error } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch NGOs',
        message: error.message
      });
    }

    res.json({
      ngos,
      count: ngos.length
    });

  } catch (error) {
    console.error('List NGOs error:', error);
    res.status(500).json({
      error: 'Failed to list NGOs',
      message: error.message
    });
  }
});

router.post('/me/volunteers', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { full_name, phone, vehicle_type } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['full_name', 'phone']
      });
    }

    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }

    const { data: volunteer, error } = await supabaseAdmin
      .from('volunteers')
      .insert({
        ngo_id: ngo.ngo_id,
        full_name,
        phone,
        vehicle_type: vehicle_type || null,
        availability_status: true
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to add volunteer',
        message: error.message
      });
    }

    res.status(201).json({
      message: 'Volunteer added successfully',
      volunteer
    });

  } catch (error) {
    console.error('Add volunteer error:', error);
    res.status(500).json({
      error: 'Failed to add volunteer',
      message: error.message
    });
  }
});

router.get('/me/volunteers', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }

    const { data: volunteers, error } = await supabaseAdmin
      .from('volunteers')
      .select('*')
      .eq('ngo_id', ngo.ngo_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch volunteers',
        message: error.message
      });
    }

    res.json({
      volunteers,
      count: volunteers.length
    });

  } catch (error) {
    console.error('Get volunteers error:', error);
    res.status(500).json({
      error: 'Failed to get volunteers',
      message: error.message
    });
  }
});

router.put('/me/volunteers/:volunteer_id', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { volunteer_id } = req.params;
    const { full_name, phone, vehicle_type, availability_status } = req.body;

    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (vehicle_type !== undefined) updates.vehicle_type = vehicle_type;
    if (availability_status !== undefined) updates.availability_status = availability_status;

    const { data: volunteer, error } = await supabaseAdmin
      .from('volunteers')
      .update(updates)
      .eq('volunteer_id', volunteer_id)
      .eq('ngo_id', ngo.ngo_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to update volunteer',
        message: error.message
      });
    }

    res.json({
      message: 'Volunteer updated successfully',
      volunteer
    });

  } catch (error) {
    console.error('Update volunteer error:', error);
    res.status(500).json({
      error: 'Failed to update volunteer',
      message: error.message
    });
  }
});

router.delete('/me/volunteers/:volunteer_id', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { volunteer_id } = req.params;

    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }

    const { error } = await supabaseAdmin
      .from('volunteers')
      .delete()
      .eq('volunteer_id', volunteer_id)
      .eq('ngo_id', ngo.ngo_id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to remove volunteer',
        message: error.message
      });
    }

    res.json({
      message: 'Volunteer removed successfully'
    });

  } catch (error) {
    console.error('Remove volunteer error:', error);
    res.status(500).json({
      error: 'Failed to remove volunteer',
      message: error.message
    });
  }
});

router.put('/:ngo_id/verify', authenticateUser, adminOnly, async (req, res) => {
  try {
    const { ngo_id } = req.params;
    const { verification_status } = req.body;

    if (typeof verification_status !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['verification_status (boolean)']
      });
    }

    const { data: ngo, error } = await supabaseAdmin
      .from('ngos')
      .update({ verification_status })
      .eq('ngo_id', ngo_id)
      .select()
      .single();

    if (error || !ngo) {
      return res.status(404).json({
        error: 'NGO not found or update failed',
        message: error?.message
      });
    }

    res.json({
      message: `NGO ${verification_status ? 'approved' : 'denied'} successfully`,
      ngo
    });

  } catch (error) {
    console.error('Verify NGO error:', error);
    res.status(500).json({
      error: 'Failed to update NGO verification',
      message: error.message
    });
  }
});

module.exports = router;
