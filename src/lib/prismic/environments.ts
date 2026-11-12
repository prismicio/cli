import { dedent } from "../string";
import { type Environment, getEnvironments, validateToken } from "./client";

export async function getUserEnvironments(
	config: Parameters<typeof getEnvironments>[0],
): Promise<Environment[]> {
	// Validate after the request, which can log in and change the token.
	const { results: environments } = await getEnvironments(config);
	const session = await validateToken(await config.getToken(), config);
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
