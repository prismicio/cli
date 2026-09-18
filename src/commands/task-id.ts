import { createCommand } from "../lib/command";
import { mintTaskId } from "../tracking";

export default createCommand(
	{
		name: "prismic task-id",
		description: `
			Print a task ID for --task-id.

			One ID covers one user request: pass it on every command for that request,
			and run this again when the user asks for something else.
		`,
	},
	async () => {
		console.info(mintTaskId());
	},
);
