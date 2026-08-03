import { getOnboardingState, toggleOnboardingStep } from "./clients/repository";

type OnboardingConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

export type OnboardingStep =
	| "createPrismicProject"
	| "createPageType"
	| "createSlice"
	| "connectPrismic";

export async function completeOnboardingSteps(
	stepIds: OnboardingStep[],
	config: OnboardingConfig,
): Promise<void> {
	const { repo, token, host } = config;
	const { completedSteps } = await getOnboardingState({ repo, token, host });
	const missing = stepIds.filter((id) => !completedSteps.includes(id));

	// API does not accept multiple steps; toggle each missing step sequentially.
	for (const stepId of missing) {
		await toggleOnboardingStep(stepId, { repo, token, host });
	}
}
