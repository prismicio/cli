import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import {
	fetchRemoteCustomTypes,
	fetchRemoteSlices,
	readLocalCustomTypes,
	readLocalSlices,
} from "./lib/custom-types-api";
import { exists } from "./lib/file";
import {
	type Framework,
	type FrameworkInfo,
	detectFrameworkInfo,
	getClientFilePath,
	getRequiredDependencies,
	getRoutePath,
	getSliceComponentExtensions,
	getSlicesDirectory,
} from "./lib/framework";
import { request } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import { getWebhooks } from "./webhook-view";

const HELP = `
Show the status of the current Prismic project.

Each section with incomplete items includes "Next steps:" with actionable
instructions.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic status [flags]

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

// Symbols for checkboxes
const CHECK = "\u2713";
const CIRCLE = "\u25CB";

type StatusItem = {
	done: boolean;
	label: string;
	hint?: string;
};

type NextStep = {
	action: string;
};

type StatusSection = {
	title: string;
	items: StatusItem[];
	nextSteps?: NextStep[];
};

function getDocsPath(framework: Framework | undefined): string {
	switch (framework) {
		case "next":
			return "nextjs/with-cli";
		case "nuxt":
			return "nuxt/with-cli";
		case "sveltekit":
			return "sveltekit/with-cli";
		default:
			return "";
	}
}

function getDocsRef(docsPath: string, anchor?: string): string {
	if (!docsPath) return "";
	const fullPath = anchor ? `${docsPath}${anchor}` : docsPath;
	return `\`prismic docs ${fullPath}\``;
}

function getClientSetupAnchor(framework: Framework | undefined): string {
	switch (framework) {
		case "nuxt":
			return "#configure-the-modules-prismic-client";
		default:
			return "#set-up-a-prismic-client";
	}
}

function getPreviewSetupAnchor(framework: Framework | undefined): string {
	switch (framework) {
		case "next":
			return "#set-up-previews-in-next-js";
		case "sveltekit":
			return "#set-up-previews-in-sveltekit";
		default:
			return "";
	}
}

function getWriteComponentsAnchor(framework: Framework | undefined): string {
	switch (framework) {
		case "nuxt":
			return "#write-vue-components";
		case "sveltekit":
			return "#write-svelte-components";
		default:
			return "#write-react-components";
	}
}

// Next-step builder functions

function buildSetupNextSteps(
	items: StatusItem[],
	frameworkInfo: FrameworkInfo,
): NextStep[] {
	const nextSteps: NextStep[] = [];
	const docsPath = getDocsPath(frameworkInfo.framework);

	// Missing dependencies
	const missingDeps = items.filter((i) => !i.done && i.hint === "not installed");
	if (missingDeps.length > 0) {
		const depsList = missingDeps.map((d) => d.label).join(" ");
		nextSteps.push({
			action: `Install dependencies: Run \`npm install ${depsList}\``,
		});
	}

	// Missing client file
	const missingClientFile = items.find((i) => !i.done && i.hint?.includes("client"));
	if (missingClientFile) {
		const docsRef = getDocsRef(docsPath, getClientSetupAnchor(frameworkInfo.framework));
		nextSteps.push({
			action: `Create Prismic client file: Run ${docsRef} and create the file as shown`,
		});
	}

	return nextSteps;
}

function buildTypesNextSteps(statuses: TypeWithStatus[]): NextStep[] {
	const nextSteps: NextStep[] = [];

	const hasToPush = statuses.some((t) => t.status === "to_push");
	const hasToPull = statuses.some((t) => t.status === "to_pull");

	if (hasToPush) {
		nextSteps.push({
			action: "Push local models to Prismic: Run `prismic push`",
		});
	}

	if (hasToPull) {
		nextSteps.push({
			action: "Pull remote models from Prismic: Run `prismic pull`",
		});
	}

	return nextSteps;
}

