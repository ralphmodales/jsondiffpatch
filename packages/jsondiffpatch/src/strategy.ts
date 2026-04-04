import type { ArrayDiffStrategy, Options } from "./types.js";

type ArrayHashFunction = (item: object, index: number) => string | undefined;

type StrategyEntry = ArrayDiffStrategy | ArrayHashFunction | undefined;

const strategyFunctionKeys = [
	"hash",
	"equal",
	"shouldDiff",
	"weight",
	"onMatch",
] as const;

export function normalizeStrategy(
	entry: StrategyEntry,
): ArrayDiffStrategy | undefined {
	if (typeof entry === "undefined") {
		return undefined;
	}
	if (typeof entry === "function") {
		return { hash: entry };
	}
	return entry;
}

export function isArrayDiffStrategy(value: unknown): value is ArrayDiffStrategy {
	if (
		value === null ||
		typeof value !== "object" ||
		typeof value === "function"
	) {
		return false;
	}
	return strategyFunctionKeys.some((key) => typeof value[key] === "function");
}

export function createHashStrategy(fn: ArrayHashFunction): ArrayDiffStrategy {
	return { hash: fn };
}

export function createEqualStrategy(
	fn: NonNullable<ArrayDiffStrategy["equal"]>,
): ArrayDiffStrategy {
	return { equal: fn };
}

export function createWeightedStrategy(
	hashFn: ArrayHashFunction,
	weightFn: NonNullable<ArrayDiffStrategy["weight"]>,
): ArrayDiffStrategy {
	return { hash: hashFn, weight: weightFn };
}

export function createShouldDiffStrategy(
	fn: NonNullable<ArrayDiffStrategy["shouldDiff"]>,
): ArrayDiffStrategy {
	return { shouldDiff: fn };
}

export function combineStrategies(
	...strategies: Array<StrategyEntry>
): ArrayDiffStrategy {
	const normalized = strategies
		.map((strategy) => normalizeStrategy(strategy))
		.filter((strategy): strategy is ArrayDiffStrategy => !!strategy);
	const combined: ArrayDiffStrategy = {};

	const hashStrategies = normalized.filter(
		(strategy): strategy is ArrayDiffStrategy & { hash: ArrayHashFunction } =>
			typeof strategy.hash === "function",
	);
	if (hashStrategies.length > 0) {
		combined.hash = (item, index) => {
			for (const strategy of hashStrategies) {
				const hash = strategy.hash(item, index);
				if (typeof hash !== "undefined") {
					return hash;
				}
			}
			return undefined;
		};
	}

	const equalStrategy = normalized.find(
		(strategy): strategy is ArrayDiffStrategy & {
			equal: NonNullable<ArrayDiffStrategy["equal"]>;
		} => typeof strategy.equal === "function",
	);
	if (equalStrategy?.equal) {
		combined.equal = equalStrategy.equal;
	}

	const shouldDiffStrategies = normalized.filter(
		(strategy): strategy is ArrayDiffStrategy & {
			shouldDiff: NonNullable<ArrayDiffStrategy["shouldDiff"]>;
		} => typeof strategy.shouldDiff === "function",
	);
	if (shouldDiffStrategies.length > 0) {
		combined.shouldDiff = (left, right) =>
			shouldDiffStrategies.every((strategy) => strategy.shouldDiff(left, right));
	}

	const weightStrategies = normalized.filter(
		(strategy): strategy is ArrayDiffStrategy & {
			weight: NonNullable<ArrayDiffStrategy["weight"]>;
		} => typeof strategy.weight === "function",
	);
	if (weightStrategies.length > 0) {
		combined.weight = (a, b) =>
			weightStrategies.reduce(
				(product, strategy) => product * strategy.weight(a, b),
				1,
			);
	}

	const onMatchStrategies = normalized.filter(
		(strategy): strategy is ArrayDiffStrategy & {
			onMatch: NonNullable<ArrayDiffStrategy["onMatch"]>;
		} => typeof strategy.onMatch === "function",
	);
	if (onMatchStrategies.length > 0) {
		combined.onMatch = (a, b) => {
			for (const strategy of onMatchStrategies) {
				strategy.onMatch(a, b);
			}
		};
	}

	return combined;
}

const splitPath = (path: string) =>
	path
		.split("/")
		.filter((segment, index) => !(index === 0 && segment === ""));

export function matchesPathPattern(pattern: string, path: string) {
	if (pattern === path) {
		return true;
	}
	const patternParts = splitPath(pattern);
	const pathParts = splitPath(path);
	if (patternParts.length !== pathParts.length) {
		return false;
	}
	return patternParts.every((part, index) => {
		if (part === "*") {
			return true;
		}
		return part === pathParts[index];
	});
}

export function resolveStrategyFromOptions(
	options: Options | undefined,
	path: string,
	left: readonly unknown[],
	right: readonly unknown[],
) {
	const matchBy = options?.matchBy;
	if (!matchBy) {
		return undefined;
	}
	if (typeof matchBy === "function") {
		return normalizeStrategy(matchBy(path, left, right) as StrategyEntry);
	}
	if (path in matchBy) {
		return normalizeStrategy(matchBy[path]);
	}
	for (const key of Object.keys(matchBy)) {
		if (key === path || !key.includes("*")) {
			continue;
		}
		if (matchesPathPattern(key, path)) {
			return normalizeStrategy(matchBy[key]);
		}
	}
	return undefined;
}

export function findBestMoveCandidate(
	removedItems: number[],
	matchFn: (index: number) => boolean,
	weightFn?: (index: number) => number,
) {
	if (!weightFn) {
		return removedItems.findIndex((index) => matchFn(index));
	}
	let bestIndex = -1;
	let bestWeight = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < removedItems.length; index++) {
		const removedIndex = removedItems[index];
		if (removedIndex === undefined || !matchFn(removedIndex)) {
			continue;
		}
		const weight = weightFn(removedIndex);
		if (weight > bestWeight) {
			bestWeight = weight;
			bestIndex = index;
		}
	}
	return bestIndex;
}

export class StrategyCache {
	private readonly cache = new Map<string, ArrayDiffStrategy | undefined>();

	get(path: string) {
		return this.cache.get(path);
	}

	set(path: string, strategy: ArrayDiffStrategy | undefined) {
		this.cache.set(path, strategy);
		return this;
	}

	has(path: string) {
		return this.cache.has(path);
	}

	clear() {
		this.cache.clear();
	}
}
