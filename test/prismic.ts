const DEFAULT_HOST = "prismic.io";

type HostConfig = { host?: string };
type AuthConfig = { token: string; host?: string };
type RepoConfig = { repo: string; token: string; host?: string };

export async function login(email: string, password: string, config?: HostConfig): Promise<string> {
	const host = config?.host ?? DEFAULT_HOST;
	const url = new URL("login", `https://auth.${host}/`);
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
	return await res.text();
}

export async function createRepository(domain: string, config: AuthConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("app/dashboard/repositories", `https://${host}/`);
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Cookie: `prismic-auth=${config.token}`,
		},
		body: JSON.stringify({ domain, framework: "nextjs", plan: "personal" }),
	});
	if (!res.ok)
		throw new Error(`Failed to create repository ${domain}: ${res.status} ${await res.text()}`);
}

export async function deleteRepository(
	domain: string,
	config: AuthConfig & { password: string },
): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("app/settings/delete", `https://${domain}.${host}/`);
	const headers = { "Content-Type": "application/json", Cookie: `prismic-auth=${config.token}` };
	const body = JSON.stringify({ confirm: domain, password: config.password });
	const res = await fetch(url, { method: "POST", headers, body });
	if (!res.ok) {
		// Sometimes deletion returns 500 but actually succeeds — retry once
		const retry = await fetch(url, { method: "POST", headers, body });
		if (!retry.ok) throw new Error(`Failed to delete repository ${domain}`);
	}
}

export async function insertCustomType(customType: object, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("customtypes/insert", `https://customtypes.${host}/`);
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.token}`,
			repository: config.repo,
		},
		body: JSON.stringify(customType),
	});
	if (!res.ok) throw new Error(`Failed to insert custom type: ${res.status} ${await res.text()}`);
}

export async function deleteCustomType(customTypeId: string, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL(`customtypes/${customTypeId}`, `https://customtypes.${host}/`);
	const res = await fetch(url, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${config.token}`,
			repository: config.repo,
		},
	});
	if (!res.ok) throw new Error(`Failed to delete custom type: ${res.status} ${await res.text()}`);
}

export async function insertSlice(slice: object, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("slices/insert", `https://customtypes.${host}/`);
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.token}`,
			repository: config.repo,
		},
		body: JSON.stringify(slice),
	});
	if (!res.ok) throw new Error(`Failed to insert slice: ${res.status} ${await res.text()}`);
}

export async function deleteSlice(sliceId: string, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL(`slices/${sliceId}`, `https://customtypes.${host}/`);
	const res = await fetch(url, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${config.token}`,
			repository: config.repo,
		},
	});
	if (!res.ok) throw new Error(`Failed to delete slice: ${res.status} ${await res.text()}`);
}

export async function getWebhooks(
	config: RepoConfig,
): Promise<{ config: Record<string, unknown> }[]> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("app/settings/webhooks", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok) throw new Error(`Failed to get webhooks: ${res.status} ${await res.text()}`);
	return await res.json();
}

export async function createWebhook(webhookUrl: string, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("app/settings/webhooks/create", `https://${config.repo}.${host}/`);
	const body = new FormData();
	body.set("url", webhookUrl);
	body.set("name", "");
	body.set("secret", "");
	body.set("headers", JSON.stringify({}));
	body.set("active", "on");
	body.set("documentsPublished", "true");
	body.set("documentsUnpublished", "true");
	body.set("releasesCreated", "true");
	body.set("releasesUpdated", "true");
	body.set("tagsCreated", "true");
	body.set("tagsDeleted", "true");
	const res = await fetch(url, {
		method: "POST",
		headers: { Cookie: `prismic-auth=${config.token}` },
		body,
	});
	if (!res.ok) throw new Error(`Failed to create webhook: ${res.status} ${await res.text()}`);
}

export async function getPreviews(
	config: RepoConfig,
): Promise<{ id: string; label: string; url: string }[]> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("core/repository/preview_configs", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok) throw new Error(`Failed to get previews: ${res.status} ${await res.text()}`);
	const data = await res.json();
	return data.results;
}

export async function addPreview(
	previewUrl: string,
	name: string,
	config: RepoConfig,
): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const parsed = new URL(previewUrl);
	const websiteURL = `${parsed.protocol}//${parsed.host}`;
	const resolverPath = parsed.pathname === "/" ? undefined : parsed.pathname;
	const url = new URL("previews/new", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Cookie: `prismic-auth=${config.token}`,
		},
		body: JSON.stringify({ name, websiteURL, resolverPath }),
	});
	if (!res.ok) throw new Error(`Failed to add preview: ${res.status} ${await res.text()}`);
}