function buildSlicesNextSteps(
	statuses: TypeWithStatus[],
	missingComponents: string[],
	slicesReadyToConnect: string[],
	frameworkInfo: FrameworkInfo,
): NextStep[] {
	const nextSteps: NextStep[] = [];
	const docsPath = getDocsPath(frameworkInfo.framework);

	if (missingComponents.length > 0) {
		const docsRef = getDocsRef(docsPath, getWriteComponentsAnchor(frameworkInfo.framework));
		nextSteps.push({
			action: `Implement slice components: Run ${docsRef} and create each component file`,
		});
	}

	const hasToPull = statuses.some((t) => t.status === "to_pull");
	const hasToPush = statuses.some((t) => t.status === "to_push");

	if (hasToPull) {
		nextSteps.push({
			action: "Pull remote models from Prismic: Run `prismic pull`",
		});
	}

	// Slices should be connected to page types before pushing
	if (slicesReadyToConnect.length > 0) {
		const sorted = [...slicesReadyToConnect].sort();
		const sliceName = sorted[0];
		nextSteps.push({
			action: `Connect slice to page type: Run \`prismic page-type connect-slice <type-id> ${sliceName}\``,
		});
	}

	if (hasToPush) {
		nextSteps.push({
			action: "Push local models to Prismic: Run `prismic push`",
		});
	}

	return nextSteps;
}

function buildPreviewNextSteps(items: StatusItem[], frameworkInfo: FrameworkInfo): NextStep[] {
	const nextSteps: NextStep[] = [];
	const docsPath = getDocsPath(frameworkInfo.framework);

	// Check for missing /slice-simulator route
	const sliceSimRoute = items.find((i) => i.label === "/slice-simulator route" && !i.done);
	if (sliceSimRoute) {
		const docsRef = getDocsRef(docsPath, "#set-up-live-previewing");
		nextSteps.push({
			action: `Create /slice-simulator route: Run ${docsRef} and create the route file as shown`,
		});
	}

	// Check for missing simulator URL config
	const simulatorUrl = items.find((i) => i.label === "Slice simulator URL" && !i.done);
	if (simulatorUrl) {
		nextSteps.push({
			action: "Configure slice simulator URL: Run `prismic preview set-simulator`",
		});
	}

	// Check for missing preview endpoints (combine /api/preview and /api/exit-preview)
	const apiPreview = items.find((i) => i.label === "/api/preview endpoint" && !i.done);
	const exitPreview = items.find((i) => i.label === "/api/exit-preview endpoint" && !i.done);
	if (apiPreview || exitPreview) {
		const docsRef = getDocsRef(docsPath, getPreviewSetupAnchor(frameworkInfo.framework));
		nextSteps.push({
			action: `Create preview endpoints: Run ${docsRef} and create the endpoint files as shown`,
		});
	}

	// Check for missing preview environment
	const previewEnv = items.find((i) => i.label === "Preview environment" && !i.done);
	if (previewEnv) {
		nextSteps.push({
			action: "Add preview environment: Run `prismic preview add`",
		});
	}

	return nextSteps;
}

function buildDeploymentNextSteps(items: StatusItem[], frameworkInfo: FrameworkInfo): NextStep[] {
	const nextSteps: NextStep[] = [];
	const docsPath = getDocsPath(frameworkInfo.framework);

	// Check for missing /api/revalidate endpoint
	const revalidateEndpoint = items.find((i) => i.label === "/api/revalidate endpoint" && !i.done);
	if (revalidateEndpoint) {
		const docsRef = getDocsRef(docsPath, "#handle-content-changes");
		nextSteps.push({
			action: `Create /api/revalidate endpoint: Run ${docsRef} and create the endpoint as shown`,
		});
	}

	// Check for missing revalidation webhook
	const webhook = items.find((i) => i.label === "Revalidation webhook" && !i.done);
	if (webhook) {
		nextSteps.push({
			action: "Create revalidation webhook: Run `prismic webhook create`",
		});
	}

	return nextSteps;
}

