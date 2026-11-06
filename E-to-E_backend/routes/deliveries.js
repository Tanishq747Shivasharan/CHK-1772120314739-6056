const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { ngoOnly, donorOnly, volunteerOnly } = require('../middleware/roleGuards');
const { sendDeliveryAlert, sendCompletionNotice } = require('../services/notificationService');
const { sendDeliveryAssignedEmail, sendDeliveryCompletedEmail, sendCollectionOtpEmail } = require('../services/emailService');
const { createCollectionOtp, decryptCollectionOtp, hashOtpCandidate, validateCoordinates } = require('../services/trackingService');

const one = (value) => Array.isArray(value) ? value[0] : value;

async function getLinkedVolunteer(profileId) {
  const { data, error } = await supabaseAdmin
    .from('volunteers')
    .select('volunteer_id, ngo_id, full_name, phone, vehicle_type, availability_status, ngos(ngo_name)')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function trackingErrorResponse(error, res) {
  const message = error?.message || '';
  if (message.includes('OTP_HASH_SECRET')) {
    return res.status(503).json({ error: 'Tracking is not configured', message: 'The server must configure OTP_HASH_SECRET before volunteers can accept pickups.' });
  }
  if (message.includes('VOLUNTEER_UNAVAILABLE') || message.includes('VOLUNTEER_HAS_ACTIVE_DELIVERY')) {
    return res.status(409).json({ error: 'Volunteer unavailable', message: 'This volunteer is unavailable or already has an active pickup.' });
  }
  if (message.includes('DELIVERY_UNAVAILABLE')) {
    return res.status(409).json({ error: 'Pickup already accepted', message: 'Another volunteer has accepted this pickup, or it is no longer available.' });
  }
  if (['PGRST202', 'PGRST205', '42P01'].includes(error?.code) || /could not find the function|function .* does not exist/i.test(message)) {
    return res.status(503).json({ error: 'Tracking migration required', message: 'Apply the live donation tracking migration to Supabase first.' });
  }
  return null;
}

router.get('/donor/my', authenticateUser, donorOnly, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const { data: donor, error: donorError } = await supabaseAdmin
      .from('donors').select('donor_id').eq('profile_id', req.user.id).single();
    if (donorError || !donor) return res.status(404).json({ error: 'Donor profile not found' });

    const { data: deliveries, error } = await supabaseAdmin
      .from('deliveries')
      .select(`
        delivery_id, claim_id, volunteer_id, volunteer_assigned_at, delivery_status, pickup_time, delivery_time,
        collection_verified_at, location_latitude, location_longitude, location_updated_at, created_at,
        volunteers(full_name, phone, vehicle_type),
        ngo_claims!inner(
          ngo_id, acceptance_time,
          ngos(ngo_name),
          food_listings!inner(listing_id, donor_id, food_type, quantity_kg, meal_equivalent, pickup_address, latitude, longitude, expiry_time, status, created_at)
        )
      `)
      .eq('ngo_claims.food_listings.donor_id', donor.donor_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch tracking data', message: error.message });

    const freshCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const withCandidates = await Promise.all((deliveries || []).map(async (delivery) => {
      if (delivery.volunteer_id) {
        const { data: codeRecord } = await supabaseAdmin
          .from('delivery_collection_secrets')
          .select('delivery_id, otp_ciphertext, otp_iv, otp_tag, expires_at, verified_at')
          .eq('delivery_id', delivery.delivery_id)
          .maybeSingle();
        const codeIsActive = codeRecord
          && !codeRecord.verified_at
          && new Date(codeRecord.expires_at).getTime() > Date.now()
          && ['assigned', 'in_transit'].includes(delivery.delivery_status);
        return {
          ...delivery,
          available_volunteers: [],
          collection_tracking_enabled: Boolean(codeRecord),
          collection_code: codeIsActive ? decryptCollectionOtp(codeRecord) : null,
          collection_code_expires_at: codeIsActive ? codeRecord.expires_at : null
        };
      }
      const claim = one(delivery.ngo_claims);
      const { data: candidates, error: candidateError } = await supabaseAdmin
        .from('volunteers')
        .select('volunteer_id, full_name, vehicle_type, latitude, longitude, location_updated_at')
        .eq('ngo_id', claim.ngo_id)
        .eq('availability_status', true)
        .not('profile_id', 'is', null)
        .gte('location_updated_at', freshCutoff);
      if (candidateError) {
        console.error('[DELIVERIES] Candidate location lookup failed:', candidateError.message);
        return { ...delivery, available_volunteers: [], collection_tracking_enabled: false };
      }
      return {
        ...delivery,
        collection_tracking_enabled: false,
        available_volunteers: (candidates || []).filter((candidate) =>
          validateCoordinates(candidate.latitude, candidate.longitude)
        )
      };
    }));
    res.json({ deliveries: withCandidates });
  } catch (error) {
    console.error('[DELIVERIES] Donor tracking feed error:', error);
    res.status(500).json({ error: 'Failed to fetch tracking data', message: error.message });
  }
});

