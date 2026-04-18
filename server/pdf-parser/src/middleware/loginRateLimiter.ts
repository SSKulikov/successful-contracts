import rateLimit from "express-rate-limit";

const windowMs = Math.max(1000, Number(process.env.AUTH_LOGIN_RATE_WINDOW_MS ?? 15 * 60 * 1000));
const max = Math.max(1, Number(process.env.AUTH_LOGIN_RATE_MAX ?? 30));

/**
 * Ограничение частоты POST /api/auth/login (защита от перебора пароля).
 * За прокси задайте TRUST_PROXY=1 и передавайте X-Forwarded-For (см. docs/DEPLOY.md).
 */
export const loginRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много попыток входа. Повторите позже." }
});