export async function status(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "status"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const frameworkInfo = await detectFrameworkInfo();
	if (!frameworkInfo) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}

	// Gather all status data in parallel
	const [
		repoInfoResult,
		previewsResult,
		webhooksResult,
		localTypesResult,
		remoteTypesResult,
		localSlicesResult,
		remoteSlicesResult,
		installedDeps,
	] = await Promise.all([
		fetchRepositoryInfo(repo),
		fetchPreviews(repo),
		getWebhooks(repo),
		readLocalCustomTypes(),
		fetchRemoteCustomTypes(repo),
		readLocalSlices(),
		fetchRemoteSlices(repo),
		getInstalledDependencies(frameworkInfo),
	]);

	// Print repository header
	const repoUrl = await getRepoUrl(repo);
	console.info(`Repository: ${repo}`);
	console.info(`URL:        ${repoUrl.href}`);
	console.info("");

	const sections: StatusSection[] = [];

	// Setup section
	const setupSection = await buildSetupSection(frameworkInfo, installedDeps);
	setupSection.nextSteps = buildSetupNextSteps(setupSection.items, frameworkInfo);
	sections.push(setupSection);

	// Types sections (Page Types and Custom Types)
	if (localTypesResult.ok && remoteTypesResult.ok) {
		const { pageTypes, customTypes, pageTypeStatuses, customTypeStatuses } = buildTypeSections(
			localTypesResult.value,
			remoteTypesResult.value,
		);
		pageTypes.nextSteps = buildTypesNextSteps(pageTypeStatuses);
		customTypes.nextSteps = buildTypesNextSteps(customTypeStatuses);
		sections.push(pageTypes);
		sections.push(customTypes);
	}

	// Slices section
	if (localSlicesResult.ok && remoteSlicesResult.ok) {
		const {
			section: slicesSection,
			statuses,
			missingComponents,
			slicesReadyToConnect,
		} = await buildSlicesSection(
			localSlicesResult.value,
			remoteSlicesResult.value,
			frameworkInfo,
			localTypesResult.ok ? localTypesResult.value : [],
		);
		slicesSection.nextSteps = buildSlicesNextSteps(
			statuses,
			missingComponents,
			slicesReadyToConnect,
			frameworkInfo,
		);
		sections.push(slicesSection);
	}

	// Preview section
	const previewSection = await buildPreviewSection(
		frameworkInfo,
		previewsResult.ok ? previewsResult.value : undefined,
		repoInfoResult.ok ? repoInfoResult.value.simulator_url : undefined,
	);
	previewSection.nextSteps = buildPreviewNextSteps(previewSection.items, frameworkInfo);
	sections.push(previewSection);

	// Deployment section (Next.js only)
	if (frameworkInfo.framework === "next") {
		const deploymentSection = await buildDeploymentSection(
			frameworkInfo,
			webhooksResult.ok ? webhooksResult.value : [],
		);
		deploymentSection.nextSteps = buildDeploymentNextSteps(
			deploymentSection.items,
			frameworkInfo,
		);
		sections.push(deploymentSection);
	}

	// Print all sections
	for (const section of sections) {
		printSection(section);
	}
}

function printSection(section: StatusSection): void {
	const remaining = section.items.filter((item) => !item.done).length;
	const header = remaining > 0 ? `${section.title} (${remaining} remaining)` : section.title;
	console.info(header);

	// Group completed items together
	const completed = section.items.filter((item) => item.done);
	const incomplete = section.items.filter((item) => !item.done);

	// Print completed items on one line if there are multiple
	if (completed.length > 0) {
		if (completed.length === 1) {
			const item = completed[0];
			const hint = item.hint ? ` \u2014 ${item.hint}` : "";
			console.info(`  ${CHECK} ${item.label}${hint}`);
		} else {
			const labels = completed.map((item) => item.label).join(", ");
			const allSameHint = completed.every((item) => item.hint === completed[0].hint);
			const hint = allSameHint && completed[0].hint ? ` \u2014 ${completed[0].hint}` : "";
			console.info(`  ${CHECK} ${labels}${hint}`);
		}
	}

	// Print incomplete items individually
	for (const item of incomplete) {
		const hint = item.hint ? ` \u2014 ${item.hint}` : "";
		console.info(`  ${CIRCLE} ${item.label}${hint}`);
	}

	// Print next steps if there are any
	if (section.nextSteps && section.nextSteps.length > 0) {
		console.info("");
		console.info("  Next steps:");
		for (const step of section.nextSteps) {
			console.info(`  - ${step.action}`);
		}
	}

	console.info("");
}

// Repository Info (from /core/repository)
const RepositoryInfoSchema = v.object({
	simulator_url: v.optional(v.string()),
});
type RepositoryInfo = v.InferOutput<typeof RepositoryInfoSchema>;

