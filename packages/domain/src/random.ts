// Unpredictable random numbers for secrets (temporary passwords, join codes, door codes).
// Math.random is fast but predictable from its outputs, so it is only a fallback for very old runtimes.
export function secureRandom(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
  return Math.random();
}
