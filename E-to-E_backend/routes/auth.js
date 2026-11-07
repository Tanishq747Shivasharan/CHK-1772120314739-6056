const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');
const { sendWelcomeDonor, sendWelcomeNGO } = require('../services/emailService');
const { createRateLimiter } = require('../middleware/rateLimit');

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.'
});
const registrationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many registration attempts. Please try again later.'
});
const oauthProfileLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many profile setup attempts. Please try again later.'
});
const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many token refresh attempts. Please sign in again later.'
});

const validEmail = (value) => typeof value === 'string'
  && value.length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validText = (value, maxLength) => typeof value === 'string'
  && value.trim().length > 0
  && value.trim().length <= maxLength;

router.post('/oauth/profile', oauthProfileLimiter, async (req, res) => {
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

    if (!validText(normalizedName, 120) || !validText(normalizedPhone, 32)) {
      return res.status(400).json({
        error: 'Invalid profile details',
        message: 'Enter a name and phone number within the allowed lengths.'
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

    if (['donor', 'ngo'].includes(role) && !validText(normalizedOrganization, 160)) {
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
          error: 'Profile could not be created',
          message: 'The supplied account details could not be used.'
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
      message: 'The profile could not be created.'
    });
  }
});

router.post('/register', registrationLimiter, async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      role,
      organization_name,
      accepted_terms
    } = req.body;

    if (!validText(full_name, 120) || !validEmail(email) || typeof password !== 'string'
      || password.length < 12 || password.length > 128 || !validText(phone, 32) || !role) {
      return res.status(400).json({
        error: 'Invalid registration details',
        message: 'Check the name, email, password, and phone number and try again.'
      });
    }

    if (accepted_terms !== true) {
      return res.status(400).json({
        error: 'Terms not accepted',
        message: 'You must accept the Terms & Conditions to register.'
      });
    }

    if (['donor', 'ngo'].includes(role) && !validText(organization_name, 160)) {
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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedName = full_name.trim();
    const normalizedOrganization = typeof organization_name === 'string' ? organization_name.trim() : null;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true
    });

    if (authError) {
      return res.status(400).json({
        error: 'Registration failed',
        message: 'Registration could not be completed with these details.'
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        role,
        organization_name: normalizedOrganization || null,
        accepted_terms: true,
        accepted_terms_timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

      return res.status(500).json({
        error: 'Profile creation failed',
        message: 'Registration could not be completed with these details.'
      });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (sessionError) {
      return res.status(500).json({
        error: 'Session creation failed',
        message: 'The request could not be completed.'
      });
    }

    try {
      const emailPayload = {
        to: normalizedEmail,
        userName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        organizationName: normalizedOrganization || 'N/A',
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
    console.error('Registration error:', error.name || 'Error');
    res.status(500).json({
      error: 'Registration failed',
      message: 'Registration could not be completed.'
    });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!validEmail(email) || typeof password !== 'string' || password.length === 0 || password.length > 128) {
      return res.status(400).json({
        error: 'Invalid credentials',
        message: 'Enter a valid email address and password.'
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) {
      return res.status(401).json({
        error: 'Login failed',
        message: 'Email or password is incorrect.'
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
        message: 'The account profile is unavailable.'
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
    console.error('Login error:', error.name || 'Error');
    res.status(500).json({
      error: 'Login failed',
      message: 'Login could not be completed.'
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
        message: 'The request could not be completed.'
      });
    }

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'The request could not be completed.'
    });
  }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (typeof refresh_token !== 'string' || refresh_token.length < 20 || refresh_token.length > 4096) {
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
        message: 'The refresh token is invalid or expired.'
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
    console.error('Token refresh error:', error.name || 'Error');
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'The token could not be refreshed.'
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
      message: 'The request could not be completed.'
    });
  }
});

module.exports = router;
