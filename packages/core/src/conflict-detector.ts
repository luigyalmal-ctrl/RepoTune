import type { Conflict, Rule } from "@repotune/schemas";

const PAIRS: [string, string][] = [
	["pnpm", "npm"],
	["yarn", "npm"],
	["pnpm", "yarn"],
	["vitest", "jest"],
	["eslint", "biome"],
];

function hasWord(text: string, word: string): boolean {
	return new RegExp(`\\b${word}\\b`, "i").test(text);
}

export function detectConflicts(rules: Rule[]): Conflict[] {
	const conflicts: Conflict[] = [];
	for (const [a, b] of PAIRS) {
		const withA = rules.filter((r) => hasWord(r.content, a));
		const withB = rules.filter((r) => hasWord(r.content, b));
		for (const ra of withA) {
			for (const rb of withB) {
				if (ra.id !== rb.id) {
					conflicts.push({
						ruleId: ra.id,
						conflictingRuleId: rb.id,
						description: `'${a}' in rule '${ra.id}' conflicts with '${b}' in rule '${rb.id}'`,
						severity: "medium",
					});
				}
			}
		}
	}
	return conflicts;
}
