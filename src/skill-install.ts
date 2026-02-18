import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { exists } from "./lib/file";
import { appendTrailingSlash } from "./lib/url";

const HELP = `
Install the Prismic skill into supported global AI tool skill directories.

USAGE
  prismic skill install [flags]

FLAGS
  -h, --help   Show help for command
  -n, --dry-run   Preview actions without writing files

LEARN MORE
  This command currently installs to global/user tool directories only.
`.trim();

const SKILL_ID = "prismic";
const SKILL_FILENAME = "SKILL.md";

export const PRISMIC_SKILL_TEMPLATE = `
---
name: prismic
description: Use when a task involves Prismic setup, repository configuration, content modeling, content type or slice changes, localization, previews, API tokens, webhooks, syncing local models, or reading Prismic documentation.
allowed-tools: Bash(prismic *)
---

# Prismic Workflows

For Prismic-related tasks, use the \`prismic\` CLI first.

1. Discover capabilities with \`prismic --help\`.
2. Inspect details with \`prismic <command> --help\`.
3. Use \`prismic docs list\` to discover docs paths, then \`prismic docs fetch <path>\` when documentation is needed.
4. Prefer CLI workflows over direct API/manual changes.
5. If the CLI does not support a required operation, state that explicitly, then use the next-best fallback.
`.trim();

export type SkillInstallTarget = {
	tool: string;
	baseDir: URL;
	skillsDir: URL;
	skillDir: URL;
	skillFile: URL;
};

export async function findGlobalSkillInstallTargets(config?: {
	homeDir?: string;
}): Promise<SkillInstallTarget[]> {
	const homeURL = appendTrailingSlash(pathToFileURL(config?.homeDir ?? homedir()));
	const codexBaseURL = new URL(".codex/", homeURL);

	const candidates: SkillInstallTarget[] = [
		createTarget("Claude", new URL(".claude/", homeURL), new URL(".claude/skills/", homeURL)),
		createTarget("Cursor", new URL(".cursor/", homeURL), new URL(".cursor/skills/", homeURL)),
		createTarget("Gemini", new URL(".gemini/", homeURL), new URL(".gemini/skills/", homeURL)),
		createTarget(
			"OpenCode",
			new URL(".config/opencode/", homeURL),
			new URL(".config/opencode/skill/", homeURL),
		),
		createTarget("Codex", codexBaseURL, new URL("skills/", codexBaseURL)),
	];

	const targets: SkillInstallTarget[] = [];
	for (const target of candidates) {
		if (await exists(target.baseDir)) {
			targets.push(target);
		}
	}

	return targets;
}

export async function skillInstall(): Promise<void> {
	const {
		values: { "dry-run": dryRun, help },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "skill", "install"
		options: {
			help: { type: "boolean", short: "h" },
			"dry-run": { type: "boolean", short: "n" },
		},
		allowPositionals: true,
		strict: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	const targets = await findGlobalSkillInstallTargets();

	if (targets.length === 0) {
		console.error(
			"No supported global AI tool directories were detected (Claude, Cursor, Gemini, OpenCode, Codex).",
		);
		process.exitCode = 1;
		return;
	}

	const conflicts: SkillInstallTarget[] = [];
	conflicts.push(...(await findExistingSkillConflicts(targets)));

	if (conflicts.length > 0) {
		console.error("Skill already exists in one or more targets:");
		for (const conflict of conflicts) {
			console.error(`- ${fileURLToPath(conflict.skillFile)}`);
		}
		console.error("Nothing was installed. Remove existing files and retry.");
		process.exitCode = 1;
		return;
	}

	if (dryRun) {
		for (const target of targets) {
			console.info(`Installed: ${fileURLToPath(target.skillFile)}`);
		}
		console.info(`Installed ${targets.length} Prismic skill file(s).`);
		return;
	}

	const installResult = await installSkillTemplateToTargets(PRISMIC_SKILL_TEMPLATE, targets);
	if (!installResult.ok) {
		console.error(`Failed to install skill for ${installResult.target.tool}: ${installResult.error}`);
		console.error(`Path: ${fileURLToPath(installResult.target.skillFile)}`);
		process.exitCode = 1;
		return;
	}
	const installedPaths = installResult.installedPaths;

	for (const installedPath of installedPaths) {
		console.info(`Installed: ${installedPath}`);
	}
	console.info(`Installed ${installedPaths.length} Prismic skill file(s).`);
}

export async function findExistingSkillConflicts(
	targets: SkillInstallTarget[],
): Promise<SkillInstallTarget[]> {
	const conflicts: SkillInstallTarget[] = [];
	for (const target of targets) {
		if (await exists(target.skillFile)) {
			conflicts.push(target);
		}
	}
	return conflicts;
}

export async function installSkillTemplateToTargets(
	template: string,
	targets: SkillInstallTarget[],
): Promise<
	| { ok: true; installedPaths: string[] }
	| { ok: false; target: SkillInstallTarget; error: string }
> {
	const installedPaths: string[] = [];
	for (const target of targets) {
		try {
			await mkdir(target.skillDir, { recursive: true });
			await writeFile(target.skillFile, template);
			installedPaths.push(fileURLToPath(target.skillFile));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, target, error: message };
		}
	}

	return { ok: true, installedPaths };
}

function createTarget(tool: string, baseDir: URL, skillsDir: URL): SkillInstallTarget {
	const skillDir = new URL(`${SKILL_ID}/`, skillsDir);
	return {
		tool,
		baseDir,
		skillsDir,
		skillDir,
		skillFile: new URL(SKILL_FILENAME, skillDir),
	};
}
