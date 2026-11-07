const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { ngoOnly, adminOnly, requireRole } = require('../middleware/roleGuards');
const { getNGOImpact } = require('../services/impactService');

const validText = (value, maxLength) => typeof value === 'string'
  && value.trim().length > 0
  && value.trim().length <= maxLength;
const validCoordinate = (value, maxAbs) => {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !value.trim())) return false;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= maxAbs;
};

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

    const radius = service_radius_km === undefined || service_radius_km === null || service_radius_km === ''
      ? 10
      : Number(service_radius_km);
    if (!validText(ngo_name, 160) || !validText(address, 500) || !validText(city, 100)
      || !validCoordinate(latitude, 90) || !validCoordinate(longitude, 180)
      || !validText(contact_person, 120)
      || (registration_number !== undefined && registration_number !== null && !validText(registration_number, 100))
      || !Number.isFinite(radius) || radius < 1 || radius > 100) {
      return res.status(400).json({
        error: 'Invalid NGO profile details'
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
        ngo_name: ngo_name.trim(),
        registration_number: registration_number?.trim() || null,
        address: address.trim(),
        city: city.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        service_radius_km: radius,
        contact_person: contact_person.trim(),
        verification_status: false
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to create NGO profile',
        message: 'The request could not be completed.'
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
      message: 'The request could not be completed.'
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
      message: 'The request could not be completed.'
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

    const radius = service_radius_km === undefined ? undefined : Number(service_radius_km);
    if ((ngo_name !== undefined && !validText(ngo_name, 160))
      || (registration_number !== undefined && registration_number !== null && !validText(registration_number, 100))
      || (address !== undefined && !validText(address, 500))
      || (city !== undefined && !validText(city, 100))
      || (latitude !== undefined && !validCoordinate(latitude, 90))
      || (longitude !== undefined && !validCoordinate(longitude, 180))
      || (service_radius_km !== undefined && (!Number.isFinite(radius) || radius < 1 || radius > 100))
      || (contact_person !== undefined && !validText(contact_person, 120))) {
      return res.status(400).json({ error: 'Invalid NGO profile details' });
    }

    const updates = {};
    if (ngo_name !== undefined) updates.ngo_name = ngo_name.trim();
    if (registration_number !== undefined) updates.registration_number = registration_number?.trim() || null;
    if (address !== undefined) updates.address = address.trim();
    if (city !== undefined) updates.city = city.trim();
    if (latitude !== undefined) updates.latitude = Number(latitude);
    if (longitude !== undefined) updates.longitude = Number(longitude);
    if (service_radius_km !== undefined) updates.service_radius_km = radius;
    if (contact_person !== undefined) updates.contact_person = contact_person.trim();
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid NGO profile updates provided' });

    const { data: ngo, error } = await supabaseAdmin
      .from('ngos')
      .update(updates)
      .eq('profile_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to update NGO profile',
        message: 'The request could not be completed.'
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
      message: 'The request could not be completed.'
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
        message: 'The request could not be completed.'
      });
    }

    res.json({
      impact: result.impact
    });

  } catch (error) {
    console.error('Get NGO impact error:', error);
    res.status(500).json({
      error: 'Failed to get impact metrics',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/', authenticateUser, requireRole('admin', 'donor', 'ngo'), async (req, res) => {
  try {
    const { city, verified } = req.query;
    const isAdmin = req.user.role === 'admin';
    if (city !== undefined && (typeof city !== 'string' || city.length > 100)) {
      return res.status(400).json({ error: 'Invalid city filter' });
    }
    if (isAdmin && verified !== undefined && !['true', 'false'].includes(verified)) {
      return res.status(400).json({ error: 'Invalid verification filter' });
    }

    let query = supabaseAdmin
      .from('ngos')
      .select(isAdmin ? `
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
      ` : `
        ngo_id,
        ngo_name,
        city,
        latitude,
        longitude,
        service_radius_km,
        verification_status,
        created_at
      `);

    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    if (!isAdmin) {
      query = query.eq('verification_status', true);
    } else if (verified !== undefined) {
      query = query.eq('verification_status', verified === 'true');
    }

    query = query.order('created_at', { ascending: false }).limit(100);

    const { data: ngos, error } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch NGOs',
        message: 'NGO records could not be loaded.'
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
      message: 'NGO records could not be loaded.'
    });
  }
});

