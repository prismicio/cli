import { getHost, getToken, onUnauthorized } from "../auth";
import { detectAgent } from "../lib/ai";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getMcpTools } from "../lib/prismic/client";

const config = {
	name: "prismic mcp tools",
	description: `
		List the Prismic MCP server's tool names.

		With names, print each tool's definition, with its input JSON schema, as one
		JSON line. Load a tool's definition before you call it.
	`,
	positionals: {
		name: { description: "Tool names to load", required: false },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const host = await getHost();
	const tools = await getMcpTools({ getToken, host, onUnauthorized });
	// MCP Apps hide their UI-only tools from models.
	const modelTools = tools.filter((tool) => tool._meta?.ui?.visibility?.includes("model") ?? true);

	if (positionals.length === 0) {
		for (const tool of modelTools) console.info(tool.name);
		console.info(
			"Load a tool's definition before calling it: prismic mcp tools <name> [<name>...]",
		);
		if (detectAgent()) {
			console.warn("For future sessions, set up the Prismic MCP server: see `prismic mcp --help`.");
		}
		return;
	}

	const unknown = positionals.filter((name) => !modelTools.some((tool) => tool.name === name));
	if (unknown.length > 0) {
		const messages = unknown.map((name) => {
			const words = name.split("_").filter(Boolean);
			const matches = modelTools
				.map((tool) => ({
					name: tool.name,
					score: tool.name.split("_").filter((word) => words.some((part) => word.startsWith(part)))
						.length,
				}))
				.filter((match) => match.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, 5)
				.map((match) => match.name);
			return matches.length > 0
				? `Unknown tool: ${name}. Close matches: ${matches.join(", ")}`
				: `Unknown tool: ${name}`;
		});
		throw new CommandError(messages.join("\n"));
	}

	for (const name of positionals) {
		const tool = modelTools.find((tool) => tool.name === name);
		console.info(JSON.stringify({ ...tool, _meta: undefined }));
	}
});
