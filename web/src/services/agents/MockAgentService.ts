// FIX: Removed file extension from import for proper module resolution.
import type { IAgentService, SimulationStep, AiResponse, DapMessage } from '../../types';
import { INITIAL_PYTHON_CODE } from '../../constants';

const MOCK_FIBONACCI_SIMULATION: SimulationStep[] = [
    { line: 11, file: 'main.py', pauseReason: 'breakpoint', variables: {}, callStack: ['<module>'], dapSequence: [], rawDapDetails: {} },
    { line: 1, file: 'main.py', pauseReason: 'step', variables: { n: 5 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 3, file: 'main.py', pauseReason: 'step', variables: { n: 5 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 5, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 0, b: 1 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 6, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 0, b: 1, '_': 0 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 7, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 1, b: 1, '_': 0 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 6, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 1, b: 1, '_': 1 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 7, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 1, b: 2, '_': 1 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 6, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 1, b: 2, '_': 2 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 7, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 2, b: 3, '_': 2 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 6, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 2, b: 3, '_': 3 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 7, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 3, b: 5, '_': 3 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 8, file: 'main.py', pauseReason: 'step', variables: { n: 5, a: 3, b: 5 }, callStack: ['<module>', 'fibonacci(n=5)'], dapSequence: [], rawDapDetails: {} },
    { line: 11, file: 'main.py', pauseReason: 'step', variables: { result: 5 }, callStack: ['<module>'], dapSequence: [], rawDapDetails: {} },
    { line: 12, file: 'main.py', pauseReason: 'step', variables: { result: 5 }, callStack: ['<module>'], dapSequence: [], rawDapDetails: {} },
];

export class MockAgentService implements IAgentService {

    private createDapSequenceForStep(dapId: number, stepData: SimulationStep): { dapSequence: DapMessage[], rawDapDetails: object, nextId: number } {
        // This is a simplified version for mock purposes.
        const messages: DapMessage[] = [];
        let currentId = dapId;
        if (stepData.pauseReason === 'breakpoint') {
            messages.push({ id: currentId++, type: 'event', direction: 'in', command: 'stopped', payload: { reason: 'breakpoint' } });
        } else {
            messages.push({ id: currentId++, type: 'request', direction: 'out', command: 'next', payload: {} });
            messages.push({ id: currentId++, type: 'event', direction: 'in', command: 'stopped', payload: { reason: 'step' } });
        }
        return { dapSequence: messages, rawDapDetails: { variables: stepData.variables }, nextId: currentId };
    }

    async generateSimulation(code: string): Promise<SimulationStep[]> {
        // The mock agent only works for the default code.
        if (code.trim() !== INITIAL_PYTHON_CODE.trim()) {
            throw new Error("The Mock Agent only supports the default Fibonacci code. Please use a real AI model for custom code.");
        }
        
        let dapId = 1;
        const hydratedSteps = MOCK_FIBONACCI_SIMULATION.map(step => {
            const { dapSequence, rawDapDetails, nextId } = this.createDapSequenceForStep(dapId, step);
            dapId = nextId;
            return { ...step, dapSequence, rawDapDetails };
        });

        return Promise.resolve(hydratedSteps);
    }

    async getAIDebugAction(context: string): Promise<AiResponse> {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // --- 变更 (STAGE 1) ---
        // 添加一个新规则来模拟“提议修复”
        if (context.includes('result = fibonacci(5)') && context.includes('line: 11')) {
             return { 
                 tool: 'proposeFix',
                 fixSuggestion: 'result = fibonacci(6) # Let\'s try a different value',
                 explanation: 'I see we are calculating fibonacci(5). What if we tried 6 instead?' 
             };
        }
        // --- 变更结束 ---
        
        // Simple deterministic logic for the mock agent
        if (context.includes('fibonacci')) {
             if (context.includes('"b": 5')) {
                 return { tool: 'stepOver', explanation: 'The loop has finished, so I will step over to return the final value.' };
             }
             if (context.includes('"a"')) {
                return { tool: 'inspectVariable', variableName: 'b', explanation: 'Variable `b` holds the latest Fibonacci number, so I will inspect it.' };
             }
             return { tool: 'stepInto', explanation: 'This is the first call to a function, so I will step into it.' };
        }

        return { tool: 'stepOver', explanation: 'This is a simple line, so I will step over it.' };
    }
}