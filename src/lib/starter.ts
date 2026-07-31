import type { ArrayDiff } from "./diff";
import type { Repository } from "./prismic/clients/repository";

import { CommandError } from "./command";
import {
	addPreview,
	hasPreviewByURL,
	removePreviewsByURL,
	setSimulatorUrl,
} from "./prismic/clients/core";
import { completeOnboardingStepsSilently } from "./prismic/clients/repository";
import { sentryCaptureError } from "./sentry";

export const starterLocalPreviewURL = "http://localhost:3000/api/preview";
const starterLocalPreviewConfig = {
	name: "Development",
	websiteURL: "http://localhost:3000",
	resolverPath: "/api/preview",
};
const starterLocalSimulatorURL = "http://localhost:3000/slice-simulator";

export function assertStarterRepositoryHasModels(
	repositoryId: string,
	customTypes: unknown[],
	slices: unknown[],
): void {
	if (customTypes.length > 0 || slices.length > 0) return;

	throw new CommandError(
		`Repository "${repositoryId}" has no starter models. Use a repository created from the starter in the Prismic dashboard.`,
	);
}

export function hasUnsafeStarterModelChanges(...diffs: Array<ArrayDiff<unknown>>): boolean {
	return diffs.some((diff) => diff.update.length > 0 || diff.delete.length > 0);
}

export function resolveStarterHostedPreviewURL(starter: Repository["starter"] | undefined): string {
	assertStarterProvenance(starter);

	return new URL("/api/preview", starter.deploymentUrl).href;
}

function assertStarterProvenance(
	starter: Repository["starter"] | undefined,
): asserts starter is NonNullable<Repository["starter"]> {
	if (starter == null) {
		throw new CommandError(
			"Repository does not have starter provenance. Use a repository created with Instant Start.",
		);
	}
}

export async function completeStarterHandoff(
	starter: NonNullable<Repository["starter"]>,
	config: { repo: string; token: string | undefined; host: string },
): Promise<{ localPreviewConfigured: boolean }> {
	const localPreviewConfigured = await configureStarterPreviews(starter, config);

	try {
		await setSimulatorUrl(starterLocalSimulatorURL, config);
	} catch (error) {
		await sentryCaptureError(error);
		console.error(
			`Could not configure the local slice simulator. Run \`prismic preview set-simulator ${starterLocalSimulatorURL}\` manually. Continuing.`,
		);
	}

	await completeOnboardingStepsSilently({
		...config,
		stepIds: ["instantStart_continueBuildingLocally"],
	});

	return { localPreviewConfigured };
}

async function configureStarterPreviews(
	starter: NonNullable<Repository["starter"]>,
	config: { repo: string; token: string | undefined; host: string },
): Promise<boolean> {
	try {
		await removePreviewsByURL([resolveStarterHostedPreviewURL(starter)], config);
		const hasDevelopmentPreview = await hasPreviewByURL(starterLocalPreviewURL, config);
		if (!hasDevelopmentPreview) {
			await addPreview(starterLocalPreviewConfig, config);
		}
		return true;
	} catch (error) {
		await sentryCaptureError(error);
		console.error(
			`Could not configure the local preview. Run \`prismic preview add ${starterLocalPreviewURL} --name ${starterLocalPreviewConfig.name}\` manually. Continuing.`,
		);
		return false;
	}
}
