import { expect } from "vitest"

import { it } from "./it"

import { hello } from "../src"

// TODO: Test the package's exports
// See: https://vitest.dev/api/

it("returns a greeting with the given name", () => {
	const res = hello("foo")
	expect(res).toBe("Hello, foo")
})
