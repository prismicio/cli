import { request } from "../../request";

export async function activateMCP(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<void> {
	const url = new URL("activation", `https://api.internal.${config.host}/mcp/`);
	url.searchParams.set("repository", config.repo);
	await request(url, { method: "POST", credentials: { "prismic-auth": config.token } });
}
