import clone from "./clone.js";
import DiffContext from "./contexts/diff.js";
import PatchContext from "./contexts/patch.js";
import ReverseContext from "./contexts/reverse.js";
import Pipe from "./pipe.js";
import Processor from "./processor.js";

import * as arrays from "./filters/arrays.js";
import * as dates from "./filters/dates.js";
import * as nested from "./filters/nested.js";
import * as texts from "./filters/texts.js";
import * as trivial from "./filters/trivial.js";
import {
	type Delta,
	type Options,
	type TextDiffDelta,
	type MovedDelta,
	type DeletedDelta,
	type ArrayDelta,
	DELTA_TYPE_TEXTDIFF,
	DELTA_TYPE_MOVED,
	DELTA_DELETED_MARKER,
	isAddedDelta,
	isModifiedDelta,
	isDeletedDelta,
	isTextDiffDelta,
	isMovedDelta,
	isArrayDelta,
} from "./types.js";

class DiffPatcher {
	processor: Processor;

	constructor(options?: Options) {
		this.processor = new Processor(options);
		this.processor.pipe(
			new Pipe<DiffContext>("diff")
				.append(
					nested.collectChildrenDiffFilter,
					trivial.diffFilter,
					dates.diffFilter,
					texts.diffFilter,
					nested.objectsDiffFilter,
					arrays.diffFilter,
				)
				.shouldHaveResult(),
		);
		this.processor.pipe(
			new Pipe<PatchContext>("patch")
				.append(
					nested.collectChildrenPatchFilter,
					arrays.collectChildrenPatchFilter,
					trivial.patchFilter,
					texts.patchFilter,
					nested.patchFilter,
					arrays.patchFilter,
				)
				.shouldHaveResult(),
		);
		this.processor.pipe(
			new Pipe<ReverseContext>("reverse")
				.append(
					nested.collectChildrenReverseFilter,
					arrays.collectChildrenReverseFilter,
					trivial.reverseFilter,
					texts.reverseFilter,
					nested.reverseFilter,
					arrays.reverseFilter,
				)
				.shouldHaveResult(),
		);
	}

	options(options: Options) {
		return this.processor.options(options);
	}

	diff(left: unknown, right: unknown) {
		return this.processor.process(new DiffContext(left, right));
	}

	patch(left: unknown, delta: Delta) {
		return this.processor.process(new PatchContext(left, delta));
	}

	reverse(delta: Delta) {
		return this.processor.process(new ReverseContext(delta));
	}

	unpatch(right: unknown, delta: Delta) {
		return this.patch(right, this.reverse(delta));
	}

	clone(value: unknown) {
		return clone(value);
	}

	compose(delta1?: Delta, delta2?: Delta): Delta | undefined {
		if (delta1 === undefined) return delta2;
		if (delta2 === undefined) return delta1;
		return this.composeDelta(delta1, delta2, []);
	}

	private composeDelta(delta1: Delta, delta2: Delta, path: string[]): Delta {
		if (Array.isArray(delta1) && Array.isArray(delta2)) {
			return this.composeLeafDelta(delta1, delta2, path);
		}

		if (
			Array.isArray(delta1) &&
			isAddedDelta(delta1 as Delta) &&
			typeof delta2 === 'object' &&
			delta2 !== null &&
			!Array.isArray(delta2)
		) {
			const patched = this.patch(delta1[0], delta2 as Delta);
			return [patched];
		}

		const d1IsObj =
			typeof delta1 === 'object' &&
			delta1 !== null &&
			!Array.isArray(delta1);
		const d2IsObj =
			typeof delta2 === 'object' &&
			delta2 !== null &&
			!Array.isArray(delta2);

		if (d1IsObj && d2IsObj) {
			const isArr1 = isArrayDelta(delta1 as Delta);
			const isArr2 = isArrayDelta(delta2 as Delta);
			if (isArr1 && isArr2) {
				return this.composeArrayDeltas(
					delta1 as ArrayDelta,
					delta2 as ArrayDelta,
					path,
				);
			}
			if (!isArr1 && !isArr2) {
				return this.composeObjectDelta(
					delta1 as Record<string, Delta>,
					delta2 as Record<string, Delta>,
					path,
				);
			}
		}

		if (d1IsObj && !isArrayDelta(delta1 as Delta) && Array.isArray(delta2)) {
			const d2Arr = delta2 as unknown[];
			if (isModifiedDelta(d2Arr as Delta)) {
				const original = this.unpatch(d2Arr[0], delta1 as Delta);
				if (this.deepEqual(original, d2Arr[1])) return undefined;
				return [original, d2Arr[1]];
			}
			if (isDeletedDelta(d2Arr as Delta)) {
				const original = this.unpatch(d2Arr[0], delta1 as Delta);
				return [
					original,
					DELTA_DELETED_MARKER,
					DELTA_DELETED_MARKER,
				] as DeletedDelta;
			}
		}

		if (Array.isArray(delta1) && isModifiedDelta(delta1 as Delta) && d2IsObj) {
			const d1Arr = delta1 as unknown[];
			const result = this.patch(this.clone(d1Arr[1]), delta2 as Delta);
			if (this.deepEqual(d1Arr[0], result)) return undefined;
			return [d1Arr[0], result];
		}

		this.throwIncompatible(path);
	}

