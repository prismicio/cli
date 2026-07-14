import { getHost, getToken } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getProfile } from "../lib/prismic/clients/user";
import { formatTable } from "../lib/string";

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

	const profile = await getProfile({ token, host });

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

	const rows = repos.map((repo) => {
		const name = repo.name || "(no name)";
		return [repo.domain, name, formatRole(repo.role)];
	});
	console.info(formatTable(rows, { headers: ["DOMAIN", "NAME", "ROLE"] }));
});

// A role can be locale-scoped, in which case it is a record of locale to role.
// Display each role next to its locale, e.g. "Writer (en-us), Editor (de-de)".
function formatRole(role: string | Record<string, string> | undefined): string {
	if (typeof role === "string") return role;
	if (role) {
		return Object.entries(role)
			.map(([locale, r]) => `${r} (${locale})`)
			.join(", ");
	}
	return "";
}
