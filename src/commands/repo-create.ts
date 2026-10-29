import { FRAMEWORKS, getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { detectAgent } from "../lib/ai";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	checkIsDomainAvailable,
	createRepository,
	type Credentials,
	upsertLocale,
} from "../lib/prismic/client";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";

const MAX_DOMAIN_TRIES = 5;

const config = {
	name: "prismic repo create",
	description: `
		Create a new Prismic repository.

		The CLI generates a random domain, shown in the output. The domain cannot
		be chosen or changed. --name sets only the display name, which
		\`prismic repo set-name\` can change later.
	`,
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

	const credentials = await getCredentials();
	const domain = await createRepo({ name, lang, framework }, credentials);

	console.info(`Repository created: ${domain}`);
	console.info(`URL: https://${domain}.${credentials.host}/`);
});

export async function createRepo(
	config: { name?: string; lang?: string; framework: string },
	credentials: Credentials,
): Promise<string> {
	const { name, lang = "en-us", framework } = config;

	const domain = await findAvailableDomain(credentials);
	if (!domain) {
		throw new CommandError("Failed to create a repository. Please try again.");
	}

	const agent = detectAgent();

	await createRepository({ domain, name: name ?? domain, framework, agent, ...credentials });

	// A new repository has no locale, so set the master locale to make it usable.
	await upsertLocale({ id: lang, isMaster: true }, { repo: domain, ...credentials });

	await completeOnboardingSteps(["createPrismicProject"], {
		repo: domain,
		...credentials,
	}).catch(() => {});

	return domain;
}

async function findAvailableDomain(credentials: Credentials): Promise<string | undefined> {
	let domain;
	for (let i = 0; i < MAX_DOMAIN_TRIES; i++) {
		const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
		const available = await checkIsDomainAvailable({ domain: candidate, ...credentials });
		if (available) {
			domain = candidate;
			break;
		}
	}
	return domain;
}
