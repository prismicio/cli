import { getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";
import { CommandError } from "./lib/command";

export async function resolveEnvironment(args: {
	env: string;
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<string> {
	const { env, repo, token, host } = args;

	const [profile, environments] = await Promise.all([
		getProfile({ token, host }),
		getEnvironments({ repo, token, host }),
	]);

	const available = environments.filter(
		(environment) =>
			environment.kind !== "dev" && environment.users.some((user) => user.id === profile.shortId),
	);

	const match = available.find((environment) => environment.domain === env);
	if (match) return match.domain;

	if (available.length === 0) {
		throw new CommandError(`No environments available on repository "${repo}".`);
	}

	const list = available.map((environment) => `  ${environment.domain}`).join("\n");
	throw new CommandError(
		`Environment "${env}" not found on repository "${repo}".\n\nAvailable environments:\n${list}`,
	);
}
