import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const workspaceDir = process.env.N8N_WORKSPACE_DIR ?? '/home/daytona/workspace';
const outputPath =
	process.env.WORKFLOW_AUDIT_OUTPUT ?? `${workspaceDir}/workflow-audit-helper.json`;
const workflowPath = process.argv[2];

if (!workflowPath) {
	console.error('Usage: node audit-workflow.mjs <workflow-json-path>');
	process.exit(1);
}

if (!existsSync(workflowPath)) {
	console.error(`Workflow JSON not found: ${workflowPath}`);
	process.exit(1);
}

let workflow;
try {
	workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
} catch (error) {
	console.error(
		`Invalid workflow JSON at ${workflowPath}: ${
			error instanceof Error ? error.message : String(error)
		}`,
	);
	process.exit(1);
}

const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
const findings = [];

if (!hasConnections(workflow.connections)) {
	findings.push(finding('high', 'connections.empty', 'Workflow has no active connections.'));
}

for (const node of nodes) {
	const name = stringValue(node.name, 'Unnamed node');
	const type = stringValue(node.type, '');
	const parameters = node.parameters ?? {};

	if (node.disabled === true) {
		findings.push(finding('medium', 'node.disabled', `Disabled node: ${name}`, { node: name }));
	}

	if (looksCredentialBacked(type) && !hasCredentials(node.credentials)) {
		findings.push(
			finding('high', 'credentials.missing', `Likely missing credentials: ${name}`, {
				node: name,
				type,
			}),
		);
	}

	if (hasSecretLikeValue(parameters)) {
		findings.push(
			finding('critical', 'secret.parameter', `Possible hard-coded secret in node: ${name}`, {
				node: name,
			}),
		);
	}

	if (isOneMinuteSchedule(node)) {
		findings.push(
			finding('medium', 'trigger.too-frequent', `Schedule trigger runs every minute: ${name}`, {
				node: name,
			}),
		);
	}

	if (hasGenericName(name)) {
		findings.push(finding('low', 'name.generic', `Generic node name: ${name}`, { node: name }));
	}
}

if (!nodes.some((node) => /trigger/i.test(stringValue(node.type, '')))) {
	findings.push(finding('high', 'trigger.missing', 'Workflow has no obvious trigger node.'));
}

const summary = {
	workflow: stringValue(workflow.name, 'Unnamed workflow'),
	nodeCount: nodes.length,
	findingsCount: findings.length,
	severityCounts: countBy(findings, 'severity'),
	verdict: verdictFor(findings),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ summary, findings }, null, 2)}\n`);

console.log(`Wrote workflow audit helper output to ${outputPath}`);

function finding(severity, code, message, metadata = {}) {
	return { severity, code, message, metadata };
}

function hasConnections(connections) {
	if (!connections || typeof connections !== 'object') return false;

	return Object.values(connections).some((sourceConnections) =>
		Object.values(sourceConnections ?? {}).some(
			(outputs) =>
				Array.isArray(outputs) &&
				outputs.some((outputGroup) => Array.isArray(outputGroup) && outputGroup.length > 0),
		),
	);
}

function looksCredentialBacked(type) {
	return /slack|gmail|google|sheets|drive|github|jira|salesforce|hubspot|stripe|postgres|mysql|mongo|redis|httpRequest/i.test(
		type,
	);
}

function hasCredentials(credentials) {
	return Boolean(
		credentials &&
			typeof credentials === 'object' &&
			!Array.isArray(credentials) &&
			Object.keys(credentials).length > 0,
	);
}

function hasSecretLikeValue(value) {
	const hits = [];
	collectStrings(value, hits);
	return hits.some((text) =>
		/(api[_-]?key|access[_-]?token|secret|bearer\s+[a-z0-9._-]+|xox[baprs]-|token=)[^,\s"'`}]*/i.test(
			text,
		),
	);
}

function collectStrings(value, out) {
	if (typeof value === 'string') {
		out.push(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectStrings(item, out);
		return;
	}
	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) collectStrings(item, out);
	}
}

function isOneMinuteSchedule(node) {
	if (!/scheduleTrigger/i.test(stringValue(node.type, ''))) return false;

	const serialized = JSON.stringify(node.parameters ?? {});
	return (
		/"field"\s*:\s*"minutes"/.test(serialized) && /"minutesInterval"\s*:\s*1\b/.test(serialized)
	);
}

function hasGenericName(name) {
	return /^(node|step|action|trigger|http request|webhook|schedule)$/i.test(name.trim());
}

function stringValue(value, fallback) {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function countBy(items, key) {
	return items.reduce((counts, item) => {
		const value = item[key];
		counts[value] = (counts[value] ?? 0) + 1;
		return counts;
	}, {});
}

function verdictFor(items) {
	if (items.some((item) => item.severity === 'critical')) return 'unsafe';
	if (items.some((item) => item.severity === 'high')) return 'risky';
	return items.length > 0 ? 'risky' : 'safe';
}
