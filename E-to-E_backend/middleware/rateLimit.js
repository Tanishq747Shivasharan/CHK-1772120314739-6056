const DEFAULT_MAX_KEYS = 20000;

/**
 * Small process-local limiter for deployments without a shared rate-limit store.
 * Keep the key space bounded so spoofed or highly varied client IPs cannot
 * grow this map without limit. Express does not trust proxy headers by default.
 */
function createRateLimiter({
  windowMs,
  max,
  message = 'Too many requests. Please try again later.',
  maxKeys = DEFAULT_MAX_KEYS,
}) {
  const buckets = new Map();
  let lastCleanup = 0;

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (now - lastCleanup >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt) buckets.delete(key);
      }
      lastCleanup = now;
    }

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      if (!bucket && buckets.size >= maxKeys) {
        return res.status(503).json({ error: 'Service temporarily unavailable' });
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
