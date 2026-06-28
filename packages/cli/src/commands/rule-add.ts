import { editor, input, select } from "@inquirer/prompts";
import { addRule, ruleIdExists } from "@repotune/core";
import type { Rule } from "@repotune/schemas";

function slugify(content: string): string {
	return content
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.split(/\s+/)
		.slice(0, 6)
		.join("-");
}

function randomHex(len: number): string {
	let r = "";
	const chars = "0123456789abcdef";
	for (let i = 0; i < len; i++)
		r += chars[Math.floor(Math.random() * chars.length)];
	return r;
}

async function generateId(content: string, repoRoot: string): Promise<string> {
	const base = slugify(content);
	for (let i = 0; i < 5; i++) {
		const id = `${base}-${randomHex(4)}`;
		if (!(await ruleIdExists(id, repoRoot))) return id;
	}
	throw new Error("Could not generate unique rule ID after 5 attempts");
}

export async function runRuleAdd(
	repoRoot: string,
	rawContent?: string,
): Promise<void> {
	const content = rawContent ?? (await editor({ message: "Rule content:" }));

	const scope = await select({
		message: "Scope?",
		choices: [
			{ name: "global — applies to all files", value: "global" as const },
			{
				name: "path — applies to specific file patterns",
				value: "path" as const,
			},
		],
	});

	let pathPattern: string | undefined;
	if (scope === "path") {
		pathPattern = await input({ message: "Glob pattern (e.g. src/**/*.ts):" });
	}

	const now = new Date().toISOString();
	const id = await generateId(content, repoRoot);
	const rule: Rule = {
		id,
		content,
		scope,
		pathPattern,
		createdAt: now,
		updatedAt: now,
	};

	await addRule(rule, repoRoot);
	console.log(`\nRule added: ${id}`);
	console.log("Run 'repotune sync' to apply.");
}
