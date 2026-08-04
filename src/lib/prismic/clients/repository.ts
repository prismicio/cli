import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

type RepositoryConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const RepositoryStarterSchema = z.object({
	id: z.string(),
	revision: z.string(),
	framework: z.string(),
	deploymentUrl: z.url(),
});

const RepositorySchema = z.object({
	starter: z.nullish(RepositoryStarterSchema),
	quotas: z.optional(
		z.object({
			sliceMachineEnabled: z.boolean(),
		}),
	),
});

export type Repository = z.infer<typeof RepositorySchema>;

export function getRepository(config: RepositoryConfig): Promise<Repository> {
	const url = getRepositoryServiceUrl(config.host);
	return repositoryServiceRequest(url, config, { schema: RepositorySchema });
}

const OnboardingStateSchema = z.object({
	completedSteps: z.array(z.string()),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export async function getOnboardingState(config: RepositoryConfig): Promise<OnboardingState> {
	const url = new URL("onboarding", getRepositoryServiceUrl(config.host));
	return onboardingServiceRequest(url, config, {
		schema: OnboardingStateSchema,
	});
}

export async function toggleOnboardingStep(
	stepId: string,
	config: RepositoryConfig,
): Promise<OnboardingState> {
	const url = new URL(
		`onboarding/${encodeURIComponent(stepId)}/toggle`,
		getRepositoryServiceUrl(config.host),
	);
	return onboardingServiceRequest(url, config, {
		method: "PATCH",
		schema: OnboardingStateSchema,
	});
}

function repositoryServiceRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return request(scopedUrl, {
		headers: {
			Authorization: `Bearer ${config.token}`,
			repository: config.repo,
		},
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function onboardingServiceRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return request(scopedUrl, {
		credentials: { "prismic-auth": config.token },
		...options,
	});
}

function getRepositoryServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/repository/`);
}
