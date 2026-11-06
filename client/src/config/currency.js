/**
 * Project-Wide Currency Configuration
 *
 * Explicitly defines USD ($) as the standard currency across the entire Namlatic Hotel Portal:
 * - Database schema: Stores rates in PostgreSQL NUMERIC(12,2)
 * - REST API: Returns prices as exact decimal strings (e.g. "270.75")
 * - Frontend: Formats all rates consistently using APP_CURRENCY = 'USD'
 */
export const APP_CURRENCY = 'USD';
export const APP_CURRENCY_SYMBOL = '$';

/**
 * Formats a numeric string or number into standard currency representation.
 * Handles null, undefined, and non-numeric values safely with a formatted fallback.
 *
 * @param {string|number|null|undefined} amount
 * @param {string} [currency=APP_CURRENCY]
 * @returns {string} E.g., "$270.75"
 */
export const formatCurrency = (amount, currency = APP_CURRENCY) => {
  if (amount === null || amount === undefined || amount === '') {
    return `${APP_CURRENCY_SYMBOL}0.00`;
  }
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numeric) || !Number.isFinite(numeric)) {
    return `${APP_CURRENCY_SYMBOL}0.00`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
};
