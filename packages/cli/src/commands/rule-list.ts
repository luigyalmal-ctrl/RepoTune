import { loadRegistry } from "@repotune/core";

export async function runRuleList(repoRoot: string): Promise<void> {
	const reg = await loadRegistry(repoRoot);

	if (reg.rules.length === 0) {
		console.log("No rules yet. Run 'repotune rule add' to add one.");
		return;
	}

	const ID_W = 26;
	const SCOPE_W = 10;
	console.log(`${"ID".padEnd(ID_W)} ${"SCOPE".padEnd(SCOPE_W)} CONTENT`);
	console.log("─".repeat(ID_W + SCOPE_W + 52));

	for (const rule of reg.rules) {
		const prefix = rule.scope === "path" ? `${rule.pathPattern ?? ""} → ` : "";
		const preview = `${prefix}${rule.content.replace(/\n/g, " ")}`.slice(0, 50);
		console.log(
			`${rule.id.padEnd(ID_W)} ${rule.scope.padEnd(SCOPE_W)} ${preview}`,
		);
	}
}
