import { describe, expect, it } from "vitest";
import { diff_match_patch } from "@dmsnell/diff-match-patch";
import * as jsondiffpatch from "../src/index.js";

describe("compose", () => {
	describe("identity behavior", () => {
		it("should return delta2 when delta1 is undefined", () => {
			const instance = jsondiffpatch.create();
			const delta = instance.diff({ a: 1 }, { a: 2 });

			expect(instance.compose(undefined, delta)).toEqual(delta);
			expect(jsondiffpatch.compose(undefined, delta)).toEqual(delta);
		});

		it("should return delta1 when delta2 is undefined", () => {
			const instance = jsondiffpatch.create();
			const delta = instance.diff({ a: 1 }, { a: 2 });

			expect(instance.compose(delta, undefined)).toEqual(delta);
		});

		it("should return undefined when both deltas are undefined", () => {
			const instance = jsondiffpatch.create();
			expect(instance.compose(undefined, undefined)).toBeUndefined();
		});
	});

	describe("core behavior", () => {
		it("should produce same result as sequential patching", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1, b: 2, c: { d: 3 } };
			const obj2 = { a: 5, b: 2, c: { d: 3, e: 4 } };
			const obj3 = { a: 5, b: 7, c: { d: 3, e: 4 } };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const sequentialResult = instance.patch(
				instance.patch(obj1, delta1),
				delta2,
			);
			const composedResult = instance.patch(obj1, composed);

			expect(composedResult).toEqual(sequentialResult);
			expect(composedResult).toEqual(obj3);
		});

		it("should return undefined when changes cancel out", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1 };
			const obj2 = { a: 1, b: 5 };
			const obj3 = { a: 1 };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			expect(composed).toBeUndefined();
		});

		it("should handle nested object changes", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: { b: { c: 1, d: 2 } } };
			const obj2 = { a: { b: { c: 2, d: 2 } } };
			const obj3 = { a: { b: { c: 3, d: 2 } } };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(obj1, composed);
			expect(result).toEqual(obj3);
		});

		it("should handle array modifications", () => {
			const instance = jsondiffpatch.create();
			const arr1 = [1, 2, 3];
			const arr2 = [1, 5, 3, 4];
			const arr3 = [1, 5, 7, 4];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(arr1, composed);
			expect(result).toEqual(arr3);
		});

		it("should handle array moves with subsequent operations", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [
				{ id: 1, v: "a" },
				{ id: 2, v: "b" },
				{ id: 3, v: "c" },
			];
			const arr2 = [
				{ id: 1, v: "a" },
				{ id: 3, v: "c" },
				{ id: 2, v: "b" },
			];
			const arr3 = [
				{ id: 1, v: "a" },
				{ id: 3, v: "modified" },
				{ id: 2, v: "b" },
			];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(arr1, composed);
			expect(result).toEqual(arr3);
		});

		it("should handle multiple sequential property changes", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1, b: 2, c: 3 };
			const obj2 = { a: 5, b: 2, c: 3, d: 4 };
			const obj3 = { a: 5, b: 7, d: 4 };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(obj1, composed);
			expect(result).toEqual(obj3);
		});

		it("should handle array deletions that shift subsequent indices", () => {
			const instance = jsondiffpatch.create();

			const arr1 = [1, 2, 3, 4];
			const arr2 = [1, 3, 4];
			const arr3 = [1, 3, 4, 5];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(arr1, composed);
			expect(result).toEqual(arr3);

			const sequential = instance.patch(instance.patch(arr1, delta1), delta2);
			expect(result).toEqual(sequential);
		});

		it("should compose primitive value changes", () => {
			const instance = jsondiffpatch.create();

			const delta1 = instance.diff(1, 2);
			const delta2 = instance.diff(2, 3);
			const composed = instance.compose(delta1, delta2);

			expect(instance.patch(1, composed)).toEqual(3);
		});
	});

	describe("text diffs", () => {
		it("should compose sequential text diff transformations", () => {
			const instance = jsondiffpatch.create({
				textDiff: { diffMatchPatch: diff_match_patch, minLength: 1 },
			});

			const obj1 = { text: "hello world" };
			const obj2 = { text: "hello there world" };
			const obj3 = { text: "hello there everyone" };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj3);

			const sequential = instance.patch(
				instance.patch(instance.clone(obj1), delta1),
				delta2,
			);
			expect(result).toEqual(sequential);
		});

		it("should handle text diff followed by modification", () => {
			const instance = jsondiffpatch.create({
				textDiff: { diffMatchPatch: diff_match_patch, minLength: 1 },
			});

			const obj1 = { text: "hello world" };
			const obj2 = { text: "hello there world" };
			const obj3 = { text: "completely different" };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj3);
		});

		it("should return undefined when text modifications cancel out", () => {
			const instance = jsondiffpatch.create({
				textDiff: { diffMatchPatch: diff_match_patch, minLength: 1 },
			});

			const obj1 = { text: "hello world" };
			const obj2 = { text: "hello there world" };
			const obj3 = { text: "hello world" };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			expect(composed).toBeUndefined();

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj1);
		});
	});

	describe("error handling", () => {
		it("should throw error for incompatible sequential deltas", () => {
			const instance = jsondiffpatch.create();
			const delta1 = { a: [1, 5] };
			const delta2 = { a: [7, 9] };

			expect(() => {
				instance.compose(delta1, delta2);
			}).toThrow(
				/Cannot compose deltas: incompatible transformations at path \[a\]/,
			);
		});

		it("should include path information in error messages for nested incompatibilities", () => {
			const instance = jsondiffpatch.create();
			const delta1 = { a: { b: { c: [1, 5] } } };
			const delta2 = { a: { b: { c: [7, 9] } } };

			expect(() => {
				instance.compose(delta1, delta2);
			}).toThrow(
				/Cannot compose deltas: incompatible transformations at path \[a, b, c\]/,
			);
		});
	});

	describe("operational transformation properties", () => {
		it("should be associative: patch results are identical regardless of composition order", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1, b: 2 };
			const obj2 = { a: 2, b: 2 };
			const obj3 = { a: 2, b: 3 };
			const obj4 = { a: 2, b: 3, c: 4 };

			const d1 = instance.diff(obj1, obj2);
			const d2 = instance.diff(obj2, obj3);
			const d3 = instance.diff(obj3, obj4);

			const composed1 = instance.compose(instance.compose(d1, d2), d3);
			const composed2 = instance.compose(d1, instance.compose(d2, d3));

			expect(instance.patch(instance.clone(obj1), composed1)).toEqual(
				instance.patch(instance.clone(obj1), composed2),
			);
			expect(instance.patch(instance.clone(obj1), composed1)).toEqual(obj4);
		});

		it("should satisfy reversibility: unpatch(obj, compose(d1, d2)) equals unpatch(unpatch(obj, d2), d1)", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1, b: 2, c: { d: 3 } };
			const obj2 = { a: 5, b: 2, c: { d: 4 } };
			const obj3 = { a: 5, b: 7, c: { d: 4, e: 5 } };

			const d1 = instance.diff(obj1, obj2);
			const d2 = instance.diff(obj2, obj3);
			const composed = instance.compose(d1, d2);

			const unpatched1 = instance.unpatch(instance.clone(obj3), composed);
			const unpatched2 = instance.unpatch(
				instance.unpatch(instance.clone(obj3), d2),
				d1,
			);

			expect(unpatched1).toEqual(unpatched2);
			expect(unpatched1).toEqual(obj1);
		});

		it("should be equivalent to direct diff for composition chains", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { x: 1, y: 2 };
			const obj2 = { x: 5, y: 2 };
			const obj3 = { x: 5, y: 7 };
			const obj4 = { x: 5, y: 7, z: 10 };

			const d1 = instance.diff(obj1, obj2);
			const d2 = instance.diff(obj2, obj3);
			const d3 = instance.diff(obj3, obj4);

			const composed = instance.compose(instance.compose(d1, d2), d3);
			const direct = instance.diff(obj1, obj4);

			expect(instance.patch(obj1, composed)).toEqual(
				instance.patch(obj1, direct),
			);
		});
	});

	describe("edge cases", () => {
		it("should handle empty first delta", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1 };
			const obj2 = { a: 1 };
			const obj3 = { a: 2 };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			expect(composed).toEqual(delta2);
		});

		it("should handle empty second delta", () => {
			const instance = jsondiffpatch.create();
			const obj1 = { a: 1 };
			const obj2 = { a: 2 };
			const obj3 = { a: 2 };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			expect(composed).toEqual(delta1);
		});
	});

	describe("complex array move chains", () => {
		it("should compose move chain A→B, B→C to A→C", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [
				{ id: 1, v: "a" },
				{ id: 2, v: "b" },
				{ id: 3, v: "c" },
				{ id: 4, v: "d" },
			];
			const arr2 = [
				{ id: 1, v: "a" },
				{ id: 3, v: "c" },
				{ id: 2, v: "b" },
				{ id: 4, v: "d" },
			];
			const arr3 = [
				{ id: 1, v: "a" },
				{ id: 3, v: "c" },
				{ id: 4, v: "d" },
				{ id: 2, v: "b" },
			];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);

			const sequential = instance.patch(
				instance.patch(instance.clone(arr1), delta1),
				delta2,
			);
			expect(result).toEqual(sequential);
		});

		it("should compose triple move chain A→B→C→D", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
			const arr2 = [{ id: 2 }, { id: 1 }, { id: 3 }, { id: 4 }, { id: 5 }];
			const arr3 = [{ id: 2 }, { id: 3 }, { id: 1 }, { id: 4 }, { id: 5 }];
			const arr4 = [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 1 }, { id: 5 }];

			const d1 = instance.diff(arr1, arr2);
			const d2 = instance.diff(arr2, arr3);
			const d3 = instance.diff(arr3, arr4);

			const composed = instance.compose(instance.compose(d1, d2), d3);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr4);

			const sequential = instance.patch(
				instance.patch(instance.patch(instance.clone(arr1), d1), d2),
				d3,
			);
			expect(result).toEqual(sequential);
		});

		it("should compose moves with value modifications", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [
				{ id: 1, x: 10 },
				{ id: 2, x: 20 },
				{ id: 3, x: 30 },
			];
			const arr2 = [
				{ id: 2, x: 20 },
				{ id: 1, x: 10 },
				{ id: 3, x: 30 },
			];
			const arr3 = [
				{ id: 2, x: 25 },
				{ id: 1, x: 15 },
				{ id: 3, x: 35 },
			];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);
		});
	});

	describe("moves and deletions interaction", () => {
		it("should handle move followed by deletion of moved item", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
			const arr2 = [{ id: 2 }, { id: 1 }, { id: 3 }];
			const arr3 = [{ id: 2 }, { id: 3 }];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);
		});

		it("should handle deletion followed by move of remaining items", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
			const arr2 = [{ id: 1 }, { id: 3 }, { id: 4 }];
			const arr3 = [{ id: 4 }, { id: 1 }, { id: 3 }];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);

			const sequential = instance.patch(
				instance.patch(instance.clone(arr1), delta1),
				delta2,
			);
			expect(result).toEqual(sequential);
		});

		it("should handle multiple deletions with moves", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
			const arr2 = [{ id: 1 }, { id: 3 }, { id: 5 }];
			const arr3 = [{ id: 5 }, { id: 3 }, { id: 1 }];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);
		});

		it("should handle addition followed by deletion (cancellation)", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [{ id: 1 }, { id: 2 }];
			const arr2 = [{ id: 1 }, { id: 3 }, { id: 2 }];
			const arr3 = [{ id: 1 }, { id: 2 }];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			expect(composed).toBeUndefined();
			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);
		});

		it("should handle move then add at vacated position", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
			const arr2 = [{ id: 2 }, { id: 1 }, { id: 3 }];
			const arr3 = [{ id: 2 }, { id: 4 }, { id: 1 }, { id: 3 }];

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);
		});
	});

	describe("stress tests with deeply nested structures", () => {
		it("should handle 5 levels of nesting", () => {
			const instance = jsondiffpatch.create();
			const obj1 = {
				l1: {
					l2: {
						l3: {
							l4: {
								l5: { value: 1, other: "a" },
							},
						},
					},
				},
			};
			const obj2 = {
				l1: {
					l2: {
						l3: {
							l4: {
								l5: { value: 2, other: "a" },
							},
						},
					},
				},
			};
			const obj3 = {
				l1: {
					l2: {
						l3: {
							l4: {
								l5: { value: 3, other: "b" },
							},
						},
					},
				},
			};

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj3);
		});

		it("should handle nested arrays within nested objects", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const obj1 = {
				users: {
					active: {
						list: [
							{ id: 1, name: "Alice", scores: [10, 20] },
							{ id: 2, name: "Bob", scores: [30, 40] },
						],
					},
				},
			};
			const obj2 = {
				users: {
					active: {
						list: [
							{ id: 2, name: "Bob", scores: [30, 40] },
							{ id: 1, name: "Alice", scores: [15, 25] },
						],
					},
				},
			};
			const obj3 = {
				users: {
					active: {
						list: [
							{ id: 2, name: "Robert", scores: [35, 45] },
							{ id: 1, name: "Alice", scores: [15, 25] },
						],
					},
				},
			};

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj3);
		});

		it("should handle large object with many properties", () => {
			const instance = jsondiffpatch.create();

			const obj1: Record<string, number> = {};
			const obj2: Record<string, number> = {};
			const obj3: Record<string, number> = {};

			for (let i = 0; i < 100; i++) {
				obj1[`prop${i}`] = i;
				obj2[`prop${i}`] = i + 1;
				obj3[`prop${i}`] = i + 2;
			}

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj3);
		});

		it("should handle array with many nested objects", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const createItem = (id: number, v: number) => ({
				id,
				data: { value: v, nested: { deep: v * 2 } },
			});

			const arr1 = Array.from({ length: 20 }, (_, i) => createItem(i, i * 10));
			const arr2 = [...arr1].reverse().map((item) => ({
				...item,
				data: { ...item.data, value: item.data.value + 5 },
			}));
			const arr3 = arr2.map((item) => ({
				...item,
				data: { ...item.data, nested: { deep: item.data.nested.deep + 100 } },
			}));

			const delta1 = instance.diff(arr1, arr2);
			const delta2 = instance.diff(arr2, arr3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(arr1), composed);
			expect(result).toEqual(arr3);
		});

		it("should handle recursive composition of many deltas", () => {
			const instance = jsondiffpatch.create();

			const objects: Record<string, number>[] = [];
			for (let i = 0; i <= 10; i++) {
				objects.push({ value: i, constant: 100 });
			}

			const deltas = [];
			for (let i = 0; i < objects.length - 1; i++) {
				deltas.push(instance.diff(objects[i], objects[i + 1]));
			}

			let composed = deltas[0];
			for (let i = 1; i < deltas.length; i++) {
				composed = instance.compose(composed, deltas[i]);
			}

			const result = instance.patch(instance.clone(objects[0]), composed);
			expect(result).toEqual(objects[objects.length - 1]);
		});

		it("should handle deeply nested changes that cancel out", () => {
			const instance = jsondiffpatch.create();

			const obj1 = {
				a: { b: { c: { d: { e: { f: 1 } } } } },
			};
			const obj2 = {
				a: { b: { c: { d: { e: { f: 999 } } } } },
			};
			const obj3 = {
				a: { b: { c: { d: { e: { f: 1 } } } } },
			};

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			expect(composed).toBeUndefined();
		});

		it("should handle mixed operations at multiple nesting levels", () => {
			const instance = jsondiffpatch.create({
				objectHash: (obj: { id?: number }) => obj?.id?.toString(),
			});

			const obj1 = {
				level1: {
					items: [
						{ id: 1, val: "a" },
						{ id: 2, val: "b" },
					],
					config: { enabled: true, count: 5 },
				},
				metadata: { version: 1 },
			};
			const obj2 = {
				level1: {
					items: [
						{ id: 2, val: "b" },
						{ id: 1, val: "a" },
						{ id: 3, val: "c" },
					],
					config: { enabled: false, count: 10 },
				},
				metadata: { version: 2, author: "test" },
			};
			const obj3 = {
				level1: {
					items: [
						{ id: 2, val: "bb" },
						{ id: 3, val: "cc" },
					],
					config: { enabled: true, count: 15, extra: "new" },
				},
				metadata: { version: 3, author: "test", reviewed: true },
			};

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			const result = instance.patch(instance.clone(obj1), composed);
			expect(result).toEqual(obj3);

			const sequential = instance.patch(
				instance.patch(instance.clone(obj1), delta1),
				delta2,
			);
			expect(result).toEqual(sequential);
		});
	});

	describe("incompatible text deltas", () => {
		it("should throw for text diffs built from wrong intermediate", () => {
			const instance = jsondiffpatch.create({
				textDiff: { diffMatchPatch: diff_match_patch, minLength: 1 },
			});

			const delta1 = instance.diff(
				{ t: "hello world" },
				{ t: "hello there world" },
			);
			const delta2 = instance.diff(
				{ t: "completely different text" },
				{ t: "completely different modified text" },
			);

			expect(() => instance.compose(delta1, delta2)).toThrow(
				/Cannot compose deltas: incompatible transformations at path \[t\]/,
			);
		});
	});

	describe("omitRemovedValues", () => {
		it("should handle add then delete with compact deltas", () => {
			const instance = jsondiffpatch.create({ omitRemovedValues: true });
			const delta1 = instance.diff({ a: 1 }, { a: 1, b: 5 });
			const delta2 = instance.diff({ a: 1, b: 5 }, { a: 1 });

			expect(delta2).toEqual({ b: [0, 0, 0] });
			expect(instance.compose(delta1, delta2)).toBeUndefined();
		});

		it("should compose compact modified then compact deleted", () => {
			const instance = jsondiffpatch.create({ omitRemovedValues: true });
			const delta1 = instance.diff({ a: 1 }, { a: 2 });
			const delta2 = instance.diff({ a: 2 }, {});

			expect(delta1).toEqual({ a: [0, 2] });
			expect(delta2).toEqual({ a: [0, 0, 0] });

			const composed = instance.compose(delta1, delta2);
			expect(composed).toEqual({ a: [0, 0, 0] });
			expect(instance.patch({ a: 1 }, composed)).toEqual({});
		});

		it("should compose compact deleted then added with different value", () => {
			const instance = jsondiffpatch.create({ omitRemovedValues: true });
			const delta1 = instance.diff({ a: 1 }, {});
			const delta2 = instance.diff({}, { a: 2 });

			expect(delta1).toEqual({ a: [0, 0, 0] });
			expect(delta2).toEqual({ a: [2] });

			const composed = instance.compose(delta1, delta2);
			expect(composed).toEqual({ a: [0, 2] });
			expect(instance.patch({ a: 1 }, composed)).toEqual({ a: 2 });
		});

		it("should not cancel [0, 1] then [1, 0] when 0 is sentinel", () => {
			const instance = jsondiffpatch.create({ omitRemovedValues: true });
			const delta1 = instance.diff({ a: "x" }, { a: 1 });
			const delta2 = instance.diff({ a: 1 }, { a: 0 });

			expect(delta1).toEqual({ a: [0, 1] });
			expect(delta2).toEqual({ a: [0, 0] });

			const composed = instance.compose(delta1, delta2);
			expect(composed).toEqual({ a: [0, 0] });
			expect(instance.patch({ a: "x" }, composed)).toEqual({ a: 0 });
		});

		it("should produce correct sequential patching equivalence", () => {
			const instance = jsondiffpatch.create({ omitRemovedValues: true });
			const obj1 = { a: 1, b: 2 };
			const obj2 = { a: 5, b: 2, c: 3 };
			const obj3 = { a: 5, d: 4 };

			const delta1 = instance.diff(obj1, obj2);
			const delta2 = instance.diff(obj2, obj3);
			const composed = instance.compose(delta1, delta2);

			expect(instance.patch(instance.clone(obj1), composed)).toEqual(obj3);
		});
	});
});
