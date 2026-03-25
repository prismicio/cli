import { getHost, getToken } from "../auth";
import { getProfile } from "../clients/user";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { UnknownRequestError } from "../lib/request";

const config = {
	name: "prismic repo list",
	description: "List all Prismic repositories associated with your account.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json } = values;

	const token = await getToken();
	const host = await getHost();

	let profile;
	try {
		profile = await getProfile({ token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to list repositories: ${message}`);
		}
		throw error;
	}

	const repos = profile.repositories;

	if (json) {
		console.info(
			stringify(
				repos.map((repo) => ({
					domain: repo.domain,
					name: repo.name ?? null,
					role: repo.role ?? null,
					url: `https://${repo.domain}.${host}/`,
				})),
			),
		);
		return;
	}

	if (repos.length === 0) {
		console.info("No repositories found.");
		return;
	}

	for (const repo of repos) {
		const name = repo.name || "(no name)";
		const role = repo.role ? `  ${repo.role}` : "";
		console.info(`${repo.domain}  ${name}${role}`);
	}
});
