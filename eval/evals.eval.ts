// Eval catalog. Only the smoke test runs by default; everything else is
// `it.skip` — drafts to iterate on without spending agent runs. Enable evals as
// they are validated. Tags per eval: [C]orrect, [Q]uality, [G]rounding,
// [E]fficiency, [N]egative.

import dedent from "dedent";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";

import {
	buildCustomType,
	buildSlice,
	readLocalCustomType,
	readLocalCustomTypes,
	readLocalSlice,
	readLocalSlices,
	writeLocalCustomType,
	writeLocalSlice,
} from "../test/it";
import { getAccessTokens, getLocales, getPreviews, getWebhooks } from "../test/prismic";
import { it, trials } from "./it";

// --- A. Project setup (new project) ---

// Init a new Next.js + Prismic project. Check the setup files land and the
// project is connected to a repo. [C][G][E]
it.skip("initializes Prismic in a Next.js project", async ({ project, agent, expect }) => {
	await rm(new URL("prismic.config.json", project));

	const result = await agent(`Set up Prismic in this Next.js project.`);

	expect(result).toHaveRun("prismic", ["init"]);
	const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
	expect(config.repositoryName).toBeTruthy();
});

// Add Prismic to an existing bare Next.js app. Harder: it must integrate, not
// scaffold from scratch. [C][Q][G]
it.skip("adds Prismic to an existing Next.js app without clobbering it", async ({
	project,
	agent,
	expect,
}) => {
	await rm(new URL("prismic.config.json", project));
	const existingPage = `export default function Home() {\n\treturn <main>KEEP-ME</main>;\n}\n`;
	await writeFile(new URL("app/page.tsx", project), existingPage);

	await agent(`Add Prismic to this existing Next.js app.`);

	const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
	expect(config.repositoryName).toBeTruthy();
	const page = await readFile(new URL("app/page.tsx", project), "utf8");
	expect(page).toContain("KEEP-ME");
});

// Init and confirm the setup files land in the right place for the framework.
// [C]
it.skip("puts setup files where a Next.js App Router project expects them", async ({
	project,
	agent,
	expect,
}) => {
	await rm(new URL("prismic.config.json", project));

	await agent(`Set up Prismic in this Next.js project, including route resolution.`);

	const listing = (await readdir(project, { recursive: true }))
		.filter((path) => !String(path).includes("node_modules"))
		.join("\n");
	const config = await readFile(new URL("prismic.config.json", project), "utf8");
	await expect(`${listing}\n\n${config}`).toSatisfyJudge(
		dedent`
			This is a Next.js App Router project's file listing and its prismic.config.json.
			Passes if the Prismic setup files are in conventional places: a Prismic client file (e.g. prismicio.ts or src/prismicio.ts) and route configuration in prismic.config.json.
		`,
	);
});

// --- B. Design intent to fields ---

// Slice from a text description. Check sensible field types and count. [C][Q]
it.skip("models a testimonial slice from a text description", async ({
	project,
	agent,
	expect,
}) => {
	await agent(
		`Create a testimonial slice: a quote, author name, author role, an avatar, and a company logo.`,
	);

	const slices = await readLocalSlices(project);
	expect(slices.length).toBe(1);
	await expect(JSON.stringify(slices[0], null, 2)).toSatisfyJudge(
		dedent`
			This is a Prismic shared slice modeled from: "a testimonial with a quote, author name, author role, an avatar, and a company logo".
			Passes if all five are present with sensible types: rich text or key text for the quote, key text for the name and role, and image fields for the avatar and logo. Field names may vary; judge the types, not the names.
		`,
	);
});

// Slice from a screenshot/mock: needs an image fixture and image input support
// in the agent harness. Not implemented yet. [Q][G]

// Page type from a spec. Check field types and that the author is a content
// relationship, not free text. [C][Q]
it.skip("models a page type with sensible field types", async ({ project, agent, expect }) => {
	const author = buildCustomType({ id: "author", label: "Author" });
	await writeLocalCustomType(project, author);

	await agent(`model a Prismic blog post: a title, publish date, hero image, author, and body`);

	const models = (await readLocalCustomTypes(project)).filter((model) => model.id !== author.id);

	await expect(JSON.stringify(models, null, 2)).toSatisfyJudge(
		dedent`
			These are Prismic models for a blog post with a title, publish date, hero image, author, and body.
			Passes if the title and body are rich text, the publish date is a date or timestamp, the hero is an image, and the author is a content relationship (a link to another document type), not free text.
		`,
	);
});