router.get('/volunteer/available', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) {
      return res.status(409).json({ error: 'Volunteer account is not linked', message: 'Ask your NGO to link this volunteer login by its account email in Volunteer Management.' });
    }
    if (!volunteer.availability_status) return res.json({ deliveries: [], volunteer });

    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .select(`
        delivery_id, claim_id, delivery_status, created_at,
        ngo_claims!inner(
          claim_id, ngo_id,
          ngos(ngo_name),
          food_listings!inner(listing_id, food_type, quantity_kg, meal_equivalent, pickup_address, latitude, longitude, expiry_time, status, donors(profiles(full_name, organization_name)))
        )
      `)
      .is('volunteer_id', null)
      .eq('delivery_status', 'assigned')
      .eq('ngo_claims.ngo_id', volunteer.ngo_id)
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch available pickups', message: error.message });

    const now = Date.now();
    const deliveries = (data || []).filter((delivery) => {
      const claim = one(delivery.ngo_claims);
      const listing = one(claim?.food_listings);
      return listing && listing.status === 'claimed' && new Date(listing.expiry_time).getTime() > now;
    });
    res.json({ deliveries, volunteer });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer pickup feed error:', error);
    res.status(500).json({ error: 'Failed to fetch available pickups', message: error.message });
  }
});

router.get('/volunteer/history', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });

    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .select(`
        delivery_id, delivery_status, pickup_time, delivery_time, created_at,
        ngo_claims!inner(
          ngo_id, ngos(ngo_name),
          food_listings!inner(
            listing_id, food_type, quantity_kg, meal_equivalent, pickup_address, latitude, longitude,
            donors(profiles(full_name, organization_name))
          )
        )
      `)
      .eq('volunteer_id', volunteer.volunteer_id)
      .in('delivery_status', ['delivered', 'failed'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: 'Failed to fetch pickup history', message: error.message });

    res.json({ deliveries: data || [] });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer pickup history error:', error);
    res.status(500).json({ error: 'Failed to fetch pickup history', message: error.message });
  }
});

router.get('/volunteer/active', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });

    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .select(`
        delivery_id, claim_id, volunteer_id, delivery_status, pickup_time, collection_verified_at,
        location_latitude, location_longitude, location_updated_at, created_at,
        ngo_claims!inner(
          ngo_id, ngos(ngo_name),
          food_listings!inner(listing_id, food_type, quantity_kg, meal_equivalent, pickup_address, latitude, longitude, donors(profiles(full_name, organization_name, phone)))
        )
      `)
      .eq('volunteer_id', volunteer.volunteer_id)
      .in('delivery_status', ['assigned', 'in_transit'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Failed to fetch active pickup', message: error.message });
    if (data) {
      const { data: codeRecord } = await supabaseAdmin
        .from('delivery_collection_secrets').select('delivery_id').eq('delivery_id', data.delivery_id).maybeSingle();
      data.collection_tracking_enabled = Boolean(codeRecord);
    }
    res.json({ delivery: data || null, volunteer });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer active pickup error:', error);
    res.status(500).json({ error: 'Failed to fetch active pickup', message: error.message });
  }
});

router.post('/:delivery_id/cancel', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });

    const { data: result, error } = await supabaseAdmin.rpc('release_volunteer_delivery', {
      p_delivery_id: req.params.delivery_id,
      p_volunteer_id: volunteer.volunteer_id,
      p_profile_id: req.user.id
    });
    if (error) {
      const response = trackingErrorResponse(error, res);
      if (response) return response;
      throw error;
    }

    const status = one(result);
    if (status === 'released') {
      return res.json({ message: 'Pickup cancelled and returned to available pickups.' });
    }
    if (status === 'not_authorized') return res.status(403).json({ error: 'Access denied' });
    return res.status(409).json({
      error: 'Pickup cannot be cancelled',
      message: 'A pickup can only be released before the collection code has been verified.'
    });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer cancel pickup error:', error);
    const response = trackingErrorResponse(error, res);
    if (response) return response;
    res.status(500).json({ error: 'Failed to cancel pickup', message: error.message });
  }
});

