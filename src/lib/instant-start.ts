import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Profile } from "./prismic/clients/user";

import { CommandError } from "./command";

const instantStartCommit = "1eb2488e86a17eb096fe494aae34041f1b840317";

export const instantStartArchiveURL = new URL(
	`https://github.com/prismicio/instant-start-next-landing-page/archive/${instantStartCommit}.zip`,
);

export const instantStartHostedPreviewURL =
	"https://nextjs-starter-prismic-landing-page.vercel.app/api/preview";

export function assertInstantStartRepositoryAccess(repositoryId: string, profile: Profile): void {
	const hasRepositoryAccess = profile.repositories.some(
		(repository) => repository.domain === repositoryId,
	);
	if (!hasRepositoryAccess) {
		throw new CommandError(
			`Repository "${repositoryId}" not found in your account. Check the name or request access to the repository.`,
		);
	}
}

export async function patchInstantStartConfig(
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
