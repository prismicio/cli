import type { ParseArgsOptionDescriptor } from "node:util";

import { parseArgs } from "node:util";

import { detectAgent } from "./ai";
import { dedent, formatTable } from "./string";

export type CommandConfig = {
	name: string;
	description: string;
	sections?: Record<string, string>;
	positionals?: Record<string, { description: string; required?: boolean }>;
	options?: Record<
		string,
		ParseArgsOptionDescriptor & {
			description: string;
			required?: boolean;
			dependsOn?: string | string[];
			deprecated?: string;
			hidden?: boolean;
		}
	>;
};

const isAgent = detectAgent() !== undefined;

// Accepted by every command so agents can group the commands of one task in analytics.
const AGENT_OPTIONS = {
	intent: {
		type: "string",
		hidden: !isAgent,
		description:
			"The user's overall task in one short sentence. Paraphrase their original request, not what this command does. Pass the same value to every command for the same task. Analytics only, no effect on behavior.",
	},
	"task-id": {
		type: "string",
		hidden: !isAgent,
		description:
			"A globally unique ID (UUID) for the user's task. Generate one per task and pass the same value to every command for that task. Analytics only, no effect on behavior.",
	},
} satisfies CommandConfig["options"];

type CommandHandlerArgs<T extends CommandConfig> = ParseArgsReturnType<T> & {
	values: ParseArgsRequiredValues<T>;
};

type ParseArgsReturnType<T extends CommandConfig> = ReturnType<
	typeof parseArgs<T & { allowPositionals: T["positionals"] extends undefined ? false : true }>
>;

type ParseArgsRequiredValues<T extends CommandConfig> = {
	[P in keyof T["options"] as NonNullable<NonNullable<T["options"]>[P]>["required"] extends true
		? P
		: never]: P extends keyof ParseArgsReturnType<T>["values"]
		? NonNullable<ParseArgsReturnType<T>["values"][P]>
		: never;
};

export function createCommand<T extends CommandConfig>(
	config: T,
	handler: (args: CommandHandlerArgs<T>) => Promise<void>,
): () => Promise<void> {
	return async function () {
		const { positionals = {}, options = {} } = config;

		const depth = config.name.split(" ").length;
		const args = process.argv.slice(1 + depth);
		const allowPositionals = Object.keys(positionals).length > 0;

		let result;
		try {
			result = parseArgs({
				args,
				options: {
					...options,
					...AGENT_OPTIONS,
					help: { type: "boolean", short: "h" },
				},
				allowPositionals,
				strict: true,
			});
		} catch (error) {
			if (
				error instanceof TypeError &&
				"code" in error &&
				typeof error.code === "string" &&
				error.code.startsWith("ERR_PARSE_ARGS_")
			) {
				throw new CommandError(error.message);
			}
			throw error;
		}

		if (result.values.help) {
			console.info(buildCommandHelp(config));
			return;
		}

		for (const [index, [name, config]] of Object.entries(positionals).entries()) {
			if (config.required && !result.positionals[index]) {
				throw new CommandError(`Missing required argument: <${name}>`);
			}
		}

		for (const [name, config] of Object.entries(options)) {
			if (config.required && !(name in result.values)) {
				throw new CommandError(`Missing required option: --${name}`);
			}
			if (config.deprecated && name in result.values) {
				console.warn(`--${name} is deprecated. ${config.deprecated}`);
			}
			if (config.dependsOn && name in result.values) {
				const deps = Array.isArray(config.dependsOn) ? config.dependsOn : [config.dependsOn];
				for (const dep of deps) {
					if (!(dep in result.values)) {
						throw new CommandError(`--${name} can only be used with --${dep}.`);
					}
				}
			}
		}

		await handler(result as CommandHandlerArgs<T>);
	};
}

function buildCommandHelp(config: CommandConfig): string {
	const { description, sections, positionals = {}, options } = config;

	const positionalNames = Object.keys(positionals);

	const lines = [dedent(description)];

	lines.push("");
	lines.push("USAGE");
	let usage = `  ${config.name}`;
	if (positionalNames.length > 0) {
		usage += " " + positionalNames.map((positionalName) => `<${positionalName}>`).join(" ");
	}
	usage += " [options]";
	lines.push(usage);

	if (positionalNames.length > 0) {
		lines.push("");
		lines.push("ARGUMENTS");
		const rows: string[][] = [];
		for (const positionalName in positionals) {
			const positional = positionals[positionalName];
			const description = positional.description + (positional.required ? " (required)" : "");
			rows.push([`  <${positionalName}>`, description]);
		}
		lines.push(formatTable(rows));
	}

	lines.push("");
	lines.push("OPTIONS");
	lines.push(formatTable(optionRows({ ...options, ...AGENT_OPTIONS })));

	if (sections) {
		for (const sectionName in sections) {
			const content = dedent(sections[sectionName]);
			lines.push("");
			lines.push(sectionName);
			for (const line of content.split("\n")) {
				lines.push(line ? `  ${line}` : "");
			}
		}
	}

	lines.push("");
	lines.push("LEARN MORE");
	const bin = config.name.split(" ")[0];
	lines.push(`  Use \`${bin} <command> --help\` for more information about a command.`);

	return lines.join("\n");
}