router.post('/volunteer/availability-location', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });
    if (!volunteer.availability_status) return res.status(409).json({ error: 'Volunteer is not available' });
    const coordinates = validateCoordinates(req.body.latitude, req.body.longitude);
    if (!coordinates) return res.status(400).json({ error: 'Invalid coordinates' });

    const { data: current, error: currentError } = await supabaseAdmin
      .from('volunteers').select('location_updated_at').eq('volunteer_id', volunteer.volunteer_id).single();
    if (currentError) throw currentError;
    if (current.location_updated_at && Date.now() - new Date(current.location_updated_at).getTime() < 5000) {
      return res.status(202).json({ message: 'Location update throttled' });
    }

    const { data, error } = await supabaseAdmin
      .from('volunteers')
      .update({ ...coordinates, location_updated_at: new Date().toISOString() })
      .eq('volunteer_id', volunteer.volunteer_id)
      .eq('profile_id', req.user.id)
      .eq('availability_status', true)
      .select('latitude, longitude, location_updated_at')
      .single();
    if (error) throw error;
    res.json({ location: data });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer availability location error:', error);
    res.status(500).json({ error: 'Failed to update availability location', message: error.message });
  }
});

router.put('/volunteer/availability', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    if (typeof req.body?.available !== 'boolean') {
      return res.status(400).json({ error: 'Availability must be true or false' });
    }
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });

    if (req.body.available) {
      const { data: activeDelivery, error: activeError } = await supabaseAdmin
        .from('deliveries')
        .select('delivery_id')
        .eq('volunteer_id', volunteer.volunteer_id)
        .in('delivery_status', ['assigned', 'in_transit'])
        .limit(1)
        .maybeSingle();
      if (activeError) throw activeError;
      if (activeDelivery) return res.status(409).json({ error: 'Finish the active pickup before becoming available.' });
    }

    const updates = { availability_status: req.body.available };
    if (!req.body.available) {
      updates.latitude = null;
      updates.longitude = null;
      updates.location_updated_at = null;
    }
    const { data, error } = await supabaseAdmin
      .from('volunteers')
      .update(updates)
      .eq('volunteer_id', volunteer.volunteer_id)
      .eq('profile_id', req.user.id)
      .select('volunteer_id, availability_status, latitude, longitude, location_updated_at')
      .single();
    if (error) throw error;

    res.json({ volunteer: data });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer availability update error:', error);
    res.status(500).json({ error: 'Failed to update volunteer availability', message: error.message });
  }
});

router.delete('/volunteer/availability-location', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const { data: volunteer, error: lookupError } = await supabaseAdmin
      .from('volunteers')
      .select('volunteer_id')
      .eq('profile_id', req.user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });

    const { error } = await supabaseAdmin
      .from('volunteers')
      .update({ latitude: null, longitude: null, location_updated_at: null })
      .eq('volunteer_id', volunteer.volunteer_id)
      .eq('profile_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Availability location cleared' });
  } catch (error) {
    console.error('[DELIVERIES] Clear volunteer availability location error:', error);
    res.status(500).json({ error: 'Failed to clear availability location', message: error.message });
  }
});

router.post('/:delivery_id/accept', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked', message: 'Ask your NGO to link your volunteer login by its account email.' });
    if (!volunteer.availability_status) return res.status(409).json({ error: 'Volunteer unavailable' });

    const { data: deliveryContext, error: deliveryError } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id, volunteer_id, delivery_status, ngo_claims!inner(claim_id, ngo_id, listing_id)')
      .eq('delivery_id', req.params.delivery_id)
      .maybeSingle();
    if (deliveryError || !deliveryContext) return res.status(404).json({ error: 'Pickup not found' });
    if (deliveryContext.volunteer_id || deliveryContext.delivery_status !== 'assigned') return res.status(409).json({ error: 'Pickup already accepted' });

    const claim = one(deliveryContext.ngo_claims);
    if (claim.ngo_id !== volunteer.ngo_id) return res.status(404).json({ error: 'Pickup not found' });
    const [{ data: listing }, { data: ngo }] = await Promise.all([
      supabaseAdmin.from('food_listings')
        .select('food_type, donors!inner(profiles!inner(email, full_name, organization_name))')
        .eq('listing_id', claim.listing_id).single(),
      supabaseAdmin.from('ngos').select('ngo_name').eq('ngo_id', claim.ngo_id).single()
    ]);
    const donorProfile = one(one(listing?.donors)?.profiles);
    if (!donorProfile?.email) return res.status(409).json({ error: 'Donor email unavailable', message: 'The donor needs a registered email address to receive the pickup verification code.' });

    const otp = createCollectionOtp();
    const { error: acceptError } = await supabaseAdmin.rpc('accept_volunteer_delivery', {
      p_delivery_id: req.params.delivery_id,
      p_volunteer_id: volunteer.volunteer_id,
      p_profile_id: req.user.id,
      p_otp_hash: otp.hash,
      p_otp_expires_at: otp.expiresAt,
      p_otp_ciphertext: otp.otpCiphertext,
      p_otp_iv: otp.otpIv,
      p_otp_tag: otp.otpTag
    });
    if (acceptError) {
      const response = trackingErrorResponse(acceptError, res);
      if (response) return response;
      throw acceptError;
    }

    const emailResult = await sendCollectionOtpEmail({
      to: donorProfile.email,
      code: otp.code,
      donorName: donorProfile.organization_name || donorProfile.full_name || 'Donor',
      foodType: listing.food_type,
      ngoName: ngo?.ngo_name || 'Your NGO'
    });
    const { data: acceptedDelivery, error: acceptedError } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id, claim_id, volunteer_id, delivery_status, created_at')
      .eq('delivery_id', req.params.delivery_id)
      .single();
    if (acceptedError) throw acceptedError;

    res.status(200).json({
      message: 'Pickup accepted. Live tracking is ready.',
      delivery: acceptedDelivery,
      otp_email_sent: Boolean(emailResult?.success)
    });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer accept error:', error);
    const response = trackingErrorResponse(error, res);
    if (response) return response;
    res.status(500).json({ error: 'Failed to accept pickup', message: error.message });
  }
});