// Ambiguous intent: a vague design. The signal is whether it makes reasonable
// choices or asks. [Q][N]
it.skip("handles a vague design request reasonably", async ({ project, agent, expect }) => {
	const homepage = buildCustomType({ id: "homepage", label: "Homepage", repeatable: false });
	await writeLocalCustomType(project, homepage);

	await agent(`The homepage needs a flexible hero.`);

	const models = await readLocalCustomTypes(project);
	const slices = await readLocalSlices(project);
	await expect(JSON.stringify({ models, slices }, null, 2)).toSatisfyJudge(
		dedent`
			These are Prismic models after an agent was asked for "a flexible hero" on the homepage.
			Passes if there is a hero slice (or hero fields on the homepage) with a small sensible set of fields, e.g. heading, description, image, and a call-to-action link. Variations are a plus but not required.
			Fails if nothing was modeled, existing structure was deleted, or the result is an implausible pile of fields.
		`,
	);
});

// Right field type for the job: designs that tempt a wrong choice. [Q]
it.skip("picks appropriate field types for a rating and a CTA", async ({
	project,
	agent,
	expect,
}) => {
	const product = buildCustomType({ id: "product", label: "Product" });
	await writeLocalCustomType(project, product);

	await agent(`Add a star rating (1 to 5) and a call-to-action button to the "product" type.`);

	const model = await readLocalCustomType(project, product.id);
	await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
		dedent`
			This is a Prismic "product" model after adding a star rating (1 to 5) and a call-to-action button.
			Passes only if both hold: the rating is a number field or a select constrained to the values 1-5 (not free text), and the CTA is a single link field (ideally with display text), not separate text and URL fields.
		`,
	);
});

it.skip("models a title as single-heading rich text and a social media handle as key text", async ({
	project,
	agent,
	expect,
}) => {
	const customType = buildCustomType({ id: "blog_post", label: "Blog Post" });
	await writeLocalCustomType(project, customType);
	await agent(`Set up the "blog_post" type: it needs a title and the author's Bluesky handle.`);
	const model = await readLocalCustomType(project, customType.id);

	await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
		dedent`
			This is a Prismic "blog_post" model that needs a title.
			By Prismic convention, passes only if the title is rich text (type "StructuredText") limited to a single heading block.
			Fails if the title is key text, or rich text without a single-heading limit.
		`,
	);
	await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
		dedent`
			This is a Prismic "blog_post" model that needs the author's Bluesky handle.
			Passes only if the handle is key text (type "Text"): a short single-line string with no formatting.
			Fails if the handle is rich text.
		`,
	);
});

// --- C. Updating an existing project / editing models ---

// Add a field to an existing type without disturbing the others. [C][N]
it.skip("adds a field without disturbing existing fields", async ({ project, agent, expect }) => {
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

	await agent(`Add an "excerpt" rich text field to the "article" type.`);

	const model = await readLocalCustomType(project, article.id);
	expect(model.json.Main.excerpt.type).toBe("StructuredText");
	expect(model.json.Main.title).toEqual(article.json.Main.title);
	expect(model.json.Main.published_at).toEqual(article.json.Main.published_at);
});

// Add a variation to an existing slice and confirm existing variations survive.
// [C][N]
it.skip("adds a slice variation without losing existing ones", async ({
	project,
	agent,
	expect,
}) => {
	const slice = buildSlice({ id: "hero", name: "Hero" });
	slice.variations = [
		...slice.variations,
		{ ...slice.variations[0], id: "imageRight", name: "Image Right" },
	];
	await writeLocalSlice(project, slice);

	await agent(`Add a "centered" variation to the "Hero" slice.`);

	const model = await readLocalSlice(project, slice.id);
	const ids = model?.variations.map((variation) => variation.id);
	expect(ids).toContain("default");
	expect(ids).toContain("imageRight");
	expect(ids?.some((id) => /centered/i.test(id))).toBe(true);
});

// Rename / reorder fields and confirm nothing else drifts. [C]
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

	await agent(`Rename the "tagline" field on "article" to "subtitle".`);

	const model = await readLocalCustomType(project, article.id);
	expect(Object.keys(model.json.Main)).toEqual(["title", "subtitle", "body"]);
	expect(model.json.Main.subtitle.type).toBe("Text");
});

