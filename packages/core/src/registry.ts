import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RegistrySchema } from "@repotune/schemas";
import type { AgentId, Registry, Rule } from "@repotune/schemas";

const REG = ".ai/registry.json";

export async function loadRegistry(repoRoot: string): Promise<Registry> {
	const raw = await readFile(join(repoRoot, REG), "utf8");
	return RegistrySchema.parse(JSON.parse(raw));
}

export async function saveRegistry(
	registry: Registry,
	repoRoot: string,
): Promise<void> {
	await mkdir(join(repoRoot, ".ai"), { recursive: true });
	await writeFile(join(repoRoot, REG), JSON.stringify(registry, null, 2));
}

export async function initRegistry(
	repoRoot: string,
	agents: AgentId[],
): Promise<Registry> {
	const now = new Date().toISOString();
	const reg: Registry = {
		version: "0.1.2",
		createdAt: now,
		updatedAt: now,
		agents,
		rules: [],
	};
	await saveRegistry(reg, repoRoot);
	return reg;
}

export async function getRules(repoRoot: string): Promise<Rule[]> {
	return (await loadRegistry(repoRoot)).rules;
}

export async function ruleIdExists(
	id: string,
	repoRoot: string,
): Promise<boolean> {
	return (await loadRegistry(repoRoot)).rules.some((r) => r.id === id);
}

export async function addRule(rule: Rule, repoRoot: string): Promise<void> {
	const reg = await loadRegistry(repoRoot);
	if (reg.rules.some((r) => r.id === rule.id)) {
		throw new Error(`Rule ID '${rule.id}' already exists`);
	}
	reg.rules.push(rule);
	reg.rules.sort((a, b) =>
		a.createdAt < b.createdAt
			? -1
			: a.createdAt > b.createdAt
				? 1
				: a.id.localeCompare(b.id),
	);
	reg.updatedAt = new Date().toISOString();
	await saveRegistry(reg, repoRoot);
}
