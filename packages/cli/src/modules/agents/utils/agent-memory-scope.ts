export function draftChatEpisodicMemoryResourceId(userId: string): string {
	return `draft-chat:${userId}`;
}

export function scheduledRunEpisodicMemoryResourceId(executionUserId: string): string {
	return `schedule:${executionUserId}`;
}

export function integrationEpisodicMemoryResourceId(
	integrationType: string,
	threadId: string,
): string {
	return `integration:${integrationType}:${threadId}`;
}
