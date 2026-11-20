import { createCommandRouter } from "../lib/command";
import mcpToken from "./mcp-token";

export default createCommandRouter({
	name: "prismic mcp",
	description: `
		Connect an agent to the Prismic MCP server with your CLI login.

		Run \`prismic docs view mcp#connect-with-the-prismic-cli\` for details.
	`,
	agents: `
		Connect the Prismic MCP server only if none is connected. Check:
		  1. Your own tools. A tool from a server at mcp.prismic.io, including an
		     account-level connector with no local config, means it's connected.
		  2. Claude Code: \`claude mcp list\`.
		  3. Codex: \`codex mcp list\`.
		  4. Cursor: ~/.cursor/mcp.json and .cursor/mcp.json.
		  5. VS Code: .vscode/mcp.json and the mcp.json in the user profile.
		If one is connected, or you can't tell, add nothing and use the CLI.

		Otherwise, add a project server named prismic at https://mcp.prismic.io/mcp.
		In Claude Code, run:
		  claude mcp add-json --scope project prismic '{"type":"http","url":"https://mcp.prismic.io/mcp","headersHelper":"npx prismic mcp token"}'
		In a client without a header command, such as Cursor, set the header that
		\`prismic mcp token\` prints, and set it again after a 401. Keep a file that
		holds the token out of git.
	`,
	commands: {
		token: {
			handler: mcpToken,
			description: "Print an Authorization header for the Prismic MCP server",
		},
	},
});