router.post('/:delivery_id/location', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });
    const coordinates = validateCoordinates(req.body.latitude, req.body.longitude);
    if (!coordinates) return res.status(400).json({ error: 'Invalid coordinates', message: 'Latitude and longitude must be valid GPS coordinates.' });
    const accuracy = req.body.accuracy_m === undefined ? null : Number(req.body.accuracy_m);
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000)) {
      return res.status(400).json({ error: 'Invalid GPS accuracy' });
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id, delivery_status, location_updated_at')
      .eq('delivery_id', req.params.delivery_id)
      .eq('volunteer_id', volunteer.volunteer_id)
      .maybeSingle();
    if (currentError || !current || !['assigned', 'in_transit'].includes(current.delivery_status)) {
      return res.status(404).json({ error: 'Active assigned pickup not found' });
    }
    if (current.location_updated_at && Date.now() - new Date(current.location_updated_at).getTime() < 5000) {
      return res.status(202).json({ message: 'Location update throttled' });
    }

    const updatedAt = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from('deliveries')
      .update({
        location_latitude: coordinates.latitude,
        location_longitude: coordinates.longitude,
        location_updated_at: updatedAt
      })
      .eq('delivery_id', req.params.delivery_id)
      .eq('volunteer_id', volunteer.volunteer_id)
      .select('delivery_id, location_latitude, location_longitude, location_updated_at')
      .single();
    if (error) return res.status(500).json({ error: 'Failed to update location', message: error.message });
    res.json({ location: updated });
  } catch (error) {
    console.error('[DELIVERIES] Volunteer location update error:', error);
    res.status(500).json({ error: 'Failed to update location', message: error.message });
  }
});

router.post('/:delivery_id/verify-otp', authenticateUser, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await getLinkedVolunteer(req.user.id);
    if (!volunteer) return res.status(409).json({ error: 'Volunteer account is not linked' });
    const { code } = req.body;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid code format', message: 'Enter the six-digit pickup code from the donor.' });
    }

    const { data: secret, error: secretError } = await supabaseAdmin
      .from('delivery_collection_secrets')
      .select('otp_hash')
      .eq('delivery_id', req.params.delivery_id)
      .maybeSingle();
    if (secretError) throw secretError;
    if (!secret) return res.status(404).json({ error: 'Pickup verification code not found' });

    const candidateHash = hashOtpCandidate(code, secret.otp_hash);
    const { data: result, error } = await supabaseAdmin.rpc('verify_delivery_collection_otp', {
      p_delivery_id: req.params.delivery_id,
      p_volunteer_id: volunteer.volunteer_id,
      p_candidate_hash: candidateHash
    });
    if (error) throw error;

    const status = one(result);
    if (status === 'verified' || status === 'already_verified') {
      return res.json({ message: 'Pickup verified', collection_verified_at: new Date().toISOString(), delivery_status: 'in_transit' });
    }
    const responses = {
      invalid: [400, 'Incorrect code. Check with the donor and try again.'],
      expired: [410, 'This code has expired. The donor can request a new code.'],
      locked: [429, 'Too many incorrect attempts. Ask the donor to request a new code.'],
      delivery_unavailable: [409, 'This pickup is no longer assigned to you.'],
      not_found: [404, 'Pickup verification code not found.']
    };
    const [httpStatus, message] = responses[status] || [409, 'Pickup could not be verified.'];
    res.status(httpStatus).json({ error: 'Pickup verification failed', message, status });
  } catch (error) {
    console.error('[DELIVERIES] OTP verification error:', error);
    const response = trackingErrorResponse(error, res);
    if (response) return response;
    res.status(500).json({ error: 'Failed to verify pickup', message: error.message });
  }
});

