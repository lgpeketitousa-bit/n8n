import { LicenseState } from '@n8n/backend-common';
import type { Folder } from '@n8n/db';
import { SharedWorkflow, SharedWorkflowRepository, WorkflowEntity } from '@n8n/db';
import { Service } from '@n8n/di';
import { jsonParse, UserError } from 'n8n-workflow';
import { v4 as uuid } from 'uuid';

import { NodeTypes } from '@/node-types';
import { userHasScopes } from '@/permissions.ee/check-access';
import * as WorkflowHelpers from '@/workflow-helpers';
import { WorkflowHistoryService } from '@/workflows/workflow-history/workflow-history.service';

import type { EntityImporter, ImportContext } from '../entity-importer';
import type { SerializedWorkflow } from '../../spec/serialized/workflow.schema';
import { WorkflowSerializer } from './workflow.serializer';

@Service()
export class WorkflowImporter implements EntityImporter<WorkflowEntity> {
	constructor(
		private readonly serializer: WorkflowSerializer,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly workflowHistoryService: WorkflowHistoryService,
		private readonly nodeTypes: NodeTypes,
		private readonly licenseState: LicenseState,
	) {}

	async import(context: ImportContext): Promise<WorkflowEntity[]> {
		const { manifest, reader, target, user, manager } = context;
		const entries = manifest.workflows ?? [];
		const imported: WorkflowEntity[] = [];

		for (const entry of entries) {
			const path = `${entry.target}/workflow.json`;

			let content: Buffer;
			try {
				content = await reader.readFile(path);
			} catch (cause) {
				throw new UserError(`Package manifest references a missing workflow file at ${path}.`, {
					cause,
				});
			}

			const wire = jsonParse<SerializedWorkflow>(content.toString('utf-8'), {
				errorMessage: `Package workflow file at ${path} is not valid JSON.`,
			});
			const partial = this.serializer.deserialize(wire);

			const workflow = Object.assign(new WorkflowEntity(), partial);
			workflow.versionId = uuid();
			workflow.active = false;
			workflow.activeVersionId = null;
			workflow.sourceWorkflowId = entry.id;
			workflow.parentFolder = target.folderId ? ({ id: target.folderId } as Folder) : null;

			WorkflowHelpers.addNodeIds(workflow);
			WorkflowHelpers.resolveNodeWebhookIds(workflow, this.nodeTypes);
			WorkflowHelpers.validateWorkflowStructure(workflow);

			// Strip redactionPolicy if the instance lacks the data-redaction license.
			if (
				workflow.settings?.redactionPolicy !== undefined &&
				!this.licenseState.isDataRedactionLicensed()
			) {
				delete workflow.settings.redactionPolicy;
			}

			// Strip redactionPolicy if the importer lacks the per-project scope.
			if (workflow.settings?.redactionPolicy !== undefined) {
				const canUpdateRedaction = await userHasScopes(
					user,
					['workflow:updateRedactionSetting'],
					false,
					{ projectId: target.projectId },
				);
				if (!canUpdateRedaction) {
					delete workflow.settings.redactionPolicy;
				}
			}

			const saved = await manager.save(WorkflowEntity, workflow);

			const shared = this.sharedWorkflowRepository.create({
				role: 'workflow:owner',
				projectId: target.projectId,
				workflow: saved,
			});
			await manager.save(SharedWorkflow, shared);

			await this.workflowHistoryService.saveVersion(user, saved, saved.id, false, manager);

			imported.push(saved);
		}

		return imported;
	}
}
