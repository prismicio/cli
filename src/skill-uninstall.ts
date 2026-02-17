import { rm, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { exists } from "./lib/file";
import { findGlobalSkillInstallTargets } from "./skill-install";

const HELP = `
Uninstall the Prismic skill from supported global AI tool skill directories.

USAGE
  prismic skill uninstall [flags]

FLAGS
  -h, --help   Show help for command

LEARN MORE
  This command currently uninstalls from global/user tool directories only.
`.trim();

export async function skillUninstall(): Promise<void> {
	const {
		values: { help },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "skill", "uninstall"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	const targets = await findGlobalSkillInstallTargets();

	const removedSkillFiles: string[] = [];

	for (const target of targets) {
		if (!(await exists(target.skillFile))) {
			continue;
		}

		try {
			await rm(target.skillFile);
			removedSkillFiles.push(fileURLToPath(target.skillFile));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to remove skill for ${target.tool}: ${message}`);
			console.error(`Path: ${fileURLToPath(target.skillFile)}`);
			process.exitCode = 1;
			return;
		}

		try {
			await rmdir(target.skillDir);
		} catch (error) {
			if (error && typeof error === "object" && "code" in error) {
				const code = String(error.code);
				if (code === "ENOTEMPTY" || code === "ENOENT") {
					continue;
				}
			}

			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to clean up skill directory for ${target.tool}: ${message}`);
			console.error(`Path: ${fileURLToPath(target.skillDir)}`);
			process.exitCode = 1;
			return;
		}
	}

	if (removedSkillFiles.length === 0) {
		console.info("No Prismic skill installation found. Nothing to uninstall.");
		return;
	}

	for (const removedSkillFile of removedSkillFiles) {
		console.info(`Removed: ${removedSkillFile}`);
	}
	console.info(`Uninstalled ${removedSkillFiles.length} Prismic skill file(s).`);
}
