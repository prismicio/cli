import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The sub-agent and the judge would otherwise inherit the developer's real Claude
// config (personal settings, hooks, MCP servers, CLAUDE.md, skills), so the eval
// would measure that setup instead of a generic agent. Seed an empty throwaway
// config dir and authenticate via ANTHROPIC_API_KEY, so every run is a clean,
// generic agent. Built once and shared by the agent and the judge.
let dir: Promise<string> | undefined;

export function isolatedConfigDir(): Promise<string> {
	return (dir ??= seed());
}

async function seed(): Promise<string> {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error("ANTHROPIC_API_KEY is not set; add it to .env.test.local (see eval/DESIGN.md)");
	}

	// Empty config: no personal skills, memory, MCP servers, or CLAUDE.md. The
	// onboarding flag keeps `claude -p` from prompting; auth comes from the API key.
	const target = await mkdtemp(join(tmpdir(), "prismic-eval-claude-"));
	await writeFile(join(target, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
	await writeFile(join(target, "settings.json"), "{}");

	return target;
}

// A full environment for spawning `claude`: the current env minus every CLAUDE*
// variable (the parent session and its config dir), then pointed at the isolated
// config dir. Dropping the parent session vars keeps the sub-agent from behaving
// as a nested/resumed session.
export async function claudeEnv(): Promise<Record<string, string>> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && !key.startsWith("CLAUDE")) env[key] = value;
	}
	env.CLAUDE_CONFIG_DIR = await isolatedConfigDir();
	return env;
}