router.post('/:delivery_id/resend-code', authenticateUser, donorOnly, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const { data: donor, error: donorError } = await supabaseAdmin
      .from('donors').select('donor_id').eq('profile_id', req.user.id).single();
    if (donorError || !donor) return res.status(404).json({ error: 'Donor profile not found' });

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id, volunteer_id, delivery_status, ngo_claims!inner(food_listings!inner(donor_id, food_type))')
      .eq('delivery_id', req.params.delivery_id)
      .eq('ngo_claims.food_listings.donor_id', donor.donor_id)
      .maybeSingle();
    if (deliveryError || !delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!delivery.volunteer_id || !['assigned', 'in_transit'].includes(delivery.delivery_status)) {
      return res.status(409).json({ error: 'Pickup is not active' });
    }

    const listing = one(one(delivery.ngo_claims)?.food_listings);
    const otp = createCollectionOtp();
    const { data: rotationResult, error: rotationError } = await supabaseAdmin.rpc('rotate_delivery_collection_otp', {
      p_delivery_id: req.params.delivery_id,
      p_donor_profile_id: req.user.id,
      p_otp_hash: otp.hash,
      p_otp_expires_at: otp.expiresAt,
      p_otp_ciphertext: otp.otpCiphertext,
      p_otp_iv: otp.otpIv,
      p_otp_tag: otp.otpTag
    });
    if (rotationError) throw rotationError;
    const rotationStatus = one(rotationResult);
    if (rotationStatus === 'cooldown') return res.status(429).json({ error: 'Please wait before requesting another code.' });
    if (rotationStatus !== 'rotated') return res.status(409).json({ error: 'Pickup code cannot be resent', status: rotationStatus });

    let emailSent = false;
    try {
      const result = await sendCollectionOtpEmail({
        to: req.user.email,
        code: otp.code,
        donorName: req.user.organization_name || req.user.full_name,
        foodType: listing?.food_type,
        ngoName: 'Your NGO'
      });
      emailSent = Boolean(result?.success);
    } catch (emailError) {
      console.error('[DELIVERIES] Collection code email failed:', emailError.message);
    }
    res.json({
      message: emailSent
        ? 'The refreshed pickup code is shown here and was emailed to you.'
        : 'The refreshed pickup code is shown here, but email delivery failed.',
      collection_code: otp.code,
      collection_code_expires_at: otp.expiresAt,
      email_sent: emailSent
    });
  } catch (error) {
    console.error('[DELIVERIES] Collection code resend error:', error);
    const response = trackingErrorResponse(error, res);
    if (response) return response;
    res.status(500).json({ error: 'Failed to resend pickup code', message: error.message });
  }
});