async function fetchRepositoryInfo(
	repo: string,
): Promise<{ ok: true; value: RepositoryInfo } | { ok: false }> {
	const url = new URL("/core/repository", await getRepoUrl(repo));
	const result = await request(url, { schema: RepositoryInfoSchema });
	if (result.ok) {
		return { ok: true, value: result.value };
	}
	return { ok: false };
}

// Previews
const PreviewSchema = v.object({
	id: v.string(),
	label: v.string(),
	url: v.string(),
});
const PreviewsResponseSchema = v.object({
	results: v.array(PreviewSchema),
});
type Preview = v.InferOutput<typeof PreviewSchema>;

async function fetchPreviews(
	repo: string,
): Promise<{ ok: true; value: Preview[] } | { ok: false }> {
	const url = new URL("/core/repository/preview_configs", await getRepoUrl(repo));
	const result = await request(url, { schema: PreviewsResponseSchema });
	if (result.ok) {
		return { ok: true, value: result.value.results };
	}
	return { ok: false };
}

// Dependencies
const PackageJsonSchema = v.object({
	dependencies: v.optional(v.record(v.string(), v.string())),
	devDependencies: v.optional(v.record(v.string(), v.string())),
});

async function getInstalledDependencies(info: FrameworkInfo): Promise<Set<string>> {
	const packageJsonPath = new URL("package.json", info.projectRoot);
	try {
		const contents = await readFile(packageJsonPath, "utf8");
		const { dependencies = {}, devDependencies = {} } = v.parse(
			PackageJsonSchema,
			JSON.parse(contents),
		);
		return new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)]);
	} catch {
		return new Set();
	}
}

// Setup Section
async function buildSetupSection(
	info: FrameworkInfo,
	installedDeps: Set<string>,
): Promise<StatusSection> {
	const items: StatusItem[] = [];

	// Check required dependencies
	const requiredDeps = getRequiredDependencies(info.framework);
	for (const dep of requiredDeps) {
		items.push({
			done: installedDeps.has(dep),
			label: dep,
			hint: installedDeps.has(dep) ? "installed" : "not installed",
		});
	}

	// Check client file
	const clientFilePath = getClientFilePath(info);
	if (clientFilePath) {
		const clientFileExists = await exists(new URL(clientFilePath, info.projectRoot));
		items.push({
			done: clientFileExists,
			label: clientFilePath,
			hint: clientFileExists ? undefined : "create Prismic client file",
		});
	} else if (info.framework === "nuxt") {
		// Check nuxt.config.ts for prismic config
		const nuxtConfigExists = await checkNuxtPrismicConfig(info);
		items.push({
			done: nuxtConfigExists,
			label: "nuxt.config.ts",
			hint: nuxtConfigExists ? "prismic configured" : "add @nuxtjs/prismic to modules",
		});
	}

	return { title: "Setup", items };
}

async function checkNuxtPrismicConfig(info: FrameworkInfo): Promise<boolean> {
	const configPath = new URL("nuxt.config.ts", info.projectRoot);
	try {
		const contents = await readFile(configPath, "utf8");
		return contents.includes("@nuxtjs/prismic") || contents.includes("prismic:");
	} catch {
		return false;
	}
}

// Types Sections
type TypeStatus = "in_sync" | "to_push" | "to_pull";

type TypeWithStatus = {
	id: string;
	label: string;
	status: TypeStatus;
};

function computeTypeStatus<T extends { id: string }>(local: T[], remote: T[]): TypeWithStatus[] {
	const localById = new Map(local.map((item) => [item.id, item]));
	const remoteById = new Map(remote.map((item) => [item.id, item]));
	const result: TypeWithStatus[] = [];

	// Check local items
	for (const localItem of local) {
		const label = (localItem as { label?: string }).label || localItem.id;
		const remoteItem = remoteById.get(localItem.id);
		if (!remoteItem) {
			result.push({ id: localItem.id, label, status: "to_push" });
		} else if (JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
			result.push({ id: localItem.id, label, status: "to_push" });
		} else {
			result.push({ id: localItem.id, label, status: "in_sync" });
		}
	}

	// Check remote items not in local
	for (const remoteItem of remote) {
		if (!localById.has(remoteItem.id)) {
			const label = (remoteItem as { label?: string }).label || remoteItem.id;
			result.push({ id: remoteItem.id, label, status: "to_pull" });
		}
	}

	return result;
}

