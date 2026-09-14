import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { detectAgent } from "../lib/ai";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { upsertLocale } from "../lib/prismic/clients/locale";
import { activateMCP } from "../lib/prismic/clients/mcp";
import { checkIsDomainAvailable, createRepository } from "../lib/prismic/clients/wroom";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";

const MAX_DOMAIN_TRIES = 5;
const FRAMEWORKS = ["next", "nuxt", "sveltekit"];

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
	const { name, lang, framework = (await getAdapter().catch(() => undefined))?.id } = values;
	if (!framework) {
		throw new CommandError(
			`No supported framework found. Run this command in a Next.js, Nuxt, or SvelteKit project, or pass --framework <${FRAMEWORKS.join("|")}>.`,
		);
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

	const domain = await findAvailableDomain({ token, host });
	if (!domain) {
		throw new CommandError("Failed to create a repository. Please try again.");
	}

	const agent = detectAgent();

	await createRepository({ domain, name: name ?? domain, framework, agent, token, host });

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

async function findAvailableDomain(config: {
	token: string | undefined;
	host: string;
}): Promise<string | undefined> {
	const { token, host } = config;
	let domain;
	for (let i = 0; i < MAX_DOMAIN_TRIES; i++) {
		const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
		const available = await checkIsDomainAvailable({ domain: candidate, token, host });
		if (available) {
			domain = candidate;
			break;
		}
	}
	return domain;
}
