import { dedent } from "../string";
import { type Environment, getEnvironments, type RepositoryConfig, validateToken } from "./client";

export async function getUserEnvironments(config: RepositoryConfig): Promise<Environment[]> {
	const [session, { results: environments }] = await Promise.all([
		validateToken(config),
		getEnvironments(config),
	]);
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
