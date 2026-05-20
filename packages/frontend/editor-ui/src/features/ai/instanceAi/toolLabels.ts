import { useI18n } from '@n8n/i18n';
import type { BaseTextKey } from '@n8n/i18n';
import type { IconName } from '@n8n/design-system';
import type { InstanceAiToolCallState } from '@n8n/api-types';

const NO_TOGGLE_TOOLS = new Set(['updateWorkingMemory', 'plan', 'task-control']);
const N8N_SKILL_DIR_TEMPLATE = '$' + '{N8N_SKILL_DIR}';

function translatedLabel(
	i18n: ReturnType<typeof useI18n>,
	key: BaseTextKey,
	fallback: string,
): string {
	const translated = i18n.baseText(key);
	return translated === key ? fallback : translated;
}

function getBasename(path: string): string {
	const cleanPath = path.split(/[?#]/, 1)[0] ?? path;
	return cleanPath.split('/').filter(Boolean).at(-1) ?? cleanPath;
}

function humanizeFileLabel(path: string): string {
	const basename = getBasename(path);
	const withoutExtension = basename.replace(/\.[^.]+$/, '');
	return withoutExtension
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function appendKind(label: string, kind: string): string {
	if (!label) return kind;
	const words = label.split(' ');
	return words.at(-1) === kind ? label : `${label} ${kind}`;
}

function getSkillFileLabel(i18n: ReturnType<typeof useI18n>, filePath: string): string | undefined {
	const [group] = filePath.split('/');
	const fileLabel = humanizeFileLabel(filePath);

	if (group === 'references') {
		return `${translatedLabel(
			i18n,
			'instanceAi.tools.skill_view.reference' as BaseTextKey,
			'Reading',
		)} ${fileLabel || translatedLabel(i18n, 'instanceAi.tools.skill_view.referenceFallback' as BaseTextKey, 'reference')}`;
	}

	if (group === 'scripts') {
		return `${translatedLabel(
			i18n,
			'instanceAi.tools.skill_view.script' as BaseTextKey,
			'Inspecting',
		)} ${appendKind(
			fileLabel,
			translatedLabel(i18n, 'instanceAi.tools.skill_view.scriptFallback' as BaseTextKey, 'script'),
		)}`;
	}

	if (group === 'templates') {
		return `${translatedLabel(
			i18n,
			'instanceAi.tools.skill_view.template' as BaseTextKey,
			'Reading',
		)} ${appendKind(
			fileLabel,
			translatedLabel(
				i18n,
				'instanceAi.tools.skill_view.templateFallback' as BaseTextKey,
				'template',
			),
		)}`;
	}

	if (group === 'examples') {
		return `${translatedLabel(
			i18n,
			'instanceAi.tools.skill_view.example' as BaseTextKey,
			'Reading',
		)} ${appendKind(
			fileLabel,
			translatedLabel(
				i18n,
				'instanceAi.tools.skill_view.exampleFallback' as BaseTextKey,
				'example',
			),
		)}`;
	}

	if (group === 'assets') {
		return `${translatedLabel(
			i18n,
			'instanceAi.tools.skill_view.asset' as BaseTextKey,
			'Opening',
		)} ${appendKind(
			fileLabel,
			translatedLabel(i18n, 'instanceAi.tools.skill_view.assetFallback' as BaseTextKey, 'asset'),
		)}`;
	}

	if (fileLabel) {
		return `${translatedLabel(
			i18n,
			'instanceAi.tools.skill_view.file' as BaseTextKey,
			'Reading',
		)} ${fileLabel}`;
	}

	return undefined;
}

function extractSkillScriptPath(command: string): string | undefined {
	const envSkillDirMatch = command.match(
		/\$(?:\{N8N_SKILL_DIR\}|N8N_SKILL_DIR)\/scripts\/([^\s"'`;|&]+)/,
	);
	if (envSkillDirMatch?.[1]) return envSkillDirMatch[1];

	const sandboxSkillDirMatch = command.match(/\/skills\/[^/\s"'`;|&]+\/scripts\/([^\s"'`;|&]+)/);
	return sandboxSkillDirMatch?.[1];
}

export function getToolIcon(toolName: string): IconName {
	if (toolName === 'complete-checkpoint') return 'circle-check';
	if (toolName === 'delegate' || toolName.endsWith('-with-agent')) return 'share';
	if (toolName === 'skills_list' || toolName === 'skill_view') return 'book-open';
	if (toolName === 'data-tables') return 'table';
	if (
		toolName === 'workflows' ||
		toolName === 'executions' ||
		toolName === 'nodes' ||
		toolName === 'templates'
	)
		return 'workflow';
	if (toolName === 'research') return 'search';
	if (toolName === 'credentials' || toolName === 'browser-credential-setup') return 'key-round';
	if (toolName === 'task-control' || toolName === 'updateWorkingMemory' || toolName === 'plan')
		return 'brain';
	if (toolName === 'filesystem') return 'file-text';
	if (toolName === 'workspace' || toolName.startsWith('workspace_')) return 'folder';
	if (toolName.includes('data-table')) return 'table';
	if (
		toolName.includes('workflow') ||
		toolName === 'submit-workflow' ||
		toolName === 'materialize-node-type'
	) {
		return 'workflow';
	}
	if (toolName.includes('credential')) return 'key-round';
	return 'settings';
}

/**
 * Returns a human-readable display label for an instance AI tool name.
 * Falls back to the raw tool name if no mapping exists in i18n.
 */
export function useToolLabel() {
	const i18n = useI18n();

	function getToolLabel(toolName: string, args?: Record<string, unknown>): string {
		if (toolName === 'skill_view') {
			const name = typeof args?.name === 'string' ? args.name : undefined;
			const filePath = typeof args?.filePath === 'string' ? args.filePath : undefined;
			if (filePath) {
				const skillFileLabel = getSkillFileLabel(i18n, filePath);
				if (skillFileLabel) return skillFileLabel;
			}

			const label = translatedLabel(
				i18n,
				'instanceAi.tools.skill_view' as BaseTextKey,
				'Opening skill',
			);
			if (name) return `${label}: ${name}`;
			return label;
		}

		if (
			toolName === 'workspace_execute_command' &&
			typeof args?.command === 'string' &&
			(args.command.includes(N8N_SKILL_DIR_TEMPLATE) ||
				args.command.includes('$N8N_SKILL_DIR') ||
				args.command.includes('/skills/'))
		) {
			const scriptPath = extractSkillScriptPath(args.command);
			if (scriptPath) {
				const scriptLabel = appendKind(
					humanizeFileLabel(scriptPath),
					translatedLabel(
						i18n,
						'instanceAi.tools.skill_view.scriptFallback' as BaseTextKey,
						'script',
					),
				);
				return `${translatedLabel(
					i18n,
					'instanceAi.tools.workspace_execute_command.skillScript' as BaseTextKey,
					'Running',
				)} ${scriptLabel}`;
			}

			return translatedLabel(
				i18n,
				'instanceAi.tools.workspace_execute_command.skill' as BaseTextKey,
				'Running skill script',
			);
		}

		const action = typeof args?.action === 'string' ? args.action : undefined;
		if (action) {
			const actionKey = `instanceAi.tools.${toolName}.${action}` as BaseTextKey;
			const actionTranslated = i18n.baseText(actionKey);
			if (actionTranslated !== actionKey) return actionTranslated;
		}
		const key = `instanceAi.tools.${toolName}` as BaseTextKey;
		const translated = i18n.baseText(key);
		return translated === key ? toolName : translated;
	}

	function getToggleLabel(toolCall: InstanceAiToolCallState): string | undefined {
		if (NO_TOGGLE_TOOLS.has(toolCall.toolName)) return undefined;
		if (toolCall.toolName === 'delegate') {
			return i18n.baseText('instanceAi.stepTimeline.showBrief');
		}
		return i18n.baseText('instanceAi.stepTimeline.showData');
	}

	function getHideLabel(toolCall: InstanceAiToolCallState): string | undefined {
		if (NO_TOGGLE_TOOLS.has(toolCall.toolName)) return undefined;
		if (toolCall.toolName === 'delegate') {
			return i18n.baseText('instanceAi.stepTimeline.hideBrief');
		}
		return i18n.baseText('instanceAi.stepTimeline.hideData');
	}

	return { getToolLabel, getToggleLabel, getHideLabel };
}