router.post('/', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { claim_id, volunteer_id } = req.body;

    if (!claim_id) {
      return res.status(400).json({
        error: 'Missing required field: claim_id'
      });
    }

    const { data: ngo } = await supabaseAdmin
      .from('ngos')
      .select('ngo_id, ngo_name')
      .eq('profile_id', req.user.id)
      .single();

    if (!ngo) {
      return res.status(404).json({
        error: 'NGO profile not found'
      });
    }

    const { data: claim } = await supabaseAdmin
      .from('ngo_claims')
      .select('*')
      .eq('claim_id', claim_id)
      .eq('ngo_id', ngo.ngo_id)
      .single();

    if (!claim) {
      return res.status(404).json({
        error: 'Claim not found or access denied'
      });
    }

    const { data: existing } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id')
      .eq('claim_id', claim_id)
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'Delivery already assigned for this claim'
      });
    }

    if (volunteer_id) {
      const { data: volunteer } = await supabaseAdmin
        .from('volunteers')
        .select('volunteer_id, full_name, profile_id, availability_status')
        .eq('volunteer_id', volunteer_id)
        .eq('ngo_id', ngo.ngo_id)
        .single();

      if (!volunteer) {
        return res.status(404).json({
          error: 'Volunteer not found or does not belong to your NGO'
        });
      }
      if (volunteer.profile_id) {
        return res.status(409).json({
          error: 'Linked volunteers accept pickups in their dashboard',
          message: 'Create an open pickup and let the volunteer accept it to enable secure tracking.'
        });
      }
      if (!volunteer.availability_status) return res.status(409).json({ error: 'Volunteer unavailable' });
    }

    const { data: delivery, error } = await supabaseAdmin
      .from('deliveries')
      .insert({
        claim_id,
        volunteer_id: volunteer_id || null,
        volunteer_assigned_at: volunteer_id ? new Date().toISOString() : null,
        delivery_status: 'assigned'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to create delivery',
        message: error.message
      });
    }

    if (volunteer_id) {
      await supabaseAdmin.from('volunteers')
        .update({ availability_status: false })
        .eq('volunteer_id', volunteer_id);
      const { data: volunteer } = await supabaseAdmin
        .from('volunteers')
        .select('full_name, phone')
        .eq('volunteer_id', volunteer_id)
        .single();

      sendDeliveryAlert(req.user.phone, volunteer.full_name, 'assigned').catch(err => {
        console.error('Failed to send delivery alert:', err);
      });

      (async () => {
        try {
          const { data: volProfile } = await supabaseAdmin
            .from('volunteers')
            .select('full_name, phone, profile_id, profiles(email)')
            .eq('volunteer_id', volunteer_id)
            .single();

          const volEmail = volProfile?.profiles?.email;
          if (volEmail) {
            const { data: claimDetails } = await supabaseAdmin
              .from('ngo_claims')
              .select(`
                food_listings(
                  food_type, quantity_kg, pickup_address,
                  donors(profiles(full_name, organization_name, phone))
                )
              `)
              .eq('claim_id', claim_id)
              .single();

            const fl = claimDetails?.food_listings;
            const donorInfo = fl?.donors?.profiles;

            sendDeliveryAssignedEmail({
              to: volEmail,
              volunteerName: volProfile.full_name || 'Volunteer',
              ngoName: ngo.ngo_name || 'NGO',
              ngoPhone: req.user.phone || 'N/A',
              donorName: donorInfo?.organization_name || donorInfo?.full_name || 'Donor',
              donorPhone: donorInfo?.phone || 'N/A',
              foodType: fl?.food_type || 'Food',
              quantity: String(fl?.quantity_kg || '0'),
              pickupAddress: fl?.pickup_address || 'N/A',
              deliveryStatus: 'Assigned',
            }).catch(err => console.error('[DELIVERIES] Delivery assignment email failed:', err.message));
          }
        } catch (emailErr) {
          console.error('[DELIVERIES] Error sending assignment email:', emailErr.message);
        }
      })();
    }

    res.status(201).json({
      message: 'Delivery assigned successfully',
      delivery
    });

  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({
      error: 'Failed to create delivery',
      message: error.message
    });
  }
});

router.get('/my', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { status } = req.query;

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

    let query = supabaseAdmin
      .from('deliveries')
      .select(`
        *,
        volunteers (
          full_name,
          phone,
          vehicle_type
        ),
        ngo_claims!inner (
          ngo_id,
          listing_id,
          food_listings (
            food_type,
            quantity_kg,
            pickup_address,
            latitude,
            longitude,
            donors (
              profiles (
                organization_name,
                full_name,
                phone
              )
            )
          )
        )
      `)
      .eq('ngo_claims.ngo_id', ngo.ngo_id);

    if (status) {
      query = query.eq('delivery_status', status);
    }

    query = query.order('created_at', { ascending: false });

    const { data: deliveries, error } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch deliveries',
        message: error.message
      });
    }

    res.json({
      deliveries,
      count: deliveries.length
    });

  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({
      error: 'Failed to get deliveries',
      message: error.message
    });
  }
});

router.get('/:delivery_id', authenticateUser, async (req, res) => {
  try {
    const { delivery_id } = req.params;

    const { data: delivery, error } = await supabaseAdmin
      .from('deliveries')
      .select(`
        *,
        volunteers (
          full_name,
          phone,
          vehicle_type
        ),
        ngo_claims (
          *,
          ngos (
            ngo_name,
            contact_person
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
        )
      `)
      .eq('delivery_id', delivery_id)
      .single();

    if (error || !delivery) {
      return res.status(404).json({
        error: 'Delivery not found'
      });
    }

    if (req.user.role === 'ngo') {
      const { data: ngo } = await supabaseAdmin.from('ngos').select('ngo_id').eq('profile_id', req.user.id).maybeSingle();
      if (!ngo || ngo.ngo_id !== delivery.ngo_claims?.ngo_id) return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role === 'donor') {
      const { data: donor } = await supabaseAdmin.from('donors').select('donor_id').eq('profile_id', req.user.id).maybeSingle();
      if (!donor || donor.donor_id !== delivery.ngo_claims?.food_listings?.donor_id) return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role === 'volunteer') {
      const volunteer = await getLinkedVolunteer(req.user.id);
      if (!volunteer || volunteer.volunteer_id !== delivery.volunteer_id) return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      delivery
    });

  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({
      error: 'Failed to get delivery',
      message: error.message
    });
  }
});

