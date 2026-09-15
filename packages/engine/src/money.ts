/**
 * Integer ₵ arithmetic. Global convention: all monetary values are integers,
 * round down at the end of every calculation. Fractions are expressed as
 * numerator/denominator pairs so no floating point is involved.
 */

import type { Credits } from './types.ts';

/** floor(amount × num / den). */
export function fraction(amount: Credits, num: number, den: number): Credits {
  return Math.floor((amount * num) / den);
}

export function assertCredits(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`);
  }
}
