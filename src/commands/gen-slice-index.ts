import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic gen slice-index",
	description: "Generate the slice index file of each slice library.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const adapter = await getAdapter();
	const libraries = await adapter.getSliceLibraries();
	for (const library of libraries) {
		await adapter.createSliceIndexFile(library);
	}
	console.info(
		libraries.length === 1
			? "Generated the slice index file."
			: `Generated ${libraries.length} slice index files.`,
	);
});
