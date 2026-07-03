import { type Environment, getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";

export async function listAvailableEnvironments(config: {
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
	const availableEnvironments = await listAvailableEnvironments(config);

	const match = availableEnvironments.find((environment) => environment.domain === env);
	if (match) return match.domain;

	throw new InvalidEnvironmentError(env, availableEnvironments, config.repo);
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
