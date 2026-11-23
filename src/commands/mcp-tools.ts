import { getHost, getToken, onUnauthorized } from "../auth";
import { detectAgent } from "../lib/ai";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getMcpTools } from "../lib/prismic/mcp";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic mcp tools",
	description: `
		List the Prismic MCP server's tools.

		With a name argument, print the tool's description and input JSON schema.
	`,
	positionals: {
		name: { description: "Tool name", required: false },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [name] = positionals;

	const host = await getHost();
	const tools = await getMcpTools({ getToken, host, onUnauthorized });
	// MCP Apps hide their UI-only tools from models.
	const modelTools = tools.filter((tool) => tool._meta?.ui?.visibility?.includes("model") ?? true);

	if (!name) {
		const rows = modelTools.map((tool) => [
			tool.name,
			tool.description?.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? "",
		]);
		console.info(formatTable(rows, { headers: ["NAME", "DESCRIPTION"] }));
		if (detectAgent()) {
			console.warn("For future sessions, set up the Prismic MCP server: see `prismic mcp --help`.");
		}
		return;
	}

	const tool = modelTools.find((tool) => tool.name === name);
	if (!tool) throw new CommandError(`Unknown tool: ${name}`);
	console.info(tool.description ?? "");
	console.info();
	console.info(stringify(tool.inputSchema));
});
