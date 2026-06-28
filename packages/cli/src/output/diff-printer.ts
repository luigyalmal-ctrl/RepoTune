import type { DiffResult } from "@repotune/schemas";
import { diffLines } from "diff";

export function printDiff(diff: DiffResult): void {
	for (const f of diff.files) {
		if (!f.hasChanges) continue;
		console.log(`\n─── ${f.path}`);
		const changes = diffLines(f.before ?? "", f.after);
		for (const c of changes) {
			const prefix = c.added ? "+" : c.removed ? "-" : " ";
			const lines = c.value.replace(/\n$/, "").split("\n");
			for (const line of lines) console.log(`${prefix} ${line}`);
		}
	}
	console.log(`\n+${diff.totalAdded} added  -${diff.totalRemoved} removed\n`);
}
