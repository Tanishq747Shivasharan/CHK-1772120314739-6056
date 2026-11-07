const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { ngoOnly } = require('../middleware/roleGuards');
const { sendClaimAlert } = require('../services/notificationService');
const { sendClaimAcceptedEmail } = require('../services/emailService');

async function createUnassignedDelivery(claimId) {
  const { data: existing } = await supabaseAdmin
    .from('deliveries')
    .select('*')
    .eq('claim_id', claimId)
    .maybeSingle();
  if (existing) return existing;

  const { data: delivery, error } = await supabaseAdmin
    .from('deliveries')
    .insert({ claim_id: claimId, volunteer_id: null, delivery_status: 'assigned' })
    .select()
    .single();
  if (error) {
    console.error('[CLAIMS] Failed to open volunteer pickup:', error.message);
    return null;
  }
  return delivery;
}

router.post('/', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { listing_id, pickup_scheduled_time, strategy_notes } = req.body;

    if (typeof listing_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(listing_id)) {
      return res.status(400).json({ error: 'Missing required field: listing_id' });
    }
    if (pickup_scheduled_time !== undefined && pickup_scheduled_time !== null
      && (typeof pickup_scheduled_time !== 'string' || !Number.isFinite(Date.parse(pickup_scheduled_time)))) {
      return res.status(400).json({ error: 'Invalid pickup schedule' });
    }
    if (strategy_notes !== undefined && strategy_notes !== null
      && (typeof strategy_notes !== 'string' || strategy_notes.length > 1000)) {
      return res.status(400).json({ error: 'Invalid strategy notes' });
    }

    const { data: ngo, error: ngoErr } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id, ngo_name, verification_status')
      .eq('profile_id', req.user.id)
      .single();

    if (ngoErr || !ngo) {
      return res.status(404).json({ error: 'NGO profile not found' });
    }
    if (!ngo.verification_status) return res.status(403).json({ error: 'Verified NGO access required' });

    const { data: listing } = await supabaseAdmin
      .from('food_listings')
      .select(`
        listing_id, food_type, quantity_kg, pickup_address, status, is_locked, donor_id, assigned_ngo_id, expiry_time,
        donors!inner ( donor_id, profile_id, profiles ( phone, email, full_name, organization_name ) )
      `)
      .eq('listing_id', listing_id)
      .single();

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing.assigned_ngo_id && listing.assigned_ngo_id !== ngo.ngo_id) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing.is_locked || !['open', 'in_discussion'].includes(listing.status)
      || new Date(listing.expiry_time).getTime() <= Date.now()) {
      return res.status(409).json({ error: 'Listing is no longer available' });
    }

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('claim_listing', {
      p_listing_id: listing_id,
      p_ngo_id: ngo.ngo_id,
      p_pickup_scheduled_time: pickup_scheduled_time || null,
      p_strategy_notes: strategy_notes || null
    });

    if (!rpcError && rpcResult && !rpcResult.error) {
      try {
        const donorPhone = listing.donors?.profiles?.phone;
        if (donorPhone) {
          sendClaimAlert(donorPhone, ngo.ngo_name, listing.food_type).catch(() => { });
        }
      } catch (_) { }

      (async () => {
        try {
          let donorEmail = listing.donors?.profiles?.email;
          let donorDisplayName = listing.donors?.profiles?.organization_name || listing.donors?.profiles?.full_name || 'Donor';

          if (!donorEmail) {
            const { data: donorProfile } = await supabaseAdmin
              .from('donors')
              .select('profiles(email, full_name, organization_name)')
              .eq('donor_id', listing.donor_id || listing.donors?.donor_id)
              .single();
            donorEmail = donorProfile?.profiles?.email;
            donorDisplayName = donorProfile?.profiles?.organization_name || donorProfile?.profiles?.full_name || donorDisplayName;
          }

          if (donorEmail) {
            const { data: ngoFull } = await supabaseAdmin
              .from('ngos')
              .select('ngo_name, contact_person, profiles(phone)')
              .eq('ngo_id', ngo.ngo_id)
              .single();

            sendClaimAcceptedEmail({
              to: donorEmail,
              donorName: donorDisplayName,
              ngoName: ngo.ngo_name,
              ngoContact: ngoFull?.contact_person || ngo.ngo_name,
              ngoPhone: ngoFull?.profiles?.phone || 'N/A',
              foodType: listing.food_type,
              quantity: String(listing.quantity_kg || ''),
              pickupAddress: listing.pickup_address || 'N/A',
              pickupTime: pickup_scheduled_time ? new Date(pickup_scheduled_time).toLocaleString() : 'To be scheduled',
            }).catch(err => console.error('[CLAIMS] Claim email to donor failed:', err.message));
          }
        } catch (emailErr) {
          console.error('[CLAIMS] Error sending claim email:', emailErr.message);
        }
      })();

      const delivery = await createUnassignedDelivery(rpcResult.claim_id);

      return res.status(201).json({
        message: 'Listing claimed successfully',
        claim: rpcResult,
        delivery
      });
    }

    console.error('[CLAIMS] Atomic claim failed:', rpcError?.code || 'claim rejected');
    if (rpcResult?.error) return res.status(409).json({ error: 'Listing is no longer available' });
    return res.status(503).json({ error: 'Listing could not be claimed right now.' });

  } catch (error) {
    console.error('[CLAIMS] Unhandled error:', error.name || 'Error');
    res.status(500).json({ error: 'Failed to claim listing' });
  }
});