router.post('/me/volunteers', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { full_name, phone, vehicle_type, account_email } = req.body;

    const validVehicles = ['bike', 'scooter', 'car', 'van', 'truck'];
    if (!validText(full_name, 120) || !validText(phone, 32)
      || (vehicle_type !== undefined && vehicle_type !== null && vehicle_type !== '' && !validVehicles.includes(vehicle_type))
      || (account_email !== undefined && account_email !== null
        && (typeof account_email !== 'string' || account_email.length > 254
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account_email)))) {
      return res.status(400).json({ error: 'Invalid volunteer details' });
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

    let volunteerProfileId = null;
    if (account_email) {
      const { data: volunteerProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('email', String(account_email).trim().toLowerCase())
        .maybeSingle();
      if (profileError || !volunteerProfile || volunteerProfile.role !== 'volunteer') {
        return res.status(400).json({
          error: 'Volunteer account not found',
          message: 'Use the email address of an existing volunteer account.'
        });
      }
      volunteerProfileId = volunteerProfile.id;
    }

    const { data: volunteer, error } = await supabaseAdmin
      .from('volunteers')
      .insert({
        ngo_id: ngo.ngo_id,
        full_name: full_name.trim(),
        phone: phone.trim(),
        profile_id: volunteerProfileId,
        vehicle_type: vehicle_type || null,
        availability_status: true
      })
      .select()
      .single();

    if (error) {
      return res.status(error.code === '23505' ? 409 : 500).json({
        error: 'Failed to add volunteer',
        message: error.code === '23505' ? 'This volunteer account is already linked to another volunteer record.' : 'The request could not be completed.'
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
      message: 'The request could not be completed.'
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
      .select('*, profiles(email)')
      .eq('ngo_id', ngo.ngo_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch volunteers',
        message: 'The request could not be completed.'
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
      message: 'The request could not be completed.'
    });
  }
});

router.put('/me/volunteers/:volunteer_id', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { volunteer_id } = req.params;
    const { full_name, phone, vehicle_type, availability_status, account_email } = req.body;
    const validVehicles = ['bike', 'scooter', 'car', 'van', 'truck'];
    if ((full_name !== undefined && !validText(full_name, 120))
      || (phone !== undefined && !validText(phone, 32))
      || (vehicle_type !== undefined && vehicle_type !== null && vehicle_type !== '' && !validVehicles.includes(vehicle_type))
      || (availability_status !== undefined && typeof availability_status !== 'boolean')
      || (account_email !== undefined && account_email !== null && account_email !== ''
        && (typeof account_email !== 'string' || account_email.length > 254
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account_email)))) {
      return res.status(400).json({ error: 'Invalid volunteer details' });
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

    const { data: currentVolunteer } = await supabaseAdmin
      .from('volunteers').select('volunteer_id, profile_id')
      .eq('volunteer_id', volunteer_id).eq('ngo_id', ngo.ngo_id).maybeSingle();
    if (!currentVolunteer) return res.status(404).json({ error: 'Volunteer not found' });

    let volunteerProfileId;
    if (account_email !== undefined) {
      if (account_email === null || !String(account_email).trim()) {
        volunteerProfileId = null;
      } else {
        const { data: volunteerProfile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('id, role')
          .eq('email', String(account_email).trim().toLowerCase())
          .maybeSingle();
        if (profileError || !volunteerProfile || volunteerProfile.role !== 'volunteer') {
          return res.status(400).json({
            error: 'Volunteer account not found',
            message: 'Use the email address of an existing volunteer account.'
          });
        }
        volunteerProfileId = volunteerProfile.id;
      }
    }

    const profileWillChange = volunteerProfileId !== undefined && volunteerProfileId !== currentVolunteer.profile_id;
    if (availability_status === true || profileWillChange) {
      const { data: activeDelivery } = await supabaseAdmin
        .from('deliveries').select('delivery_id')
        .eq('volunteer_id', volunteer_id)
        .in('delivery_status', ['assigned', 'in_transit'])
        .limit(1).maybeSingle();
      if (activeDelivery) return res.status(409).json({ error: 'Finish the active pickup before changing this volunteer.' });
    }

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (vehicle_type !== undefined) updates.vehicle_type = vehicle_type || null;
    if (availability_status !== undefined) updates.availability_status = availability_status;
    if (volunteerProfileId !== undefined) updates.profile_id = volunteerProfileId;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid volunteer updates provided' });

    const { data: volunteer, error } = await supabaseAdmin
      .from('volunteers')
      .update(updates)
      .eq('volunteer_id', volunteer_id)
      .eq('ngo_id', ngo.ngo_id)
      .select()
      .single();

    if (error) {
      return res.status(error.code === '23505' ? 409 : 500).json({
        error: 'Failed to update volunteer',
        message: error.code === '23505' ? 'This volunteer account is already linked to another volunteer record.' : 'The request could not be completed.'
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
      message: 'The request could not be completed.'
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

    const { data: volunteer } = await supabaseAdmin
      .from('volunteers').select('volunteer_id')
      .eq('volunteer_id', volunteer_id).eq('ngo_id', ngo.ngo_id).maybeSingle();
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    const { data: activeDelivery } = await supabaseAdmin
      .from('deliveries').select('delivery_id')
      .eq('volunteer_id', volunteer_id)
      .in('delivery_status', ['assigned', 'in_transit'])
      .limit(1).maybeSingle();
    if (activeDelivery) return res.status(409).json({ error: 'Finish the active pickup before removing this volunteer.' });

    const { error } = await supabaseAdmin
      .from('volunteers')
      .delete()
      .eq('volunteer_id', volunteer_id)
      .eq('ngo_id', ngo.ngo_id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to remove volunteer',
        message: 'The request could not be completed.'
      });
    }

    res.json({
      message: 'Volunteer removed successfully'
    });

  } catch (error) {
    console.error('Remove volunteer error:', error);
    res.status(500).json({
      error: 'Failed to remove volunteer',
      message: 'The request could not be completed.'
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
        message: 'The verification status could not be updated.'
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
      message: 'The request could not be completed.'
    });
  }
});

module.exports = router;