function buildTypeSections(
	localTypes: CustomType[],
	remoteTypes: CustomType[],
): {
	pageTypes: StatusSection;
	customTypes: StatusSection;
	pageTypeStatuses: TypeWithStatus[];
	customTypeStatuses: TypeWithStatus[];
} {
	const typeStatuses = computeTypeStatus(localTypes, remoteTypes);

	// Separate by format
	const pageTypeStatuses = typeStatuses.filter((t) => {
		const localType = localTypes.find((lt) => lt.id === t.id);
		const remoteType = remoteTypes.find((rt) => rt.id === t.id);
		const type = localType || remoteType;
		return type && (type as { format?: string }).format === "page";
	});

	const customTypeStatuses = typeStatuses.filter((t) => {
		const localType = localTypes.find((lt) => lt.id === t.id);
		const remoteType = remoteTypes.find((rt) => rt.id === t.id);
		const type = localType || remoteType;
		return !type || (type as { format?: string }).format !== "page";
	});

	const pageTypeItems: StatusItem[] = pageTypeStatuses.map((t) => ({
		done: t.status === "in_sync",
		label: t.label,
		hint: statusToHint(t.status),
	}));

	const customTypeItems: StatusItem[] = customTypeStatuses.map((t) => ({
		done: t.status === "in_sync",
		label: t.label,
		hint: statusToHint(t.status),
	}));

	return {
		pageTypes: { title: "Page Types", items: pageTypeItems },
		customTypes: { title: "Custom Types", items: customTypeItems },
		pageTypeStatuses,
		customTypeStatuses,
	};
}

function statusToHint(status: TypeStatus): string | undefined {
	switch (status) {
		case "in_sync":
			return "in sync";
		case "to_push":
			return "to push";
		case "to_pull":
			return "to pull";
	}
}

// Slices Section
function sliceHasFields(slice: SharedSlice): boolean {
	for (const variation of slice.variations) {
		const primaryFields = Object.keys(variation.primary ?? {});
		const itemFields = Object.keys(variation.items ?? {});
		if (primaryFields.length > 0 || itemFields.length > 0) {
			return true;
		}
	}
	return false;
}

function isSliceConnectedToAnyType(sliceId: string, localTypes: CustomType[]): boolean {
	for (const type of localTypes) {
		for (const tabFields of Object.values(type.json)) {
			for (const field of Object.values(tabFields as Record<string, unknown>)) {
				const typedField = field as {
					type?: string;
					config?: { choices?: Record<string, unknown> };
				};
				if (typedField.type === "Slices" && typedField.config?.choices?.[sliceId]) {
					return true;
				}
			}
		}
	}
	return false;
}

async function buildSlicesSection(
	localSlices: SharedSlice[],
	remoteSlices: SharedSlice[],
	info: FrameworkInfo,
	localTypes: CustomType[],
): Promise<{
	section: StatusSection;
	statuses: TypeWithStatus[];
	missingComponents: string[];
	slicesReadyToConnect: string[];
}> {
	const sliceStatuses = computeTypeStatus(localSlices, remoteSlices);
	const items: StatusItem[] = [];
	const missingComponents: string[] = [];
	const slicesReadyToConnect: string[] = [];

	const slicesDir = getSlicesDirectory(info);
	const extensions = getSliceComponentExtensions(info.framework);

	for (const slice of sliceStatuses) {
		const localSlice = localSlices.find((s) => s.id === slice.id);

		// Track slices that have fields but aren't connected to any type
		// These should be connected before pushing
		if (localSlice) {
			const hasFields = sliceHasFields(localSlice);
			const isConnected = isSliceConnectedToAnyType(slice.id, localTypes);

			if (hasFields && !isConnected) {
				slicesReadyToConnect.push(slice.label);
			}
		}

		// Check if component is implemented
		const componentExists = await checkSliceComponent(info, slicesDir, slice.id, extensions);

		if (slice.status === "in_sync" && componentExists) {
			items.push({
				done: true,
				label: slice.label,
				hint: "component implemented",
			});
		} else if (slice.status === "in_sync" && !componentExists) {
			items.push({
				done: false,
				label: slice.label,
				hint: "missing component",
			});
			missingComponents.push(slice.label);
		} else {
			items.push({
				done: false,
				label: slice.label,
				hint: statusToHint(slice.status),
			});
		}
	}

	return {
		section: { title: "Slices", items },
		statuses: sliceStatuses,
		missingComponents,
		slicesReadyToConnect,
	};
}