router.get('/my', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { status } = req.query;

    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id, verification_status')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }
    if (!ngo.verification_status) return res.status(403).json({ error: 'Verified NGO access required' });

    let query = supabaseAdmin
      .from('ngo_claims')
      .select(`
        *,
        food_listings (
          *,
          donors (
            profiles (
              organization_name,
              full_name,
              phone
            )
          )
        )
      `)
      .eq('ngo_id', ngo.ngo_id);

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('acceptance_time', { ascending: false });

    const { data: claims, error } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch claims',
        message: 'The request could not be completed.'
      });
    }

    res.json({
      claims,
      count: claims.length
    });

  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({
      error: 'Failed to get claims',
      message: 'The request could not be completed.'
    });
  }
});

router.get('/:claim_id', authenticateUser, async (req, res) => {
  try {
    const { claim_id } = req.params;

    const { data: claim, error } = await supabaseAdmin
      .from('ngo_claims')
      .select(`
        *,
        ngos (
          ngo_name,
          contact_person,
          profiles (
            phone
          )
        ),
        food_listings (
          *,
          donors (
            profiles (
              organization_name,
              phone
            )
          )
        )
      `)
      .eq('claim_id', claim_id)
      .single();

    if (error || !claim) {
      return res.status(404).json({
        error: 'Claim not found'
      });
    }

    if (req.user.role === 'ngo') {
      const { data: ngo } = await supabaseAdmin
        .from('ngos')
        .select('ngo_id, verification_status')
        .eq('profile_id', req.user.id)
        .single();

      if (!ngo || !ngo.verification_status || claim.ngo_id !== ngo.ngo_id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
    } else if (req.user.role === 'donor') {
      const { data: donor } = await supabaseAdmin
        .from('donors')
        .select('donor_id')
        .eq('profile_id', req.user.id)
        .single();

      if (!donor || claim.food_listings.donor_id !== donor.donor_id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
    } else if (req.user.role === 'volunteer') {
      const { data: volunteer } = await supabaseAdmin
        .from('volunteers').select('volunteer_id').eq('profile_id', req.user.id).maybeSingle();
      if (!volunteer) return res.status(403).json({ error: 'Access denied' });
      const { data: delivery } = await supabaseAdmin
        .from('deliveries').select('delivery_id').eq('claim_id', claim_id)
        .eq('volunteer_id', volunteer.volunteer_id).maybeSingle();
      if (!delivery) return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      claim
    });

  } catch (error) {
    console.error('Get claim error:', error);
    res.status(500).json({
      error: 'Failed to get claim',
      message: 'The request could not be completed.'
    });
  }
});

router.put('/:claim_id', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { claim_id } = req.params;
    const { pickup_scheduled_time, strategy_notes, status } = req.body;

    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id, verification_status')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }
    if (!ngo.verification_status) return res.status(403).json({ error: 'Verified NGO access required' });

    const { data: existing } = await supabaseAdmin
      .from('ngo_claims')
      .select('ngo_id, status')
      .eq('claim_id', claim_id)
      .single();

    if (!existing || existing.ngo_id !== ngo.ngo_id) {
      return res.status(404).json({
        error: 'Claim not found or access denied'
      });
    }

    const updates = {};
    if (pickup_scheduled_time !== undefined) {
      if (pickup_scheduled_time !== null
        && (typeof pickup_scheduled_time !== 'string' || !Number.isFinite(Date.parse(pickup_scheduled_time)))) {
        return res.status(400).json({ error: 'Invalid pickup schedule' });
      }
      updates.pickup_scheduled_time = pickup_scheduled_time;
    }
    if (strategy_notes !== undefined) {
      if (strategy_notes !== null && (typeof strategy_notes !== 'string' || strategy_notes.length > 1000)) {
        return res.status(400).json({ error: 'Invalid strategy notes' });
      }
      updates.strategy_notes = strategy_notes;
    }
    if (status !== undefined) {
      if (!['claimed', 'scheduled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid claim status' });
      }
      updates.status = status;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid claim updates provided' });

    const { data: claim, error } = await supabaseAdmin
      .from('ngo_claims')
      .update(updates)
      .eq('claim_id', claim_id)
      .eq('ngo_id', ngo.ngo_id)
      .eq('status', existing.status)
      .select()
      .single();

    if (error) {
      return res.status(error.code === 'PGRST116' ? 409 : 500).json({ error: 'Failed to update claim' });
    }

    res.json({
      message: 'Claim updated successfully',
      claim
    });

  } catch (error) {
    console.error('Update claim error:', error);
    res.status(500).json({
      error: 'Failed to update claim',
      message: 'The request could not be completed.'
    });
  }
});

