import React, { useState, useCallback } from 'react';
import type { SimulationState, SimulationStep, PromptConfig } from '@/types';
import { INITIAL_PYTHON_CODE } from '@/constants';
// FIX: Replaced the VS Code tracker import with the web-compatible service factory
import { getAgentService } from '@/services/aiServiceFactory';

import { GithubIcon } from '@/components/icons';
import { CodePanel } from '@/components/CodePanel';
import { StatePanel } from '@/components/StatePanel';
import { DapLogPanel } from '@/components/DapLogPanel';
import { AIAgentPanel } from '@/components/AIAgentPanel';
import { Controls } from '@/components/Controls';
import { UsageGuide } from '@/components/UsageGuide';
import { ArchitectureDiagram } from '@/components/ArchitectureDiagram';
import { Roadmap } from '@/components/Roadmap';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AIModelSelector } from '@/components/AIModelSelector';
import { PromptConfigPanel } from '@/components/PromptConfigPanel';
import { useI18n } from '@/lib/i18n';
import { useAI } from '@/contexts/AIProvider';

const initialState: SimulationState = {
    isRunning: false,
    isPaused: false,
    isAwaitingAI: false,
    isGeneratingSimulation: false,
    error: null,
    currentStepIndex: -1,
    dapLog: [],
    aiContext: '',
    aiResponse: null,
    highlightedVariable: null,
    rawDapPayloads: null,
};

// Helper function to extract a code snippet for the prompt
// (Simulates what tracker.ts does in VS Code)
function getCodeSnippet(fullCode: string, currentLine: number, windowSize: number): string {
    const lines = fullCode.split('\n');
    // currentLine is 1-based, arrays are 0-based
    const startLineIndex = Math.max(0, currentLine - 1 - windowSize);
    const endLineIndex = Math.min(lines.length, currentLine + windowSize);

    let snippet = '';
    for (let i = startLineIndex; i < endLineIndex; i++) {
        const lineNum = i + 1;
        const prefix = lineNum === currentLine ? '>' : ' ';
        snippet += `${prefix} ${lineNum}: ${lines[i]}\n`;
    }
    return snippet;
}

