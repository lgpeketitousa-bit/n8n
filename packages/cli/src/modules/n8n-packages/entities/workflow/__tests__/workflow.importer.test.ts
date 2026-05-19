import type { LicenseState } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import type { SharedWorkflowRepository } from '@n8n/db';
import { mock, type MockProxy } from 'jest-mock-extended';

import type { NodeTypes } from '@/node-types';
import type { WorkflowHistoryService } from '@/workflows/workflow-history/workflow-history.service';

import type { EntityManagerLike } from './manager-types';
import type { ImportContext } from '../../entity-importer';
import type { PackageReader } from '../../../io/package-reader';
import type { PackageManifest } from '../../../spec/manifest.schema';
import type { SerializedWorkflow } from '../../../spec/serialized/workflow.schema';
import { WorkflowImporter } from '../workflow.importer';
import { WorkflowSerializer } from '../workflow.serializer';

jest.mock('@/permissions.ee/check-access', () => ({
	userHasScopes: jest.fn().mockResolvedValue(true),
}));

const buildSerializedWorkflow = (
	overrides: Partial<SerializedWorkflow> = {},
): SerializedWorkflow => ({
	id: 'wf-source-id',
	name: 'Imported Workflow',
	nodes: [
		{
			id: 'node-1',
			name: 'Start',
			type: 'n8n-nodes-base.start',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		},
	] as never,
	connections: {},
	versionId: 'source-version-id',
	parentFolderId: null,
	activeVersionId: null,
	isArchived: false,
	...overrides,
});

const buildReader = (workflows: Record<string, SerializedWorkflow>): PackageReader => {
	const reader = mock<PackageReader>();
	reader.readFile.mockImplementation(async (path) => {
		for (const [target, workflow] of Object.entries(workflows)) {
			if (path === `${target}/workflow.json`) {
				return Buffer.from(JSON.stringify(workflow));
			}
		}
		throw new Error(`Not found: ${path}`);
	});
	return reader;
};

const buildContext = (
	manifest: PackageManifest,
	reader: PackageReader,
	manager: EntityManagerLike,
): ImportContext => ({
	user: mock<User>(),
	manifest,
	reader,
	target: { projectId: 'project-1', folderId: null },
	manager: manager as never,
});

describe('WorkflowImporter.import', () => {
	let sharedWorkflowRepository: MockProxy<SharedWorkflowRepository>;
	let workflowHistoryService: MockProxy<WorkflowHistoryService>;
	let licenseState: MockProxy<LicenseState>;
	let nodeTypes: MockProxy<NodeTypes>;
	let importer: WorkflowImporter;
	let manager: EntityManagerLike;

	beforeEach(() => {
		sharedWorkflowRepository = mock<SharedWorkflowRepository>();
		workflowHistoryService = mock<WorkflowHistoryService>();
		licenseState = mock<LicenseState>();
		licenseState.isDataRedactionLicensed.mockReturnValue(true);
		nodeTypes = mock<NodeTypes>();

		sharedWorkflowRepository.create.mockImplementation(((entity: unknown) => entity) as never);

		manager = {
			save: jest.fn().mockImplementation(async <T>(_entity: unknown, payload: T) => payload),
		};

		importer = new WorkflowImporter(
			new WorkflowSerializer(),
			sharedWorkflowRepository,
			workflowHistoryService,
			nodeTypes,
			licenseState,
		);
	});

	it('imports each workflow listed in the manifest, assigning sourceWorkflowId from the package id', async () => {
		const wire = buildSerializedWorkflow({ id: 'wf-source-id', name: 'My Workflow' });
		const manifest: PackageManifest = {
			packageFormatVersion: '1',
			exportedAt: '2026-05-18T12:00:00.000Z',
			sourceN8nVersion: '1.0.0',
			sourceId: 'instance-abc',
			workflows: [{ id: 'wf-source-id', name: 'My Workflow', target: 'workflows/my-workflow' }],
		};
		const reader = buildReader({ 'workflows/my-workflow': wire });

		const result = await importer.import(buildContext(manifest, reader, manager));

		expect(result).toHaveLength(1);
		expect(result[0].sourceWorkflowId).toBe('wf-source-id');
		expect(result[0].name).toBe('My Workflow');
	});

	it('resets activeVersionId to null even when the wire has a published version', async () => {
		const wire = buildSerializedWorkflow({ activeVersionId: 'source-published-version-id' });
		const manifest: PackageManifest = {
			packageFormatVersion: '1',
			exportedAt: '2026-05-18T12:00:00.000Z',
			sourceN8nVersion: '1.0.0',
			sourceId: 'instance-abc',
			workflows: [{ id: wire.id, name: wire.name, target: 'workflows/wf' }],
		};
		const reader = buildReader({ 'workflows/wf': wire });

		const result = await importer.import(buildContext(manifest, reader, manager));

		expect(result[0].activeVersionId).toBe(null);
	});

	it('assigns a fresh versionId distinct from the wire versionId', async () => {
		const wire = buildSerializedWorkflow({ versionId: 'source-version-id' });
		const manifest: PackageManifest = {
			packageFormatVersion: '1',
			exportedAt: '2026-05-18T12:00:00.000Z',
			sourceN8nVersion: '1.0.0',
			sourceId: 'instance-abc',
			workflows: [{ id: wire.id, name: wire.name, target: 'workflows/wf' }],
		};
		const reader = buildReader({ 'workflows/wf': wire });

		const result = await importer.import(buildContext(manifest, reader, manager));

		expect(result[0].versionId).toBeDefined();
		expect(result[0].versionId).not.toBe('source-version-id');
	});

	it('creates a SharedWorkflow row tying the imported workflow to the target project', async () => {
		const wire = buildSerializedWorkflow();
		const manifest: PackageManifest = {
			packageFormatVersion: '1',
			exportedAt: '2026-05-18T12:00:00.000Z',
			sourceN8nVersion: '1.0.0',
			sourceId: 'instance-abc',
			workflows: [{ id: wire.id, name: wire.name, target: 'workflows/wf' }],
		};
		const reader = buildReader({ 'workflows/wf': wire });

		await importer.import(buildContext(manifest, reader, manager));

		expect(sharedWorkflowRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				role: 'workflow:owner',
				projectId: 'project-1',
			}),
		);
	});

	it('aborts when the manifest declares a workflow file that is not in the tar', async () => {
		const manifest: PackageManifest = {
			packageFormatVersion: '1',
			exportedAt: '2026-05-18T12:00:00.000Z',
			sourceN8nVersion: '1.0.0',
			sourceId: 'instance-abc',
			workflows: [{ id: 'wf-x', name: 'Missing', target: 'workflows/missing' }],
		};
		const reader = buildReader({});

		await expect(importer.import(buildContext(manifest, reader, manager))).rejects.toThrow(
			/missing/i,
		);
	});
});
