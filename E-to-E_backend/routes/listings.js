const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { donorOnly, ngoOnly } = require('../middleware/roleGuards');
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

    if (!food_type || !quantity_kg || !meal_equivalent || !expiry_time || !pickup_address || !latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['food_type', 'quantity_kg', 'meal_equivalent', 'expiry_time', 'pickup_address', 'latitude', 'longitude']
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
        food_type,
        quantity_kg,
        meal_equivalent,
        expiry_time: expiryISO,
        pickup_address,
        latitude,
        longitude,
        status: 'open',
        is_locked: false,
        assigned_ngo_id: assigned_ngo_id || null
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return res.status(500).json({
        error: 'Failed to create listing',
        message: error.message
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
      message: error.message
    });
  }
});

router.get('/', authenticateUser, async (req, res) => {
  try {
    const { status, city } = req.query;

    if (req.user.role === 'ngo') {
      const { data: ngo, error: ngoError } = await supabaseAdmin
        .from('ngos')
        .select('ngo_id')
        .eq('profile_id', req.user.id)
        .single();

      if (ngoError) {
        console.error('NGO lookup error:', ngoError);
      }

      if (ngo) {
        const result = await getAvailableListingsForNGO(ngo.ngo_id);

        if (!result.success) {
          console.error('getAvailableListingsForNGO failed:', result.error);
          return res.status(500).json({
            error: 'Failed to fetch listings',
            message: result.error
          });
        }

        return res.json({
          listings: result.listings,
          count: result.count
        });
      }
    }

    let query = supabaseAdmin
      .from('food_listings')
      .select(`
        *,
        donors (
          donor_id,
          city,
          address
        )
      `);

    if (req.user.role === 'admin') {
      if (status) {
        query = query.eq('status', status);
      }
    } else {
      if (status) {
        query = query.eq('status', status);
      } else {
        query = query.in('status', ['open', 'in_discussion']);
      }
    }

    query = query.order('created_at', { ascending: false });

    const { data: listings, error } = await query;

    if (error) {
      console.error('Listings query error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return res.status(500).json({
        error: 'Unable to load food listings at this time. Please try again.',
        message: error.message
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
      message: error.message
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
        message: error.message
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
      message: error.message
    });
  }
});

router.get('/search', authenticateUser, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'Missing search query',
        message: 'Please provide a search term (e.g., ?q=Rice)'
      });
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
      .ilike('food_type', `%${q}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Listings search error:', error);
      return res.status(500).json({
        error: 'Failed to search listings',
        message: error.message
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
      message: error.message
    });
  }
});

router.get('/:listing_id', async (req, res) => {
  try {
    const { listing_id } = req.params;

    const { data: listing, error } = await supabaseAdmin
      .from('food_listings')
      .select(`
        *,
        donors (
          donor_id,
          city,
          address
        )
      `)
      .eq('listing_id', listing_id)
      .single();

    if (error || !listing) {
      return res.status(404).json({
        error: 'Listing not found'
      });
    }

    res.json({
      listing
    });

  } catch (error) {
    console.error('Get listing error:', error);
    res.status(500).json({
      error: 'Failed to get listing',
      message: error.message
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
    if (food_type !== undefined) updates.food_type = food_type;
    if (quantity_kg !== undefined) updates.quantity_kg = quantity_kg;
    if (meal_equivalent !== undefined) updates.meal_equivalent = meal_equivalent;
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
    if (pickup_address !== undefined) updates.pickup_address = pickup_address;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;

    const { data: listing, error } = await supabaseAdmin
      .from('food_listings')
      .update(updates)
      .eq('listing_id', listing_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to update listing',
        message: error.message
      });
    }

    res.json({
      message: 'Listing updated successfully',
      listing
    });

  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({
      error: 'Failed to update listing',
      message: error.message
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
      .eq('listing_id', listing_id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to delete listing',
        message: error.message
      });
    }

    res.json({
      message: 'Listing deleted successfully'
    });

  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({
      error: 'Failed to delete listing',
      message: error.message
    });
  }
});

module.exports = router;
