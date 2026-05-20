import { GlobalConfig } from '@n8n/config';
import type { Project, User } from '@n8n/db';
import { ProjectRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';
import { UserError } from 'n8n-workflow';
import { ZodError } from 'zod';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { EventService } from '@/events/event.service';
import { ExternalHooks } from '@/external-hooks';
import { FolderService } from '@/services/folder.service';
import { ProjectService } from '@/services/project.service.ee';

import type { ImportTarget } from '../entities/entity-importer';
import { WorkflowImporter } from '../entities/workflow/workflow.importer';
import { TarPackageReader } from '../io/tar/tar-package-reader';
import type { ImportPackageRequest, ImportResult } from '../n8n-packages.types';
import { packageManifestSchema } from '../spec/manifest.schema';

@Service()
export class ImportPipeline {
	constructor(
		private readonly workflowImporter: WorkflowImporter,
		private readonly dataSource: DataSource,
		private readonly globalConfig: GlobalConfig,
		private readonly projectRepository: ProjectRepository,
		private readonly projectService: ProjectService,
		private readonly folderService: FolderService,
		private readonly eventService: EventService,
		private readonly externalHooks: ExternalHooks,
	) {}

	async run(request: ImportPackageRequest): Promise<ImportResult> {
		const maxUncompressedBytes = this.globalConfig.endpoints.payloadSizeMax * 1024 * 1024;
		const reader = new TarPackageReader(request.packageBuffer, maxUncompressedBytes);

		let rawManifest: unknown;
		try {
			rawManifest = await reader.readManifest();
		} catch (error) {
			if (error instanceof BadRequestError) throw error;
			throw new BadRequestError('Failed to read package manifest');
		}

		let manifest;
		try {
			manifest = packageManifestSchema.parse(rawManifest);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new BadRequestError('Package manifest failed validation');
			}
			throw error;
		}

		const { target, project } = await this.resolveTarget(
			request.user,
			request.projectId,
			request.folderId,
		);

		const workflows = await this.dataSource.transaction(async (manager) => {
			return await this.workflowImporter.import({
				user: request.user,
				manifest,
				reader,
				target,
				manager,
			});
		});

		// Events fire only after the transaction has committed.
		for (const workflow of workflows) {
			await this.externalHooks.run('workflow.afterCreate', [workflow]);
			this.eventService.emit('workflow-created', {
				user: request.user,
				workflow,
				publicApi: true,
				projectId: target.projectId,
				projectType: project.type,
				source: 'import',
			});
		}

		this.eventService.emit('workflows-imported', {
			user: request.user,
			projectId: target.projectId,
			workflowIds: workflows.map((w) => w.id),
			packageSourceId: manifest.sourceId,
			packageVersion: manifest.packageFormatVersion,
		});

		return {
			package: {
				sourceN8nVersion: manifest.sourceN8nVersion,
				sourceId: manifest.sourceId,
				exportedAt: manifest.exportedAt,
			},
			workflows: workflows.map((w) => ({
				sourceId: w.sourceWorkflowId ?? '',
				localId: w.id,
				name: w.name,
				projectId: target.projectId,
				parentFolderId: w.parentFolder?.id ?? null,
				activeVersionId: w.activeVersionId ?? null,
			})),
		};
	}

	private async resolveTarget(
		user: User,
		projectId: string | undefined,
		folderId: string | undefined,
	): Promise<{ target: ImportTarget; project: Project }> {
		let project: Project;

		if (projectId === undefined) {
			project = await this.projectRepository.getPersonalProjectForUserOrFail(user.id);
		} else {
			const scoped = await this.projectService.getProjectWithScope(user, projectId, [
				'workflow:import',
			]);
			if (!scoped) {
				if (!(await this.projectRepository.exists({ where: { id: projectId } }))) {
					throw new NotFoundError(`Project not found: ${projectId}`);
				}
				throw new ForbiddenError(
					'You do not have permission to import workflows into this project.',
				);
			}
			project = scoped;
		}

		if (folderId !== undefined) {
			try {
				await this.folderService.findFolderInProjectOrFail(folderId, project.id);
			} catch (cause) {
				throw new UserError(`Folder not found in target project: ${folderId}`, { cause });
			}
		}

		return {
			project,
			target: { projectId: project.id, folderId: folderId ?? null },
		};
	}
}
