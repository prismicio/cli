import { getAdapter } from "./adapters";
import { type Environment, getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";
import { readEnvFile } from "./lib/env-file";
import { findProjectRoot, getRepositoryName } from "./project";

export async function getAvailableEnvironments(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Environment[]> {
	const { repo, token, host } = config;

	const [profile, environments] = await Promise.all([
		getProfile({ token, host }),
		getEnvironments({ repo, token, host }),
	]);

	return environments.filter(
		(environment) =>
			(environment.kind === "prod" || environment.kind === "stage") &&
			environment.users.some((user) => user.id === profile.shortId),
	);
}

export async function resolveEnvironment(
	env: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<string> {
	const availableEnvironments = await getAvailableEnvironments(config);
	const match = availableEnvironments.find((environment) => environment.domain === env);
	if (match) return match.domain;

	throw new InvalidEnvironmentError(env, availableEnvironments, config.repo);
}

/**
 * The repository name persisted as the active environment, read from
 * `process.env` then `.env.local`. Returns `undefined` when none is set.
 */
export async function getActiveRepositoryName(): Promise<string | undefined> {
	let key: string;
	try {
		const adapter = await getAdapter();
		key = adapter.repositoryEnvVar;
	} catch {
		return undefined;
	}

	const fromProcess = process.env[key];
	if (fromProcess) return fromProcess;

	const localEnv = await readEnvFile(new URL(".env.local", await findProjectRoot()));
	return localEnv[key];
}

/** The repository name to target by default, honoring the active environment. */
export async function resolveRepositoryName(): Promise<string> {
	return (await getActiveRepositoryName()) ?? (await getRepositoryName());
}

export class InvalidEnvironmentError extends Error {
	name = "InvalidEnvironmentError";
	repo: string;
	env: string;
	availableEnvironments: Environment[];
	constructor(env: string, availableEnvironments: Environment[], repo: string) {
		super();
		this.repo = repo;
		this.env = env;
		this.availableEnvironments = availableEnvironments;
	}
}
