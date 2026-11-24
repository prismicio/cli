import { text } from "node:stream/consumers";

import { getHost, getToken, onUnauthorized } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { callMcpTool, getMcpTools, McpError } from "../lib/prismic/client";

const config = {
	name: "prismic mcp call",
	description: `
		Call a Prismic MCP server tool and print its result.

		Load the tool's definition first with \`prismic mcp tools <name>\`, and
		pass input that matches its input schema.
	`,
	positionals: {
		name: { description: "Tool name", required: true },
	},
	options: {
		input: {
			type: "string",
			description: "Tool input as a JSON object, or - to read it from stdin",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { input = "{}" } = values;

	const json = input === "-" ? await text(process.stdin) : input;
	let args: unknown;
	try {
		args = JSON.parse(json);
	} catch {
		throw new CommandError("The input must be a JSON object.");
	}

	const mcpConfig = { getToken, host: await getHost(), onUnauthorized };
	let output: string;
	try {
		const result = await callMcpTool(name, args, mcpConfig);
		output = result.content
			.map((content) => (content.type === "text" ? content.text : JSON.stringify(content)))
			.join("\n");
		if (result.isError) throw new McpError(output);
	} catch (error) {
		if (!(error instanceof McpError) || !/-32602|Invalid arguments for tool/.test(error.message)) {
			throw error;
		}
		const tools = await getMcpTools(mcpConfig).catch(() => []);
		const tool = tools.find((tool) => tool.name === name);
		if (!tool) throw error;
		throw new McpError(
			`${error.message}\n\n${JSON.stringify({ ...tool, _meta: undefined })}\n\nFix the input to match this definition.`,
		);
	}
	console.info(output);
});