router.put('/:delivery_id/status', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { delivery_id } = req.params;
    const { status, pickup_time, delivery_time, proof_image_url } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing required field: status'
      });
    }

    const validStatuses = ['assigned', 'in_transit', 'delivered', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        valid_statuses: validStatuses
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

    const { data: existingDelivery } = await supabaseAdmin
      .from('deliveries')
      .select(`
        delivery_id,
        delivery_status,
        ngo_claims!inner (
          ngo_id,
          food_listings (
            food_type,
            quantity_kg,
            meal_equivalent
          )
        )
      `)
      .eq('delivery_id', delivery_id)
      .eq('ngo_claims.ngo_id', ngo.ngo_id)
      .single();

    if (!existingDelivery) {
      return res.status(404).json({
        error: 'Delivery not found or access denied'
      });
    }

    if (status === 'delivered' && existingDelivery.delivery_status === 'delivered') {
      const { data: currentDelivery } = await supabaseAdmin
        .from('deliveries').select('*').eq('delivery_id', delivery_id).single();
      return res.json({ message: 'Delivery is already complete', delivery: currentDelivery });
    }

    if (['in_transit', 'delivered'].includes(status)) {
      const { data: collectionSecret, error: secretError } = await supabaseAdmin
        .from('delivery_collection_secrets')
        .select('verified_at')
        .eq('delivery_id', delivery_id)
        .maybeSingle();
      if (secretError && secretError.code !== '42P01' && secretError.code !== 'PGRST205') throw secretError;
      if (collectionSecret && !collectionSecret.verified_at) {
        return res.status(409).json({
          error: 'Collection verification required',
          message: 'The assigned volunteer must verify the donor pickup code before this delivery can proceed.'
        });
      }
    }

    const updates = {
      delivery_status: status
    };

    if (pickup_time) updates.pickup_time = pickup_time;
    if (delivery_time) updates.delivery_time = delivery_time;
    if (proof_image_url) updates.proof_image_url = proof_image_url;

    if (status === 'in_transit' && !pickup_time) {
      updates.pickup_time = new Date().toISOString();
    }
    if (status === 'delivered' && !delivery_time) {
      updates.delivery_time = new Date().toISOString();
    }

    const { data: delivery, error } = await supabaseAdmin
      .from('deliveries')
      .update(updates)
      .eq('delivery_id', delivery_id)
      .eq('delivery_status', existingDelivery.delivery_status)
      .select()
      .single();

    if (error) {
      return res.status(error.code === 'PGRST116' ? 409 : 500).json({
        error: 'Failed to update delivery status',
        message: error.code === 'PGRST116' ? 'The delivery status changed. Refresh before trying again.' : error.message
      });
    }

    const transitionedToDelivered = status === 'delivered' && existingDelivery.delivery_status !== 'delivered';
    if (transitionedToDelivered) {
      const listing = existingDelivery.ngo_claims.food_listings;

      const co2Reduced = parseFloat(listing.quantity_kg) * 2.5;

      sendCompletionNotice(
        req.user.phone,
        listing.meal_equivalent,
        co2Reduced
      ).catch(err => {
        console.error('Failed to send completion notice:', err);
      });

      (async () => {
        try {
          const { data: fullDelivery } = await supabaseAdmin
            .from('deliveries')
            .select(`
              delivery_time,
              volunteers(full_name, phone),
              ngo_claims(
                ngo_id,
                ngos(ngo_name, profiles(email, phone)),
                food_listings(
                  food_type, quantity_kg, meal_equivalent, pickup_address,
                  donors(profiles(email, full_name, organization_name, phone))
                )
              )
            `)
            .eq('delivery_id', delivery_id)
            .single();

          if (!fullDelivery) return;

          const fl = fullDelivery.ngo_claims?.food_listings;
          const donorInfo = fl?.donors?.profiles;
          const ngoInfo = fullDelivery.ngo_claims?.ngos;
          const volInfo = fullDelivery.volunteers;
          const calcCo2 = parseFloat(fl?.quantity_kg || 0) * 2.5;

          const commonData = {
            donorName: donorInfo?.organization_name || donorInfo?.full_name || 'Donor',
            donorPhone: donorInfo?.phone || 'N/A',
            ngoName: ngoInfo?.ngo_name || 'NGO',
            ngoPhone: ngoInfo?.profiles?.phone || 'N/A',
            volunteerName: volInfo?.full_name || 'Volunteer',
            foodType: fl?.food_type || 'Food',
            quantity: String(fl?.quantity_kg || '0'),
            mealEquivalent: String(fl?.meal_equivalent || '0'),
            pickupAddress: fl?.pickup_address || 'N/A',
            deliveryStatus: 'Delivered',
            completedAt: fullDelivery.delivery_time ? new Date(fullDelivery.delivery_time).toLocaleString() : new Date().toLocaleString(),
            co2Saved: calcCo2.toFixed(2),
          };

          if (donorInfo?.email) {
            sendDeliveryCompletedEmail({
              to: donorInfo.email,
              recipientName: commonData.donorName,
              ...commonData,
            }).catch(err => console.error('[DELIVERIES] Completion email to donor failed:', err.message));
          }

          if (ngoInfo?.profiles?.email) {
            sendDeliveryCompletedEmail({
              to: ngoInfo.profiles.email,
              recipientName: commonData.ngoName,
              ...commonData,
            }).catch(err => console.error('[DELIVERIES] Completion email to NGO failed:', err.message));
          }

          console.log('[DELIVERIES] Delivery completion emails queued for donor & NGO');
        } catch (emailErr) {
          console.error('[DELIVERIES] Error sending completion emails:', emailErr.message);
        }
      })();

      try {
        const impactService = require('../services/impactService');
        await impactService.processCompletedDelivery(delivery_id);
        console.log('[DELIVERIES] Impact processed successfully for delivery:', delivery_id);
      } catch (impactErr) {
        console.error('[DELIVERIES] Error processing impact:', impactErr.message);
      }

      if (delivery.volunteer_id) {
        await supabaseAdmin.from('volunteers')
          .update({ availability_status: true })
          .eq('volunteer_id', delivery.volunteer_id);
      }
    }

    res.json({
      message: 'Delivery status updated successfully',
      delivery
    });

  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({
      error: 'Failed to update delivery status',
      message: error.message
    });
  }
});

