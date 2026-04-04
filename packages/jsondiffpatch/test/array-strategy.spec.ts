import { beforeAll, describe, expect, it } from "vitest";
import * as jsondiffpatch from "../src/index.js";
import * as jsonpatchFormatter from "../src/formatters/jsonpatch.js";

const DiffPatcher = jsondiffpatch.DiffPatcher;

describe("ArrayDiffStrategy", () => {
	beforeAll(() => {
		expect(DiffPatcher).toBeTypeOf("function");
	});

	describe("matchBy with path-based map", () => {
		it("hash function per path matches items correctly", () => {
			const instance = new DiffPatcher({
				matchBy: { "/items": (item: object) => (item as { id: string }).id },
			} as any);
			const left = { items: [{ id: "a", val: 1 }, { id: "b", val: 2 }] };
			const right = { items: [{ id: "b", val: 2 }, { id: "a", val: 10 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: { _t: "a", 1: { val: [1, 10] }, _1: ["", 0, 3] },
			});
			expect(instance.patch(jsondiffpatch.clone(left), delta as jsondiffpatch.Delta)).toEqual(right);
		});

		it("full strategy object with hash", () => {
			const instance = new DiffPatcher({
				matchBy: { "/items": { hash: (item: object) => (item as { name: string }).name } },
			} as any);
			const left = { items: [{ name: "x", v: 1 }, { name: "y", v: 2 }] };
			const right = { items: [{ name: "y", v: 2 }, { name: "x", v: 5 }] };
			expect(instance.diff(left, right)).toEqual({
				items: { _t: "a", 1: { v: [1, 5] }, _1: ["", 0, 3] },
			});
		});

		it("different strategies for different paths", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/users": (item: object) => (item as { uid: string }).uid,
					"/tags": (item: object) => (item as { label: string }).label,
				},
			} as any);
			const left = {
				users: [{ uid: "u1", name: "Alice" }, { uid: "u2", name: "Bob" }],
				tags: [{ label: "a", color: "red" }, { label: "b", color: "blue" }],
			};
			const right = {
				users: [{ uid: "u2", name: "Bob" }, { uid: "u1", name: "Alicia" }],
				tags: [{ label: "b", color: "blue" }, { label: "a", color: "green" }],
			};
			expect(instance.diff(left, right)).toEqual({
				users: { _t: "a", 1: { name: ["Alice", "Alicia"] }, _1: ["", 0, 3] },
				tags: { _t: "a", 1: { color: ["red", "green"] }, _1: ["", 0, 3] },
			});
		});
	});

	describe("matchBy with resolver function", () => {
		it("function-based resolver", () => {
			const instance = new DiffPatcher({
				matchBy: (path: string) =>
					path === "/items" ? { hash: (item: object) => (item as { id: string }).id } : undefined,
			} as any);
			const left = { items: [{ id: "a", v: 1 }], other: [{ id: "a", v: 1 }] };
			const right = { items: [{ id: "a", v: 2 }], other: [{ id: "a", v: 2 }] };
			expect(instance.diff(left, right)).toEqual({
				items: { _t: "a", 0: { v: [1, 2] } },
				other: { _t: "a", 0: { v: [1, 2] } },
			});
		});

		it("resolver returning undefined falls back to objectHash", () => {
			const instance = new DiffPatcher({
				objectHash: (item: object) => (item as { id: string }).id,
				matchBy: (path: string) =>
					path === "/primary" ? { hash: (item: object) => (item as { key: string }).key } : undefined,
			} as any);
			const left = { primary: [{ key: "k1", v: 1 }], secondary: [{ id: "s1", v: 1 }] };
			const right = { primary: [{ key: "k1", v: 2 }], secondary: [{ id: "s1", v: 2 }] };
			expect(instance.diff(left, right)).toEqual({
				primary: { _t: "a", 0: { v: [1, 2] } },
				secondary: { _t: "a", 0: { v: [1, 2] } },
			});
		});
	});

	describe("shouldDiff hook", () => {
		it("shouldDiff false produces atomic modify delta", () => {
			const instance = new DiffPatcher({ matchBy: { "/arr": { shouldDiff: () => false } } } as any);
			expect(instance.diff({ arr: [1, 2, 3] }, { arr: [4, 5, 6] })).toEqual({ arr: [[1, 2, 3], [4, 5, 6]] });
		});

		it("shouldDiff false can be patched", () => {
			const instance = new DiffPatcher({ matchBy: { "/arr": { shouldDiff: () => false } } } as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [4, 5, 6] };
			const delta = instance.diff(left, right);
			expect(instance.patch(jsondiffpatch.clone(left), delta as jsondiffpatch.Delta)).toEqual(right);
		});

		it("shouldDiff false can be unpatched", () => {
			const instance = new DiffPatcher({ matchBy: { "/arr": { shouldDiff: () => false } } } as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [4, 5, 6] };
			const delta = instance.diff(left, right);
			expect(instance.unpatch(jsondiffpatch.clone(right), delta as jsondiffpatch.Delta)).toEqual(left);
		});

		it("shouldDiff false can be reversed", () => {
			const instance = new DiffPatcher({ matchBy: { "/arr": { shouldDiff: () => false } } } as any);
			const delta = instance.diff({ arr: [1, 2, 3] }, { arr: [4, 5, 6] });
			expect(instance.reverse(delta as jsondiffpatch.Delta)).toEqual({ arr: [[4, 5, 6], [1, 2, 3]] });
		});

		it("shouldDiff true behaves normally", () => {
			const instance = new DiffPatcher({ matchBy: { "/arr": { shouldDiff: () => true } } } as any);
			expect(instance.diff({ arr: [1, 2, 3] }, { arr: [1, 2, 3, 4] })).toEqual({ arr: { _t: "a", 3: [4] } });
		});

		it("shouldDiff on identical arrays produces no delta", () => {
			const instance = new DiffPatcher({ matchBy: { "/arr": { shouldDiff: () => false } } } as any);
			expect(instance.diff({ arr: [1, 2, 3] }, { arr: [1, 2, 3] })).toBeUndefined();
		});
	});

	describe("weight hook", () => {
		it("weight zero rejects hash match", () => {
			const instance = new DiffPatcher({
				matchBy: { "/items": { hash: (item: object) => (item as { type: string }).type, weight: () => 0 } },
			} as any);
			expect(instance.diff({ items: [{ type: "a", v: 1 }] }, { items: [{ type: "a", v: 2 }] })).toEqual({
				items: { _t: "a", _0: [{ type: "a", v: 1 }, 0, 0], 0: [{ type: "a", v: 2 }] },
			});
		});

		it("weight positive confirms hash match", () => {
			const instance = new DiffPatcher({
				matchBy: { "/items": { hash: (item: object) => (item as { id: string }).id, weight: () => 1 } },
			} as any);
			expect(instance.diff({ items: [{ id: "a", v: 1 }] }, { items: [{ id: "a", v: 2 }] })).toEqual({
				items: { _t: "a", 0: { v: [1, 2] } },
			});
		});

		it("weight selects best-matching move candidate", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/items": {
						hash: (item: object) => (item as { type: string }).type,
						weight: (a: unknown, b: unknown) => {
							const score = (a as { score: number }).score + (b as { score: number }).score;
							return score > 5 ? 1 : 0.1;
						},
					},
				},
			} as any);
			const delta = instance.diff(
				{ items: [{ type: "x", score: 1 }, { type: "x", score: 4 }] },
				{ items: [{ type: "y", score: 0 }, { type: "x", score: 4 }] },
			);
			expect(delta).toBeDefined();
		});
	});

	describe("equal hook", () => {
		it("equal used instead of hash for matching", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/items": {
						equal: (a: unknown, b: unknown) =>
							(a as { name: string }).name === (b as { name: string }).name,
					},
				},
			} as any);
			const left = { items: [{ name: "x", v: 1 }, { name: "y", v: 2 }] };
			const right = { items: [{ name: "y", v: 3 }, { name: "x", v: 1 }] };
			expect(instance.diff(left, right)).toEqual({
				items: { _t: "a", 0: { v: [2, 3] }, _0: ["", 1, 3] },
			});
		});
	});

	describe("onMatch observer", () => {
		it("onMatch is called for each matched pair", () => {
			const matched: [unknown, unknown][] = [];
			const instance = new DiffPatcher({
				matchBy: {
					"/items": {
						hash: (item: object) => (item as { id: string }).id,
						onMatch: (a: unknown, b: unknown) => { matched.push([a, b]); },
					},
				},
			} as any);
			instance.diff(
				{ items: [{ id: "a", v: 1 }, { id: "b", v: 2 }] },
				{ items: [{ id: "b", v: 2 }, { id: "a", v: 10 }] },
			);
			expect(matched.length).toBeGreaterThan(0);
			const ids = matched.map(([a]) => (a as { id: string }).id);
			expect(ids).toContain("a");
			expect(ids).toContain("b");
		});
	});

	describe("resolveStrategy method", () => {
		it("returns strategy from map", () => {
			const hashFn = (item: object) => (item as { id: string }).id;
			const instance = new DiffPatcher({ matchBy: { "/items": { hash: hashFn } } } as any) as any;
			const strategy = instance.resolveStrategy("/items", [], []);
			expect(strategy).toBeDefined();
			expect(strategy.hash).toBe(hashFn);
		});

		it("returns undefined for unmatched path", () => {
			const instance = new DiffPatcher({ matchBy: { "/items": (item: object) => (item as { id: string }).id } } as any) as any;
			expect(instance.resolveStrategy("/other", [], [])).toBeUndefined();
		});

		it("normalizes bare hash to strategy", () => {
			const hashFn = (item: object) => (item as { id: string }).id;
			const instance = new DiffPatcher({ matchBy: { "/items": hashFn } } as any) as any;
			const strategy = instance.resolveStrategy("/items", [], []);
			expect(strategy).toBeDefined();
			expect(strategy.hash).toBe(hashFn);
		});

		it("returns undefined with no matchBy", () => {
			expect((new DiffPatcher() as any).resolveStrategy("/any", [], [])).toBeUndefined();
		});
	});

	describe("fallback chain", () => {
		it("matchBy takes precedence over objectHash", () => {
			const instance = new DiffPatcher({
				objectHash: (item: object) => (item as { id: string }).id,
				matchBy: { "/items": (item: object) => (item as { key: string }).key },
			} as any);
			expect(instance.diff(
				{ items: [{ key: "k1", id: "OLD", v: 1 }] },
				{ items: [{ key: "k1", id: "NEW", v: 2 }] },
			)).toEqual({ items: { _t: "a", 0: { id: ["OLD", "NEW"], v: [1, 2] } } });
		});

		it("objectHash used when matchBy has no match", () => {
			const instance = new DiffPatcher({
				objectHash: (item: object) => (item as { id: string }).id,
				matchBy: { "/primary": (item: object) => (item as { key: string }).key },
			} as any);
			expect(instance.diff(
				{ secondary: [{ id: "s1", v: 1 }] },
				{ secondary: [{ id: "s1", v: 2 }] },
			)).toEqual({ secondary: { _t: "a", 0: { v: [1, 2] } } });
		});
	});

	describe("path tracking", () => {
		it("deeply nested path resolves correctly", () => {
			const instance = new DiffPatcher({
				matchBy: { "/a/b/items": { hash: (item: object) => (item as { id: string }).id } },
			} as any);
			expect(instance.diff(
				{ a: { b: { items: [{ id: "x", v: 1 }] } } },
				{ a: { b: { items: [{ id: "x", v: 2 }] } } },
			)).toEqual({ a: { b: { items: { _t: "a", 0: { v: [1, 2] } } } } });
		});

		it("root-level array path is empty string", () => {
			const instance = new DiffPatcher({
				matchBy: { "": { hash: (item: object) => (item as { id: string }).id } },
			} as any);
			expect(instance.diff([{ id: "a", v: 1 }], [{ id: "a", v: 2 }])).toEqual({
				_t: "a", 0: { v: [1, 2] },
			});
		});
	});

	describe("wildcard path matching", () => {
		it("* matches any single path segment", () => {
			const instance = new DiffPatcher({
				matchBy: { "/users/*/items": { hash: (item: object) => (item as { id: string }).id } },
			} as any);
			const left = { users: [{ name: "Alice", items: [{ id: "i1", v: 1 }] }, { name: "Bob", items: [{ id: "i2", v: 2 }] }] };
			const right = { users: [{ name: "Alice", items: [{ id: "i1", v: 10 }] }, { name: "Bob", items: [{ id: "i2", v: 20 }] }] };
			expect(instance.diff(left, right)).toEqual({
				users: {
					_t: "a",
					0: { items: { _t: "a", 0: { v: [1, 10] } } },
					1: { items: { _t: "a", 0: { v: [2, 20] } } },
				},
			});
		});
	});

	describe("backward compatibility", () => {
		it("objectHash without matchBy still works", () => {
			const instance = new DiffPatcher({
				objectHash: (obj: object) => (obj as { id: string | number }).id?.toString(),
			});
			expect(instance.diff([{ id: 4, width: 10 }, { id: "five", width: 4 }], [{ id: 4, width: 12 }, { id: "five", width: 4 }])).toEqual({
				_t: "a", 0: { width: [10, 12] },
			});
		});

		it("no options produces same behavior", () => {
			expect(new DiffPatcher().diff([1, 2, 3], [1, 2, 4])).toEqual({ _t: "a", _2: [3, 0, 0], 2: [4] });
		});
	});

	describe("strategy utility functions", () => {
		it("createHashStrategy creates a strategy from a hash function", () => {
			const hashFn = (item: object) => (item as { id: string }).id;
			expect(jsondiffpatch.createHashStrategy(hashFn).hash).toBe(hashFn);
		});

		it("createEqualStrategy creates a strategy from an equality function", () => {
			const equalFn = (a: unknown, b: unknown) => (a as { id: string }).id === (b as { id: string }).id;
			expect(jsondiffpatch.createEqualStrategy(equalFn).equal).toBe(equalFn);
		});

		it("createWeightedStrategy combines hash and weight", () => {
			const hashFn = (item: object) => (item as { id: string }).id;
			const weightFn = () => 0.5;
			const s = jsondiffpatch.createWeightedStrategy(hashFn, weightFn);
			expect(s.hash).toBe(hashFn);
			expect(s.weight).toBe(weightFn);
		});

		it("isArrayDiffStrategy identifies strategy objects", () => {
			const { isArrayDiffStrategy } = jsondiffpatch;
			expect(isArrayDiffStrategy({ hash: () => "x" })).toBe(true);
			expect(isArrayDiffStrategy({ equal: () => true })).toBe(true);
			expect(isArrayDiffStrategy({ shouldDiff: () => true })).toBe(true);
			expect(isArrayDiffStrategy(() => "x")).toBe(false);
			expect(isArrayDiffStrategy(null)).toBe(false);
			expect(isArrayDiffStrategy({})).toBe(false);
		});

		it("combineStrategies cascades hash functions", () => {
			const { combineStrategies } = jsondiffpatch;
			const stratA = { hash: (item: object) => (item as { idA?: string }).idA };
			const stratB = { hash: (item: object) => (item as { idB: string }).idB };
			const combined = combineStrategies(stratA, stratB);
			expect(combined.hash!({ idA: "a1" }, 0)).toBe("a1");
			expect(combined.hash!({ idB: "b1" }, 0)).toBe("b1");
			expect(combined.hash!({ idA: "a1", idB: "b1" }, 0)).toBe("a1");
		});

		it("combineStrategies ANDs shouldDiff hooks", () => {
			const { combineStrategies } = jsondiffpatch;
			const combined = combineStrategies(
				{ shouldDiff: (left: readonly unknown[]) => left.length < 10 },
				{ shouldDiff: (_l: readonly unknown[], right: readonly unknown[]) => right.length < 10 },
			);
			expect(combined.shouldDiff!([1, 2], [1, 2])).toBe(true);
			expect(combined.shouldDiff!([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1])).toBe(false);
		});

		it("combineStrategies multiplies weight functions", () => {
			const combined = jsondiffpatch.combineStrategies({ weight: () => 0.5 }, { weight: () => 0.8 });
			expect(combined.weight!({}, {})).toBeCloseTo(0.4);
		});

		it("combineStrategies chains onMatch hooks", () => {
			const { combineStrategies } = jsondiffpatch;
			const callsA: unknown[] = [];
			const callsB: unknown[] = [];
			const combined = combineStrategies(
				{ onMatch: (a: unknown) => { callsA.push(a); } },
				{ onMatch: (a: unknown) => { callsB.push(a); } },
			);
			combined.onMatch!("x", "y");
			expect(callsA).toEqual(["x"]);
			expect(callsB).toEqual(["x"]);
		});

		it("combineStrategies end-to-end", () => {
			const combined = jsondiffpatch.combineStrategies(
				{ hash: (item: object) => (item as { id: string }).id },
				{ shouldDiff: (l: readonly unknown[], r: readonly unknown[]) => l.length + r.length < 100 },
			);
			const instance = new DiffPatcher({ matchBy: { "/items": combined } } as any);
			expect(instance.diff({ items: [{ id: "a", v: 1 }] }, { items: [{ id: "a", v: 2 }] })).toEqual({
				items: { _t: "a", 0: { v: [1, 2] } },
			});
		});
	});

	describe("withStrategy builder", () => {
		it("adds a strategy to the instance", () => {
			const instance = (new DiffPatcher() as any).withStrategy(
				"/items",
				(item: object) => (item as { id: string }).id,
			);
			expect(instance.diff({ items: [{ id: "a", v: 1 }] }, { items: [{ id: "a", v: 2 }] })).toEqual({
				items: { _t: "a", 0: { v: [1, 2] } },
			});
		});

		it("withStrategy is chainable", () => {
			const instance = (new DiffPatcher() as any)
				.withStrategy("/a", (item: object) => (item as { id: string }).id)
				.withStrategy("/b", (item: object) => (item as { key: string }).key);
			expect(instance.resolveStrategy("/a", [], [])).toBeDefined();
			expect(instance.resolveStrategy("/b", [], [])).toBeDefined();
		});
	});

	describe("JSON Patch format with strategies", () => {
		it("shouldDiff false produces replace op", () => {
			const instance = new DiffPatcher({ matchBy: { "/data": { shouldDiff: () => false } } } as any);
			const delta = instance.diff({ data: [1, 2] }, { data: [3, 4] }) as jsondiffpatch.Delta;
			expect(jsonpatchFormatter.format(delta)).toEqual([{ op: "replace", path: "/data", value: [3, 4] }]);
		});

		it("strategy-matched moves produce valid JSONPatch", () => {
			const instance = new DiffPatcher({
				matchBy: { "/items": (item: object) => (item as { id: string }).id },
			} as any);
			const left = { items: [{ id: "a" }, { id: "b" }] };
			const right = { items: [{ id: "b" }, { id: "a" }] };
			const delta = instance.diff(left, right) as jsondiffpatch.Delta;
			const ops = jsonpatchFormatter.format(delta);
			expect(ops).toEqual([{ op: "move", from: "/items/1", path: "/items/0" }]);
			const patched = jsondiffpatch.clone(left);
			jsonpatchFormatter.patch(patched, ops);
			expect(patched).toEqual(right);
		});
	});
});
