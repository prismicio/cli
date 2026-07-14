import { request, type RequestOptions } from "../../request";

type MCPConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

export async function activateMCP(config: MCPConfig): Promise<void> {
	const url = new URL("activation", getMcpServiceUrl(config.host));
	await mcpServiceRequest(url, config, { method: "POST" });
}

function mcpServiceRequest<T>(
	url: URL,
	config: MCPConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return request(scopedUrl, {
		credentials: { "prismic-auth": config.token },
		...options,
	});
}

function getMcpServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/mcp/`);
}