export async function getLocales(
	config: RepoConfig,
): Promise<{ id: string; label: string; customName: string | null; isMaster: boolean }[]> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("locale/repository/locales", `https://api.internal.${host}/`);
	url.searchParams.set("repository", config.repo);
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${config.token}` },
	});
	if (!res.ok) throw new Error(`Failed to get locales: ${res.status} ${await res.text()}`);
	const data = await res.json();
	return data.results;
}

export async function upsertLocale(
	code: string,
	config: RepoConfig & { isMaster?: boolean },
): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("locale/repository/locales", `https://api.internal.${host}/`);
	url.searchParams.set("repository", config.repo);
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.token}`,
		},
		body: JSON.stringify({ id: code, isMaster: config.isMaster ?? false }),
	});
	if (!res.ok) throw new Error(`Failed to add locale ${code}: ${res.status} ${await res.text()}`);
}

export async function removeLocale(code: string, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL(
		`locale/repository/locales/${encodeURIComponent(code)}`,
		`https://api.internal.${host}/`,
	);
	url.searchParams.set("repository", config.repo);
	const res = await fetch(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${config.token}` },
	});
	if (!res.ok && res.status !== 404)
		throw new Error(`Failed to remove locale ${code}: ${res.status} ${await res.text()}`);
}

export async function resetLocales(config: RepoConfig): Promise<void> {
	await upsertLocale("en-us", { isMaster: true, ...config });
	const locales = await getLocales(config);
	for (const locale of locales) {
		if (locale.isMaster) continue;
		await removeLocale(locale.id, config);
	}
}

export async function getAccessTokens(
	config: RepoConfig,
): Promise<
	{ id: string; name: string; wroom_auths: { id: string; token: string; scope: string }[] }[]
> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("settings/security/contentapi", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok) throw new Error(`Failed to get access tokens: ${res.status} ${await res.text()}`);
	return await res.json();
}

export async function createAccessToken(
	config: RepoConfig,
): Promise<{ appId: string; authId: string; token: string }> {
	const host = config.host ?? DEFAULT_HOST;
	const baseUrl = `https://${config.repo}.${host}/`;
	const headers = { "Content-Type": "application/json", Cookie: `prismic-auth=${config.token}` };

	// Find or create an OAuth app for tests.
	const apps = await getAccessTokens(config);
	let app = apps.find((a) => a.name === "Prismic CLI Test");
	if (!app) {
		const createUrl = new URL("settings/security/oauthapp", baseUrl);
		const res = await fetch(createUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({ app_name: "Prismic CLI Test" }),
		});
		if (!res.ok) throw new Error(`Failed to create OAuth app: ${res.status} ${await res.text()}`);
		app = await res.json();
	}

	// Create an authorization on that app.
	const authUrl = new URL("settings/security/authorizations", baseUrl);
	const res = await fetch(authUrl, {
		method: "POST",
		headers,
		body: JSON.stringify({ app: app!.id, scope: "master" }),
	});
	if (!res.ok) throw new Error(`Failed to create access token: ${res.status} ${await res.text()}`);
	const auth = await res.json();
	return { appId: app!.id, authId: auth.id, token: auth.token };
}

export async function deleteAccessToken(authId: string, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL(
		`settings/security/authorizations/${authId}`,
		`https://${config.repo}.${host}/`,
	);
	const res = await fetch(url, {
		method: "DELETE",
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok && res.status !== 404)
		throw new Error(`Failed to delete access token: ${res.status} ${await res.text()}`);
}

export async function getWriteTokens(
	config: RepoConfig,
): Promise<{ tokens: { app_name: string; token: string; timestamp: number }[] }> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("settings/security/customtypesapi", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok) throw new Error(`Failed to get write tokens: ${res.status} ${await res.text()}`);
	return await res.json();
}

export async function createWriteToken(config: RepoConfig): Promise<{ token: string }> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("settings/security/token", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: `prismic-auth=${config.token}` },
		body: JSON.stringify({ app_name: "Prismic CLI Test" }),
	});
	if (!res.ok) throw new Error(`Failed to create write token: ${res.status} ${await res.text()}`);
	const data = await res.json();
	return { token: data.token };
}

export async function deleteWriteToken(tokenValue: string, config: RepoConfig): Promise<void> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL(`settings/security/token/${tokenValue}`, `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		method: "DELETE",
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok && res.status !== 404)
		throw new Error(`Failed to delete write token: ${res.status} ${await res.text()}`);
}

export async function getRepository(config: RepoConfig): Promise<{ simulator_url?: string }> {
	const host = config.host ?? DEFAULT_HOST;
	const url = new URL("core/repository", `https://${config.repo}.${host}/`);
	const res = await fetch(url, {
		headers: { Cookie: `prismic-auth=${config.token}` },
	});
	if (!res.ok) throw new Error(`Failed to get repository: ${res.status} ${await res.text()}`);
	return await res.json();
}
