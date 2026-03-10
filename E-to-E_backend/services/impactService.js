const { supabaseAdmin } = require('../config/supabaseClient');
const getTotalImpactMetrics = async () => {
  try {
    let metrics = {};
    const { data, error } = await supabaseAdmin.rpc('get_total_impact_metrics');

    if (!error && data) {
      metrics = data;
    } else {
      console.warn('RPC get_total_impact_metrics failed, using fallback queries for impact:', error?.message);

      let totalFoodKg = 0;
      let totalCo2Kg = 0;

      const { data: impactData } = await supabaseAdmin
        .from('impact_metrics')
        .select('food_saved_kg, co2_emissions_reduced_kg');

      if (impactData && impactData.length > 0) {
        totalFoodKg = impactData.reduce((sum, row) => sum + (parseFloat(row.food_saved_kg) || 0), 0);
        totalCo2Kg = impactData.reduce((sum, row) => sum + (parseFloat(row.co2_emissions_reduced_kg) || 0), 0);
      } else {
        const { data: listings } = await supabaseAdmin
          .from('food_listings')
          .select('quantity_kg');

        if (listings && listings.length > 0) {
          totalFoodKg = listings.reduce((sum, row) => sum + (parseFloat(row.quantity_kg) || 0), 0);
          totalCo2Kg = totalFoodKg * 2.5; // approximate
        }
      }

      metrics = {
        total_food_saved_kg: Math.round(totalFoodKg),
        total_co2_reduced_kg: Math.round(totalCo2Kg * 100) / 100,
      };
    }

    const { count: ngoCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'ngo');

    const { count: donorCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'donor');

    return {
      success: true,
      metrics: {
        ...metrics,
        total_ngos: ngoCount || 0,
        total_donors: donorCount || 0,
        ngo_count: ngoCount || 0,
        donor_count: donorCount || 0,
      }
    };
  } catch (error) {
    console.error('Error getting total impact:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getImpactByPeriod = async (startDate, endDate) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_impact_by_period', {
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) throw error;

    return {
      success: true,
      metrics: data
    };
  } catch (error) {
    console.error('Error getting period impact:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getDonorLeaderboard = async (limit = 10) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_donor_leaderboard', {
      p_limit: limit
    });

    if (error) throw error;

    return {
      success: true,
      leaderboard: data
    };
  } catch (error) {
    console.error('Error getting donor leaderboard:', error);
    return {
      success: false,
      error: error.message,
      leaderboard: []
    };
  }
};

const getNGOPerformance = async (limit = 10) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_ngo_performance', {
      p_limit: limit
    });

    if (error) throw error;

    return {
      success: true,
      performance: data
    };
  } catch (error) {
    console.error('Error getting NGO performance:', error);
    return {
      success: false,
      error: error.message,
      performance: []
    };
  }
};

const getDailyImpactTrend = async (days = 30) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_daily_impact_trend', {
      p_days: days
    });

    if (error) throw error;

    return {
      success: true,
      trend: data
    };
  } catch (error) {
    console.error('Error getting daily trend:', error);
    return {
      success: false,
      error: error.message,
      trend: []
    };
  }
};

const getImpactByCity = async () => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_impact_by_city');

    if (error) throw error;

    return {
      success: true,
      cityImpact: data
    };
  } catch (error) {
    console.error('Error getting city impact:', error);
    return {
      success: false,
      error: error.message,
      cityImpact: []
    };
  }
};

const getVolunteerPerformance = async (ngoId = null) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_volunteer_performance', {
      p_ngo_id: ngoId
    });

    if (error) throw error;

    return {
      success: true,
      performance: data
    };
  } catch (error) {
    console.error('Error getting volunteer performance:', error);
    return {
      success: false,
      error: error.message,
      performance: []
    };
  }
};

const getFoodTypeDistribution = async () => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_food_type_distribution');

    if (error) throw error;

    return {
      success: true,
      distribution: data
    };
  } catch (error) {
    console.error('Error getting food distribution:', error);
    return {
      success: false,
      error: error.message,
      distribution: []
    };
  }
};

