export const isValidHttpsUrl = (str) => {
  if (!str) return true;
  try {
    const u = new URL(str);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};
