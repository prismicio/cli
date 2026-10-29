import { getOnboardingState, type RepositoryConfig, toggleOnboardingStep } from "./client";

export type OnboardingStep =
	| "createPrismicProject"
	| "createPageType"
	| "createSlice"
	| "connectPrismic"
	| "instantStart_continueBuildingLocally";

export async function completeOnboardingSteps(
	stepIds: OnboardingStep[],
	config: RepositoryConfig,
): Promise<void> {
	const { completedSteps } = await getOnboardingState(config);
	const missing = stepIds.filter((id) => !completedSteps.includes(id));

	// API does not accept multiple steps; toggle each missing step sequentially.
	for (const stepId of missing) {
		await toggleOnboardingStep(stepId, config);
	}
}
