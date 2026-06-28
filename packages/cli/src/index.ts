import { findRepoRoot } from "@repotune/core";
import type { AgentId } from "@repotune/schemas";
import { Command } from "commander";
import { runDoctor } from "./commands/doctor";
import { runInit } from "./commands/init";
import { runRollback } from "./commands/rollback";
import { runRuleAdd } from "./commands/rule-add";
import { runRuleList } from "./commands/rule-list";
import { runSync } from "./commands/sync";

const program = new Command();
program
	.name("repotune")
	.description("Sync AI assistant rules across agents")
	.version("0.1.2");

program
	.command("init")
	.description("Initialize RepoTune in this repository")
	.action(async () => {
		const root = findRepoRoot(process.cwd());
		await runInit(root);
	});

const rule = program.command("rule").description("Manage rules");

rule
	.command("add [content]")
	.description("Add a new rule")
	.action(async (content?: string) => {
		const root = findRepoRoot(process.cwd());
		await runRuleAdd(root, content);
	});

rule
	.command("list")
	.description("List all rules")
	.action(async () => {
		const root = findRepoRoot(process.cwd());
		await runRuleList(root);
	});

program
	.command("sync")
	.description("Sync rules to agent configuration files")
	.option("--dry-run", "Show what would change without writing", false)
	.option("--diff", "Show file diffs before applying", false)
	.option(
		"--agent <id>",
		"Sync specific agent only (repeatable)",
		(v: string, acc: AgentId[]) => [...acc, v as AgentId],
		[] as AgentId[],
	)
	.option("--yes", "Skip confirmation prompts", false)
	.action(
		async (opts: {
			dryRun: boolean;
			diff: boolean;
			agent: AgentId[];
			yes: boolean;
		}) => {
			const root = findRepoRoot(process.cwd());
			await runSync(root, {
				dryRun: opts.dryRun,
				diff: opts.diff,
				agents: opts.agent,
				yes: opts.yes,
			});
		},
	);

program
	.command("doctor")
	.description("Check repository health")
	.action(async () => {
		const root = findRepoRoot(process.cwd());
		await runDoctor(root);
	});

program
	.command("rollback")
	.description("Restore from last backup")
	.option("--backup <path>", "Path to backup directory")
	.option("--yes", "Skip confirmation prompt", false)
	.action(async (opts: { backup?: string; yes: boolean }) => {
		const root = findRepoRoot(process.cwd());
		await runRollback(root, opts.backup, opts.yes);
	});

program.parseAsync(process.argv).catch((err: Error) => {
	console.error(err.message ?? String(err));
	process.exit(1);
});
