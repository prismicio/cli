import * as z from "zod/mini";

import { NotFoundRequestError, request } from "../lib/request";

const RepositorySchema = z.object({
	quotas: z.optional(
		z.object({
			sliceMachineEnabled: z.boolean(),
		}),
	),
});

export type Repository = z.infer<typeof RepositorySchema>;

export async function getRepository(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Repository> {
	const { repo, token, host } = config;
	const url = getRepositoryServiceUrl(host);
	url.searchParams.set("repository", repo);
	try {
		const response = await request(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
			schema: RepositorySchema,
		});
		return response;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

const OnboardingStateSchema = z.object({
	completedSteps: z.array(z.string()),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

type OnboardingConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

export async function getOnboardingState(config: OnboardingConfig): Promise<OnboardingState> {
	const { repo, token, host } = config;
	const url = new URL("./onboarding", getRepositoryServiceUrl(host));
	url.searchParams.set("repository", repo);
	return request(url, {
		credentials: { "prismic-auth": token },
		schema: OnboardingStateSchema,
	});
}

export async function completeOnboardingSteps(
	config: OnboardingConfig & { stepIds: string[] },
): Promise<void> {
	const { repo, token, host, stepIds } = config;
	const { completedSteps } = await getOnboardingState({ repo, token, host });
	const missing = stepIds.filter((id) => !completedSteps.includes(id));

	// API does not accept multiple steps; toggle each missing step sequentially.
	for (const stepId of missing) {
		const url = new URL(`./onboarding/${stepId}/toggle`, getRepositoryServiceUrl(host));
		url.searchParams.set("repository", repo);
		await request(url, {
			method: "PATCH",
			credentials: { "prismic-auth": token },
			schema: OnboardingStateSchema,
		});
	}
}

export async function completeOnboardingStepsSilently(
	config: OnboardingConfig & { stepIds: string[] },
): Promise<void> {
	try {
		await completeOnboardingSteps(config);
	} catch {}
}

function getRepositoryServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/repository/`);
}
