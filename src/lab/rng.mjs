// Seeded PRNG (mulberry32). Everything that must be reproducible draws from here, never Math.random.

export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    uniform: (min = 0, max = 1) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gaussian: () => {
      const u = 1 - next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    uint32: () => Math.floor(next() * 4294967296) >>> 0,
    // Independent stream derived from this one (keeps sub-streams stable when other draws change).
    fork: () => createRng(Math.floor(next() * 4294967296)),
  };
  return rng;
}

export function seedFromTime() {
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}
