export const API_BASE = 'https://notry-back.onrender.com/api/v1';

export const fetchWithTimeout = (url, options, ms = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};
