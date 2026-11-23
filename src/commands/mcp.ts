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
	agents: `
		Set up the Prismic MCP server so the next sessions use its tools directly.
		Once it is set up, prefer it over \`prismic mcp call\`. The server loads in
		the next session. Until then, use \`prismic mcp\`.

		Server URL: https://mcp.prismic.io/mcp
		Transport: streamable HTTP
		Auth: OAuth with the user's Prismic account, through the client's MCP
		sign-in flow

		Adapt this to the client you run in:
		- Claude Code: run \`claude mcp add --transport http --scope user prismic https://mcp.prismic.io/mcp\`.
		  Then, in Claude Code, run \`/mcp\`, select prismic, then Authenticate.
		- Codex: run \`codex mcp add prismic --url https://mcp.prismic.io/mcp\`. It
		  opens a browser to sign in. If it was closed, run \`codex mcp login prismic\`.
		- Cursor: add {"mcpServers":{"Prismic":{"url":"https://mcp.prismic.io/mcp"}}}
		  to ~/.cursor/mcp.json, or to .cursor/mcp.json to share it with the project.
		  Then, in Cursor Settings > Tools & MCPs, click Prismic and authorize it.
		- Other clients: add a remote MCP server with the URL above.
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
