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

Includes a "Next:" step showing the most important action to take based on
project state.

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

type StatusSection = {
	title: string;
	items: StatusItem[];
};

type NextStep = {
	message: string;
};

function getDocsUrl(framework: Framework | undefined): string {
	switch (framework) {
		case "next":
			return "https://prismic.io/docs/nextjs/with-cli";
		case "nuxt":
			return "https://prismic.io/docs/nuxt/with-cli";
		case "sveltekit":
			return "https://prismic.io/docs/sveltekit/with-cli";
		default:
			return "https://prismic.io/docs";
	}
}

function computeNextStep(
	sections: StatusSection[],
	frameworkInfo: FrameworkInfo,
	typeStatuses: TypeWithStatus[],
	sliceStatuses: TypeWithStatus[],
	slicesWithMissingComponents: string[],
): NextStep | undefined {
	const docsUrl = getDocsUrl(frameworkInfo.framework);

	// 1. Setup - missing dependencies
	const setupSection = sections.find((s) => s.title === "Setup");
	const missingDeps = setupSection?.items.filter((i) => !i.done && i.hint === "not installed");
	if (missingDeps && missingDeps.length > 0) {
		const depsList = missingDeps.map((d) => d.label).join(" ");
		return { message: `Install Prismic packages with 'npm install ${depsList}'` };
	}

	// 2. Setup - missing client file
	const missingClientFile = setupSection?.items.find((i) => !i.done && i.hint?.includes("client"));
	if (missingClientFile) {
		return { message: `Create a ${missingClientFile.label} file (see ${docsUrl})` };
	}

	// 3-7. Preview section (in order: local files, then remote config)
	const previewSection = sections.find((s) => s.title === "Preview");
	if (previewSection) {
		// Local files first
		const sliceSimRoute = previewSection.items.find(
			(i) => i.label === "/slice-simulator route" && !i.done,
		);
		if (sliceSimRoute) {
			return { message: `Create the /slice-simulator route (see ${docsUrl})` };
		}

		const apiPreview = previewSection.items.find(
			(i) => i.label === "/api/preview endpoint" && !i.done,
		);
		if (apiPreview) {
			return { message: `Create the /api/preview route (see ${docsUrl})` };
		}

		const exitPreview = previewSection.items.find(
			(i) => i.label === "/api/exit-preview endpoint" && !i.done,
		);
		if (exitPreview) {
			return { message: `Create the /api/exit-preview route (see ${docsUrl})` };
		}

		// Remote config
		const simulatorUrl = previewSection.items.find(
			(i) => i.label === "Slice simulator URL" && !i.done,
		);
		if (simulatorUrl) {
			return { message: `Configure the slice simulator URL with 'prismic preview set-simulator'` };
		}

		const previewEnv = previewSection.items.find(
			(i) => i.label === "Preview environment" && !i.done,
		);
		if (previewEnv) {
			return { message: `Add a preview environment with 'prismic preview add'` };
		}
	}

	// 8. Models to pull
	const hasToPull =
		typeStatuses.some((t) => t.status === "to_pull") ||
		sliceStatuses.some((s) => s.status === "to_pull");
	if (hasToPull) {
		return { message: `Pull remote models with 'prismic pull'` };
	}

	// 9. Models to push
	const hasToPush =
		typeStatuses.some((t) => t.status === "to_push") ||
		sliceStatuses.some((s) => s.status === "to_push");
	if (hasToPush) {
		return { message: `Push local models with 'prismic push'` };
	}

	// 10. Slice components to implement (first alphabetically)
	if (slicesWithMissingComponents.length > 0) {
		const sorted = [...slicesWithMissingComponents].sort();
		const sliceName = sorted[0];
		const slicesDir = getSlicesDirectory(frameworkInfo);
		const ext = getSliceComponentExtensions(frameworkInfo.framework)[0];
		const path = `${slicesDir}${sliceName}/index${ext}`;
		return { message: `Implement the ${sliceName} slice component at ${path} (see ${docsUrl})` };
	}

	// 11-12. Deployment (Next.js only)
	const deploymentSection = sections.find((s) => s.title === "Deployment");
	if (deploymentSection) {
		const revalidateEndpoint = deploymentSection.items.find(
			(i) => i.label === "/api/revalidate endpoint" && !i.done,
		);
		if (revalidateEndpoint) {
			return { message: `Create the /api/revalidate route for ISR (see ${docsUrl})` };
		}

		const webhook = deploymentSection.items.find(
			(i) => i.label === "Revalidation webhook" && !i.done,
		);
		if (webhook) {
			return { message: `Create a revalidation webhook with 'prismic webhook create'` };
		}
	}

	// All complete
	return undefined;
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

	// Track statuses for next step computation
	let typeStatuses: TypeWithStatus[] = [];
	let sliceStatuses: TypeWithStatus[] = [];
	let slicesWithMissingComponents: string[] = [];

	// Setup section
	const setupSection = await buildSetupSection(frameworkInfo, installedDeps);
	sections.push(setupSection);

	// Types sections (Page Types and Custom Types)
	if (localTypesResult.ok && remoteTypesResult.ok) {
		const { pageTypes, customTypes, allTypeStatuses } = buildTypeSections(
			localTypesResult.value,
			remoteTypesResult.value,
		);
		sections.push(pageTypes);
		sections.push(customTypes);
		typeStatuses = allTypeStatuses;
	}

	// Slices section
	if (localSlicesResult.ok && remoteSlicesResult.ok) {
		const {
			section: slicesSection,
			statuses,
			missingComponents,
		} = await buildSlicesSection(localSlicesResult.value, remoteSlicesResult.value, frameworkInfo);
		sections.push(slicesSection);
		sliceStatuses = statuses;
		slicesWithMissingComponents = missingComponents;
	}

	// Preview section
	const previewSection = await buildPreviewSection(
		frameworkInfo,
		previewsResult.ok ? previewsResult.value : undefined,
		repoInfoResult.ok ? repoInfoResult.value.simulator_url : undefined,
	);
	sections.push(previewSection);

	// Deployment section (Next.js only)
	if (frameworkInfo.framework === "next") {
		const deploymentSection = await buildDeploymentSection(
			frameworkInfo,
			webhooksResult.ok ? webhooksResult.value : [],
		);
		sections.push(deploymentSection);
	}

	// Print all sections
	for (const section of sections) {
		printSection(section);
	}

	// Print next step
	const nextStep = computeNextStep(
		sections,
		frameworkInfo,
		typeStatuses,
		sliceStatuses,
		slicesWithMissingComponents,
	);
	if (nextStep) {
		console.info(`Next: ${nextStep.message}`);
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
): { pageTypes: StatusSection; customTypes: StatusSection; allTypeStatuses: TypeWithStatus[] } {
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
		allTypeStatuses: typeStatuses,
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
async function buildSlicesSection(
	localSlices: SharedSlice[],
	remoteSlices: SharedSlice[],
	info: FrameworkInfo,
): Promise<{
	section: StatusSection;
	statuses: TypeWithStatus[];
	missingComponents: string[];
}> {
	const sliceStatuses = computeTypeStatus(localSlices, remoteSlices);
	const items: StatusItem[] = [];
	const missingComponents: string[] = [];

	const slicesDir = getSlicesDirectory(info);
	const extensions = getSliceComponentExtensions(info.framework);

	for (const slice of sliceStatuses) {
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
