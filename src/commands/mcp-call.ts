import { text } from "node:stream/consumers";

import { getHost, getToken, onUnauthorized } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { McpError } from "../lib/mcp";
import { callMcpTool } from "../lib/prismic/mcp";

const config = {
	name: "prismic mcp call",
	description: `
		Call a Prismic MCP server tool and print its result.

		Run \`prismic mcp tools <name>\` to see the tool's input schema.
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

	let args: unknown;
	try {
		args = JSON.parse(input === "-" ? await text(process.stdin) : input);
	} catch {
		throw new CommandError("The input must be a JSON object.");
	}

	const host = await getHost();
	const result = await callMcpTool(name, args, { getToken, host, onUnauthorized });
	const output = result.content.flatMap((content) => content.text ?? []).join("\n");

	if (result.isError) throw new McpError(output);
	console.info(output);
});
