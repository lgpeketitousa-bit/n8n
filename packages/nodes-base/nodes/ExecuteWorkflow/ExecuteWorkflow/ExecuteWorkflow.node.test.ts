import { mock } from 'jest-mock-extended';
import type {
	IExecuteFunctions,
	INode,
	IWorkflowDataProxyData,
	SubWorkflowReturnMode,
} from 'n8n-workflow';

import { ExecuteWorkflow } from './ExecuteWorkflow.node';
import { getWorkflowInfo } from './GenericFunctions';

jest.mock('./GenericFunctions');
jest.mock('../../../utils/utilities');

describe('ExecuteWorkflow', () => {
	const executeWorkflow = new ExecuteWorkflow();
	const executeFunctions = mock<IExecuteFunctions>({
		getNodeParameter: jest.fn(),
		getInputData: jest.fn(),
		getWorkflowDataProxy: jest.fn(),
		executeWorkflow: jest.fn(),
		continueOnFail: jest.fn(),
		setMetadata: jest.fn(),
		getNode: jest.fn(),
	});

	beforeEach(() => {
		jest.clearAllMocks();
		executeFunctions.getInputData.mockReturnValue([{ json: { key: 'value' } }]);
		executeFunctions.getWorkflowDataProxy.mockReturnValue({
			$workflow: { id: 'workflowId' },
			$execution: { id: 'executionId' },
		} as unknown as IWorkflowDataProxyData);
	});

	test('should execute workflow in "each" mode and wait for sub-workflow completion', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(true); // waitForSubWorkflow

		executeFunctions.getInputData.mockReturnValue([{ json: { key: 'value' } }]);
		executeFunctions.getWorkflowDataProxy.mockReturnValue({
			$workflow: { id: 'workflowId' },
			$execution: { id: 'executionId' },
		} as unknown as IWorkflowDataProxyData);
		(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
		(executeFunctions.executeWorkflow as jest.Mock).mockResolvedValue({
			executionId: 'subExecutionId',
			data: [[{ json: { key: 'subValue' } }]],
		});

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[
				{
					json: { key: 'subValue' },
					pairedItem: { item: 0 },
					metadata: {
						subExecution: { workflowId: 'subWorkflowId', executionId: 'subExecutionId' },
					},
				},
			],
		]);

		// Verify shouldResume is set correctly
		expect(executeFunctions.executeWorkflow).toHaveBeenCalledWith(
			{ id: 'subWorkflowId' },
			[{ json: { key: 'value' }, index: 0, pairedItem: { item: 0 }, binary: undefined }],
			undefined,
			{
				parentExecution: {
					executionId: 'executionId',
					workflowId: 'workflowId',
					shouldResume: true,
				},
				returnMode: 'lastRunOnly',
			},
		);
	});

	test('should execute workflow in "once" mode and not wait for sub-workflow completion', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('once') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(false); // waitForSubWorkflow

		executeFunctions.getInputData.mockReturnValue([{ json: { key: 'value' } }]);
		(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });

		executeFunctions.executeWorkflow.mockResolvedValue({
			executionId: 'subExecutionId',
			data: [[{ json: { key: 'subValue' } }]],
		});

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[{ json: { key: 'value' }, index: 0, pairedItem: { item: 0 }, binary: undefined }],
		]);

		// Verify shouldResume is set to false
		expect(executeFunctions.executeWorkflow).toHaveBeenCalledWith(
			{ id: 'subWorkflowId' },
			[{ json: { key: 'value' }, index: 0, pairedItem: { item: 0 }, binary: undefined }],
			undefined,
			{
				doNotWaitToFinish: true,
				parentExecution: {
					executionId: 'executionId',
					workflowId: 'workflowId',
					shouldResume: false,
				},
				returnMode: 'lastRunOnly',
			},
		);
	});

	test('should handle errors and continue on fail, no items, < 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(true); // waitForSubWorkflow

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.2 } as INode);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([[{ json: { error: 'Test error' }, pairedItem: { item: 0 } }]]);
	});

	test('should handle errors and continue on fail, multiple items, < 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value (item 0)
			.mockReturnValueOnce({}) // workflowInputs.value (item 1)
			.mockReturnValueOnce({}) // workflowInputs.value (item 2)
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(true) // waitForSubWorkflow (item 0)
			.mockReturnValueOnce(true) // waitForSubWorkflow (item 1)
			.mockReturnValueOnce(true); // waitForSubWorkflow (item 2)

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.2 } as INode);
		executeFunctions.getInputData.mockReturnValueOnce([
			{ json: { key: '1' } },
			{ json: { key: '2' } },
			{ json: { key: '3' } },
		]);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[{ json: { error: 'Test error' }, pairedItem: { item: 0 }, metadata: undefined }],
			[{ json: { error: 'Test error' }, pairedItem: { item: 1 }, metadata: undefined }],
			[{ json: { error: 'Test error' }, pairedItem: { item: 2 }, metadata: undefined }],
		]);
	});

	test('should handle errors and continue on fail, no items, >= 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(true); // waitForSubWorkflow

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.3 } as INode);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([[{ json: { error: 'Test error' }, pairedItem: { item: 0 } }]]);
	});

	test('should handle errors and continue on fail, multiple items, >= 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value (item 0)
			.mockReturnValueOnce({}) // workflowInputs.value (item 1)
			.mockReturnValueOnce({}) // workflowInputs.value (item 2)
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(true) // waitForSubWorkflow (item 0)
			.mockReturnValueOnce(true) // waitForSubWorkflow (item 1)
			.mockReturnValueOnce(true); // waitForSubWorkflow (item 2)

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.3 } as INode);
		executeFunctions.getInputData.mockReturnValueOnce([
			{ json: { key: '1' } },
			{ json: { key: '2' } },
			{ json: { key: '3' } },
		]);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[
				{ json: { error: 'Test error' }, pairedItem: { item: 0 }, metadata: undefined },
				{ json: { error: 'Test error' }, pairedItem: { item: 1 }, metadata: undefined },
				{ json: { error: 'Test error' }, pairedItem: { item: 2 }, metadata: undefined },
			],
		]);
	});

	test('should throw error if not continuing on fail', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(undefined) // options.itemsFromSubWorkflow
			.mockReturnValueOnce(true); // waitForSubWorkflow

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(false);

		await expect(executeWorkflow.execute.call(executeFunctions)).rejects.toThrow(
			'Error executing workflow with item at index 0',
		);
	});

	describe('returnMode forwarding (v1.4)', () => {
		test.each<{
			scenario: string;
			callerOption: SubWorkflowReturnMode | undefined;
			typeVersion: number;
			expectedForwarded: SubWorkflowReturnMode;
		}>([
			{
				scenario: 'v1.4 caller forwards `fromSubWorkflow` when the option defers',
				callerOption: 'fromSubWorkflow',
				typeVersion: 1.4,
				expectedForwarded: 'fromSubWorkflow',
			},
			{
				scenario: 'v1.4 caller forwards an explicit `allRuns` override',
				callerOption: 'allRuns',
				typeVersion: 1.4,
				expectedForwarded: 'allRuns',
			},
			{
				scenario: 'v1.4 caller forwards an explicit `lastRunOnly` override',
				callerOption: 'lastRunOnly',
				typeVersion: 1.4,
				expectedForwarded: 'lastRunOnly',
			},
			{
				scenario: 'v1.3 caller is locked to `lastRunOnly`',
				callerOption: undefined,
				typeVersion: 1.3,
				expectedForwarded: 'lastRunOnly',
			},
		])('$scenario', async ({ callerOption, typeVersion, expectedForwarded }) => {
			executeFunctions.getNodeParameter
				.mockReturnValueOnce('database') // source
				.mockReturnValueOnce('once') // mode
				.mockReturnValueOnce({}) // workflowInputs.value
				.mockReturnValueOnce([]) // workflowInputs.schema
				.mockReturnValueOnce(callerOption ?? 'fromSubWorkflow') // options.itemsFromSubWorkflow (ignored for pre-1.4)
				.mockReturnValueOnce(true); // waitForSubWorkflow

			executeFunctions.getNode.mockReturnValue({ typeVersion } as INode);
			(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
			executeFunctions.executeWorkflow.mockResolvedValue({
				executionId: 'subExecutionId',
				data: [[{ json: { merged: true } }]],
			});

			await executeWorkflow.execute.call(executeFunctions);

			expect(executeFunctions.executeWorkflow).toHaveBeenCalledWith(
				{ id: 'subWorkflowId' },
				expect.anything(),
				undefined,
				expect.objectContaining({ returnMode: expectedForwarded }),
			);
		});

		test('forwards `returnMode` in `each` mode (one call per input item)', async () => {
			executeFunctions.getNodeParameter
				.mockReturnValueOnce('database') // source
				.mockReturnValueOnce('each') // mode
				.mockReturnValueOnce({}) // workflowInputs.value (item 0)
				.mockReturnValueOnce({}) // workflowInputs.value (item 1)
				.mockReturnValueOnce([]) // workflowInputs.schema
				.mockReturnValueOnce('allRuns') // options.itemsFromSubWorkflow
				.mockReturnValueOnce(true) // waitForSubWorkflow (item 0)
				.mockReturnValueOnce(true); // waitForSubWorkflow (item 1)

			executeFunctions.getNode.mockReturnValue({ typeVersion: 1.4 } as INode);
			executeFunctions.getInputData.mockReturnValue([
				{ json: { key: 'a' } },
				{ json: { key: 'b' } },
			]);
			(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
			executeFunctions.executeWorkflow.mockResolvedValue({
				executionId: 'subExecutionId',
				data: [[{ json: { merged: true } }]],
			});

			await executeWorkflow.execute.call(executeFunctions);

			expect(executeFunctions.executeWorkflow).toHaveBeenCalledTimes(2);
			expect(executeFunctions.executeWorkflow).toHaveBeenNthCalledWith(
				1,
				{ id: 'subWorkflowId' },
				expect.anything(),
				undefined,
				expect.objectContaining({ returnMode: 'allRuns' }),
			);
			expect(executeFunctions.executeWorkflow).toHaveBeenNthCalledWith(
				2,
				{ id: 'subWorkflowId' },
				expect.anything(),
				undefined,
				expect.objectContaining({ returnMode: 'allRuns' }),
			);
		});

		test('forwards executionResult.data to the parent without modification', async () => {
			executeFunctions.getNodeParameter
				.mockReturnValueOnce('database') // source
				.mockReturnValueOnce('once') // mode
				.mockReturnValueOnce({}) // workflowInputs.value
				.mockReturnValueOnce([]) // workflowInputs.schema
				.mockReturnValueOnce('allRuns') // options.itemsFromSubWorkflow
				.mockReturnValueOnce(true); // waitForSubWorkflow
			executeFunctions.getNode.mockReturnValue({ typeVersion: 1.4 } as INode);
			(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
			executeFunctions.executeWorkflow.mockResolvedValue({
				executionId: 'subExecutionId',
				data: [[{ json: { merged: true } }]],
			});

			const result = await executeWorkflow.execute.call(executeFunctions);

			const expectedDataForwardedWithPairedItem = [
				{ json: { merged: true }, pairedItem: { item: 0 } },
			];
			expect(result[0]).toEqual(expectedDataForwardedWithPairedItem);
		});
	});
});
