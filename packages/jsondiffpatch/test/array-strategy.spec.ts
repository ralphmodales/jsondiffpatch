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
				matchBy: {
					"/items": (item: object) => (item as { id: string }).id,
				},
			} as any);
			const left = { items: [{ id: "a", val: 1 }, { id: "b", val: 2 }] };
			const right = { items: [{ id: "b", val: 2 }, { id: "a", val: 10 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: {
					_t: "a",
					1: { val: [1, 10] },
					_1: ["", 0, 3],
				},
			});
			const patched = instance.patch(jsondiffpatch.clone(left), delta as jsondiffpatch.Delta);
			expect(patched).toEqual(right);
		});

		it("full strategy object with hash", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/items": {
						hash: (item: object) => (item as { name: string }).name,
					},
				},
			} as any);
			const left = { items: [{ name: "x", v: 1 }, { name: "y", v: 2 }] };
			const right = { items: [{ name: "y", v: 2 }, { name: "x", v: 5 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: {
					_t: "a",
					1: { v: [1, 5] },
					_1: ["", 0, 3],
				},
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
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				users: {
					_t: "a",
					1: { name: ["Alice", "Alicia"] },
					_1: ["", 0, 3],
				},
				tags: {
					_t: "a",
					1: { color: ["red", "green"] },
					_1: ["", 0, 3],
				},
			});
		});
	});

	describe("matchBy with resolver function", () => {
		it("function-based resolver", () => {
			const instance = new DiffPatcher({
				matchBy: (path: string) => {
					if (path === "/items") {
						return { hash: (item: object) => (item as { id: string }).id };
					}
					return undefined;
				},
			} as any);
			const left = { items: [{ id: "a", v: 1 }], other: [{ id: "a", v: 1 }] };
			const right = { items: [{ id: "a", v: 2 }], other: [{ id: "a", v: 2 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: { _t: "a", 0: { v: [1, 2] } },
				other: { _t: "a", 0: { v: [1, 2] } },
			});
		});

		it("resolver returning undefined falls back to objectHash", () => {
			const instance = new DiffPatcher({
				objectHash: (item: object) => (item as { id: string }).id,
				matchBy: (path: string) => {
					if (path === "/primary") {
						return { hash: (item: object) => (item as { key: string }).key };
					}
					return undefined;
				},
			} as any);
			const left = {
				primary: [{ key: "k1", v: 1 }],
				secondary: [{ id: "s1", v: 1 }],
			};
			const right = {
				primary: [{ key: "k1", v: 2 }],
				secondary: [{ id: "s1", v: 2 }],
			};
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				primary: { _t: "a", 0: { v: [1, 2] } },
				secondary: { _t: "a", 0: { v: [1, 2] } },
			});
		});
	});

	describe("shouldDiff hook", () => {
		it("shouldDiff false produces atomic modify delta", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/arr": { shouldDiff: () => false },
				},
			} as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [4, 5, 6] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({ arr: [[1, 2, 3], [4, 5, 6]] });
		});

		it("shouldDiff false can be patched", () => {
			const instance = new DiffPatcher({
				matchBy: { "/arr": { shouldDiff: () => false } },
			} as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [4, 5, 6] };
			const delta = instance.diff(left, right);
			const patched = instance.patch(jsondiffpatch.clone(left), delta as jsondiffpatch.Delta);
			expect(patched).toEqual(right);
		});

		it("shouldDiff false can be unpatched", () => {
			const instance = new DiffPatcher({
				matchBy: { "/arr": { shouldDiff: () => false } },
			} as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [4, 5, 6] };
			const delta = instance.diff(left, right);
			const unpatched = instance.unpatch(jsondiffpatch.clone(right), delta as jsondiffpatch.Delta);
			expect(unpatched).toEqual(left);
		});

		it("shouldDiff false can be reversed", () => {
			const instance = new DiffPatcher({
				matchBy: { "/arr": { shouldDiff: () => false } },
			} as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [4, 5, 6] };
			const delta = instance.diff(left, right);
			const reversed = instance.reverse(delta as jsondiffpatch.Delta);
			expect(reversed).toEqual({ arr: [[4, 5, 6], [1, 2, 3]] });
		});

		it("shouldDiff true behaves normally", () => {
			const instance = new DiffPatcher({
				matchBy: { "/arr": { shouldDiff: () => true } },
			} as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [1, 2, 3, 4] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({ arr: { _t: "a", 3: [4] } });
		});

		it("shouldDiff on identical arrays produces no delta", () => {
			const instance = new DiffPatcher({
				matchBy: { "/arr": { shouldDiff: () => false } },
			} as any);
			const left = { arr: [1, 2, 3] };
			const right = { arr: [1, 2, 3] };
			const delta = instance.diff(left, right);
			expect(delta).toBeUndefined();
		});
	});

	describe("weight hook", () => {
		it("weight zero rejects hash match", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/items": {
						hash: (item: object) => (item as { type: string }).type,
						weight: () => 0,
					},
				},
			} as any);
			const left = { items: [{ type: "a", v: 1 }] };
			const right = { items: [{ type: "a", v: 2 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: { _t: "a", _0: [{ type: "a", v: 1 }, 0, 0], 0: [{ type: "a", v: 2 }] },
			});
		});

		it("weight positive confirms hash match", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/items": {
						hash: (item: object) => (item as { id: string }).id,
						weight: () => 1,
					},
				},
			} as any);
			const left = { items: [{ id: "a", v: 1 }] };
			const right = { items: [{ id: "a", v: 2 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: { _t: "a", 0: { v: [1, 2] } },
			});
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
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: {
					_t: "a",
					0: { v: [2, 3] },
					_0: ["", 1, 3],
				},
			});
		});
	});

	describe("resolveStrategy method", () => {
		it("returns strategy from map", () => {
			const hashFn = (item: object) => (item as { id: string }).id;
			const instance = new DiffPatcher({
				matchBy: { "/items": { hash: hashFn } },
			} as any) as any;
			const strategy = instance.resolveStrategy("/items", [], []);
			expect(strategy).toBeDefined();
			expect(strategy.hash).toBe(hashFn);
		});

		it("returns undefined for unmatched path", () => {
			const instance = new DiffPatcher({
				matchBy: { "/items": (item: object) => (item as { id: string }).id },
			} as any) as any;
			const strategy = instance.resolveStrategy("/other", [], []);
			expect(strategy).toBeUndefined();
		});

		it("normalizes bare hash to strategy", () => {
			const hashFn = (item: object) => (item as { id: string }).id;
			const instance = new DiffPatcher({
				matchBy: { "/items": hashFn },
			} as any) as any;
			const strategy = instance.resolveStrategy("/items", [], []);
			expect(strategy).toBeDefined();
			expect(strategy.hash).toBe(hashFn);
		});

		it("returns undefined with no matchBy", () => {
			const instance = new DiffPatcher() as any;
			const strategy = instance.resolveStrategy("/any", [], []);
			expect(strategy).toBeUndefined();
		});
	});

	describe("fallback chain", () => {
		it("matchBy takes precedence over objectHash", () => {
			const matchByHash = (item: object) => (item as { key: string }).key;
			const objectHashFn = (item: object) => (item as { id: string }).id;
			const instance = new DiffPatcher({
				objectHash: objectHashFn,
				matchBy: { "/items": matchByHash },
			} as any);
			const left = { items: [{ key: "k1", id: "OLD", v: 1 }] };
			const right = { items: [{ key: "k1", id: "NEW", v: 2 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				items: { _t: "a", 0: { id: ["OLD", "NEW"], v: [1, 2] } },
			});
		});

		it("objectHash used when matchBy has no match", () => {
			const instance = new DiffPatcher({
				objectHash: (item: object) => (item as { id: string }).id,
				matchBy: { "/primary": (item: object) => (item as { key: string }).key },
			} as any);
			const left = { secondary: [{ id: "s1", v: 1 }] };
			const right = { secondary: [{ id: "s1", v: 2 }] };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				secondary: { _t: "a", 0: { v: [1, 2] } },
			});
		});
	});

	describe("path tracking", () => {
		it("deeply nested path resolves correctly", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"/a/b/items": {
						hash: (item: object) => (item as { id: string }).id,
					},
				},
			} as any);
			const left = { a: { b: { items: [{ id: "x", v: 1 }] } } };
			const right = { a: { b: { items: [{ id: "x", v: 2 }] } } };
			const delta = instance.diff(left, right);
			expect(delta).toEqual({
				a: { b: { items: { _t: "a", 0: { v: [1, 2] } } } },
			});
		});

		it("root-level array path is empty string", () => {
			const instance = new DiffPatcher({
				matchBy: {
					"": { hash: (item: object) => (item as { id: string }).id },
				},
			} as any);
			const left = [{ id: "a", v: 1 }];
			const right = [{ id: "a", v: 2 }];
			const delta = instance.diff(left, right);
			expect(delta).toEqual({ _t: "a", 0: { v: [1, 2] } });
		});
	});

	describe("backward compatibility", () => {
		it("objectHash without matchBy still works", () => {
			const instance = new DiffPatcher({
				objectHash: (obj: object) =>
					(obj as { id: string | number }).id?.toString(),
			});
			const left = [{ id: 4, width: 10 }, { id: "five", width: 4 }];
			const right = [{ id: 4, width: 12 }, { id: "five", width: 4 }];
			const delta = instance.diff(left, right);
			expect(delta).toEqual({ _t: "a", 0: { width: [10, 12] } });
		});

		it("no options produces same behavior", () => {
			const instance = new DiffPatcher();
			const left = [1, 2, 3];
			const right = [1, 2, 4];
			const delta = instance.diff(left, right);
			expect(delta).toEqual({ _t: "a", _2: [3, 0, 0], 2: [4] });
		});
	});

	describe("JSON Patch format with strategies", () => {
		it("shouldDiff false produces replace op", () => {
			const instance = new DiffPatcher({
				matchBy: { "/data": { shouldDiff: () => false } },
			} as any);
			const left = { data: [1, 2] };
			const right = { data: [3, 4] };
			const delta = instance.diff(left, right) as jsondiffpatch.Delta;
			const ops = jsonpatchFormatter.format(delta);
			expect(ops).toEqual([{ op: "replace", path: "/data", value: [3, 4] }]);
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
