import { createCommandRouter } from "../lib/command";
import sliceConnect from "./slice-connect";
import sliceCreate from "./slice-create";
import sliceDisconnect from "./slice-disconnect";
import sliceList from "./slice-list";
import sliceRemove from "./slice-remove";
import sliceView from "./slice-view";

export default createCommandRouter({
	name: "prismic slice",
	description: "Manage slices.",
	commands: {
		create: {
			handler: sliceCreate,
			description: "Create a slice",
		},
		list: {
			handler: sliceList,
			description: "List slices",
		},
		view: {
			handler: sliceView,
			description: "View a slice",
		},
		remove: {
			handler: sliceRemove,
			description: "Remove a slice",
		},
		connect: {
			handler: sliceConnect,
			description: "Connect a slice to a type's slice zone",
		},
		disconnect: {
			handler: sliceDisconnect,
			description: "Disconnect a slice from a type's slice zone",
		},
	},
});
