import * as z from "zod/mini";

type McpOptions = Omit<RequestInit, "method" | "body">;

const McpToolSchema = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	inputSchema: z.unknown(),
	_meta: z.optional(
		z.object({ ui: z.optional(z.object({ visibility: z.optional(z.array(z.string())) })) }),
	),
});
export type McpTool = z.infer<typeof McpToolSchema>;

const McpToolResultSchema = z.object({
	content: z.array(z.object({ type: z.string(), text: z.optional(z.string()) })),
	isError: z.optional(z.boolean()),
});
export type McpToolResult = z.infer<typeof McpToolResultSchema>;

export async function listTools(url: URL, options: McpOptions = {}): Promise<McpTool[]> {
	const { tools } = await send(
		url,
		"tools/list",
		{},
		z.object({ tools: z.array(McpToolSchema) }),
		options,
	);
	return tools;
}

export async function callTool(
	url: URL,
	name: string,
	args: unknown,
	options: McpOptions = {},
): Promise<McpToolResult> {
	return send(url, "tools/call", { name, arguments: args }, McpToolResultSchema, options);
}

const McpMessageSchema = z.object({
	result: z.unknown(),
	error: z.optional(z.object({ message: z.string() })),
});

async function send<T>(
	url: URL,
	method: string,
	params: unknown,
	schema: z.ZodMiniType<T>,
	options: McpOptions,
): Promise<T> {
	const headers = new Headers(options.headers);
	// MCP servers reject requests that don't accept both.
	headers.set("Accept", "application/json, text/event-stream");
	headers.set("Content-Type", "application/json");

	const response = await fetch(url, {
		...options,
		method: "POST",
		headers,
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});

	const text = await response.text();
	let body: unknown;
	try {
		body = text ? JSON.parse(text) : undefined;
	} catch {
		body = text;
	}

	if (!response.ok) {
		const error = z.safeParse(McpMessageSchema, body).data?.error;
		throw new McpError(error?.message ?? `${response.status} ${response.statusText}`, {
			response,
			body,
			isRpcError: Boolean(error),
		});
	}
	const message = z.parse(McpMessageSchema, body);
	if (message.error) throw new McpError(message.error.message, { isRpcError: true });
	return z.parse(schema, message.result);
}

export class McpError extends Error {
	name = "McpError";
	response?: Response;
	body?: unknown;
	isRpcError: boolean;

	constructor(
		message: string,
		options: { response?: Response; body?: unknown; isRpcError?: boolean } = {},
	) {
		super(message);
		this.response = options.response;
		this.body = options.body;
		this.isRpcError = options.isRpcError ?? false;
	}

	get status(): number | undefined {
		return this.response?.status;
	}
}
