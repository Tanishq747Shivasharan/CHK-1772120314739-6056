const express = require('express');
const router = express.Router();
const {
  getTotalImpactMetrics,
  getImpactByPeriod,
  getDonorLeaderboard,
  getNGOPerformance,
  getDailyImpactTrend,
  getImpactByCity,
  getVolunteerPerformance,
  getFoodTypeDistribution,
  getDashboardSummary
} = require('../services/impactService');
const { authenticateUser } = require('../middleware/authMiddleware');
const { supabaseAdmin } = require('../config/supabaseClient');

router.get('/total', async (req, res) => {
  try {
    const result = await getTotalImpactMetrics();

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get impact metrics',
        message: result.error
      });
    }

    res.json({
      metrics: result.metrics
    });

  } catch (error) {
    console.error('Get total impact error:', error);
    res.status(500).json({
      error: 'Failed to get impact metrics',
      message: error.message
    });
  }
});

router.get('/period', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['start_date', 'end_date']
      });
    }

    const result = await getImpactByPeriod(start_date, end_date);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get period impact',
        message: result.error
      });
    }

    res.json({
      metrics: result.metrics
    });

  } catch (error) {
    console.error('Get period impact error:', error);
    res.status(500).json({
      error: 'Failed to get period impact',
      message: error.message
    });
  }
});

router.get('/leaderboard/donors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await getDonorLeaderboard(limit);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get donor leaderboard',
        message: result.error
      });
    }

    res.json({
      leaderboard: result.leaderboard
    });

  } catch (error) {
    console.error('Get donor leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get donor leaderboard',
      message: error.message
    });
  }
});

router.get('/performance/ngos', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await getNGOPerformance(limit);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get NGO performance',
        message: result.error
      });
    }

    res.json({
      performance: result.performance
    });

  } catch (error) {
    console.error('Get NGO performance error:', error);
    res.status(500).json({
      error: 'Failed to get NGO performance',
      message: error.message
    });
  }
});

router.get('/trend/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await getDailyImpactTrend(days);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get daily trend',
        message: result.error
      });
    }

    res.json({
      trend: result.trend
    });

  } catch (error) {
    console.error('Get daily trend error:', error);
    res.status(500).json({
      error: 'Failed to get daily trend',
      message: error.message
    });
  }
});

router.get('/city', async (req, res) => {
  try {
    const result = await getImpactByCity();

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get city impact',
        message: result.error
      });
    }

    res.json({
      cityImpact: result.cityImpact
    });

  } catch (error) {
    console.error('Get city impact error:', error);
    res.status(500).json({
      error: 'Failed to get city impact',
      message: error.message
    });
  }
});

router.get('/performance/volunteers', async (req, res) => {
  try {
    const ngoId = req.query.ngo_id || null;

    const result = await getVolunteerPerformance(ngoId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get volunteer performance',
        message: result.error
      });
    }

    res.json({
      performance: result.performance
    });

  } catch (error) {
    console.error('Get volunteer performance error:', error);
    res.status(500).json({
      error: 'Failed to get volunteer performance',
      message: error.message
    });
  }
});

router.get('/distribution/food-types', async (req, res) => {
  try {
    const result = await getFoodTypeDistribution();

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get food distribution',
        message: result.error
      });
    }

    res.json({
      distribution: result.distribution
    });

  } catch (error) {
    console.error('Get food distribution error:', error);
    res.status(500).json({
      error: 'Failed to get food distribution',
      message: error.message
    });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const result = await getDashboardSummary();

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get dashboard summary',
        message: result.error
      });
    }

    res.json({
      summary: result.summary
    });

  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard summary',
      message: error.message
    });
  }
});

router.get('/summary', authenticateUser, async (req, res) => {
  try {
    const user = req.user;

    let profileId = null;
    let targetRole = user.role; 

    let balance = 0;
    let lifetime = 0;
    let credits = 0;

    if (targetRole === 'admin') {
      const { data: allWallets } = await supabaseAdmin.from('impact_wallets').select('impact_points_balance, lifetime_impact_points');
      if (allWallets) {
        balance = allWallets.reduce((acc, w) => acc + (Number(w.impact_points_balance) || 0), 0);
        lifetime = allWallets.reduce((acc, w) => acc + (Number(w.lifetime_impact_points) || 0), 0);
      }
      const { count: totalCredits } = await supabaseAdmin.from('carbon_credits').select('*', { count: 'exact', head: true });
      credits = totalCredits || 0;
    } else {
      profileId = user.id; 
      if (targetRole === 'donor') {
        const { data: donor } = await supabaseAdmin.from('donors').select('profile_id').eq('profile_id', user.id).maybeSingle();
        if (donor) profileId = donor.profile_id;
      } else if (targetRole === 'ngo') {
        const { data: ngo } = await supabaseAdmin.from('ngos').select('profile_id').eq('profile_id', user.id).maybeSingle();
        if (ngo) profileId = ngo.profile_id;
      }

      const { data: wallet } = await supabaseAdmin
        .from('impact_wallets')
        .select('*')
        .eq('profile_id', profileId)
        .eq('role', targetRole)
        .maybeSingle();

      if (wallet) {
        balance = Number(wallet.impact_points_balance) || 0;
        lifetime = Number(wallet.lifetime_impact_points) || 0;
      }

      const { count: roleCredits } = await supabaseAdmin
        .from('carbon_credits')
        .select('*', { count: 'exact', head: true })
        .eq('owner_profile_id', profileId);

      credits = roleCredits || 0;
    }

    res.json({
      impact_points_balance: balance,
      lifetime_impact_points: lifetime,
      carbon_credits: credits,
      next_credit_progress: `${balance} / 100`
    });
  } catch (error) {
    console.error('Impact Summary Error:', error);
    res.status(500).json({ error: 'Failed to fetch impact summary' });
  }
});

module.exports = router;