function optionRows(options: NonNullable<CommandConfig["options"]>): string[][] {
	const rows: string[][] = [];
	for (const [name, option] of Object.entries(options)) {
		if (option.deprecated || option.hidden) continue;
		const shortPart = option.short ? `-${option.short}, ` : "    ";
		const typeSuffix = option.type === "string" ? " string" : "";
		const description = option.description + (option.required ? " (required)" : "");
		rows.push([`  ${shortPart}--${name}${typeSuffix}`, description]);
	}
	rows.push(["  -h, --help", "Show help for command"]);
	return rows;
}

type CreateCommandRouterConfig = {
	name: string;
	description: string;
	sections?: Record<string, string>;
	commands: Record<string, RouterCommand>;
};
type RouterCommand = { handler: () => Promise<void>; description: string; hidden?: boolean };

export function createCommandRouter(config: CreateCommandRouterConfig): () => Promise<void> {
	const depth = config.name.split(" ").length;

	return async function () {
		const args = process.argv.slice(1 + depth);

		const {
			positionals: [subcommand],
		} = parseArgs({
			args,
			options: { help: { type: "boolean", short: "h" } },
			allowPositionals: true,
			strict: false,
		});

		const entry = subcommand ? config.commands[subcommand] : undefined;
		if (entry) {
			await entry.handler();
			return;
		}

		if (subcommand) {
			throw new CommandError(`Unknown command: ${subcommand}`);
		}

		console.info(buildRouterHelp(config));
	};
}

function buildRouterHelp(config: CreateCommandRouterConfig): string {
	const { name, description, sections, commands } = config;

	const lines = [dedent(description)];

	lines.push("");
	lines.push("USAGE");
	lines.push(`  ${name} <command> [options]`);

	lines.push("");
	lines.push("COMMANDS");
	const commandRows = Object.entries(commands)
		.filter(([, cmd]) => !cmd.hidden)
		.map(([name, cmd]) => [`  ${name}`, cmd.description]);
	lines.push(formatTable(commandRows));

	lines.push("");
	lines.push("OPTIONS");
	lines.push(formatTable(optionRows(AGENT_OPTIONS)));

	if (sections) {
		for (const sectionName in sections) {
			const content = dedent(sections[sectionName]);
			lines.push("");
			lines.push(sectionName);
			for (const line of content.split("\n")) {
				lines.push(line ? `  ${line}` : "");
			}
		}
	}

	lines.push("");
	lines.push("LEARN MORE");
	lines.push(`  Use \`${name} <command> --help\` for more information about a command.`);

	return lines.join("\n");
}

export function exclusiveOptions<T extends Record<string, unknown>>(
	values: T,
	names: readonly (keyof T)[],
): void {
	const provided = names.filter((name) => name in values);
	if (provided.length > 1) {
		const list = names.map((name) => `--${String(name)}`).join(" or ");
		throw new CommandError(`Only one of ${list} can be specified.`);
	}
}

export function requireOneOption<T extends Record<string, unknown>>(
	values: T,
	names: readonly (keyof T)[],
): void {
	const provided = names.filter((name) => name in values);
	if (provided.length === 0) {
		const list = names.map((name) => `--${String(name)}`).join(" or ");
		throw new CommandError(`Specify one of ${list}.`);
	}
}

type SelectedOption<T, K extends keyof T> = K extends unknown
	? { key: K; value: NonNullable<T[K]> }
	: never;

export function exactlyOneOption<T extends Record<string, unknown>, K extends keyof T>(
	values: T,
	names: readonly K[],
): SelectedOption<T, K> {
	exclusiveOptions(values, names);
	requireOneOption(values, names);
	const key = names.find((name) => name in values)!;
	return { key, value: values[key] } as SelectedOption<T, K>;
}

export class CommandError extends Error {
	name = "CommandError";
}
