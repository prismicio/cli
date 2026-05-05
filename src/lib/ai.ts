import { exists } from "./file";

export async function detectAgent(): Promise<string | undefined> {
	if (process.env.AI_AGENT) return process.env.AI_AGENT.toLowerCase();

	if (process.env.CLAUDE_CODE_IS_COWORK === "1" || process.env.CLAUDE_CODE_IS_COWORK === "true")
		return "claude-cowork";
	if (process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE) return "claude-code";
	if (process.env.CODEX_CI === "1" || process.env.CODEX_SANDBOX || process.env.CODEX_THREAD_ID)
		return "codex";
	if (process.env.CURSOR_AGENT === "1" || process.env.CURSOR_EXTENSION_HOST_ROLE === "agent-exec")
		return "cursor";
	if (process.env.CLINE_ACTIVE === "true") return "cline";
	if (process.env.ANTIGRAVITY_AGENT) return "antigravity";
	if (process.env.AUGMENT_AGENT === "1") return "augment";
	if (process.env.OPENCODE_CLIENT === "1") return "opencode";
	if (process.env.GEMINI_CLI === "1") return "gemini-cli";
	if (process.env.TRAE_AI_SHELL_ID) return "trae";
	if (process.env.REPL_ID) return "replit";
	if (
		process.env.COPILOT_MODEL ||
		process.env.COPILOT_ALLOW_ALL ||
		process.env.COPILOT_GITHUB_TOKEN
	)
		return "github-copilot";

	const agent = process.env.AGENT?.toLowerCase();
	if (agent === "goose" || agent === "amp") return agent;

	if (process.platform === "linux") {
		const isDevin = await exists(new URL("file:///opt/.devin"));
		if (isDevin) return "devin";
	}

	if (process.env.IS_SANDBOX === "yes") return "unknown-sandbox";
}
