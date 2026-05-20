import { createSkillViewTool, type Workspace } from '@n8n/agents';
import { jsonParse } from 'n8n-workflow';

import {
	N8N_SKILLS_DIR_ENV,
	N8N_SKILL_DIR_ENV,
	N8N_WORKSPACE_DIR_ENV,
	SANDBOX_RUNTIME_SKILLS_DIR,
	SANDBOX_RUNTIME_SKILL_REGISTRY_FILE,
	materializeRuntimeSkillsIntoWorkspace,
} from '../materialize-runtime-skills';
import { loadInstanceAiRuntimeSkillSource } from '../runtime-skills';

function createMockWorkspace() {
	const writes = new Map<string, string>();
	const writeFile = jest.fn(async (path: string, content: string | Buffer) => {
		writes.set(path, Buffer.isBuffer(content) ? content.toString('utf-8') : content);
		await Promise.resolve();
	});
	const sandbox = {
		getDefaultCommandEnv: () => ({ EXISTING_ENV: 'kept' }),
	};

	return {
		writes,
		workspace: {
			filesystem: { writeFile },
			sandbox,
		} as unknown as Workspace,
	};
}

describe('materializeRuntimeSkillsIntoWorkspace', () => {
	it('copies bundled skills and linked files into the builder workspace', async () => {
		const source = loadInstanceAiRuntimeSkillSource();
		const { workspace, writes } = createMockWorkspace();
		const root = '/home/daytona/workspace';

		const materialized = await materializeRuntimeSkillsIntoWorkspace({
			source,
			workspace,
			root,
		});

		expect(materialized).toBeDefined();
		const skillDir = `${root}/${SANDBOX_RUNTIME_SKILLS_DIR}/workflow-auditor`;
		const skillPath = `${skillDir}/SKILL.md`;
		const scriptPath = `${skillDir}/scripts/audit-workflow.mjs`;
		const registryPath = `${root}/${SANDBOX_RUNTIME_SKILLS_DIR}/${SANDBOX_RUNTIME_SKILL_REGISTRY_FILE}`;

		expect(writes.get(skillPath)).toContain(`node ${skillDir}/scripts/audit-workflow.mjs`);
		expect(writes.get(skillPath)).toContain(`${root}/workflow-audit-helper.json`);
		expect(writes.get(scriptPath)).toContain('workflow-audit-helper.json');
		expect(writes.has(`${skillDir}/references/audit-rubric.md`)).toBe(true);

		const registry = jsonParse<{
			skills: Array<{ name: string; path: string; directory: string }>;
		}>(writes.get(registryPath) ?? '{}');
		expect(registry.skills[0]).toMatchObject({
			name: 'workflow-auditor',
			path: skillPath,
			directory: skillDir,
		});

		expect(materialized?.env).toMatchObject({
			[N8N_WORKSPACE_DIR_ENV]: root,
			[N8N_SKILLS_DIR_ENV]: `${root}/${SANDBOX_RUNTIME_SKILLS_DIR}`,
			[N8N_SKILL_DIR_ENV]: skillDir,
		});
		expect(workspace.sandbox?.getDefaultCommandEnv?.()).toMatchObject({
			EXISTING_ENV: 'kept',
			[N8N_SKILL_DIR_ENV]: skillDir,
		});
	});

	it('returns a sandbox-aware skill source for skill_view output', async () => {
		const source = loadInstanceAiRuntimeSkillSource();
		const { workspace } = createMockWorkspace();
		const root = '/home/daytona/workspace';

		const materialized = await materializeRuntimeSkillsIntoWorkspace({
			source,
			workspace,
			root,
		});
		if (!materialized) throw new Error('Expected runtime skills to materialize');

		const viewTool = createSkillViewTool(materialized.source);
		const result = await viewTool.handler?.({ name: 'workflow-auditor' }, {});

		expect(result).toMatchObject({
			success: true,
			name: 'workflow-auditor',
			skillDir: `${root}/${SANDBOX_RUNTIME_SKILLS_DIR}/workflow-auditor`,
		});
		if (
			!result ||
			typeof result !== 'object' ||
			!('content' in result) ||
			typeof result.content !== 'string'
		) {
			throw new Error('Expected skill_view to return materialized skill content');
		}
		expect(result.content).toContain(
			`${root}/${SANDBOX_RUNTIME_SKILLS_DIR}/workflow-auditor/scripts/audit-workflow.mjs`,
		);
	});
});
