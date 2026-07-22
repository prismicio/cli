import {
	buildCustomType,
	buildSlice,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "../test/it";
import { it, trials } from "./it";

it.for(trials)("adds a field", async (_, { project, agent, expect }) => {
	const article = buildCustomType({
		id: "article",
		label: "Article",
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
				published_at: { type: "Date", config: { label: "Published At" } },
			},
		},
	});
	await writeLocalCustomType(project, article);

	const result = await agent(`Add an "excerpt" rich text field to the "article" type.`);

	expect(result).toHaveRun("prismic", ["field", "add", "rich-text", "excerpt"]);
	const model = await readLocalCustomType(project, article.id);
	expect(model.json.Main.excerpt.type).toBe("StructuredText");
	expect(model.json.Main.title).toEqual(article.json.Main.title);
	expect(model.json.Main.published_at).toEqual(article.json.Main.published_at);
});

it.for(trials)(
	"adds a slice variation without losing existing ones",
	async (_, { project, agent, expect }) => {
		const slice = buildSlice({ id: "hero", name: "Hero" });
		slice.variations = [
			...slice.variations,
			{ ...slice.variations[0], id: "imageRight", name: "Image Right" },
		];
		await writeLocalSlice(project, slice);

		const result = await agent(`Add a "centered" variation to the "Hero" slice.`);

		expect(result).toHaveRun("prismic", ["slice", "add-variation"]);
		const model = await readLocalSlice(project, slice.id);
		const ids = model?.variations.map((variation) => variation.id);
		expect(ids).toContain("default");
		expect(ids).toContain("imageRight");
		expect(ids?.some((id) => /centered/i.test(id))).toBe(true);
	},
);

// Fails: the CLI cannot rename a field ID; `field edit` only changes label and config.
it.skip("renames a field without disturbing field order", async ({ project, agent, expect }) => {
	const article = buildCustomType({
		id: "article",
		label: "Article",
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
				tagline: { type: "Text", config: { label: "Tagline" } },
				body: { type: "StructuredText", config: { label: "Body", multi: "paragraph" } },
			},
		},
	});
	await writeLocalCustomType(project, article);

	const result = await agent(`Rename the "tagline" field on "article" to "subtitle".`);

	expect(result).toHaveRun("prismic", ["field", "edit"]);
	const model = await readLocalCustomType(project, article.id);
	expect(Object.keys(model.json.Main)).toEqual(["title", "subtitle", "body"]);
	expect(model.json.Main.subtitle.type).toBe("Text");
});

it.for(trials)(
	"extends a slice to match a design change",
	async (_, { project, agent, expect }) => {
		const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
		slice.variations[0].primary = {
			quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
			author: { type: "Text", config: { label: "Author" } },
		};
		await writeLocalSlice(project, slice);

		const result = await agent(
			`The testimonial design now also shows the author's company logo and a star rating. Update the "Testimonial" slice.`,
		);

		expect(result).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalSlice(project, slice.id);
		const primary = model?.variations[0].primary ?? {};
		expect(primary.quote).toEqual(slice.variations[0].primary.quote);
		expect(primary.author).toEqual(slice.variations[0].primary.author);
		const addedTypes = Object.values(primary).map((field) => field.type);
		expect(addedTypes).toContain("Image");
	},
);

it.for(trials)(
	"is idempotent when the same task runs twice",
	async (_, { project, agent, expect }) => {
		const homepage = buildCustomType({ id: "homepage", label: "Homepage" });
		await writeLocalCustomType(project, homepage);

		const firstRun = await agent(`add a "body" rich text field to "homepage"`);
		await agent(`add a "body" rich text field to "homepage"`);

		expect(firstRun).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalCustomType(project, homepage.id);
		const bodyLikeKeys = Object.keys(model.json.Main).filter((key) => /body/i.test(key));
		expect(bodyLikeKeys).toEqual(["body"]);
		expect(model.json.Main.body.type).toBe("StructuredText");
	},
);

it.for(trials)("adds a group field with nested fields", async (_, { project, agent, expect }) => {
	const product = buildCustomType({ id: "product", label: "Product" });
	await writeLocalCustomType(project, product);

	const result = await agent(
		`Add a repeatable "features" group to the "product" type. Each feature has an icon image and a label.`,
	);

	expect(result).toHaveRun("prismic", ["field", "add", "group"]);
	const model = await readLocalCustomType(project, product.id);
	const features = model.json.Main.features;
	expect(features.type).toBe("Group");
	const nestedTypes = Object.values(
		(features.config as { fields: Record<string, { type: string }> }).fields,
	).map((field) => field.type);
	expect(nestedTypes).toContain("Image");
	expect(nestedTypes).toContain("Text");
});

it.for(trials)(
	"adds constrained fields with the right config",
	async (_, { project, agent, expect }) => {
		const author = buildCustomType({ id: "author", label: "Author" });
		const product = buildCustomType({ id: "product", label: "Product" });
		await writeLocalCustomType(project, author);
		await writeLocalCustomType(project, product);

		const result = await agent(
			`On the "product" type, add a "size" dropdown with the options S, M, and L, and an "author" link that can only point to "author" documents.`,
		);

		expect(result).toHaveRun("prismic", ["field", "add", "select"]);
		expect(result).toHaveRun("prismic", ["field", "add", "content-relationship"]);
		const model = await readLocalCustomType(project, product.id);
		expect(model.json.Main.size.type).toBe("Select");
		expect((model.json.Main.size.config as { options: string[] }).options).toEqual(["S", "M", "L"]);
		expect(model.json.Main.author.type).toBe("Link");
		expect(JSON.stringify(model.json.Main.author.config)).toContain("author");
	},
);

it.for(trials)(
	"uses the documented config for a single-heading constraint",
	async (_, { project, agent, expect }) => {
		const post = buildCustomType({
			id: "post",
			label: "Post",
			json: {
				Main: {
					title: {
						type: "StructuredText",
						config: { label: "Title", multi: "heading1,heading2,paragraph" },
					},
				},
			},
		});
		await writeLocalCustomType(project, post);

		const result = await agent(
			`Restrict the "title" field on "post" so editors can only write a single H1.`,
		);

		expect(result).toHaveRun("prismic", ["field", "edit"]);
		const model = await readLocalCustomType(project, post.id);
		const config = model.json.Main.title.config as { single?: string; multi?: string };
		expect(config.single).toBe("heading1");
		expect(config.multi).toBeUndefined();
	},
);

it.for(trials)("connects a slice to a page type", async (_, { project, agent, expect }) => {
	const page = buildCustomType({
		id: "page",
		label: "Page",
		json: { Main: { slices: { type: "Slices", fieldset: "Slice Zone", config: { choices: {} } } } },
	});
	await writeLocalCustomType(project, page);
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	await writeLocalSlice(project, slice);

	const result = await agent(`Make the "Testimonial" slice available on the "page" type.`);

	expect(result).toHaveRun("prismic", ["slice", "connect"]);
	const model = await readLocalCustomType(project, page.id);
	const choices = (model.json.Main.slices.config as { choices: Record<string, unknown> }).choices;
	expect(Object.keys(choices)).toContain(slice.id);
});
