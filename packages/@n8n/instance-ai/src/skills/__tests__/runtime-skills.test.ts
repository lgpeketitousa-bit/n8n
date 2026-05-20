import { createSkillViewTool } from '@n8n/agents';
import { existsSync } from 'node:fs';

import { INSTANCE_AI_SKILLS_DIR, loadInstanceAiRuntimeSkillSource } from '../runtime-skills';

describe('Instance AI runtime skills', () => {
	it('loads the bundled workflow-auditor skill and its linked files', async () => {
		expect(existsSync(INSTANCE_AI_SKILLS_DIR)).toBe(true);

		const source = loadInstanceAiRuntimeSkillSource();
		const workflowAuditor = source.registry.skills.find(
			(skill) => skill.name === 'workflow-auditor',
		);

		expect(workflowAuditor).toMatchObject({
			name: 'workflow-auditor',
			description:
				'Use when reviewing n8n workflow exports for correctness, maintainability, credential safety, and likely runtime failures.',
			platforms: ['daytona'],
			recommendedTools: ['read_file', 'write_file', 'bash'],
		});
		expect(workflowAuditor?.linkedFiles.references).toEqual([
			expect.objectContaining({ path: 'references/audit-rubric.md' }),
		]);
		expect(workflowAuditor?.linkedFiles.scripts).toEqual([
			expect.objectContaining({ path: 'scripts/audit-workflow.mjs' }),
		]);

		const viewTool = createSkillViewTool(source);
		const viewResult = await viewTool.handler?.(
			{ name: 'workflow-auditor', filePath: 'scripts/audit-workflow.mjs' },
			{},
		);
		expect(viewResult).toMatchObject({
			success: true,
			name: 'workflow-auditor',
			filePath: 'scripts/audit-workflow.mjs',
		});
		if (
			!viewResult ||
			typeof viewResult !== 'object' ||
			!('content' in viewResult) ||
			typeof viewResult.content !== 'string'
		) {
			throw new Error('Expected skill_view to return file content');
		}
		expect(viewResult.content).toContain('workflow-audit-helper.json');
	});
});
