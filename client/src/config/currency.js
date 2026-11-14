/**
 * Project-Wide Currency Configuration
 *
 * Configurable via environment variable: VITE_APP_CURRENCY (e.g., 'USD', 'EUR', 'INR').
 * If no currency is configured, formatting defaults to a currency-neutral numeric
 * representation (e.g., "250.00") rather than silently defaulting to USD.
 */

// Read configured currency from Vite or Node environment, defaulting to USD ($)
const envCurrency =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_CURRENCY) ||
  (typeof process !== 'undefined' && process.env && process.env.VITE_APP_CURRENCY) ||
  'USD';

export const APP_CURRENCY = envCurrency.trim() || 'USD';

/**
 * Derives the currency symbol for a given ISO 4217 currency code.
 * Returns empty string if code is empty or null.
 *
 * @param {string|null} currencyCode
 * @returns {string} E.g., "$", "€", "₹", or ""
 */
export const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).formatToParts(0);
    const currPart = parts.find((p) => p.type === 'currency');
    return currPart ? currPart.value : currencyCode;
  } catch {
    return currencyCode;
  }
};

export const APP_CURRENCY_SYMBOL = APP_CURRENCY ? getCurrencySymbol(APP_CURRENCY) : '';

/**
 * Formats a numeric string or number into currency or currency-neutral numeric representation.
 * - If currency is configured: formats with currency symbol/code (e.g. "$250.00").
 * - If no currency is configured: formats as clean number with 2 decimals (e.g. "250.00").
 * Handles null, undefined, and non-numeric values safely with a fallback.
 *
 * @param {string|number|null|undefined} amount
 * @param {string|null} [currency=APP_CURRENCY]
 * @returns {string} E.g., "$250.00" or "250.00"
 */
export const formatCurrency = (amount, currency = APP_CURRENCY) => {
  if (amount === null || amount === undefined || amount === '') {
    return currency ? formatWithCurrency(0, currency) : '0.00';
  }
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numeric) || !Number.isFinite(numeric)) {
    return currency ? formatWithCurrency(0, currency) : '0.00';
  }
  if (!currency) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  return formatWithCurrency(numeric, currency);
};

function formatWithCurrency(num, curr) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${curr}`;
  }
}
