import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { type CustomTypeMeta, getAdapter, type SharedSliceMeta, type Adapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { dedent, formatTable } from "../lib/string";
import { relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic pull",
	description: `
		Pull content types and slices from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.
	`,
	options: {
		force: { type: "boolean", description: "Force pull remote changes" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();

	console.info(`Pulling from repository: ${repo}`);

	const [sliceOperations, customTypeOperations] = await Promise.all([
		getSliceOperations({ adapter, repo, token, host }),
		getCustomTypeOperations({ adapter, repo, token, host }),
	]);

	if (
		(!force && sliceOperations.update.length > 0) ||
		sliceOperations.delete.length > 0 ||
		customTypeOperations.update.length > 0 ||
		customTypeOperations.delete.length > 0
	) {
		const projectRoot = await findProjectRoot();
		const destructiveOperationRows: string[][] = [
			...sliceOperations.update.map((operation) => [
				"Overwrite slice",
				operation.model.id,
				relativePathname(projectRoot, operation.file),
			]),
			...sliceOperations.delete.map((operation) => [
				"Delete slice",
				operation.model.id,
				relativePathname(projectRoot, operation.file),
			]),
		];

		throw new CommandError(dedent`
			The following destructive changes will happen:

			  ${formatTable(destructiveOperationRows, { headers: ["OPERATION", "ID", "FILE"] })}

			Re-run the command with \`--force\` to confirm.
		`);
	}

	console.info("Pull complete");
});

type Operations<TInsert, TUpdate = TInsert, TDelete = TInsert> = {
	insert: TInsert[];
	update: TUpdate[];
	delete: TDelete[];
};

async function getSliceOperations(config: {
	adapter: Adapter;
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Operations<SharedSlice, SharedSliceMeta, SharedSliceMeta>> {
	const { adapter, repo, token, host } = config;

	const operations: Operations<SharedSlice, SharedSliceMeta, SharedSliceMeta> = {
		insert: [],
		update: [],
		delete: [],
	};

	const remoteSlices = await getSlices({ repo, token, host });
	const localSlices = await adapter.getSlices();
	for (const remoteSlice of remoteSlices) {
		const localSlice = localSlices.find((slice) => slice.model.id === remoteSlice.id);
		if (localSlice) {
			const isSame = localSlice && JSON.stringify(remoteSlice) === JSON.stringify(localSlice);
			if (!isSame) operations.update.push(localSlice);
		} else {
			operations.insert.push(remoteSlice);
		}
	}
	for (const localSlice of localSlices) {
		const remoteSlice = remoteSlices.find((slice) => slice.id === localSlice.model.id);
		if (!remoteSlice) operations.delete.push(localSlice);
	}

	return operations;
}

async function getCustomTypeOperations(config: {
	adapter: Adapter;
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Operations<CustomType, CustomTypeMeta, CustomTypeMeta>> {
	const { adapter, repo, token, host } = config;

	const operations: Operations<CustomType, CustomTypeMeta, CustomTypeMeta> = {
		insert: [],
		update: [],
		delete: [],
	};

	const remoteCustomTypes = await getCustomTypes({ repo, token, host });
	const localCustomTypes = await adapter.getCustomTypes();
	for (const remoteCustomType of remoteCustomTypes) {
		const localCustomType = localCustomTypes.find(
			(customType) => customType.model.id === remoteCustomType.id,
		);
		if (localCustomType) {
			const isSame =
				localCustomType && JSON.stringify(remoteCustomType) === JSON.stringify(localCustomType);
			if (!isSame) operations.update.push(localCustomType);
		} else {
			operations.insert.push(remoteCustomType);
		}
	}
	for (const localCustomType of localCustomTypes) {
		const remoteCustomType = remoteCustomTypes.find(
			(customType) => customType.id === localCustomType.model.id,
		);
		if (!remoteCustomType) operations.delete.push(localCustomType);
	}

	return operations;
}
