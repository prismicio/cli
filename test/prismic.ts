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
