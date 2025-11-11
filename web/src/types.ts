export interface AiResponse {
    tool: 'next' | 'stepIn' | 'stepOut' | 'continue' | 'stepOver' | 'stepInto' | 'inspectVariable' | 'proposeFix';
    explanation: string;
    variableName?: string; 
    fixSuggestion?: string; 
}

export type AiModel = 'gemini-2.5-flash' | 'mock';

export interface PromptConfig {
    systemPrompt: string;
    codeContextWindow: number;
}

export interface DapMessage {
    id: number;
    type: 'event' | 'request' | 'response';
    direction: 'in' | 'out';
    command: string;
    payload: any;
}

export interface SimulationStep {
    line: number;
    file: string;
    pauseReason: 'breakpoint' | 'step';
    variables: Record<string, any>;
    callStack: string[];
    dapSequence: DapMessage[];
    rawDapDetails: object;
}

export interface SimulationState {
    isRunning: boolean;
    isPaused: boolean;
    isAwaitingAI: boolean;
    isGeneratingSimulation: boolean;
    error: string | null;
    currentStepIndex: number;
    dapLog: DapMessage[];
    aiContext: string;
    aiResponse: AiResponse | null;
    highlightedVariable: string | null;
    rawDapPayloads: object | null;
}

export interface IAgentService {
    generateSimulation(code: string): Promise<SimulationStep[]>;
    getAIDebugAction(context: string): Promise<AiResponse>;
}