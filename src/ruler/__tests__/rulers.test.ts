import { describe, expect, it } from 'vitest';
import {
  addSubRuler,
  formatRatio,
  INITIAL_RULERS,
  isBinaryRuler,
  isPowerOfTwo,
  mod,
  orderRulers,
  parseRatio,
  removeRuler,
  selectRuler,
  setRatio,
  shiftRuler,
  type OrderedRuler,
  type RulerNode,
} from '../rulers';

const byId = (rulers: RulerNode[]) => new Map(orderRulers(rulers).map((r) => [r.node.id, r]));

/** True if both rulers have the same marks: same interval and origins a whole number of intervals apart. */
function sameMarks(a: OrderedRuler, b: OrderedRuler): boolean {
  const k = (a.origin - b.origin) / a.interval;
  return Math.abs(a.interval - b.interval) < 1e-9 && Math.abs(k - Math.round(k)) < 1e-9;
}

describe('parseRatio', () => {
  it('accepts "1" and "m:n" with positive integers', () => {
    expect(parseRatio('1')).toEqual({ m: 1, n: 1 });
    expect(parseRatio('3:2')).toEqual({ m: 3, n: 2 });
    expect(parseRatio(' 12 : 7 ')).toEqual({ m: 12, n: 7 });
  });

  it('rejects anything else', () => {
    for (const text of ['', '2', '0:3', '3:0', '3:', ':2', '1.5:2', '-1:2', '3:2:1', 'a:b']) {
      expect(parseRatio(text)).toBeNull();
    }
  });

  it('formats the unit ratio as "1"', () => {
    expect(formatRatio({ m: 1, n: 1 })).toBe('1');
    expect(formatRatio({ m: 3, n: 2 })).toBe('3:2');
  });
});

describe('orderRulers', () => {
  // main(0) ── a(1) ── c(3)
  //        └── b(2)
  let rulers = addSubRuler(INITIAL_RULERS, 0, 1);
  rulers = addSubRuler(rulers, 0, 2);
  rulers = addSubRuler(rulers, 1, 3);

  it('lists every ruler directly followed by the rulers derived from it', () => {
    expect(orderRulers(rulers).map((r) => [r.node.id, r.depth])).toEqual([
      [0, 0],
      [1, 1],
      [3, 2],
      [2, 1],
    ]);
  });

  it('starts sub-rulers with the same marks as their parent', () => {
    expect(orderRulers(rulers).map((r) => [r.interval, r.origin])).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
  });

  it('fits m sub-ruler intervals into n parent intervals', () => {
    expect(byId(setRatio(rulers, 1, { m: 3, n: 2 })).get(1)!.interval).toBeCloseTo(2 / 3);
  });

  it('deletes a sub-ruler together with all rulers derived from it', () => {
    const deep = addSubRuler(rulers, 3, 4); // a(1) ── c(3) ── d(4)
    expect(removeRuler(deep, 1).map((r) => r.id)).toEqual([0, 2]);
    expect(removeRuler(deep, 3).map((r) => r.id)).toEqual([0, 1, 2]);
    expect(removeRuler(deep, 2).map((r) => r.id)).toEqual([0, 1, 3, 4]);
  });

  it('keeps sub-sub-rulers relative to their parent when the parent changes', () => {
    let changed = setRatio(rulers, 3, { m: 2, n: 1 }); // c halves a's intervals
    changed = setRatio(changed, 1, { m: 3, n: 2 }); // a now has 3 intervals per 2 main intervals
    const result = byId(changed);
    expect(result.get(1)!.interval).toBeCloseTo(2 / 3);
    expect(result.get(3)!.interval).toBeCloseTo(1 / 3);
    expect(result.get(2)!.interval).toBe(1);
  });
});

describe('selectRuler', () => {
  let rulers = addSubRuler(INITIAL_RULERS, 0, 1);
  rulers = addSubRuler(rulers, 0, 2);
  const selectedIds = (rs: RulerNode[]) => rs.filter((r) => r.selected).map((r) => r.id);

  it('starts with nothing selected', () => {
    expect(selectedIds(rulers)).toEqual([]);
  });

  it('selects exactly one sub-ruler at a time', () => {
    const first = selectRuler(rulers, 1);
    expect(selectedIds(first)).toEqual([1]);
    expect(selectedIds(selectRuler(first, 2))).toEqual([2]);
  });

  it('never selects the main ruler, and keeps the current selection when it is clicked', () => {
    expect(selectedIds(selectRuler(rulers, 0))).toEqual([]);
    expect(selectedIds(selectRuler(selectRuler(rulers, 2), 0))).toEqual([2]);
  });

  it('keeps the selection when the selected ruler is clicked again', () => {
    const selected = selectRuler(rulers, 1);
    expect(selectRuler(selected, 1)).toBe(selected);
  });
});