	private throwIncompatible(path: string[]): never {
		throw new Error(
			`Cannot compose deltas: incompatible transformations at path [${path.join(', ')}]`,
		);
	}

	private composeLeafDelta(
		delta1: unknown[],
		delta2: unknown[],
		path: string[],
	): Delta {
		const d1 = delta1 as Delta;
		const d2 = delta2 as Delta;

		if (isAddedDelta(d1)) {
			if (isModifiedDelta(d2)) return [d2[1]];
			if (isDeletedDelta(d2)) return undefined;
			if (isTextDiffDelta(d2)) {
				const patched = this.applyTextPatch(String(d1[0]), d2[0], path);
				return [patched];
			}
			this.throwIncompatible(path);
		}

		if (isModifiedDelta(d1)) {
			if (isModifiedDelta(d2)) {
				const compact = this.isCompactMode();
				const d1IsCompact = compact && d1[0] === DELTA_DELETED_MARKER;
				const d2IsCompact = compact && d2[0] === DELTA_DELETED_MARKER;
				if (!d2IsCompact && !this.deepEqual(d1[1], d2[0])) {
					this.throwIncompatible(path);
				}
				if (d1IsCompact) {
					return [DELTA_DELETED_MARKER, d2[1]];
				}
				if (this.deepEqual(d1[0], d2[1])) return undefined;
				return [d1[0], d2[1]];
			}
			if (isDeletedDelta(d2)) {
				return [d1[0], DELTA_DELETED_MARKER, DELTA_DELETED_MARKER] as DeletedDelta;
			}
			if (isTextDiffDelta(d2)) {
				const finalText = this.applyTextPatch(String(d1[1]), d2[0], path);
				if (this.deepEqual(d1[0], finalText)) return undefined;
				return [d1[0], finalText];
			}
			this.throwIncompatible(path);
		}

		if (isDeletedDelta(d1)) {
			if (isAddedDelta(d2)) {
				const d1IsCompact = this.isCompactMode() && d1[0] === DELTA_DELETED_MARKER;
				if (d1IsCompact) {
					return [DELTA_DELETED_MARKER, d2[0]];
				}
				if (this.deepEqual(d1[0], d2[0])) return undefined;
				return [d1[0], d2[0]];
			}
			this.throwIncompatible(path);
		}

		if (isTextDiffDelta(d1)) {
			if (isTextDiffDelta(d2)) {
				return this.composeTextDiffs(d1, d2, path);
			}
			if (isModifiedDelta(d2)) {
				const originalText = this.extractOriginalTextFromPatch(d1[0]);
				if (originalText !== null && this.deepEqual(originalText, d2[1])) {
					return undefined;
				}
				return [originalText ?? d2[0], d2[1]];
			}
			if (isDeletedDelta(d2)) {
				const originalText = this.extractOriginalTextFromPatch(d1[0]);
				return [
					originalText ?? '',
					DELTA_DELETED_MARKER,
					DELTA_DELETED_MARKER,
				] as DeletedDelta;
			}
			this.throwIncompatible(path);
		}

		if (isMovedDelta(d1)) {
			if (isMovedDelta(d2)) {
				return [d1[0], d2[1], DELTA_TYPE_MOVED] as MovedDelta;
			}
			this.throwIncompatible(path);
		}

		this.throwIncompatible(path);
	}

