type StarterHandoffDescriptor = {
	deploymentUrl: string
}

export const INSTANT_PREVIEW_DEPLOYMENT_PATH = ".deployment/instant-preview"

export function buildHostedPreviewUrl(args: {
	deploymentUrl: string
	repositoryName: string
}): string {
	return new URL(`/api/preview/${args.repositoryName}`, args.deploymentUrl).href
}

export function getHostedPreviewURLsToRemove(args: {
	starter: StarterHandoffDescriptor
	repositoryName: string
	resolverPath: string
}): string[] {
	const urls = new Set<string>()

	urls.add(
		buildHostedPreviewUrl({
			deploymentUrl: args.starter.deploymentUrl,
			repositoryName: args.repositoryName,
		}),
	)
	urls.add(new URL(args.resolverPath, args.starter.deploymentUrl).href)

	return [...urls]
}
