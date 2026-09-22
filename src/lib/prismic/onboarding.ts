import { getOnboardingState, toggleOnboardingStep } from "./clients/repository";

export type OnboardingStep =
	| "createPrismicProject"
	| "createPageType"
	| "createSlice"
	| "connectPrismic"
	| "instantStart_continueBuildingLocally";

export async function completeOnboardingSteps(
	stepIds: OnboardingStep[],
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { completedSteps } = await getOnboardingState(config);
	// API does not accept multiple steps; toggle each missing step sequentially.
	for (const stepId of stepIds) {
		if (!completedSteps.includes(stepId)) await toggleOnboardingStep(stepId, config);
	}
}
