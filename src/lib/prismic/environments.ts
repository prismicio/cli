import { dedent } from "../string";
import { type Environment, getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";

export async function getUserEnvironments(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Environment[]> {
	const { repo, token, host } = config;
	const [profile, environments] = await Promise.all([
		getProfile({ token, host }),
		getEnvironments({ repo, token, host }),
	]);
	const userEnvironments = environments.filter(
		(environment) =>
			(environment.kind === "prod" || environment.kind === "stage") &&
			environment.users.some((user) => user.id === profile.shortId),
	);
	return userEnvironments;
}

export class InvalidEnvironmentError extends Error {
	name = "InvalidEnvironmentError";
	repo: string;
	env: string;
	availableEnvironments: Environment[];
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

		this.repo = repo;
		this.env = env;
		this.availableEnvironments = availableEnvironments;
	}
}
