const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { sendWelcomeDonor, sendWelcomeNGO } = require('../services/emailService');

router.post('/oauth/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'A valid Google-authenticated session is required'
      });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user || !user.email) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'The authentication session is invalid or expired'
      });
    }

    const hasGoogleIdentity = user.app_metadata?.provider === 'google' ||
      user.identities?.some(identity => identity.provider === 'google');
    if (!hasGoogleIdentity) {
      return res.status(403).json({
        error: 'Google authentication required',
        message: 'Complete sign-in with Google before creating an OAuth profile'
      });
    }

    const { full_name, phone, role, organization_name, accepted_terms } = req.body;
    const normalizedName = typeof full_name === 'string' ? full_name.trim() : '';
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedOrganization = typeof organization_name === 'string'
      ? organization_name.trim()
      : null;

    if (!normalizedName || !normalizedPhone) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['full_name', 'phone']
      });
    }

    if (!['donor', 'ngo', 'volunteer'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        message: 'Role must be donor, ngo, or volunteer'
      });
    }

    if (accepted_terms !== true) {
      return res.status(400).json({
        error: 'Terms not accepted',
        message: 'You must accept the Terms & Conditions to register.'
      });
    }

    if (['donor', 'ngo'].includes(role) && !normalizedOrganization) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'organization_name is required for donor and ngo roles'
      });
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfileError) {
      throw existingProfileError;
    }

    if (existingProfile) {
      return res.json({
        user: { id: user.id, email: user.email, ...existingProfile },
        existing: true
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        full_name: normalizedName,
        email: user.email,
        phone: normalizedPhone,
        role,
        organization_name: normalizedOrganization || null,
        accepted_terms: true,
        accepted_terms_timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      if (profileError.code === '23505') {
        const { data: racedProfile, error: racedProfileError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (racedProfileError) {
          throw racedProfileError;
        }

        if (racedProfile) {
          return res.json({
            user: { id: user.id, email: user.email, ...racedProfile },
            existing: true
          });
        }

        return res.status(409).json({
          error: 'Profile already exists',
          message: 'This email address or phone number is already associated with an account.'
        });
      }

      throw profileError;
    }

    return res.status(201).json({
      user: { id: user.id, email: user.email, ...profile },
      existing: false
    });
  } catch (error) {
    console.error('OAuth profile creation error:', error);
    return res.status(500).json({
      error: 'Profile creation failed',
      message: error.message
    });
  }
});

router.post('/register', async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      role,
      organization_name,
      accepted_terms,
      accepted_terms_timestamp
    } = req.body;

    if (!full_name || !email || !password || !phone || !role) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['full_name', 'email', 'password', 'phone', 'role']
      });
    }

    if (accepted_terms !== true) {
      return res.status(400).json({
        error: 'Terms not accepted',
        message: 'You must accept the Terms & Conditions to register.'
      });
    }

    if (['donor', 'ngo'].includes(role) && !organization_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'organization_name is required for donor and ngo roles'
      });
    }

    if (!['donor', 'ngo', 'volunteer'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        message: 'Role must be one of: donor, ngo, volunteer'
      });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      return res.status(400).json({
        error: 'Registration failed',
        message: authError.message
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name,
        email,
        phone,
        role,
        organization_name: organization_name || null,
        accepted_terms: true,
        accepted_terms_timestamp: accepted_terms_timestamp || new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

      return res.status(500).json({
        error: 'Profile creation failed',
        message: profileError.message
      });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (sessionError) {
      return res.status(500).json({
        error: 'Session creation failed',
        message: sessionError.message
      });
    }

    try {
      const emailPayload = {
        to: email,
        userName: full_name,
        email,
        phone,
        organizationName: organization_name || 'N/A',
      };

      if (role === 'donor') {
        sendWelcomeDonor(emailPayload).catch(err => console.error('[AUTH] Welcome donor email failed:', err.message));
      } else if (role === 'ngo') {
        sendWelcomeNGO({ ...emailPayload, contactPerson: full_name }).catch(err => console.error('[AUTH] Welcome NGO email failed:', err.message));
      }
    } catch (emailErr) {
      console.error('[AUTH] Error queueing welcome email:', emailErr.message);
    }

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        ...profile
      },
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        required: ['email', 'password']
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        error: 'Login failed',
        message: error.message
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      return res.status(404).json({
        error: 'Profile not found',
        message: profileError.message
      });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        ...profile
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7);

    const { error } = await supabase.auth.admin.signOut(token);

    if (error) {
      return res.status(500).json({
        error: 'Logout failed',
        message: error.message
      });
    }

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Missing refresh token'
      });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({
        error: 'Token refresh failed',
        message: error.message
      });
    }

    res.json({
      message: 'Token refreshed',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

router.get('/me', authenticateUser, async (req, res) => {
  try {
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: error.message
    });
  }
});

module.exports = router;