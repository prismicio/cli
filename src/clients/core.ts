import * as z from "zod/mini";

import { NotFoundRequestError, request } from "../lib/request";

const PreviewSchema = z.object({
	id: z.string(),
	label: z.string(),
	url: z.string(),
});

const GetPreviewsResponseSchema = z.object({
	results: z.array(PreviewSchema),
});

export type Preview = z.infer<typeof PreviewSchema>;

export async function getPreviews(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Preview[]> {
	const { repo, token, host } = config;
	const url = new URL("core/repository/preview_configs", getCoreBaseUrl(repo, host));
	try {
		const response = await request(url, {
			credentials: { "prismic-auth": token },
			schema: GetPreviewsResponseSchema,
		});
		return response.results;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

export async function addPreview(
	previewConfig: {
		name: string;
		websiteURL: string;
		resolverPath: string | undefined;
	},
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const url = new URL("previews/new", getCoreBaseUrl(repo, host));
	try {
		await request(url, {
			method: "POST",
			body: {
				name: previewConfig.name,
				websiteURL: previewConfig.websiteURL,
				resolverPath: previewConfig.resolverPath,
			},
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

export async function removePreview(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const url = new URL(`previews/delete/${id}`, getCoreBaseUrl(repo, host));
	try {
		await request(url, {
			method: "POST",
			body: {},
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = "Preview not found";
		}
		throw error;
	}
}

const RepositoryResponseSchema = z.object({
	simulator_url: z.optional(z.string()),
});

export async function getSimulatorUrl(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<string | undefined> {
	const { repo, token, host } = config;
	const url = new URL("core/repository", getCoreBaseUrl(repo, host));
	try {
		const response = await request(url, {
			credentials: { "prismic-auth": token },
			schema: RepositoryResponseSchema,
		});
		return response.simulator_url;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

export async function setSimulatorUrl(
	simulatorUrl: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const url = new URL("core/repository", getCoreBaseUrl(repo, host));
	try {
		await request(url, {
			method: "PATCH",
			body: { simulator_url: simulatorUrl },
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

function getCoreBaseUrl(repo: string, host: string): URL {
	return new URL(`https://${repo}.${host}/`);
}
