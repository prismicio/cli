import type { TokenSource } from "../request";
import { dedent } from "../string";
import { validateToken } from "./clients/auth";
import { type Environment, getEnvironments } from "./clients/core";

export async function getUserEnvironments(config: {
	repo: string;
	token: TokenSource;
	host: string;
}): Promise<Environment[]> {
	const { repo, token, host } = config;
	// Validates after, since getting environments can log in again.
	const environments = await getEnvironments({ repo, token, host });
	const session = await validateToken(token.current(), { host });
	if (session.type === "Machine2Machine") {
		return environments.filter((environment) => environment.domain === session.domain);
	}
	return environments.filter(
		(environment) =>
			(environment.kind === "prod" || environment.kind === "stage") &&
			environment.users.some((user) => user.id === session.shortId),
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
