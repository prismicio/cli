import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Repository } from "./prismic/clients/repository";
import type { Profile } from "./prismic/clients/user";

import { CommandError } from "./command";

export const starterLocalPreviewURL = "http://localhost:3000/api/preview";

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

	return new URL(`https://github.com/${starter.id}/archive/${starter.revision}.zip`);
}

export function resolveStarterHostedPreviewURL(starter: Repository["starter"] | undefined): string {
	if (starter == null) {
		throw new CommandError(
			`Repository does not support starter download. Use a repository created with Instant Start.`,
		);
	}

	return new URL("/api/preview", starter.deploymentUrl).href;
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
