/**
 * Auth cookie utilities.
 *
 * Token strategy (split-token / refresh-rotation):
 *   - access_token  → returned in the JSON response body; the frontend stores
 *                     it in memory only (NOT localStorage) so an XSS attack
 *                     cannot persistently steal it.
 *   - refresh_token → stored in an HttpOnly, SameSite cookie that JavaScript
 *                     cannot read.  The /auth/refresh endpoint reads it from
 *                     the cookie and returns a new access_token in the body
 *                     plus a rotated refresh cookie.
 *   - csrf_token    → non-HttpOnly cookie read by the frontend and echoed back
 *                     as the X-CSRF-Token header on state-changing requests
 *                     (double-submit cookie CSRF defence).
 */

const isProduction = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Set auth cookies on the response.
 * @param {import('express').Response} res
 * @param {{ access_token?: string, refresh_token?: string }} session
 */
function setAuthCookies(res, session) {
  if (session?.refresh_token) {
    res.cookie('refresh_token', session.refresh_token, COOKIE_OPTIONS);
  }
  // Issue / rotate a CSRF double-submit token
  const csrfToken = crypto.randomUUID();
  res.cookie('csrf_token', csrfToken, CSRF_COOKIE_OPTIONS);
}

/**
 * Clear all auth cookies.
 * @param {import('express').Response} res
 */
function clearAuthCookies(res) {
  res.clearCookie('refresh_token', { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
}

/**
 * Read the refresh token from the request cookies.
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function getRefreshTokenFromCookie(req) {
  return req.cookies?.refresh_token || null;
}

module.exports = {
  COOKIE_OPTIONS,
  CSRF_COOKIE_OPTIONS,
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookie,
};
