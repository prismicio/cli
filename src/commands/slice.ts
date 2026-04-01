import { createCommandRouter } from "../lib/command";
import sliceAddVariation from "./slice-add-variation";
import sliceConnect from "./slice-connect";
import sliceCreate from "./slice-create";
import sliceDisconnect from "./slice-disconnect";
import sliceList from "./slice-list";
import sliceRemove from "./slice-remove";
import sliceRemoveVariation from "./slice-remove-variation";
import sliceView from "./slice-view";

export default createCommandRouter({
	name: "prismic slice",
	description: "Manage slices.",
	commands: {
		create: {
			handler: sliceCreate,
			description: "Create a new slice",
		},
		remove: {
			handler: sliceRemove,
			description: "Remove a slice",
		},
		list: {
			handler: sliceList,
			description: "List slices",
		},
		view: {
			handler: sliceView,
			description: "View a slice",
		},
		connect: {
			handler: sliceConnect,
			description: "Connect a slice to a type's slice zone",
		},
		disconnect: {
			handler: sliceDisconnect,
			description: "Disconnect a slice from a type's slice zone",
		},
		"add-variation": {
			handler: sliceAddVariation,
			description: "Add a variation to a slice",
		},
		"remove-variation": {
			handler: sliceRemoveVariation,
			description: "Remove a variation from a slice",
		},
	},
});