	private applyTextPatch(
		text: string,
		patchString: string,
		path: string[],
	): string {
		const options = this.processor.options();
		if (!options?.textDiff?.diffMatchPatch) {
			throw new Error('diff_match_patch not configured');
		}
		const dmp = new options.textDiff.diffMatchPatch();
		const patches = dmp.patch_fromText(patchString);
		const [result, applied] = dmp.patch_apply(patches, text);
		for (const success of applied) {
			if (!success) {
				this.throwIncompatible(path);
			}
		}
		return result as string;
	}

	private extractOriginalTextFromPatch(patchString: string): string | null {
		const options = this.processor.options();
		if (!options?.textDiff?.diffMatchPatch) return null;
		const dmp = new options.textDiff.diffMatchPatch();
		const patches = dmp.patch_fromText(patchString);
		if (patches.length === 0) return null;
		let text = '';
		let pos = 0;
		for (const patch of patches) {
			const hunkStart = patch.start1 as number;
			if (hunkStart > pos) {
				text += '\x00'.repeat(hunkStart - pos);
			}
			let hunkOrigLen = 0;
			for (const [op, content] of patch.diffs) {
				if (op !== 1) {
					text += content;
					hunkOrigLen += content.length;
				}
			}
			pos = hunkStart + hunkOrigLen;
		}
		return text.length > 0 ? text : null;
	}

	private composeTextDiffs(
		delta1: TextDiffDelta,
		delta2: TextDiffDelta,
		path: string[],
	): Delta {
		const options = this.processor.options();
		if (!options?.textDiff?.diffMatchPatch) this.throwIncompatible(path);
		const dmp = new options.textDiff.diffMatchPatch();
		const patches1 = dmp.patch_fromText(delta1[0]);
		const patches2 = dmp.patch_fromText(delta2[0]);
		if (patches1.length === 0 || patches2.length === 0)
			this.throwIncompatible(path);

		const p1Output = new Map<number, string>();
		for (const p of patches1) {
			let pos = p.start2 as number;
			for (const [op, content] of p.diffs as [number, string][]) {
				if (op !== -1) {
					for (let i = 0; i < content.length; i++)
						p1Output.set(pos + i, content[i]);
					pos += content.length;
				}
			}
		}

		const p2Input = new Map<number, string>();
		let p2Delta = 0;
		for (const p of patches2) {
			const absStart = (p.start1 as number) - p2Delta;
			let pos = absStart;
			for (const [op, content] of p.diffs as [number, string][]) {
				if (op !== 1) {
					for (let i = 0; i < content.length; i++)
						p2Input.set(pos + i, content[i]);
					pos += content.length;
				}
			}
			p2Delta += (p.length2 as number) - (p.length1 as number);
		}

		for (const [pos, ch] of p2Input) {
			if (p1Output.has(pos) && p1Output.get(pos) !== ch)
				this.throwIncompatible(path);
		}

		const merged = new Map(p1Output);
		for (const [pos, ch] of p2Input) {
			if (!merged.has(pos)) merged.set(pos, ch);
		}
		let maxPos = 0;
		for (const k of merged.keys()) if (k > maxPos) maxPos = k;
		let intermediate = '';
		for (let i = 0; i <= maxPos; i++)
			intermediate += merged.get(i) ?? ' ';

		const reversed1: {
			start1: number;
			length1: number;
			start2: number;
			length2: number;
			diffs: [number, string][];
		}[] = [];
		for (const p of patches1) {
			reversed1.push({
				start1: p.start2 as number,
				length1: p.length2 as number,
				start2: p.start1 as number,
				length2: p.length1 as number,
				diffs: (p.diffs as [number, string][]).map((d) => [
					d[0] === 1 ? -1 : d[0] === -1 ? 1 : 0,
					d[1],
				]),
			});
		}

		const [approxOriginal, app1] = dmp.patch_apply(
			reversed1,
			intermediate,
		);
		for (const ok of app1 as boolean[]) {
			if (!ok) this.throwIncompatible(path);
		}
		const [approxFinal, app2] = dmp.patch_apply(patches2, intermediate);
		for (const ok of app2 as boolean[]) {
			if (!ok) this.throwIncompatible(path);
		}
		if (approxOriginal === approxFinal) return undefined;
		const composedDelta = this.diff(approxOriginal, approxFinal);
		if (isTextDiffDelta(composedDelta)) return composedDelta;
		if (isModifiedDelta(composedDelta)) return composedDelta;
		return [approxOriginal as string, approxFinal as string];
	}

