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
			dependsOn?: string;
			deprecated?: string;
		}
	>;
};

const isAgent = detectAgent() !== undefined;

const AGENT_OPTIONS = {
	"user-intent": {
		type: "string",
		description:
			"The user's overall task in one short US English sentence. Paraphrase their original request, not what this command does. Pass the same value on every command for the same task. Analytics only — no effect on behavior.",
	},
	"task-id": {
		type: "string",
		description:
			"Groups the commands of one user request. One id covers the whole request, not one per command: a slice's create, field and push commands share it. Run `prismic task-id` when the user asks for something new. Analytics only — no effect on behavior.",
	},
	"analytics-intent": { type: "string", hidden: true, description: "Renamed to --user-intent." },
	"analytics-task-id": { type: "string", hidden: true, description: "Renamed to --task-id." },
} satisfies CommandConfig["options"];

export const AGENTS_HELP = `
	--task-id and --user-intent group the commands of one user request together.
	Run \`prismic task-id\` when the user asks for something, then pass that id on
	every command until they ask for something else — creating a slice, adding its
	fields and pushing them are one request, and the next slice is another. Pass
	what the user asked for as --user-intent. Analytics only — no effect on behavior.
`;

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

		let result;
		try {
			result = parseArgs({
				args: process.argv.slice(1 + config.name.split(" ").length),
				options: { ...options, ...AGENT_OPTIONS, help: { type: "boolean", short: "h" } },
				allowPositionals: Object.keys(positionals).length > 0,
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
			const names = Object.keys(positionals);
			const blocks: Record<string, string> = {
				USAGE: `  ${[config.name, ...names.map((name) => `<${name}>`), "[options]"].join(" ")}`,
			};
			if (names.length > 0) {
				blocks.ARGUMENTS = formatTable(
					Object.entries(positionals).map(([name, positional]) => [
						`  <${name}>`,
						positional.description + (positional.required ? " (required)" : ""),
					]),
				);
			}
			blocks.OPTIONS = formatTable(optionRows(options));
			console.info(
				formatHelp(config.description, blocks, config.name.split(" ")[0], config.sections),
			);
			return;
		}

		for (const [index, [name, positional]] of Object.entries(positionals).entries()) {
			if (positional.required && !result.positionals[index]) {
				throw new CommandError(`Missing required argument: <${name}>`);
			}
		}

		for (const [name, option] of Object.entries(options)) {
			if (option.required && !(name in result.values)) {
				throw new CommandError(`Missing required option: --${name}`);
			}
			if (!(name in result.values)) continue;
			if (option.deprecated) {
				console.warn(`--${name} is deprecated. ${option.deprecated}`);
			}
			if (option.dependsOn && !(option.dependsOn in result.values)) {
				throw new CommandError(`--${name} can only be used with --${option.dependsOn}.`);
			}
		}

		await handler(result as CommandHandlerArgs<T>);
	};
}

export function createCommandRouter(config: {
	name: string;
	description: string;
	sections?: Record<string, string>;
	commands: Record<string, { handler: () => Promise<void>; description: string }>;
}): () => Promise<void> {
	return async function () {
		const {
			positionals: [subcommand],
		} = parseArgs({
			args: process.argv.slice(1 + config.name.split(" ").length),
			options: { ...AGENT_OPTIONS, help: { type: "boolean", short: "h" } },
			allowPositionals: true,
			strict: false,
		});

		if (subcommand) {
			const entry = config.commands[subcommand];
			if (!entry) throw new CommandError(`Unknown command: ${subcommand}`);
			await entry.handler();
			return;
		}

		const blocks = {
			USAGE: `  ${config.name} <command> [options]`,
			COMMANDS: formatTable(
				Object.entries(config.commands).map(([name, command]) => [
					`  ${name}`,
					command.description,
				]),
			),
			OPTIONS: formatTable(optionRows({})),
		};
		const sections = isAgent ? { ...config.sections, AGENTS: AGENTS_HELP } : config.sections;
		console.info(formatHelp(config.description, blocks, config.name, sections));
	};
}

function optionRows(options: NonNullable<CommandConfig["options"]>): string[][] {
	const all: typeof options = isAgent ? { ...options, ...AGENT_OPTIONS } : options;
	const rows: string[][] = [];
	for (const [name, option] of Object.entries(all)) {
		if (option.deprecated) continue;
		const shortPart = option.short ? `-${option.short}, ` : "    ";
		const typeSuffix = option.type === "string" ? " string" : "";
		const description = option.description + (option.required ? " (required)" : "");
		rows.push([`  ${shortPart}--${name}${typeSuffix}`, description]);
	}
	rows.push(["  -h, --help", "Show help for command"]);

	return rows;
}

function formatHelp(
	description: string,
	blocks: Record<string, string>,
	learnMoreCommand: string,
	sections: Record<string, string> = {},
): string {
	const lines = [dedent(description)];
	for (const [title, content] of Object.entries(blocks)) {
		lines.push("", title, content);
	}
	for (const [title, content] of Object.entries(sections)) {
		lines.push(
			"",
			title,
			...dedent(content)
				.split("\n")
				.map((line) => (line ? `  ${line}` : "")),
		);
	}
	lines.push(
		"",
		"LEARN MORE",
		`  Use \`${learnMoreCommand} <command> --help\` for more information about a command.`,
	);

	return lines.join("\n");
}

type SelectedOption<T, K extends keyof T> = K extends unknown
	? { key: K; value: NonNullable<T[K]> }
	: never;

export function exactlyOneOption<T extends Record<string, unknown>, K extends keyof T>(
	values: T,
	names: readonly K[],
): SelectedOption<T, K> {
	const provided = names.filter((name) => name in values);
	const list = names.map((name) => `--${String(name)}`).join(" or ");
	if (provided.length > 1) throw new CommandError(`Only one of ${list} can be specified.`);
	if (provided.length === 0) throw new CommandError(`Specify one of ${list}.`);

	return { key: provided[0], value: values[provided[0]] } as SelectedOption<T, K>;
}

export class CommandError extends Error {
	name = "CommandError";
}
