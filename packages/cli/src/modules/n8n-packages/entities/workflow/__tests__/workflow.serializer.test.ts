import type { WorkflowEntity } from '@n8n/db';

import type { SerializedWorkflow } from '../../../spec/serialized/workflow.schema';
import { WorkflowSerializer } from '../workflow.serializer';

const wire = (overrides: Partial<SerializedWorkflow> = {}): SerializedWorkflow => ({
	id: 'wf-source-id',
	name: 'Workflow from package',
	nodes: [
		{
			id: 'node-1',
			name: 'Start',
			type: 'n8n-nodes-base.start',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		},
	],
	connections: {},
	versionId: 'version-from-source',
	parentFolderId: 'folder-from-source',
	active: true,
	isArchived: false,
	...overrides,
});

describe('WorkflowSerializer.deserialize', () => {
	const serializer = new WorkflowSerializer();

	it('returns a partial WorkflowEntity preserving content fields', () => {
		const result = serializer.deserialize(wire());

		expect(result.name).toBe('Workflow from package');
		expect(result.nodes).toEqual([
			{
				id: 'node-1',
				name: 'Start',
				type: 'n8n-nodes-base.start',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
		]);
		expect(result.connections).toEqual({});
	});

	it('preserves the wire isArchived flag', () => {
		const archived = serializer.deserialize(wire({ isArchived: true }));
		const live = serializer.deserialize(wire({ isArchived: false }));

		expect(archived.isArchived).toBe(true);
		expect(live.isArchived).toBe(false);
	});

	it('includes settings when present in the wire', () => {
		const result = serializer.deserialize(wire({ settings: { executionOrder: 'v1' } }));

		expect(result.settings).toEqual({ executionOrder: 'v1' });
	});

	it('omits settings when absent in the wire', () => {
		const result = serializer.deserialize(wire({ settings: undefined }));

		expect(result.settings).toBeUndefined();
	});

	it('does not carry id, versionId, parentFolderId, or active from the wire', () => {
		const result = serializer.deserialize(wire());

		const partial = result as Partial<WorkflowEntity>;
		expect(partial.id).toBeUndefined();
		expect(partial.versionId).toBeUndefined();
		expect(partial.parentFolder).toBeUndefined();
		expect(partial.active).toBeUndefined();
	});
});
