import { request } from "../lib/request";

export async function activateMCP(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<void> {
	const { repo, token, host } = config;
	const url = new URL("./activation", getMCPServiceUrl(host));
	url.searchParams.set("repository", repo);
	await request(url, {
		method: "POST",
		credentials: { "prismic-auth": token },
	});
}

function getMCPServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/mcp/`);
}