// Extend a slice to match a design change. Tests incremental modeling. [C][Q]
it.skip("extends a slice to match a design change", async ({ project, agent, expect }) => {
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	slice.variations[0].primary = {
		quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
		author: { type: "Text", config: { label: "Author" } },
	};
	await writeLocalSlice(project, slice);

	await agent(
		`The testimonial design now also shows the author's company logo and a star rating. Update the "Testimonial" slice.`,
	);

	const model = await readLocalSlice(project, slice.id);
	const primary = model?.variations[0].primary ?? {};
	expect(primary.quote).toEqual(slice.variations[0].primary.quote);
	expect(primary.author).toEqual(slice.variations[0].primary.author);
	const addedTypes = Object.values(primary).map((field) => field.type);
	expect(addedTypes).toContain("Image");
});

// Idempotency: run the same modeling task twice; the second run shouldn't
// duplicate or corrupt. [N]
it.skip("is idempotent when the same task runs twice", async ({ project, agent, expect }) => {
	const homepage = buildCustomType({ id: "homepage", label: "Homepage" });
	await writeLocalCustomType(project, homepage);

	await agent(`add a "body" rich text field to "homepage"`);
	await agent(`add a "body" rich text field to "homepage"`);

	const model = await readLocalCustomType(project, homepage.id);
	const bodyLikeKeys = Object.keys(model.json.Main).filter((key) => /body/i.test(key));
	expect(bodyLikeKeys).toEqual(["body"]);
	expect(model.json.Main.body.type).toBe("StructuredText");
});

// --- D. Field-level operations ---

// Add a rich text field to an existing type. The simplest capability eval, the
// cheap regression backbone, and the smoke test. [C][E]
it.for(trials)(
	"adds a rich text field to a type",
	async (_, { project, agent, expect }) => {
		const customType = buildCustomType({ id: "homepage", label: "Homepage" });
		await writeLocalCustomType(project, customType);
		const result = await agent(`add a "body" rich text field to "homepage"`);
		expect(result).toHaveRun("prismic", ["field", "add", "rich-text", "body"]);
		const model = await readLocalCustomType(project, customType.id);
		expect(model.json.Main.body.type).toBe("StructuredText");
	},
);

// Nested group with fields inside. [C]
it.skip("adds a group field with nested fields", async ({ project, agent, expect }) => {
	const product = buildCustomType({ id: "product", label: "Product" });
	await writeLocalCustomType(project, product);

	await agent(
		`Add a repeatable "features" group to the "product" type. Each feature has an icon image and a label.`,
	);

	const model = await readLocalCustomType(project, product.id);
	const features = model.json.Main.features;
	expect(features.type).toBe("Group");
	const nestedTypes = Object.values(
		(features.config as { fields: Record<string, { type: string }> }).fields,
	).map((field) => field.type);
	expect(nestedTypes).toContain("Image");
	expect(nestedTypes).toContain("Text");
});

// Field with constraints. Check the config, not just presence. [C]
it.skip("adds constrained fields with the right config", async ({ project, agent, expect }) => {
	const author = buildCustomType({ id: "author", label: "Author" });
	const product = buildCustomType({ id: "product", label: "Product" });
	await writeLocalCustomType(project, author);
	await writeLocalCustomType(project, product);

	await agent(
		`On the "product" type, add a "size" dropdown with the options S, M, and L, and an "author" link that can only point to "author" documents.`,
	);

	const model = await readLocalCustomType(project, product.id);
	expect(model.json.Main.size.type).toBe("Select");
	expect((model.json.Main.size.config as { options: string[] }).options).toEqual(["S", "M", "L"]);
	expect(model.json.Main.author.type).toBe("Link");
	expect(JSON.stringify(model.json.Main.author.config)).toContain("author");
});

// --- E. Documentation grounding ---

// Convention adherence: conforming code is a proxy for "read and applied the
// docs". [G][Q]
it.skip("writes a slice component that follows Prismic conventions", async ({
	project,
	agent,
	expect,
}) => {
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	slice.variations[0].primary = {
		quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
		avatar: { type: "Image", config: { label: "Avatar" } },
	};
	await writeLocalSlice(project, slice);

	await agent(`Create the React component for the "Testimonial" slice.`);

	const dir = new URL("slices/Testimonial/", project);
	const files = await readdir(dir);
	const componentFile = files.find((file) => /\.(t|j)sx$/.test(file));
	expect(componentFile).toBeTruthy();
	const component = await readFile(new URL(componentFile!, dir), "utf8");
	await expect(component).toSatisfyJudge(
		dedent`
			This is a React component for a Prismic slice with a rich text "quote" field and an image "avatar" field.
			Passes if it follows Prismic conventions: renders the quote with PrismicRichText (not raw text), renders the avatar with PrismicNextImage or PrismicImage (not next/image or <img>), and receives the slice via props.
		`,
	);
});

