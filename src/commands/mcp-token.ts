import { getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic mcp token",
	description: `
		Print an Authorization header for the Prismic MCP server, as JSON. It uses
		your CLI login and renews it when needed.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const token = await getToken();
	if (!token) throw new CommandError("Not logged in. Run `prismic login` first.");
	console.info(JSON.stringify({ Authorization: `Bearer ${token}` }));
});
