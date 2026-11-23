import { createCommandRouter } from "../lib/command";
import mcpCall from "./mcp-call";
import mcpTools from "./mcp-tools";

export default createCommandRouter({
	name: "prismic mcp",
	description: `
		Use the Prismic MCP server's tools with your CLI login.

		For coding agents that don't have the Prismic MCP server configured. If it
		is configured, use it instead.
	`,
	commands: {
		tools: {
			handler: mcpTools,
			description: "List MCP tools or view one",
		},
		call: {
			handler: mcpCall,
			description: "Call an MCP tool",
		},
	},
});