const getDashboardSummary = async () => {
  try {
    const { data, error } = await supabaseAdmin
      .from('dashboard_summary')
      .select('*')
      .single();

    if (error) throw error;

    return {
      success: true,
      summary: data
    };
  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getDonorImpact = async (donorId) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('impact_metrics')
      .select(`
        *,
        food_listings!inner (
          donor_id,
          food_type,
          quantity_kg,
          created_at
        )
      `)
      .eq('food_listings.donor_id', donorId);

    if (error) throw error;

    const totalImpact = data.reduce((acc, metric) => ({
      total_meals: acc.total_meals + (metric.meals_served || 0),
      total_food_kg: acc.total_food_kg + (parseFloat(metric.food_saved_kg) || 0),
      total_co2_kg: acc.total_co2_kg + (parseFloat(metric.co2_emissions_reduced_kg) || 0),
      total_value: acc.total_value + (parseFloat(metric.monetary_value) || 0),
      listing_count: acc.listing_count + 1
    }), {
      total_meals: 0,
      total_food_kg: 0,
      total_co2_kg: 0,
      total_value: 0,
      listing_count: 0
    });

    return {
      success: true,
      impact: {
        ...totalImpact,
        details: data
      }
    };
  } catch (error) {
    console.error('Error getting donor impact:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getNGOImpact = async (ngoId) => {
  try {
    const { data: claims, error: claimsError } = await supabaseAdmin
      .from('ngo_claims')
      .select('listing_id')
      .eq('ngo_id', ngoId);

    if (claimsError) throw claimsError;

    if (!claims || claims.length === 0) {
      return {
        success: true,
        impact: {
          total_meals: 0,
          total_food_kg: 0,
          total_co2_kg: 0,
          total_value: 0,
          delivery_count: 0,
          details: []
        }
      };
    }

    const listingIds = claims.map(c => c.listing_id);

    const { data, error } = await supabaseAdmin
      .from('impact_metrics')
      .select(`
        *,
        food_listings (
          listing_id,
          food_type,
          quantity_kg
        )
      `)
      .in('listing_id', listingIds);

    if (error) throw error;

    const totalImpact = (data || []).reduce((acc, metric) => ({
      total_meals: acc.total_meals + (metric.meals_served || 0),
      total_food_kg: acc.total_food_kg + (parseFloat(metric.food_saved_kg) || 0),
      total_co2_kg: acc.total_co2_kg + (parseFloat(metric.co2_emissions_reduced_kg) || 0),
      total_value: acc.total_value + (parseFloat(metric.monetary_value) || 0),
      delivery_count: acc.delivery_count + 1
    }), {
      total_meals: 0,
      total_food_kg: 0,
      total_co2_kg: 0,
      total_value: 0,
      delivery_count: 0
    });

    return {
      success: true,
      impact: {
        ...totalImpact,
        details: data || []
      }
    };
  } catch (error) {
    console.error('Error getting NGO impact:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const calculateImpactMetrics = (foodKg, mealEquivalent) => {
  const co2Reduced = parseFloat(foodKg) * 2.5; // 2.5 kg CO2 per kg food
  const monetaryValue = parseInt(mealEquivalent) * 3.0; // $3 per meal

  return {
    meals_served: mealEquivalent,
    food_saved_kg: parseFloat(foodKg),
    co2_emissions_reduced_kg: parseFloat(co2Reduced.toFixed(2)),
    monetary_value: parseFloat(monetaryValue.toFixed(2))
  };
};

module.exports = {
  getTotalImpactMetrics,
  getImpactByPeriod,
  getDonorLeaderboard,
  getNGOPerformance,
  getDailyImpactTrend,
  getImpactByCity,
  getVolunteerPerformance,
  getFoodTypeDistribution,
  getDashboardSummary,
  getDonorImpact,
  getNGOImpact,
  calculateImpactMetrics
};

const processCompletedDelivery = async (delivery_id) => {
  console.log(`[IMPACT] Impact processing started for delivery: ${delivery_id}`);
  try {
    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('deliveries')
      .select(`
        *,
        ngo_claims (
          *,
          food_listings (*),
          ngos (profile_id)
        )
      `)
      .eq('delivery_id', delivery_id)
      .single();

    if (deliveryError || !delivery) {
      throw new Error(`Failed to fetch delivery ${delivery_id}: ${deliveryError?.message}`);
    }

    if (delivery.delivery_status !== 'COMPLETED' && delivery.delivery_status !== 'delivered') {
      console.log(`[IMPACT] Delivery ${delivery_id} not completed. Status: ${delivery.delivery_status}`);
      return;
    }

    const claim = delivery.ngo_claims;
    const listing = claim?.food_listings;
    if (!claim || !listing) {
      throw new Error(`Missing claim or listing for delivery ${delivery_id}`);
    }

    const { data: existingCredit } = await supabaseAdmin
      .from('carbon_credits')
      .select('credit_id')
      .contains('metadata', { delivery_id })
      .maybeSingle();

    if (existingCredit) {
      console.log(`[IMPACT] Wallets already processed for delivery ${delivery_id} (found credit with metadata). Skipping.`);
      return;
    }

    console.log(`[IMPACT] Processing: quantity=${listing.quantity_kg}kg, food_type=${listing.food_type}`);

    const { data: donor } = await supabaseAdmin
      .from('donors')
      .select('profile_id')
      .eq('donor_id', listing.donor_id)
      .single();

    if (!donor) throw new Error(`Missing donor for delivery ${delivery_id}`);

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminProfile) throw new Error('No admin profile found for minting carbon credits');

    const donorProfileId = donor.profile_id;
    const ngoProfileId = claim.ngos?.profile_id;
    const adminProfileId = adminProfile.id;

    const quantity_kg = Number(listing.quantity_kg) || 0;
    const baseImpactPoints = quantity_kg / 10;
    let categoryMultiplier = 1; 

    const foodType = (listing.food_type || '').toLowerCase();
    switch (foodType) {
      case 'dairy products':
        categoryMultiplier = 2;
        break;

      case 'cooked meals':
        categoryMultiplier = 2;
        break;

      case 'raw vegetables':
      case 'fruits':
        categoryMultiplier = 1;
        break;

      case 'bakery items':
        categoryMultiplier = 1;
        break;

      case 'beverages':
        categoryMultiplier = 1;
        break;

      case 'other':
        categoryMultiplier = 1;
        break;

      default:
        categoryMultiplier = 1;
    }

    const totalImpactPoints = baseImpactPoints * categoryMultiplier;

    const distributions = [
      { profile_id: donorProfileId, role: 'donor', points: totalImpactPoints * 0.4 },
      { profile_id: ngoProfileId, role: 'ngo', points: totalImpactPoints * 0.3 },
      { profile_id: adminProfileId, role: 'admin', points: totalImpactPoints * 0.2 },
      { profile_id: adminProfileId, role: 'platform', points: totalImpactPoints * 0.1 } // Fallback to admin ID for platform share
    ];

    const composted_kg = Number(delivery.composted_kg) || 0;
    if (composted_kg > 0) {
      const compostIP = composted_kg / 10;
      const adminDist = distributions.find(d => d.role === 'admin');
      if (adminDist) {
        adminDist.points += compostIP;
      }
    }

    for (const dist of distributions) {
      if (!dist.profile_id || dist.points <= 0) continue;

      const { data: wallet } = await supabaseAdmin
        .from('impact_wallets')
        .select('impact_points_balance, lifetime_impact_points')
        .eq('profile_id', dist.profile_id)
        .eq('role', dist.role)
        .maybeSingle();

      let currentBalance = (Number(wallet?.impact_points_balance) || 0) + dist.points;
      const lifetimePoints = (Number(wallet?.lifetime_impact_points) || 0) + dist.points;

      let creditsToMint = 0;
      if (currentBalance >= 100) {
        creditsToMint = Math.floor(currentBalance / 100);
        currentBalance = currentBalance - (creditsToMint * 100);
      }

      const { error: upsertError } = await supabaseAdmin
        .from('impact_wallets')
        .upsert(
          {
            profile_id: dist.profile_id,
            role: dist.role,
            impact_points_balance: currentBalance,
            lifetime_impact_points: lifetimePoints,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'profile_id, role' }
        );

      if (upsertError) throw new Error(`Wallet UPSERT failed: ${upsertError.message}`);

      if (creditsToMint > 0) {
        const creditRecords = [];
        for (let i = 0; i < creditsToMint; i++) {
          creditRecords.push({
            source_impact_points: 100,
            issued_by_admin: adminProfileId,
            owner_profile_id: dist.profile_id,
            metadata: { delivery_id, role: dist.role }
          });
        }

        const { error: mintError } = await supabaseAdmin
          .from('carbon_credits')
          .insert(creditRecords);

        if (mintError) throw new Error(`Carbon credit insert failed: ${mintError.message}`);
        console.log(`[IMPACT] Minted ${creditsToMint} carbon credit(s) for ${dist.role} (profile: ${dist.profile_id})`);
      }
    }

  console.log(`[IMPACT] Impact processing completed successfully for delivery: ${delivery_id}`);

  } catch (error) {
    console.error(`[IMPACT] Impact processing FAILED for delivery ${delivery_id}:`, error);
    throw error;
  }
};

module.exports.processCompletedDelivery = processCompletedDelivery;