import * as z from "zod/mini";

import { request } from "../../request";

type RepositoryConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const RepositorySchema = z.object({
	starter: z.nullish(
		z.object({
			id: z.string(),
			revision: z.string(),
			framework: z.string(),
			deploymentUrl: z.url(),
		}),
	),
	quotas: z.optional(
		z.object({
			sliceMachineEnabled: z.boolean(),
		}),
	),
});
export type Repository = z.infer<typeof RepositorySchema>;

export async function getRepository(config: RepositoryConfig): Promise<Repository> {
	return request(getRepositoryUrl("", config), {
		headers: {
			Authorization: `Bearer ${config.token}`,
			repository: config.repo,
		},
		notFoundMessage: `Repository not found: ${config.repo}`,
		schema: RepositorySchema,
	});
}

const OnboardingStateSchema = z.object({
	completedSteps: z.array(z.string()),
});
type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export async function getOnboardingState(config: RepositoryConfig): Promise<OnboardingState> {
	return request(getRepositoryUrl("onboarding", config), {
		credentials: { "prismic-auth": config.token },
		schema: OnboardingStateSchema,
	});
}

export async function toggleOnboardingStep(
	stepId: string,
	config: RepositoryConfig,
): Promise<OnboardingState> {
	return request(getRepositoryUrl(`onboarding/${encodeURIComponent(stepId)}/toggle`, config), {
		method: "PATCH",
		credentials: { "prismic-auth": config.token },
		schema: OnboardingStateSchema,
	});
}

function getRepositoryUrl(path: string, config: RepositoryConfig): URL {
	const url = new URL(path, `https://api.internal.${config.host}/repository/`);
	url.searchParams.set("repository", config.repo);
	return url;
}
