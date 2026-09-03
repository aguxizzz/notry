export const coordsEqual = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export const parseNumberOrZero = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