router.put('/:delivery_id/assign', authenticateUser, ngoOnly, async (req, res) => {
  try {
    const { delivery_id } = req.params;
    const { volunteer_id } = req.body;

    if (!volunteer_id) {
      return res.status(400).json({
        error: 'Missing required field: volunteer_id'
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

    const { data: volunteer } = await supabaseAdmin
      .from('volunteers')
      .select('volunteer_id, full_name, profile_id, availability_status')
      .eq('volunteer_id', volunteer_id)
      .eq('ngo_id', ngo.ngo_id)
      .single();

    if (!volunteer) {
      return res.status(404).json({
        error: 'Volunteer not found or does not belong to your NGO'
      });
    }

    if (volunteer.profile_id) {
      return res.status(409).json({
        error: 'Linked volunteers accept pickups in their dashboard',
        message: 'Leave the pickup open so the volunteer can accept it and start OTP-protected tracking.'
      });
    }

    const { data: currentDelivery, error: currentError } = await supabaseAdmin
      .from('deliveries')
      .select('delivery_id, volunteer_id, delivery_status, ngo_claims!inner(ngo_id)')
      .eq('delivery_id', delivery_id)
      .eq('ngo_claims.ngo_id', ngo.ngo_id)
      .maybeSingle();
    if (currentError || !currentDelivery) return res.status(404).json({ error: 'Delivery not found or access denied' });
    if (!['assigned', 'in_transit'].includes(currentDelivery.delivery_status)) {
      return res.status(409).json({ error: 'Delivery is no longer active' });
    }
    if (!volunteer.availability_status && currentDelivery.volunteer_id !== volunteer_id) {
      return res.status(409).json({ error: 'Volunteer unavailable' });
    }

    let assignmentQuery = supabaseAdmin
      .from('deliveries')
      .update({
        volunteer_id,
        volunteer_assigned_at: new Date().toISOString()
      })
      .eq('delivery_id', delivery_id)
      .eq('delivery_status', currentDelivery.delivery_status);
    assignmentQuery = currentDelivery.volunteer_id
      ? assignmentQuery.eq('volunteer_id', currentDelivery.volunteer_id)
      : assignmentQuery.is('volunteer_id', null);
    const { data: delivery, error } = await assignmentQuery.select().single();

    if (error) {
      return res.status(error.code === 'PGRST116' ? 409 : 500).json({
        error: 'Failed to reassign volunteer',
        message: error.code === 'PGRST116' ? 'The delivery assignment changed. Refresh and try again.' : error.message
      });
    }

    if (currentDelivery.volunteer_id && currentDelivery.volunteer_id !== volunteer_id) {
      await supabaseAdmin.from('volunteers')
        .update({ availability_status: true })
        .eq('volunteer_id', currentDelivery.volunteer_id);
    }
    await supabaseAdmin.from('volunteers')
      .update({ availability_status: false })
      .eq('volunteer_id', volunteer_id);

    res.json({
      message: 'Volunteer reassigned successfully',
      delivery
    });

  } catch (error) {
    console.error('Reassign volunteer error:', error);
    res.status(500).json({
      error: 'Failed to reassign volunteer',
      message: error.message
    });
  }
});

module.exports = router;
