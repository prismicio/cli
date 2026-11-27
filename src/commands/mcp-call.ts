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
		"user-confirmed": {
			type: "boolean",
			description: "Confirm that the user approved this call",
		},
	},
} satisfies CommandConfig;

// The server's destructiveHint also flags routine staged edits, so only gate live or irreversible changes.
const TOOLS_REQUIRING_CONFIRMATION = [
	"publish_release",
	"app_confirm_publish_release",
	"delete_releases",
	"archive_documents",
];

export default createCommand(config, async ({ positionals, values }) => {
	const [name, ...extra] = positionals;
	if (extra.length > 0) throw new CommandError("Pass the tool input with --input.");
	const { input = "{}" } = values;
	if (TOOLS_REQUIRING_CONFIRMATION.includes(name) && !values["user-confirmed"]) {
		throw new CommandError(
			`${name} changes the live site or can't be undone. Ask the user to confirm, then rerun with --user-confirmed.`,
		);
	}

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