describe('shiftRuler', () => {
  // main(0) ── a(1, 3:2) ── c(3, 5:4)
  let rulers = addSubRuler(INITIAL_RULERS, 0, 1);
  rulers = addSubRuler(rulers, 1, 3);
  rulers = setRatio(setRatio(rulers, 1, { m: 3, n: 2 }), 3, { m: 5, n: 4 });

  it('moves in steps that keep a mark aligned with a parent mark', () => {
    // 3:2 has marks every 2/3; aligned positions are 1/3 apart.
    const a = byId(shiftRuler(rulers, 1, 1)).get(1)!;
    expect(a.offsetStep).toBeCloseTo(1 / 3);
    expect(a.origin).toBeCloseTo(1 + 1 / 3);
    // Mark k = 1 lands on main-ruler mark 2.
    expect(a.origin + a.interval).toBeCloseTo(2);
  });

  it('keeps the offset in [0, n / gcd(m, n)) by a modulo operation', () => {
    for (const steps of [-7, -2, -1, 1, 2, 5, 11]) {
      const node = shiftRuler(rulers, 1, steps).find((r) => r.id === 1)!;
      expect(node.offset).toBe(mod(steps, 2));
    }
    // 4:6 reduces to 2:3, so there are 3 positions per interval.
    const unreduced = setRatio(rulers, 1, { m: 4, n: 6 });
    expect(shiftRuler(unreduced, 1, 7).find((r) => r.id === 1)!.offset).toBe(1);
  });

  it('moves the whole branch: sub-rulers keep their marks relative to the moved ruler', () => {
    for (const steps of [-5, -1, 1, 3, 8]) {
      const before = byId(rulers);
      const after = byId(shiftRuler(rulers, 1, steps));
      const shift = steps * before.get(1)!.offsetStep;
      for (const id of [1, 3]) {
        const moved = { ...before.get(id)!, origin: before.get(id)!.origin + shift };
        expect(sameMarks(after.get(id)!, moved)).toBe(true);
      }
    }
  });

  it('accumulates small moves to the same result as one big move', () => {
    let stepwise = rulers;
    for (let i = 0; i < 7; i++) stepwise = shiftRuler(stepwise, 1, 1);
    expect(stepwise).toEqual(shiftRuler(rulers, 1, 7));
  });

  it('moves a sub-sub-ruler against its own parent only', () => {
    const result = byId(shiftRuler(rulers, 3, 1));
    expect(result.get(1)!.origin).toBe(1);
    // 5:4 under a 2/3 interval: aligned positions are (2/3) / 5 apart.
    expect(result.get(3)!.origin).toBeCloseTo(1 + 2 / 15);
  });

  it('never moves the main ruler', () => {
    expect(shiftRuler(rulers, 0, 3)).toBe(rulers);
  });

  it('marks the group boundaries where sub-ruler marks meet parent marks', () => {
    const a = byId(shiftRuler(rulers, 1, 1)).get(1)!;
    expect(a.groupPhase).toBe(1);
    const boundary = a.origin + a.groupPhase * a.interval;
    expect(Math.abs(boundary - Math.round(boundary))).toBeLessThan(1e-9);
  });
});

describe('ratios against the main ruler', () => {
  // 0 main, 1 = 4:1 under main, 2 = 3:2 under 1, 3 = 3:2 under main, 4 = 2:3 under 3.
  let rulers = addSubRuler(addSubRuler(INITIAL_RULERS, 0, 1), 1, 2);
  rulers = addSubRuler(addSubRuler(rulers, 0, 3), 3, 4);
  rulers = setRatio(rulers, 1, { m: 4, n: 1 });
  rulers = setRatio(rulers, 2, { m: 3, n: 2 });
  rulers = setRatio(rulers, 3, { m: 3, n: 2 });
  rulers = setRatio(rulers, 4, { m: 2, n: 3 });
  const rows = byId(rulers);

  it('multiplies the ratios down the tree, in lowest terms', () => {
    expect(rows.get(0)!.mainRatio).toEqual({ m: 1, n: 1 });
    expect(rows.get(1)!.mainRatio).toEqual({ m: 4, n: 1 });
    expect(rows.get(2)!.mainRatio).toEqual({ m: 6, n: 1 });
    expect(rows.get(3)!.mainRatio).toEqual({ m: 3, n: 2 });
    expect(rows.get(4)!.mainRatio).toEqual({ m: 1, n: 1 });
  });

  it('calls sub-rulers binary when their m against the main ruler is a power of two', () => {
    expect([0, 1, 2, 3, 4].map((id) => isBinaryRuler(rows.get(id)!))).toEqual([false, true, false, false, true]);
    expect([1, 2, 4, 1024, 2 ** 40].every(isPowerOfTwo)).toBe(true);
    expect([0, 3, 6, 12, 0.5, -2].some(isPowerOfTwo)).toBe(false);
  });
});

describe('binary rulers and offsets', () => {
  const binary = (rulers: RulerNode[], id: number) => isBinaryRuler(byId(rulers).get(id)!);
  // 1 = 3:1 under the main ruler, 2 = 4:3 under 1, which makes 2 4:1 against the main ruler.
  const thirds = setRatio(setRatio(addSubRuler(addSubRuler(INITIAL_RULERS, 0, 1), 1, 2), 1, { m: 3, n: 1 }), 2, { m: 4, n: 3 });

  it('stay binary when shifted so that some marks still sit on main-ruler marks', () => {
    const quarters = setRatio(addSubRuler(INITIAL_RULERS, 0, 1), 1, { m: 4, n: 1 });
    expect(binary(shiftRuler(quarters, 1, 1), 1)).toBe(true);
    const halves = setRatio(addSubRuler(INITIAL_RULERS, 0, 1), 1, { m: 2, n: 3 });
    expect(binary(shiftRuler(halves, 1, 1), 1)).toBe(true);
    expect(binary(thirds, 2)).toBe(true);
  });

  it('are not binary when their own offset or an ancestor’s moves all their marks off the main-ruler marks', () => {
    // Shifting 2 by 1/12 puts its marks at 1/12 + k/4.
    expect(binary(shiftRuler(thirds, 2, 1), 2)).toBe(false);
    // Shifting 1 by 1/3 takes 2 along: its marks are at 1/3 + k/4.
    expect(binary(shiftRuler(thirds, 1, 1), 2)).toBe(false);
    // Shifting 2 by three steps (1/4) puts its marks back on quarters.
    expect(binary(shiftRuler(thirds, 2, 3), 2)).toBe(true);
  });
});