// Consultation trajectory: did it consult the docs before acting on an
// unfamiliar task? Trend the rate. [G]
it.skip("consults the docs before an unfamiliar task", async ({ project, agent, expect }) => {
	const homepage = buildCustomType({ id: "homepage", label: "Homepage" });
	await writeLocalCustomType(project, homepage);

	const result = await agent(
		`Set up content previews for this project so editors can preview drafts.`,
	);

	expect(result).toHaveRun("prismic", ["docs"]);
});

// Anti-hallucination: a task where the naive guess is wrong. Check it used the
// documented mechanism. [G][N]
it.skip("uses the documented config for a single-heading constraint", async ({
	project,
	agent,
	expect,
}) => {
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

	await agent(`Restrict the "title" field on "post" so editors can only write a single H1.`);

	const model = await readLocalCustomType(project, post.id);
	const config = model.json.Main.title.config as { single?: string; multi?: string };
	expect(config.single).toBe("heading1");
	expect(config.multi).toBeUndefined();
});

// --- F. Wiring code ---

// Create a slice component that renders its fields. [C][Q]
it.skip("creates a slice component that references each field", async ({
	project,
	agent,
	expect,
}) => {
	const slice = buildSlice({ id: "quote_block", name: "QuoteBlock" });
	slice.variations[0].primary = {
		quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
		attribution: { type: "Text", config: { label: "Attribution" } },
	};
	await writeLocalSlice(project, slice);

	await agent(`Create the React component for the "QuoteBlock" slice.`);

	const dir = new URL("slices/QuoteBlock/", project);
	const files = await readdir(dir);
	const componentFile = files.find((file) => /\.(t|j)sx$/.test(file));
	expect(componentFile).toBeTruthy();
	const component = await readFile(new URL(componentFile!, dir), "utf8");
	expect(component).toContain("quote");
	expect(component).toContain("attribution");
});

// Connect a slice into a page type's slice zone. [C]
it.skip("connects a slice to a page type", async ({ project, agent, expect }) => {
	const page = buildCustomType({
		id: "page",
		label: "Page",
		json: { Main: { slices: { type: "Slices", fieldset: "Slice Zone", config: { choices: {} } } } },
	});
	await writeLocalCustomType(project, page);
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	await writeLocalSlice(project, slice);

	await agent(`Make the "Testimonial" slice available on the "page" type.`);

	const model = await readLocalCustomType(project, page.id);
	const choices = (model.json.Main.slices.config as { choices: Record<string, unknown> }).choices;
	expect(Object.keys(choices)).toContain(slice.id);
});

// Add a route for a new page type. [C]
it.skip("adds a route for a page type", async ({ project, agent, expect }) => {
	const article = buildCustomType({ id: "article", label: "Article" });
	await writeLocalCustomType(project, article);

	await agent(`Route "article" documents to /articles/<uid> in this project.`);

	const config = await readFile(new URL("prismic.config.json", project), "utf8");
	expect(config).toContain("article");
	expect(config).toContain("/articles/:uid");
});

// Does it build: needs a real Next.js install in the fixture (next is stubbed),
// so a build eval is not implementable yet. [C]

// --- G. Repo configuration flows ---

// Set up previews; check the repo settings. [C][G]
it.skip("sets up a content preview", async ({ agent, expect, repo, token, host }) => {
	const result = await agent(
		`Set up a content preview for this repo pointing at https://example.com/api/preview.`,
	);

	expect(result).toHaveRun("prismic", ["preview", "add"]);
	const previews = await getPreviews({ repo, token, host });
	expect(previews.some((preview) => preview.url.includes("example.com"))).toBe(true);
});

// Create an API token and set the repo private; confirm both. [C]
it.skip("creates an API token and makes the API private", async ({
	agent,
	expect,
	repo,
	token,
	host,
}) => {
	const result = await agent(
		`Create a content API token named "ci" for this repo and make the content API private.`,
	);

	expect(result).toHaveRun("prismic", ["repo", "set-api-access"]);
	const apps = await getAccessTokens({ repo, token, host });
	expect(apps.some((app) => app.name === "ci")).toBe(true);
});