	private composeObjectDelta(
		delta1: Record<string, Delta>,
		delta2: Record<string, Delta>,
		path: string[],
	): Delta {
		const result: Record<string, Delta> = {};
		const keys = new Set([...Object.keys(delta1), ...Object.keys(delta2)]);

		for (const key of keys) {
			if (key === '_t') continue;
			const d1 = delta1[key];
			const d2 = delta2[key];
			if (d1 !== undefined && d2 !== undefined) {
				const composed = this.composeDelta(d1, d2, [...path, key]);
				if (composed !== undefined) result[key] = composed;
			} else if (d1 !== undefined) {
				result[key] = d1;
			} else if (d2 !== undefined) {
				result[key] = d2;
			}
		}

		return Object.keys(result).length > 0 ? result : undefined;
	}

	private composeArrayDeltas(
		delta1: ArrayDelta,
		delta2: ArrayDelta,
		path: string[],
	): Delta {
		const d1Rec = delta1 as Record<string, unknown>;
		const d2Rec = delta2 as Record<string, unknown>;

		const structural1: Record<string, unknown> = { _t: 'a' };
		const mods1: Record<string, Delta> = {};
		let maxPreIdx = 0;
		let addCount1 = 0;
		let removeCount1 = 0;
		let maxPostIdx1 = 0;
		for (const key in d1Rec) {
			if (key === '_t') continue;
			if (key.startsWith('_')) {
				structural1[key] = d1Rec[key];
				const idx = parseInt(key.substring(1), 10);
				if (idx + 1 > maxPreIdx) maxPreIdx = idx + 1;
				const v = d1Rec[key] as Delta;
				if (isMovedDelta(v)) {
					removeCount1++;
					addCount1++;
					const dest = v[1];
					if (dest + 1 > maxPostIdx1) maxPostIdx1 = dest + 1;
				} else {
					removeCount1++;
				}
			} else {
				const idx = parseInt(key, 10);
				if (idx + 1 > maxPostIdx1) maxPostIdx1 = idx + 1;
				const v = d1Rec[key] as Delta;
				if (isAddedDelta(v)) {
					structural1[key] = v;
					addCount1++;
				} else {
					mods1[key] = v;
				}
			}
		}
		const origSize = Math.max(
			maxPreIdx,
			maxPostIdx1 - addCount1 + removeCount1,
		);

		const structural2: Record<string, unknown> = { _t: 'a' };
		const mods2: Record<string, Delta> = {};
		let maxPreIdx2 = 0;
		let addCount2 = 0;
		let removeCount2 = 0;
		let maxPostIdx2 = 0;
		for (const key in d2Rec) {
			if (key === '_t') continue;
			if (key.startsWith('_')) {
				structural2[key] = d2Rec[key];
				const idx = parseInt(key.substring(1), 10);
				if (idx + 1 > maxPreIdx2) maxPreIdx2 = idx + 1;
				const v = d2Rec[key] as Delta;
				if (isMovedDelta(v)) {
					removeCount2++;
					addCount2++;
					const dest = v[1];
					if (dest + 1 > maxPostIdx2) maxPostIdx2 = dest + 1;
				} else {
					removeCount2++;
				}
			} else {
				const idx = parseInt(key, 10);
				if (idx + 1 > maxPostIdx2) maxPostIdx2 = idx + 1;
				const v = d2Rec[key] as Delta;
				if (isAddedDelta(v)) {
					structural2[key] = v;
					addCount2++;
				} else {
					mods2[key] = v;
				}
			}
		}
		const interSize = Math.max(
			maxPreIdx2,
			maxPostIdx2 - addCount2 + removeCount2,
		);
		const size = Math.max(
			origSize,
			interSize - addCount1 + removeCount1,
		);

		const original: unknown[] = [];
		for (let i = 0; i < size; i++) {
			original.push({ __ph: true, __i: i });
		}

		const savedOpts = { ...this.processor.options() } as Options;
		const origHash = savedOpts?.objectHash;
		const composeHash = (obj: object) => {
			const o = obj as { __ph?: boolean; __i?: number };
			if (o.__ph) return `__ph_${o.__i}`;
			return origHash ? origHash(obj) : undefined;
		};

		this.processor.options({ ...savedOpts, objectHash: composeHash });
		try {
			const inter = this.patch(
				this.clone(original),
				structural1 as Delta,
			) as unknown[];
			const finalArr = this.patch(
				this.clone(inter),
				structural2 as Delta,
			) as unknown[];
			const composedStructural = this.diff(original, finalArr) as
				| Record<string, unknown>
				| undefined;

			const hasMods1 = Object.keys(mods1).length > 0;
			const hasMods2 = Object.keys(mods2).length > 0;
			if (!hasMods1 && !hasMods2) {
				return composedStructural;
			}

			const finalMods: Record<string, Delta> = {};

			if (hasMods1) {
				const phToFinalIdx = new Map<number, number>();
				for (let j = 0; j < finalArr.length; j++) {
					const item = finalArr[j] as {
						__ph?: boolean;
						__i?: number;
					};
					if (item?.__ph) {
						phToFinalIdx.set(item.__i!, j);
					}
				}
				for (const key in mods1) {
					const interIdx = parseInt(key, 10);
					const item = inter[interIdx] as {
						__ph?: boolean;
						__i?: number;
					};
					if (item?.__ph && phToFinalIdx.has(item.__i!)) {
						const finalIdx = phToFinalIdx.get(item.__i!)!;
						finalMods[finalIdx.toString()] = mods1[key];
					}
				}
			}

			if (hasMods2) {
				for (const key in mods2) {
					if (finalMods[key] !== undefined) {
						const composed = this.composeDelta(
							finalMods[key],
							mods2[key],
							[...path, key],
						);
						if (composed !== undefined) {
							finalMods[key] = composed;
						} else {
							delete finalMods[key];
						}
					} else {
						finalMods[key] = mods2[key];
					}
				}
			}

			if (Object.keys(finalMods).length === 0) {
				return composedStructural;
			}

			const result: Record<string, unknown> = composedStructural
				? { ...composedStructural }
				: { _t: 'a' };

			for (const key in finalMods) {
				if (finalMods[key] === undefined) continue;
				const existing = result[key] as Delta;
				if (existing !== undefined && isAddedDelta(existing)) {
					const addedValue = (existing as unknown[])[0];
					const patched = this.patch(
						this.clone(addedValue),
						finalMods[key],
					);
					result[key] = [patched];
				} else {
					result[key] = finalMods[key];
				}
			}

			let hasEntries = false;
			for (const key in result) {
				if (key !== '_t') {
					hasEntries = true;
					break;
				}
			}
			return hasEntries ? (result as Delta) : undefined;
		} finally {
			this.processor.options(savedOpts);
		}
	}

	private isCompactMode(): boolean {
		return this.processor.options()?.omitRemovedValues === true;
	}

	private deepEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (a === null || b === null) return a === b;
		if (typeof a !== 'object') return false;
		if (a instanceof Date && b instanceof Date)
			return a.getTime() === b.getTime();
		if (a instanceof Date || b instanceof Date) return false;
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return false;
			return a.every((val, idx) => this.deepEqual(val, b[idx]));
		}
		if (Array.isArray(a) || Array.isArray(b)) return false;
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);
		if (aKeys.length !== bKeys.length) return false;
		return aKeys.every((key) => this.deepEqual(aObj[key], bObj[key]));
	}
}

export default DiffPatcher;
