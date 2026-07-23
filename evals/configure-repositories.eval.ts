import {
	addPreview,
	getAccessTokens,
	getLocales,
	getPreviews,
	getRepository,
	getWebhooks,
} from "../test/prismic";
import { it, trials } from "./it";

it.for(trials)("sets up a content preview", async (_, { agent, expect, repo, token, host }) => {
	const result = await agent(
		`Set up a content preview for this repo pointing at https://example.com/api/preview.`,
	);

	expect(result).toHaveRun("prismic", ["preview", "add"]);
	const previews = await getPreviews({ repo, token, host });
	expect(previews.some((preview) => preview.url.includes("example.com"))).toBe(true);
});

// Fails: the agent does not update the simulator URL after a deploy.
it.for(trials)(
	"updates previews for production after a deploy",
	async (_, { agent, expect, repo, token, host }) => {
		await addPreview("http://localhost:3000/api/preview", "Development", { repo, token, host });

		const result = await agent(
			`We just deployed the site to https://example.com. Set up content previews for production.`,
		);

		expect(result).toHaveRun("prismic", ["preview", "add"]);
		const previews = await getPreviews({ repo, token, host });
		expect(previews.some((preview) => preview.url.includes("example.com"))).toBe(true);
		expect(previews.some((preview) => preview.url.includes("localhost:3000"))).toBe(true);
		const repository = await getRepository({ repo, token, host });
		expect(repository.simulatorUrl).toContain("example.com");
	},
);

it.for(trials)(
	"creates an API token and makes the API private",
	async (_, { agent, expect, repo, token, host }) => {
		const result = await agent(
			`Create a content API token named "ci" for this repo and make the content API private.`,
		);

		expect(result).toHaveRun("prismic", ["token", "create"]);
		expect(result).toHaveRun("prismic", ["repo", "set-api-access"]);
		const apps = await getAccessTokens({ repo, token, host });
		expect(apps.some((app) => app.name === "ci")).toBe(true);
	},
);

it.for(trials)("registers a webhook", async (_, { agent, expect, repo, token, host }) => {
	const result = await agent(
		`Register a webhook at https://example.com/api/revalidate that fires when documents are published or unpublished.`,
	);

	expect(result).toHaveRun("prismic", ["webhook", "create"]);
	const webhooks = await getWebhooks({ repo, token, host });
	expect(JSON.stringify(webhooks)).toContain("example.com/api/revalidate");
});

it.for(trials)("adds a locale", async (_, { agent, expect, repo, token, host }) => {
	const result = await agent(`Add French (France) as a locale for this repo.`);

	expect(result).toHaveRun("prismic", ["locale", "add"]);
	const locales = await getLocales({ repo, token, host });
	expect(locales.some((locale) => locale.id === "fr-fr")).toBe(true);
});
