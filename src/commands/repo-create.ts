import { FRAMEWORKS, getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { detectAgent } from "../lib/ai";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { upsertLocale } from "../lib/prismic/clients/locale";
import { activateMCP } from "../lib/prismic/clients/mcp";
import { checkIsDomainAvailable, createRepository } from "../lib/prismic/clients/wroom";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";

const MAX_DOMAIN_TRIES = 5;

const config = {
	name: "prismic repo create",
	description: "Create a new Prismic repository.",
	options: {
		name: { type: "string", short: "n", description: "Display name for the repository" },
		lang: {
			type: "string",
			short: "l",
			description: "Master locale for the new repository (default: en-us)",
		},
		framework: {
			type: "string",
			short: "f",
			description: `Framework the repository is for: ${FRAMEWORKS.join(", ")} (default: detected from the project)`,
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const adapter = await getAdapter().catch(() => undefined);
	const { name, lang, framework = adapter?.id } = values;
	if (!framework) {
		throw new CommandError(`
			No supported framework found. The CLI needs a Next.js, Nuxt, or SvelteKit project to work with a repository.

			Do one of the following:
			  - Run this command inside an existing Next.js, Nuxt, or SvelteKit project.
			  - Create the project first, then run \`prismic init\` to create and connect a repository.
			  - Pass --framework <${FRAMEWORKS.join("|")}> to create the repository now.
			    You still need a compatible project to use it. Connect one later with \`prismic init --repo <domain>\`.
		`);
	}
	if (!FRAMEWORKS.includes(framework)) {
		throw new CommandError(
			`Unsupported framework "${framework}". Use one of: ${FRAMEWORKS.join(", ")}.`,
		);
	}

	const { token, host } = await getCredentials();
	const domain = await createRepo({ name, lang, framework, token, host });

	console.info(`Repository created: ${domain}`);
	console.info(`URL: https://${domain}.${host}/`);
});

export async function createRepo(config: {
	name?: string;
	lang?: string;
	framework: string;
	token: string | undefined;
	host: string;
}): Promise<string> {
	const { name, lang = "en-us", framework, token, host } = config;

	let domain;
	for (let i = 0; i < MAX_DOMAIN_TRIES && !domain; i++) {
		const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
		if (await checkIsDomainAvailable({ domain: candidate, token, host })) domain = candidate;
	}
	if (!domain) {
		throw new CommandError("Failed to create a repository. Please try again.");
	}

	await createRepository({
		domain,
		name: name ?? domain,
		framework,
		agent: detectAgent(),
		token,
		host,
	});

	// A new repository has no locale, so set the master locale to make it usable.
	await upsertLocale({ id: lang, isMaster: true }, { repo: domain, token, host });

	await completeOnboardingSteps(["createPrismicProject"], {
		repo: domain,
		token,
		host,
	}).catch(() => {});

	await activateMCP({ repo: domain, token, host }).catch(() => {});

	return domain;
}
