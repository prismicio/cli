import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

type RepositoryConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const RepositorySchema = z.object({
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

export type OnboardingStep =
	| "createPrismicProject"
	| "createPageType"
	| "createSlice"
	| "connectPrismic";

const OnboardingStateSchema = z.object({
	completedSteps: z.array(z.string()),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

type OnboardingConfig = RepositoryConfig;

export async function getOnboardingState(config: OnboardingConfig): Promise<OnboardingState> {
	const url = new URL("onboarding", getRepositoryServiceUrl(config.host));
	return onboardingServiceRequest(url, config, {
		schema: OnboardingStateSchema,
	});
}

export async function completeOnboardingSteps(
	config: OnboardingConfig & { stepIds: OnboardingStep[] },
): Promise<void> {
	const { host, stepIds } = config;
	const { completedSteps } = await getOnboardingState(config);
	const missing = stepIds.filter((id) => !completedSteps.includes(id));

	// API does not accept multiple steps; toggle each missing step sequentially.
	for (const stepId of missing) {
		const url = new URL(
			`onboarding/${encodeURIComponent(stepId)}/toggle`,
			getRepositoryServiceUrl(host),
		);
		await onboardingServiceRequest(url, config, {
			method: "PATCH",
			schema: OnboardingStateSchema,
		});
	}
}

export async function completeOnboardingStepsSilently(
	config: OnboardingConfig & { stepIds: OnboardingStep[] },
): Promise<void> {
	try {
		await completeOnboardingSteps(config);
	} catch {
		// Ignore errors
	}
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
