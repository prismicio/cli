import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

export class HelpRequested extends Error {
	constructor(helpText: string) {
		super(helpText);
		this.name = "HelpRequested";
	}
}

export class CommandError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CommandError";
	}
}

// Build the full parseArgs config type with help injected.
type FullParseArgsConfig<O extends ParseArgsOptionsConfig, P extends boolean> = {
	args: string[];
	options: O & { help: { type: "boolean"; short: "h" } };
	allowPositionals: P;
	strict: true;
};

// Extract the return type of parseArgs for a given config, then strip `help`.
type ParseCommandResult<O extends ParseArgsOptionsConfig, P extends boolean> = {
	values: Omit<ReturnType<typeof parseArgs<FullParseArgsConfig<O, P>>>["values"], "help">;
	positionals: ReturnType<typeof parseArgs<FullParseArgsConfig<O, P>>>["positionals"];
};

export function parseCommand<
	const O extends ParseArgsOptionsConfig,
	const P extends boolean = false,
>(config: {
	help: string;
	argv: string[];
	options?: O;
	allowPositionals?: P;
}): ParseCommandResult<O, P> {
	const fullOptions = {
		...config.options,
		help: { type: "boolean" as const, short: "h" as const },
	};

	const result = parseArgs({
		args: config.argv,
		options: fullOptions,
		allowPositionals: (config.allowPositionals ?? false) as P,
		strict: true as const,
	});

	if (result.values.help) {
		throw new HelpRequested(config.help);
	}

	const { help: _, ...rest } = result.values;
	return { values: rest, positionals: result.positionals } as ParseCommandResult<O, P>;
}

export function defineRouter(config: {
	help: string;
	argv: string[];
	commands: Record<string, () => Promise<void>>;
}): () => Promise<void> {
	return async () => {
		const {
			positionals: [subcommand],
		} = parseArgs({
			args: config.argv,
			options: { help: { type: "boolean", short: "h" } },
			allowPositionals: true,
			strict: false,
		});

		const handler = subcommand ? config.commands[subcommand] : undefined;
		if (handler) {
			await handler();
			return;
		}

		if (subcommand) {
			console.error(`Unknown command: ${subcommand}\n`);
			process.exitCode = 1;
		}
		console.info(config.help);
	};
}
