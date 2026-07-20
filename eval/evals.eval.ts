// Eval catalog. Placeholders only. Each comment is a future `it(...)` eval.
// Nothing is hooked up yet. Tags per eval: [C]orrect, [Q]uality, [G]rounding,
// [E]fficiency, [N]egative.

import dedent from "dedent";
import {
	buildCustomType,
	readLocalCustomType,
	readLocalCustomTypes,
	writeLocalCustomType,
} from "../test/it";
import { it } from "./it"; // existing test fixtures extended with `agent`

// --- A. Project setup (new project) ---

// Init a new Next.js + Prismic project from an empty dir. Check the project has
// prismicio.ts, prismic.config.json, the right deps (@prismicio/client,
// @prismicio/react, @prismicio/next), and a repo was created. [C][G][E]

// Add Prismic to an existing bare Next.js app (fixture: a plain create-next-app
// with no Prismic). Harder: it must integrate, not scaffold from scratch. [C][Q][G]

// Init and confirm the routing files land in the right place for the chosen
// framework variant. [C]

// --- B. Design intent to fields ---

// Slice from a text description: "A testimonial slice with a quote, author name,
// author role, an avatar, and a company logo." Check it creates a slice with
// sensible field types (rich text/key text for the quote, key text for
// name/role, image for avatar/logo), correct count, and a repeatable group if
// the design implies multiple. [C][Q]

// Slice from a screenshot/mock (if the agent can take an image): same as above,
// but from a visual. Tests interpretation. [Q][G]

// Page type from a spec: "A blog post with title, publish date, hero image,
// author reference, and body." Check field types and that the author is a
// content relationship, not free text. [C][Q]
it("models a page type with sensible field types", async ({ project, agent, expect }) => {
	const author = buildCustomType({ id: "author", label: "Author" });
	await writeLocalCustomType(project, author);

	await agent(
		`model a Prismic blog post: a title, publish date, hero image, author, and body`,
	);

	const models = (await readLocalCustomTypes(project)).filter((model) => model.id !== author.id);

	await expect(JSON.stringify(models, null, 2)).toSatisfyJudge(
		dedent`
			These are Prismic models. Are the models sensible for a blog post? Expect a rich text title, a date or timestamp for the publish date, a content relationship for the author, an image for the hero, and rich text for the body.
		`,
	);
});

// Ambiguous intent: a vague design ("a flexible hero"). The signal is whether it
// makes reasonable choices or asks. [Q][N]

// Right field type for the job: designs that tempt a wrong choice (a "rating" ->
// number vs select; a "CTA" -> link vs separate text+url). Judge the
// appropriateness. [Q]
it("models a title as single-heading rich text and a social media handle as key text", async ({ project, agent, expect }) => {
	const customType = buildCustomType({ id: "blog_post", label: "Blog Post" });
	await writeLocalCustomType(project, customType);
	await agent(`Set up the "blog_post" type: it needs a title and the author's Bluesky handle.`);
	const model = await readLocalCustomType(project, customType.id);

	await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
		dedent`
			This is a Prismic "blog_post" model. The task asked for a title and the author's Bluesky handle.
			By Prismic convention the title should be rich text (type "StructuredText") limited to a single heading block, NOT key text.
			The Bluesky handle should be key text (type "Text"): a short single-line string with no formatting.
			Score high only if both match; penalize key text (or plain rich text with no single-heading limit) for the title, and rich text for the handle.
		`,
	);
});

// --- C. Updating an existing project / editing models ---

// Add a field to an existing type without disturbing the others. Check the new
// field exists and the rest are unchanged. [C][N]

// Add a variation to an existing slice and confirm existing variations survive.
// [C][N]

// Rename / reorder fields and confirm nothing else drifts. [C]

// Extend a slice to match a design change (fixture: existing slice + a new design
// adding two fields). Tests incremental modeling. [C][Q]

// Idempotency: run the same modeling task twice; the second run shouldn't
// duplicate or corrupt. [N]

// --- D. Field-level operations ---

// Add a rich text field to an existing type. The simplest capability eval, and
// the cheap regression backbone (repeat per field type). [C][E]
it("adds a rich text field to a type", async ({ project, agent, expect }) => {
	const customType = buildCustomType({ id: "homepage", label: "Homepage" });
	await writeLocalCustomType(project, customType);
	const result = await agent(`add a "body" rich text field to "homepage"`);
	expect(result).toHaveRun("prismic", ["field", "add", "rich-text", "body"]);
	const model = await readLocalCustomType(project, customType.id);
	expect(model.json.Main.body.type).toBe("StructuredText");
});

// Nested group with fields inside. [C]

// Field with constraints (a select with specific options, a link limited to a
// type). Check the config, not just presence. [C]

// --- E. Documentation grounding ---

// Convention adherence: after a modeling+wiring task, check the code uses
// PrismicNextImage (not next/image), getByUID, slices in src/slices/, routes in
// prismic.config.json. Conforming is a proxy for "read and applied the docs."
// [G][Q]

// Consultation trajectory: from the transcript, did it hit the Prismic docs
// source (docs tool / skill / a fetch to prismic.io/docs) before acting on an
// unfamiliar task? Trend the rate. [G]

// Anti-hallucination: a task where the naive guess is wrong (the correct helper
// or config key differs from the obvious one). Check it used the documented one.
// [G][N]

// --- F. Wiring code ---

// Create a slice component that renders its fields and check it references each
// field. [C][Q]

// Connect a slice into a page's SliceZone and confirm the import/registration.
// [C]

// Add a route for a new page type and confirm prismic.config.json + the app/
// file. [C]

// Does it build: next build / tsc --noEmit passes after the change. [C]

// --- G. Repo configuration flows ---

// Set up the slice simulator and preview URLs; check the route handlers and
// settings. [C][G]

// Create an API token and set the repo private; confirm both. [C]

// Register a revalidation webhook with the right triggers. [C]

// Add a locale and localize routing (app/[lang], i18n.ts, locale-aware query).
// [C][Q][G]

// --- H. Negative / safety ---

// Don't reassign a document's type (Prismic doesn't support it). Check it refuses
// or routes around it rather than doing something destructive. [N]

// Don't delete content/fields it wasn't asked to. [N]

// Ask when genuinely ambiguous instead of guessing on a one-way-door action.
// [N][Q]

// --- I. End-to-end composite ---

// Zero to rendered page: init -> model a page type + a slice from a spec -> wire
// components -> next build passes. The flagship, and the best efficiency-trend
// target (steps/tokens for a realistic task). [C][Q][E][G]