router.delete('/:claim_id', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { claim_id } = req.params;

    // Get ngo_id
    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id, verification_status')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }
    if (!ngo.verification_status) return res.status(403).json({ error: 'Verified NGO access required' });

    const { data: claim } = await supabaseAdmin
      .from('ngo_claims')
      .select('listing_id')
      .eq('claim_id', claim_id)
      .eq('ngo_id', ngo.ngo_id)
      .maybeSingle();
    if (!claim) return res.status(404).json({ error: 'Claim not found or access denied' });

    const { data: delivery } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id')
      .eq('claim_id', claim_id)
      .single();

    if (delivery) {
      return res.status(403).json({
        error: 'Cannot cancel claim after delivery has been assigned'
      });
    }

    const { error } = await supabaseAdmin
      .from('ngo_claims')
      .delete()
      .eq('claim_id', claim_id)
      .eq('ngo_id', ngo.ngo_id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to cancel claim',
        message: 'The request could not be completed.'
      });
    }

    if (claim) {
      await supabaseAdmin
        .from('food_listings')
        .update({
          is_locked: false,
          status: 'open'
        })
        .eq('listing_id', claim.listing_id)
        .eq('status', 'claimed')
        .eq('is_locked', true);
    }

    res.json({
      message: 'Claim cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel claim error:', error);
    res.status(500).json({
      error: 'Failed to cancel claim',
      message: 'The request could not be completed.'
    });
  }
});

module.exports = router;
