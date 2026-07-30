import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Repository } from "./prismic/clients/repository";
import type { Profile } from "./prismic/clients/user";

import { CommandError } from "./command";

export const starterHostedPreviewURL = "https://next-instant-start.vercel.app/api/preview";

export const starterLocalPreviewURL = "http://localhost:3000/api/preview";

const supportedStarterId = "prismicio/next-instant-start";
const supportedStarterFramework = "next";
const starterRevisionPattern = /^[0-9a-f]{40}$/;

export function assertStarterRepositoryAccess(repositoryId: string, profile: Profile): void {
	const hasRepositoryAccess = profile.repositories.some(
		(repository) => repository.domain === repositoryId,
	);
	if (!hasRepositoryAccess) {
		throw new CommandError(
			`Repository "${repositoryId}" not found in your account. Check the name or request access to the repository.`,
		);
	}
}

export function assertStarterRepositoryHasModels(
	repositoryId: string,
	customTypes: unknown[],
	slices: unknown[],
): void {
	if (customTypes.length > 0 || slices.length > 0) return;

	throw new CommandError(
		`Repository "${repositoryId}" has no starter models. Use a repository created from the starter in the Prismic dashboard.`,
	);
}

export function resolveStarterArchive(starter: Repository["starter"] | undefined): URL {
	if (starter == null) {
		throw new CommandError(
			`Repository does not support starter download. Use a repository created with Instant Start.`,
		);
	}

	if (starter.id !== supportedStarterId) {
		throw new CommandError(
			`Repository starter "${starter.id}" is not supported by starter download.`,
		);
	}

	if (starter.framework !== supportedStarterFramework) {
		throw new CommandError(
			`Repository starter framework "${starter.framework}" is not supported by starter download.`,
		);
	}

	if (!starterRevisionPattern.test(starter.revision)) {
		throw new CommandError(
			`Repository starter revision "${starter.revision}" is not a valid Git commit SHA.`,
		);
	}

	return new URL(`https://github.com/prismicio/next-instant-start/archive/${starter.revision}.zip`);
}

export async function patchStarterConfig(
	destination: string,
	repositoryId: string,
	host: string,
): Promise<void> {
	const configPath = join(destination, "prismic.config.json");
	const config: unknown = JSON.parse(await readFile(configPath, "utf8"));
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		throw new Error("Invalid prismic.config.json.");
	}

	await writeFile(
		configPath,
		`${JSON.stringify(
			{
				...config,
				repositoryName: repositoryId,
				documentAPIEndpoint: `https://${repositoryId}.${host}/api/v2`,
			},
			null,
			2,
		)}\n`,
	);
}
