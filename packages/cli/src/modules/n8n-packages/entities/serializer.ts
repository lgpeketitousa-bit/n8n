/**
 * Generic contract every per-entity serializer implements. `TDb` is the
 * database entity type (e.g. `WorkflowEntity`), `TWire` is the package's
 * on-disk representation (e.g. `SerializedWorkflow`).
 */
export interface Serializer<TDb, TWire> {
	serialize(entity: TDb): TWire;
	deserialize(wire: TWire): Partial<TDb>;
}
