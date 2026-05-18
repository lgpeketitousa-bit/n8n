import type { User } from '@n8n/db';
import type { EntityManager } from '@n8n/typeorm';

import type { PackageReader } from '../io/package-reader';
import type { PackageManifest } from '../spec/manifest.schema';

/**
 * Where a package's entities should land on import.
 *
 * `projectId` is mandatory and resolved by `ImportPipeline.resolveTarget`
 * before this is passed to any entity importer. `folderId` is optional
 * and applies to workflows; other entity types may ignore it.
 */
export interface ImportTarget {
	projectId: string;
	folderId: string | null;
}

/**
 * Context passed to every entity importer. The pipeline owns the outer
 * transaction and shares its `EntityManager` so all per-entity writes
 * commit (or roll back) together.
 */
export interface ImportContext {
	user: User;
	manifest: PackageManifest;
	reader: PackageReader;
	target: ImportTarget;
	manager: EntityManager;
}

/**
 * Contract every per-entity importer implements. Returns the entities
 * that were inserted, in the order they were declared in the manifest.
 */
export interface EntityImporter<TEntity> {
	import(context: ImportContext): Promise<TEntity[]>;
}
