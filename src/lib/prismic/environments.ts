import { dedent } from "../string";
import { type Environment, getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";
import { readWriteApiToken } from "./write-api-token";

export async function getUserEnvironments(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Environment[]> {
	const { repo, token, host } = config;
	// A Write API token has no user id. The environment is the token's domain.
	const writeApiToken = readWriteApiToken(token);
	if (writeApiToken) {
		const environments = await getEnvironments({ repo, token, host });
		return environments.filter((environment) => environment.domain === writeApiToken.domain);
	}

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

export class InvalidEnvironmentError extends Error {
	name = "InvalidEnvironmentError";

	constructor(env: string, availableEnvironments: Environment[], repo: string) {
		if (availableEnvironments.length === 1 && repo === availableEnvironments[0].domain) {
			super(`No environments available on repository "${repo}".`);
		} else {
			const list = availableEnvironments.map((environment) => environment.domain).join("\n");
			super(dedent`
				Environment "${env}" not found on repository "${repo}".

				Available environments:
				  ${list}
			`);
		}
	}
}
