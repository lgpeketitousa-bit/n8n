import type { WorkflowEntity } from '@n8n/db';
import { Service } from '@n8n/di';

import {
	serializedWorkflowSchema,
	type SerializedWorkflow,
} from '../../spec/serialized/workflow.schema';

@Service()
export class WorkflowSerializer {
	serialize(workflow: WorkflowEntity): SerializedWorkflow {
		return serializedWorkflowSchema.parse({
			id: workflow.id,
			name: workflow.name,
			nodes: workflow.nodes,
			connections: workflow.connections,
			settings: workflow.settings,
			versionId: workflow.versionId,
			parentFolderId: workflow.parentFolder?.id ?? null,
			activeVersionId: workflow.activeVersionId ?? null,
			isArchived: workflow.isArchived,
		});
	}

	/**
	 * Turns a workflow from a package back into something we can save on
	 * the target instance.
	 *
	 * We drop anything the target owns — its id, versionId, where it lives,
	 * activation state, timestamps — so the caller can set those fresh.
	 * The content of the workflow comes along, and we keep whichever
	 * archived state the source had it in.
	 */
	deserialize(wire: SerializedWorkflow): Partial<WorkflowEntity> {
		const partial: Partial<WorkflowEntity> = {
			name: wire.name,
			nodes: wire.nodes,
			connections: wire.connections,
			isArchived: wire.isArchived,
		};

		if (wire.settings !== undefined) {
			partial.settings = wire.settings;
		}

		return partial;
	}
}
