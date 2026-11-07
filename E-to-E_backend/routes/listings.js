const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { donorOnly, ngoOnly, adminOnly, requireRole } = require('../middleware/roleGuards');
const geoMatchService = require('../services/geoMatchService');
const {
  getAvailableListingsForNGO,
  matchListingToNGOs,
  notifyNearbyNGOs,
  notifySpecificNGO
} = geoMatchService;
const { sendListingCreatedEmail } = require('../services/emailService');

router.post('/', authenticateUser, donorOnly, async (req, res) => {
  try {
    const {
      food_type,
      quantity_kg,
      meal_equivalent,
      expiry_time,
      pickup_address,
      latitude,
      longitude,
      assigned_ngo_id,
    } = req.body;

    const quantity = Number(quantity_kg);
    const meals = Number(meal_equivalent);
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (typeof food_type !== 'string' || !food_type.trim() || food_type.trim().length > 120
      || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000
      || !Number.isInteger(meals) || meals <= 0 || meals > 100000
      || typeof pickup_address !== 'string' || !pickup_address.trim() || pickup_address.trim().length > 500
      || !Number.isFinite(lat) || Math.abs(lat) > 90
      || !Number.isFinite(lng) || Math.abs(lng) > 180
      || typeof expiry_time !== 'string' || !expiry_time) {
      return res.status(400).json({
        error: 'Invalid listing details',
        message: 'Provide valid food, quantity, meal count, expiry, pickup address, and coordinates.'
      });
    }

    const parsedExpiry = new Date(expiry_time);
    if (isNaN(parsedExpiry.getTime())) {
      return res.status(400).json({
        error: 'Invalid expiry_time',
        message: 'expiry_time must be a valid date-time string'
      });
    }

    if (parsedExpiry <= new Date()) {
      return res.status(400).json({
        error: 'Invalid expiry_time',
        message: 'Expiry time must be in the future'
      });
    }

    const expiryISO = parsedExpiry.toISOString(); 

    if (assigned_ngo_id !== undefined && assigned_ngo_id !== null) {
      if (typeof assigned_ngo_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(assigned_ngo_id)) {
        return res.status(400).json({ error: 'Invalid assigned NGO' });
      }
      const { data: assignedNgo } = await supabaseAdmin
        .from('ngos')
        .select('ngo_id')
        .eq('ngo_id', assigned_ngo_id)
        .eq('verification_status', true)
        .maybeSingle();
      if (!assignedNgo) return res.status(400).json({ error: 'Assigned NGO is unavailable' });
    }

    const { data: donor, error: donorError } = await supabaseAdmin
      .from('donors')
      .select('donor_id')
      .eq('profile_id', req.user.id)
      .single();

    if (donorError) {
      console.error('Donor lookup error:', donorError);
    }

    if (!donor) {
      return res.status(404).json({
        error: 'Donor profile not found',
        message: 'Please create a donor profile first'
      });
    }

    const { data: listing, error } = await supabaseAdmin
      .from('food_listings')
      .insert({
        donor_id: donor.donor_id,
        food_type: food_type.trim(),
        quantity_kg: quantity,
        meal_equivalent: meals,
        expiry_time: expiryISO,
        pickup_address: pickup_address.trim(),
        latitude: lat,
        longitude: lng,
        status: 'open',
        is_locked: false,
        assigned_ngo_id: assigned_ngo_id || null
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', {
        message: 'The request could not be completed.',
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return res.status(500).json({
        error: 'Failed to create listing',
        message: 'The request could not be completed.'
      });
    }

    try {
      const notifyFn = assigned_ngo_id ? notifySpecificNGO : notifyNearbyNGOs;

      if (typeof notifyFn === 'function') {
        Promise.resolve(
          assigned_ngo_id
            ? notifyFn(listing.listing_id, assigned_ngo_id)
            : notifyFn(listing.listing_id)
        ).catch(err => {
          console.error('Failed to notify NGOs:', err);
        });
      } else {
        console.warn(
          assigned_ngo_id
            ? 'notifySpecificNGO is not available in geoMatchService'
            : 'notifyNearbyNGOs is not available in geoMatchService'
        );
      }
    } catch (notifyErr) {
      console.error('NGO notification dispatch error:', notifyErr);
    }

    (async () => {
      try {
        const { data: donorProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, organization_name, phone')
          .eq('id', req.user.id)
          .single();

        const donorDisplayName = donorProfile?.organization_name || donorProfile?.full_name || 'A Donor';

        const matchResult = await matchListingToNGOs(listing.listing_id);

        if (matchResult.success && matchResult.matches.length > 0) {
          for (const match of matchResult.matches) {
            const { data: ngoData } = await supabaseAdmin
              .from('ngos')
              .select('ngo_name, profiles(email)')
              .eq('ngo_id', match.ngo_id)
              .single();

            if (ngoData?.profiles?.email) {
              sendListingCreatedEmail({
                to: ngoData.profiles.email,
                ngoName: ngoData.ngo_name || 'NGO',
                donorName: donorDisplayName,
                donorPhone: donorProfile?.phone || 'N/A',
                foodType: food_type,
                quantity: String(quantity_kg),
                mealEquivalent: String(meal_equivalent),
                pickupAddress: pickup_address,
                expiryTime: new Date(expiryISO).toLocaleString(),
                distance: match.distance_km ? String(match.distance_km.toFixed(1)) : 'N/A',
              }).catch(err => console.error('[LISTINGS] Email to NGO failed:', err.message));
            }
          }
          console.log(`[LISTINGS] Listing email notifications queued for ${matchResult.matches.length} NGO(s)`);
        }
      } catch (emailErr) {
        console.error('[LISTINGS] Error sending listing emails:', emailErr.message);
      }
    })();

    res.status(201).json({
      message: 'Donation created sucessfully All ngos have been notified',
      listing
    });

  } catch (error) {
    console.error('Create listing error:', error);
    res.status(500).json({
      error: 'Failed to create listing',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/', authenticateUser, requireRole('ngo', 'admin'), async (req, res) => {
  try {
    const { status } = req.query;

    if (req.user.role === 'ngo') {
      const { data: ngo, error: ngoError } = await supabaseAdmin
        .from('ngos')
        .select('ngo_id, verification_status')
        .eq('profile_id', req.user.id)
        .single();

      if (ngoError) {
        console.error('NGO lookup error:', ngoError);
      }

      if (!ngo) return res.status(404).json({ error: 'NGO profile not found' });
      if (!ngo.verification_status) {
        return res.status(403).json({ error: 'Verified NGO access required' });
      }
      const result = await getAvailableListingsForNGO(ngo.ngo_id);

      if (!result.success) {
        console.error('getAvailableListingsForNGO failed:', result.error);
        return res.status(500).json({
          error: 'Failed to fetch listings',
          message: 'Listings could not be loaded.'
        });
      }

      return res.json({
        listings: result.listings,
        count: result.count
      });
    }

    let query = supabaseAdmin
      .from('food_listings')
      .select(`
        *,
        donors (
          donor_id,
          city
        )
      `);

    if (status) {
      const allowedStatuses = ['open', 'in_discussion', 'claimed', 'scheduled', 'picked', 'completed', 'expired'];
      if (req.user.role !== 'admin' && !['open', 'in_discussion'].includes(status)) {
        return res.status(403).json({ error: 'That listing status is not available to this role.' });
      }
      if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid listing status' });
      query = query.eq('status', status);
    } else if (req.user.role !== 'admin') {
      query = query.in('status', ['open', 'in_discussion']);
    }

    query = query.order('created_at', { ascending: false }).limit(100);

    const { data: listings, error } = await query;

    if (error) {
      console.error('Listings query error:', {
        message: 'The request could not be completed.',
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return res.status(500).json({
        error: 'Unable to load food listings at this time. Please try again.',
        message: 'The request could not be completed.'
      });
    }

    res.json({
      listings: listings || [],
      count: (listings || []).length
    });

  } catch (error) {
    console.error('Get listings error:', error);
    res.status(500).json({
      error: 'Failed to get listings',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/my', authenticateUser, donorOnly, async (req, res) => {
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

    const { data: listings, error } = await supabaseAdmin
      .from('food_listings')
      .select('*')
      .eq('donor_id', donor.donor_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch listings',
        message: 'The request could not be completed.'
      });
    }

    res.json({
      listings,
      count: listings.length
    });

  } catch (error) {
    console.error('Get my listings error:', error);
    res.status(500).json({
      error: 'Failed to get listings',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/search', authenticateUser, requireRole('ngo', 'admin'), async (req, res) => {
  try {
    const { q } = req.query;

    if (typeof q !== 'string' || !q.trim() || q.trim().length > 100) {
      return res.status(400).json({
        error: 'Missing search query',
        message: 'Please provide a search term (e.g., ?q=Rice)'
      });
    }

    if (req.user.role === 'ngo') {
      const { data: ngo } = await supabaseAdmin
        .from('ngos').select('verification_status').eq('profile_id', req.user.id).maybeSingle();
      if (!ngo || !ngo.verification_status) return res.status(403).json({ error: 'Verified NGO access required' });
    }

    const { data: listings, error } = await supabaseAdmin
      .from('food_listings')
      .select(`
        *,
        donors!inner (
          donor_id,
          city,
          address,
          profiles!inner (
            organization_name,
            full_name
          )
        )
      `)
      .eq('status', 'open')
      .gt('expiry_time', new Date().toISOString())
      .ilike('food_type', `%${q.trim()}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Listings search error:', error);
      return res.status(500).json({
        error: 'Failed to search listings',
        message: 'The request could not be completed.'
      });
    }

    res.json({
      listings: listings || [],
      count: (listings || []).length
    });

  } catch (error) {
    console.error('Search listings error:', error);
    res.status(500).json({
      error: 'Failed to search listings',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/:listing_id', authenticateUser, async (req, res) => {
  try {
    const { listing_id } = req.params;

    const { data: listing, error } = await supabaseAdmin
      .from('food_listings')
      .select(`
        *,
        donors (
          donor_id,
          city
        )
      `)
      .eq('listing_id', listing_id)
      .single();

    if (error || !listing) {
      return res.status(404).json({
        error: 'Listing not found'
      });
    }

    if (req.user.role === 'donor') {
      const { data: donor } = await supabaseAdmin
        .from('donors').select('donor_id').eq('profile_id', req.user.id).maybeSingle();
      if (!donor || donor.donor_id !== listing.donor_id) {
        return res.status(404).json({ error: 'Listing not found' });
      }
    } else if (req.user.role === 'ngo') {
      const { data: ngo } = await supabaseAdmin
        .from('ngos').select('ngo_id, verification_status').eq('profile_id', req.user.id).maybeSingle();
      if (!ngo || !ngo.verification_status) return res.status(403).json({ error: 'Verified NGO access required' });

      if (!['open', 'in_discussion'].includes(listing.status)) {
        const { data: ownClaim } = await supabaseAdmin
          .from('ngo_claims').select('claim_id').eq('listing_id', listing_id).eq('ngo_id', ngo.ngo_id).maybeSingle();
        if (!ownClaim) return res.status(404).json({ error: 'Listing not found' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      listing
    });

  } catch (error) {
    console.error('Get listing error:', error);
    res.status(500).json({
      error: 'Failed to get listing',
      message: 'The request could not be completed.'
    });
  }
});

router.put('/:listing_id', authenticateUser, donorOnly, async (req, res) => {
  try {
    const { listing_id } = req.params;
    const {
      food_type,
      quantity_kg,
      meal_equivalent,
      expiry_time,
      pickup_address,
      latitude,
      longitude,
    } = req.body;

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

    const { data: existing } = await supabaseAdmin
      .from('food_listings')
      .select('status, is_locked')
      .eq('listing_id', listing_id)
      .eq('donor_id', donor.donor_id)
      .single();

    if (!existing) {
      return res.status(404).json({
        error: 'Listing not found or access denied'
      });
    }

    if (existing.is_locked || !['open', 'in_discussion'].includes(existing.status)) {
      return res.status(403).json({
        error: 'Cannot update claimed or completed listing'
      });
    }

    const updates = {};
    if (food_type !== undefined) {
      if (typeof food_type !== 'string' || !food_type.trim() || food_type.trim().length > 120) {
        return res.status(400).json({ error: 'Invalid food type' });
      }
      updates.food_type = food_type.trim();
    }
    if (quantity_kg !== undefined) {
      const quantity = Number(quantity_kg);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
      updates.quantity_kg = quantity;
    }
    if (meal_equivalent !== undefined) {
      const meals = Number(meal_equivalent);
      if (!Number.isInteger(meals) || meals <= 0 || meals > 100000) {
        return res.status(400).json({ error: 'Invalid meal count' });
      }
      updates.meal_equivalent = meals;
    }
    if (expiry_time !== undefined) {
      const parsedExpiry = new Date(expiry_time);
      if (isNaN(parsedExpiry.getTime()) || parsedExpiry <= new Date()) {
        return res.status(400).json({
          error: 'Invalid expiry_time',
          message: 'Expiry time must be a valid date in the future'
        });
      }
      updates.expiry_time = parsedExpiry.toISOString();
    }
    if (pickup_address !== undefined) {
      if (typeof pickup_address !== 'string' || !pickup_address.trim() || pickup_address.trim().length > 500) {
        return res.status(400).json({ error: 'Invalid pickup address' });
      }
      updates.pickup_address = pickup_address.trim();
    }
    if (latitude !== undefined) {
      const lat = Number(latitude);
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) return res.status(400).json({ error: 'Invalid latitude' });
      updates.latitude = lat;
    }
    if (longitude !== undefined) {
      const lng = Number(longitude);
      if (!Number.isFinite(lng) || Math.abs(lng) > 180) return res.status(400).json({ error: 'Invalid longitude' });
      updates.longitude = lng;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid listing updates provided' });

    const { data: listing, error } = await supabaseAdmin
      .from('food_listings')
      .update(updates)
      .eq('listing_id', listing_id)
      .eq('donor_id', donor.donor_id)
      .eq('status', existing.status)
      .eq('is_locked', existing.is_locked)
      .select()
      .single();

    if (error) {
      return res.status(error.code === 'PGRST116' ? 409 : 500).json({ error: 'Failed to update listing' });
    }

    res.json({
      message: 'Listing updated successfully',
      listing
    });

  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({
      error: 'Failed to update listing',
      message: 'The request could not be completed.'
    });
  }
});

router.delete('/:listing_id', authenticateUser, donorOnly, async (req, res) => {
  try {
    const { listing_id } = req.params;

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

    const { data: existing } = await supabaseAdmin
      .from('food_listings')
      .select('status, is_locked')
      .eq('listing_id', listing_id)
      .eq('donor_id', donor.donor_id)
      .single();

    if (!existing) {
      return res.status(404).json({
        error: 'Listing not found or access denied'
      });
    }

    if (existing.is_locked || !['open', 'in_discussion'].includes(existing.status)) {
      return res.status(403).json({
        error: 'Cannot delete claimed or completed listing'
      });
    }

    const { error } = await supabaseAdmin
      .from('food_listings')
      .delete()
      .eq('listing_id', listing_id)
      .eq('donor_id', donor.donor_id)
      .in('status', ['open', 'in_discussion'])
      .eq('is_locked', false);

    if (error) {
      return res.status(500).json({
        error: 'Failed to delete listing',
        message: 'The request could not be completed.'
      });
    }

    res.json({
      message: 'Listing deleted successfully'
    });

  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({
      error: 'Failed to delete listing',
      message: 'The request could not be completed.'
    });
  }
});

module.exports = router;