async function checkSliceComponent(
	info: FrameworkInfo,
	slicesDir: string,
	sliceId: string,
	extensions: string[],
): Promise<boolean> {
	// Convert slice ID to PascalCase for folder name
	const sliceName = pascalCase(sliceId);

	for (const ext of extensions) {
		const componentPath = new URL(`${slicesDir}${sliceName}/index${ext}`, info.projectRoot);
		if (await exists(componentPath)) {
			return true;
		}
	}
	return false;
}

function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}

// Preview Section
async function buildPreviewSection(
	info: FrameworkInfo,
	previews: Preview[] | undefined,
	simulatorUrl: string | undefined,
): Promise<StatusSection> {
	const items: StatusItem[] = [];

	// Check simulator URL configured
	items.push({
		done: Boolean(simulatorUrl),
		label: "Slice simulator URL",
		hint: simulatorUrl ? "configured" : "run `prismic preview set-simulator`",
	});

	// Check slice-simulator route
	const sliceSimRoute = getRoutePath(info, "/slice-simulator");
	if (sliceSimRoute) {
		const routeExists = await checkRouteExists(info, sliceSimRoute);
		items.push({
			done: routeExists,
			label: "/slice-simulator route",
			hint: routeExists ? undefined : "create route for Page Builder",
		});
	}

	// Check preview environment
	const hasPreviewEnv = previews && previews.length > 0;
	items.push({
		done: Boolean(hasPreviewEnv),
		label: "Preview environment",
		hint: hasPreviewEnv ? undefined : "run `prismic preview add`",
	});

	// Check /api/preview endpoint (skip for Nuxt - built-in)
	if (info.framework !== "nuxt") {
		const previewRoute = getRoutePath(info, "/api/preview");
		if (previewRoute) {
			const routeExists = await checkRouteExists(info, previewRoute);
			items.push({
				done: routeExists,
				label: "/api/preview endpoint",
				hint: routeExists ? undefined : "create preview endpoint",
			});
		}
	}

	// Check /api/exit-preview endpoint (Next.js only)
	if (info.framework === "next") {
		const exitPreviewRoute = getRoutePath(info, "/api/exit-preview");
		if (exitPreviewRoute) {
			const routeExists = await checkRouteExists(info, exitPreviewRoute);
			items.push({
				done: routeExists,
				label: "/api/exit-preview endpoint",
				hint: routeExists ? undefined : "create exit-preview endpoint",
			});
		}
	}

	return { title: "Preview", items };
}

async function checkRouteExists(
	info: FrameworkInfo,
	route: { path: string; extensions: string[] },
): Promise<boolean> {
	for (const ext of route.extensions) {
		const fullPath = new URL(`${route.path}${ext}`, info.projectRoot);
		if (await exists(fullPath)) {
			return true;
		}
	}
	return false;
}

// Deployment Section (Next.js only)
async function buildDeploymentSection(
	info: FrameworkInfo,
	webhooks: Array<{ config: { url: string; active: boolean } }>,
): Promise<StatusSection> {
	const items: StatusItem[] = [];

	// Check /api/revalidate endpoint
	const revalidateRoute = getRoutePath(info, "/api/revalidate");
	if (revalidateRoute) {
		const routeExists = await checkRouteExists(info, revalidateRoute);
		items.push({
			done: routeExists,
			label: "/api/revalidate endpoint",
			hint: routeExists ? undefined : "create for ISR",
		});
	}

	// Check revalidation webhook
	const hasRevalidationWebhook = webhooks.some(
		(w) => w.config.active && w.config.url.toLowerCase().includes("revalidate"),
	);
	items.push({
		done: hasRevalidationWebhook,
		label: "Revalidation webhook",
		hint: hasRevalidationWebhook ? "configured" : "run `prismic webhook create`",
	});

	return { title: "Deployment", items };
}