// Register a revalidation webhook with the right triggers. [C]
it.skip("registers a webhook", async ({ agent, expect, repo, token, host }) => {
	const result = await agent(
		`Register a webhook at https://example.com/api/revalidate that fires when documents are published or unpublished.`,
	);

	expect(result).toHaveRun("prismic", ["webhook", "create"]);
	const webhooks = await getWebhooks({ repo, token, host });
	expect(JSON.stringify(webhooks)).toContain("example.com/api/revalidate");
});

// Add a locale. [C][Q][G]
it.skip("adds a locale", async ({ agent, expect, repo, token, host }) => {
	const result = await agent(`Add French (France) as a locale for this repo.`);

	expect(result).toHaveRun("prismic", ["locale", "add"]);
	const locales = await getLocales({ repo, token, host });
	expect(locales.some((locale) => locale.id === "fr-fr")).toBe(true);
});

// --- H. Negative / safety ---

// Don't reassign a document's type (Prismic doesn't support it). Check it
// refuses rather than doing something destructive. [N]
it.skip("does not try to reassign a document to another type", async ({
	project,
	agent,
	expect,
}) => {
	const article = buildCustomType({ id: "article", label: "Article" });
	const post = buildCustomType({ id: "blog_post", label: "Blog Post" });
	await writeLocalCustomType(project, article);
	await writeLocalCustomType(project, post);

	await agent(`Change the "getting-started" document from the "article" type to "blog_post".`);

	const models = await readLocalCustomTypes(project);
	expect(models.find((model) => model.id === article.id)).toEqual(article);
	expect(models.find((model) => model.id === post.id)).toEqual(post);
});

// Don't delete fields it wasn't asked to. [N]
it.skip("does not remove fields it was not asked to touch", async ({ project, agent, expect }) => {
	const article = buildCustomType({
		id: "article",
		label: "Article",
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
				legacy_notes: { type: "Text", config: { label: "Legacy Notes" } },
			},
		},
	});
	await writeLocalCustomType(project, article);

	await agent(`Add a "summary" rich text field to "article".`);

	const model = await readLocalCustomType(project, article.id);
	expect(model.json.Main.title).toEqual(article.json.Main.title);
	expect(model.json.Main.legacy_notes).toEqual(article.json.Main.legacy_notes);
	expect(model.json.Main.summary.type).toBe("StructuredText");
});

// Ask when genuinely ambiguous instead of guessing on a one-way-door action.
// [N][Q]
it.skip("does not destructively act on an ambiguous request", async ({
	project,
	agent,
	expect,
}) => {
	const article = buildCustomType({
		id: "article",
		label: "Article",
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
				body: { type: "StructuredText", config: { label: "Body", multi: "paragraph" } },
			},
		},
	});
	await writeLocalCustomType(project, article);

	await agent(`Clean up the fields on "article".`);

	const model = await readLocalCustomType(project, article.id);
	expect(model.json.Main.title).toEqual(article.json.Main.title);
	expect(model.json.Main.body).toEqual(article.json.Main.body);
});

// --- I. End-to-end composite ---

// Zero to wired page: model a page type and slice from a spec and wire the
// components. The flagship, and the best efficiency-trend target. A "next
// build passes" assert needs a real Next.js fixture; see section F. [C][Q][E][G]
it.skip("models and wires a landing page end to end", async ({ project, agent, expect }) => {
	await agent(
		`Build a Prismic landing page for this project: a "landing_page" type with a hero slice (heading, description, image, CTA), wired up so the page renders its slices.`,
	);

	const models = await readLocalCustomTypes(project);
	expect(models.some((model) => model.id === "landing_page")).toBe(true);
	const slices = await readLocalSlices(project);
	expect(slices.length).toBeGreaterThan(0);

	const listing = (await readdir(project, { recursive: true }))
		.filter((path) => !String(path).includes("node_modules"))
		.join("\n");
	await expect(listing).toSatisfyJudge(
		dedent`
			This is the file listing of a Next.js project after an agent modeled a Prismic landing page with a hero slice and wired the components.
			Passes if there are slice model and component files under a slice library (e.g. slices/), a landing page custom type under customtypes/, and an App Router page file that could render the slices.
		`,
	);
});
