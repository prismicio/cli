import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { detectAgent } from "../lib/ai";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { upsertLocale } from "../lib/prismic/clients/locale";
import { activateMCP } from "../lib/prismic/clients/mcp";
import { completeOnboardingStepsSilently } from "../lib/prismic/clients/repository";
import { checkIsDomainAvailable, createRepository } from "../lib/prismic/clients/wroom";
import { UnknownRequestError } from "../lib/request";

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
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { name, lang } = values;

	const token = await getToken();
	const host = await getHost();
	const domain = await createRepo({ name, lang, token, host });

	console.info(`Repository created: ${domain}`);
	console.info(`URL: https://${domain}.${host}/`);
});

export async function createRepo(config: {
	name?: string;
	lang?: string;
	token: string | undefined;
	host: string;
}): Promise<string> {
	const { name, lang = "en-us", token, host } = config;

	const domain = await findAvailableDomain({ token, host });
	if (!domain) {
		throw new CommandError("Failed to create a repository. Please try again.");
	}

	const adapter = await getAdapter().catch(() => undefined);
	const framework = adapter?.id ?? "other";
	const agent = await detectAgent();

	try {
		await createRepository({ domain, name: name ?? domain, framework, agent, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create repository: ${message}`);
		}
		throw error;
	}

	// A new repository has no locale, so set the master locale to make it usable.
	try {
		await upsertLocale({ id: lang, isMaster: true }, { repo: domain, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to set master locale: ${message}`);
		}
		throw error;
	}

	await completeOnboardingStepsSilently({
		repo: domain,
		token,
		host,
		stepIds: ["createPrismicProject"],
	});

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
