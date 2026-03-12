import type { Vitest } from "vitest/node";

import { createRepository, deleteRepository, login } from "./prismic";

declare module "vitest" {
	export interface ProvidedContext {
		token: string;
		repo: string;
	}
}

export default async function ({ provide }: Vitest): Promise<() => Promise<void>> {
	try {
		process.loadEnvFile(".env.test.local");
	} catch {
		// .env.test.local is optional
	}

	const email = process.env.E2E_PRISMIC_EMAIL;
	if (!email) throw new Error("E2E_PRISMIC_EMAIL is required");
	const password = process.env.E2E_PRISMIC_PASSWORD;
	if (!password) throw new Error("E2E_PRISMIC_PASSWORD is required");
	const host = process.env.PRISMIC_HOST ?? "prismic.io";

	console.info(`Logging in to ${host} with ${email}`);
	const token = await login(email, password, { host });
	provide("token", token);

	const domain = `prismic-cli-test-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
	console.info(`Creating shared test repository: ${domain}`);
	await createRepository(domain, { token, host });
	provide("repo", domain);

	return async () => {
		try {
			console.info(`Deleting shared test repository: ${domain}`);
			await deleteRepository(domain, { token, password, host });
		} catch {
			console.warn(`Warning: failed to delete test repository ${domain}`);
		}
	};
}
