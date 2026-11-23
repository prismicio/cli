import { callTool, listTools, McpError, type McpTool, type McpToolResult } from "../mcp";
import {
	BadRequestError,
	ForbiddenRequestError,
	NetworkError,
	NotFoundRequestError,
	UnauthorizedRequestError,
	UnknownRequestError,
	USER_AGENT,
	type UnauthorizedHandler,
} from "../request";

type Config = {
	getToken: () => Promise<string | undefined>;
	host: string;
	onUnauthorized?: UnauthorizedHandler;
};

export async function getMcpTools(config: Config): Promise<McpTool[]> {
	return send((headers) => listTools(getMcpServiceUrl(config.host), { headers }), config);
}

export async function callMcpTool(
	name: string,
	args: unknown,
	config: Config,
): Promise<McpToolResult> {
	return send(
		(headers) => callTool(getMcpServiceUrl(config.host), name, args, { headers }),
		config,
	);
}

async function send<T>(
	call: (headers: Headers) => Promise<T>,
	config: Config,
	headers?: Headers,
): Promise<T> {
	const sent =
		headers ??
		new Headers({ Authorization: `Bearer ${await config.getToken()}`, "User-Agent": USER_AGENT });
	try {
		return await call(sent);
	} catch (error) {
		// fetch throws this when the server can't be reached: offline, DNS, refused connection.
		if (error instanceof TypeError && error.message === "fetch failed") {
			throw new NetworkError(error.message, { cause: error });
		}
		if (!(error instanceof McpError) || !error.response) throw error;

		const { response, body, status } = error;
		if (status === 401 || status === 403) {
			let retried = false;
			const result = await config.onUnauthorized?.((init) => {
				retried = true;
				const retryHeaders = new Headers(sent);
				new Headers(init?.headers).forEach((value, key) => retryHeaders.set(key, value));
				return send(call, { ...config, onUnauthorized: undefined }, retryHeaders);
			}, sent);
			if (retried) return result as T;
			if (status === 401) throw new UnauthorizedRequestError(response, body);
			throw new ForbiddenRequestError(response, body);
		}
		if (status === 404) throw new NotFoundRequestError(response, body);
		if (error.isRpcError) throw error;
		if (status === 400) throw new BadRequestError(response, body);
		throw new UnknownRequestError(response, body);
	}
}

function getMcpServiceUrl(host: string): URL {
	return new URL(`https://mcp.${host}/mcp`);
}