const App: React.FC = () => {
    const { t } = useI18n();
    const { selectedModel } = useAI();
    const [code, setCode] = useState<string>(INITIAL_PYTHON_CODE);
    const [simulationSteps, setSimulationSteps] = useState<SimulationStep[]>([]);
    const [state, setState] = useState<SimulationState>(initialState);
    const [promptConfig, setPromptConfig] = useState<PromptConfig>({
        // --- 变更 (STAGE 1) ---
        // 更新系统提示，告知 AI 它可以提议修复
        systemPrompt: `You are an expert debugging assistant. Your goal is to decide the next best debugging action to take.
Based on the current state of the debugger, choose one of the following tools: 'stepOver', 'stepInto', 'continue', 'inspectVariable', or 'proposeFix'.
If you choose 'inspectVariable', you MUST provide the variable name.
If you choose 'proposeFix', you MUST provide the replacement line of code in 'fixSuggestion'.
Provide a brief, one-sentence explanation for your choice.`,
        // --- 变更结束 ---
        codeContextWindow: 5,
    });

    const resetSimulation = useCallback(() => {
        setState(initialState);
    }, []);

    const startSimulation = useCallback(async () => {
        try {
            setState(s => ({ ...initialState, isGeneratingSimulation: true, error: null }));
            // Use the factory to get the correct service (Mock or Gemini) based on selection
            const agentService = getAgentService(selectedModel);
            const steps = await agentService.generateSimulation(code);

            if (steps.length === 0) {
                throw new Error(t('error.simulation.generationFailed'));
            }
            setSimulationSteps(steps);
            setState({
                ...initialState,
                isRunning: true,
                isPaused: true,
                currentStepIndex: 0,
                dapLog: steps[0].dapSequence,
                rawDapPayloads: steps[0].rawDapDetails,
            });
        } catch (e) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : t('error.simulation.unknown');
            setState(s => ({ ...initialState, error: errorMessage }));
        }
    }, [code, t, selectedModel]);

    const handleNextStep = useCallback(async () => {
        if (!state.isRunning || !state.isPaused || state.isAwaitingAI) return;
        if (state.currentStepIndex >= simulationSteps.length - 1) {
            setState(s => ({ ...s, isPaused: false, isAwaitingAI: false, error: t('simulation.end') }));
            return;
        }

        setState(s => ({ ...s, isAwaitingAI: true, error: null, aiResponse: null, highlightedVariable: null }));

        const currentStep = simulationSteps[state.currentStepIndex];

        try {
            // --- 1. Build the "Golden Context" (Context Engineering Pipeline) ---
            // In the real VS Code extension, 'tracker.ts' does this by querying the Debug Adapter.
            // Here in the web UI, we simulate it using the pre-calculated step data.
            const codeSnippet = getCodeSnippet(code, currentStep.line, promptConfig.codeContextWindow);
            const context = `${promptConfig.systemPrompt}

Current state:
- File: ${currentStep.file}
- Paused at line: ${currentStep.line}
- Reason: ${currentStep.pauseReason}

Code Context:
\`\`\`python
${codeSnippet}
\`\`\`

Call Stack:
${JSON.stringify(currentStep.callStack, null, 2)}

Local Variables:
${JSON.stringify(currentStep.variables, null, 2)}
`;
            // Update UI to show the generated prompt
            setState(s => ({ ...s, aiContext: context }));

            // --- 2. AI Agent Control Loop ---
            // Call the selected AI service (Mock or Gemini) to get a decision
            const agentService = getAgentService(selectedModel);
            const aiResponse = await agentService.getAIDebugAction(context);

            // --- 3. Execute (Simulated) ---
            // Advance to the next step in our pre-recorded simulation
            const nextStepIndex = state.currentStepIndex + 1;
            const nextStep = simulationSteps[nextStepIndex];

            if (!nextStep) {
                setState(s => ({ ...s, isAwaitingAI: false, isPaused: false, error: t('simulation.end'), aiResponse }));
                return;
            }

            setState(s => ({
                ...s,
                isAwaitingAI: false,
                aiResponse: aiResponse,
                currentStepIndex: nextStepIndex,
                // Append new DAP logs
                dapLog: [...s.dapLog, ...nextStep.dapSequence],
                // Update raw payload view
                rawDapPayloads: nextStep.rawDapDetails,
                // Highlight variable if requested by AI
                highlightedVariable: aiResponse.tool === 'inspectVariable' ? aiResponse.variableName || null : null,
            }));

        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : t('error.ai.unknown');
            setState(s => ({ ...s, isAwaitingAI: false, error: errorMessage }));
        }
    }, [state, simulationSteps, code, promptConfig, t, selectedModel]);


    // --- 变更 (STAGE 1) ---
    // 添加一个新的回调函数来处理“应用修复”
    const currentStep = state.isRunning ? simulationSteps[state.currentStepIndex] : null;

    const handleApplyFix = useCallback((fix: string) => {
        if (!currentStep) return;

        const lineToFix = currentStep.line - 1; // currentStep.line 是 1-based

        // 真实地修改代码状态
        const newCode = code.split('\n').map((line, index) => {
            if (index === lineToFix) {
                // 尝试保留原始缩进
                const originalIndentation = line.match(/^\s*/)?.[0] || '';
                return originalIndentation + fix.trim();
            }
            return line;
        }).join('\n');

        setCode(newCode);

        // 重要：修改代码后，旧的“模拟轨迹” (simulationSteps) 已失效
        // 我们必须重置模拟器，并向用户显示一条消息。
        setState(s => ({
            ...initialState,
            error: "代码已修改。请重置并重新开始模拟。"
        }));
        
        // 清空旧的模拟步骤
        setSimulationSteps([]);

        console.log(`Applied fix: ${fix} to line ${currentStep.line}`);

    }, [code, currentStep]);
    // --- 变更结束 ---

    return (
        <div className="bg-gray-900 min-h-screen text-white p-4 sm:p-6 lg:p-8">
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8 z-20 flex items-center space-x-4">
                <AIModelSelector />
                <LanguageSwitcher />
            </div>

            <header className="text-center mb-8">
                <div className="flex justify-center items-center gap-4">
                    <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">{t('title')}</h1>
                    <a href="https://github.com/google/generative-ai-docs/tree/main/demos/ai_debugger" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                        <GithubIcon className="w-8 h-8" />
                    </a>
                </div>
                <p className="mt-2 text-md text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
            </header>

            <main className="space-y-8">
                <UsageGuide />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        <Controls
                            isRunning={state.isRunning}
                            isPaused={state.isPaused}
                            isGeneratingSimulation={state.isGeneratingSimulation}
                            onStart={startSimulation}
                            onReset={resetSimulation}
                            onNextStep={handleNextStep}
                            currentStep={state.currentStepIndex + 1}
                            totalSteps={simulationSteps.length}
                        />
                        <CodePanel
                            code={code}
                            onCodeChange={setCode}
                            isReadOnly={state.isRunning || state.isGeneratingSimulation}
                            activeLine={currentStep?.line || null}
                        />
                    </div>
                    <div className="space-y-6">
                        <StatePanel
                            callStack={currentStep?.callStack || []}
                            variables={currentStep?.variables || {}}
                            highlightedVariable={state.highlightedVariable}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* --- 变更 (STAGE 1) --- */}
                    {/* 将 handleApplyFix 传递给 AIAgentPanel */}
                    <AIAgentPanel
                        context={state.aiContext}
                        rawDapPayloads={state.rawDapPayloads}
                        response={state.aiResponse}
                        isLoading={state.isAwaitingAI || state.isGeneratingSimulation}
                        error={state.error}
                        onApplyFix={handleApplyFix}
                    />
                    {/* --- 变更结束 --- */}
                    <div className="space-y-6">
                        <PromptConfigPanel config={promptConfig} onConfigChange={setPromptConfig} />
                        <DapLogPanel log={state.dapLog} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <ArchitectureDiagram />
                    <Roadmap />
                </div>
            </main>

            <footer className="text-center mt-12 text-sm text-gray-500">
                <p>{t('footer.builtWith')}</p>
                <p>{t('footer.disclaimer')}</p>
            </footer>
        </div>
    );
};

export default App;