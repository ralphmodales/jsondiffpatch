import defaultClone from "../clone.js";
import type { ArrayDiffStrategy, Delta } from "../types.js";
import Context from "./context.js";

class DiffContext extends Context<Delta> {
	left: unknown;
	right: unknown;
	pipe: "diff";

	leftType?: string;
	rightType?: string;
	leftIsArray?: boolean;
	rightIsArray?: boolean;
	resolvedStrategy?: ArrayDiffStrategy;

	private _path?: string;

	constructor(left: unknown, right: unknown) {
		super();
		this.left = left;
		this.right = right;
		this.pipe = "diff";
	}

	prepareDeltaResult<T extends Delta>(result: T): T {
		if (typeof result === "object") {
			if (
				this.options?.omitRemovedValues &&
				Array.isArray(result) &&
				result.length > 1 &&
				(result.length === 2 || // modified
					result[2] === 0 || // deleted
					result[2] === 3) // moved
			) {
				// omit the left/old value (this delta will be more compact but irreversible)
				result[0] = 0;
			}

			if (this.options?.cloneDiffValues) {
				const clone =
					typeof this.options?.cloneDiffValues === "function"
						? this.options?.cloneDiffValues
						: defaultClone;

				if (typeof result[0] === "object") {
					result[0] = clone(result[0]);
				}
				if (typeof result[1] === "object") {
					result[1] = clone(result[1]);
				}
			}
		}
		return result;
	}

	setResult(result: Delta) {
		this.prepareDeltaResult(result);
		return super.setResult(result);
	}

	getPath() {
		if (typeof this._path !== "undefined") {
			return this._path;
		}
		const segments: string[] = [];
		let context: DiffContext | undefined = this;
		while (context?.parent) {
			if (typeof context.childName !== "undefined") {
				segments.unshift(String(context.childName));
			}
			context = context.parent;
		}
		this._path = segments.length > 0 ? `/${segments.join("/")}` : "";
		return this._path;
	}
}

export default DiffContext;
