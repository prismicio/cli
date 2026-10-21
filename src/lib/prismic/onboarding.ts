import { completeOnboardingStep } from "./clients/repository";

type OnboardingConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

export type OnboardingStep =
	| "createPrismicProject"
	| "createPageType"
	| "createSlice"
	| "connectPrismic"
	| "instantStart_continueBuildingLocally";

export async function completeOnboardingSteps(
	stepIds: OnboardingStep[],
	config: OnboardingConfig,
): Promise<void> {
	for (const stepId of new Set(stepIds)) {
		await completeOnboardingStep(stepId, config);
	}
}
