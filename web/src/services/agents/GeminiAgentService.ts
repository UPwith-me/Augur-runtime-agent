/// <reference types="vite/client" />
import { GoogleGenAI, Type } from "@google/genai";
import type { IAgentService, SimulationStep, AiResponse, DapMessage } from '../../types';

interface AiSimulationStep {
    line: number;
    pauseReason: 'breakpoint' | 'step';
    variables: Record<string, any>;
    callStack: string[];
}

export class GeminiAgentService implements IAgentService {

    private createDapSequenceForStep(dapId: number, stepData: AiSimulationStep): { dapSequence: DapMessage[], rawDapDetails: object, nextId: number } {
        const messages: DapMessage[] = [];
        let currentId = dapId;

        if (stepData.pauseReason === 'breakpoint') {
            messages.push({ id: currentId++, type: 'event', direction: 'in', command: 'stopped', payload: { reason: 'breakpoint', threadId: 1, text: 'Paused on breakpoint' } });
            messages.push({ id: currentId++, type: 'request', direction: 'out', command: 'stackTrace', payload: { threadId: 1 } });
            messages.push({ id: currentId++, type: 'response', direction: 'in', command: 'stackTrace', payload: { stackFrames: [{ id: 1000, name: stepData.callStack[0] || 'main', line: stepData.line, source: {name: 'main.py'}}] } });
            messages.push({ id: currentId++, type: 'request', direction: 'out', command: 'scopes', payload: { frameId: 1000 } });
            messages.push({ id: currentId++, type: 'response', direction: 'in', command: 'scopes', payload: { scopes: [{ name: 'Locals', variablesReference: 1001 }] } });
        } else {
            messages.push({ id: currentId++, type: 'request', direction: 'out', command: 'next', payload: { threadId: 1 } });
            messages.push({ id: currentId++, type: 'response', direction: 'in', command: 'next', payload: {} });
            messages.push({ id: currentId++, type: 'event', direction: 'in', command: 'stopped', payload: { reason: 'step', threadId: 1 } });
        }
        
        const rawDapDetails = {
            command: stepData.pauseReason === 'breakpoint' ? 'initial stop' : 'next',
            stopped: { reason: stepData.pauseReason },
            variables: stepData.variables,
        };

        return { dapSequence: messages, rawDapDetails, nextId: currentId };
    }

    async generateSimulation(code: string): Promise<SimulationStep[]> {
        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("APIKeyError: VITE_GEMINI_API_KEY is not set. Please create a .env.local file and add your key.");
            }
            const ai = new GoogleGenAI({ apiKey });
            
            const prompt = `
You are an expert Python debugger. Your task is to trace the execution of the following Python code and generate a series of simulation steps representing the state of the debugger at each pause point.
Rules:
1. Trace the code execution line by line, as a step-through debugger would.
2. The first step MUST have 'breakpoint' as the pauseReason and be on the first executable line. Subsequent steps MUST have 'step' as the pauseReason.
3. For each step, provide the line number, the call stack, and the state of ALL local variables currently in scope.
4. The call stack should be an array of strings. For the global scope, use '<module>'. For functions, use the format 'function_name(arg1=value1)'.
5. Variables should be a JSON object where keys are variable names and values are their corresponding JSON-compatible values (string, number, boolean, array, object).
6. The simulation should trace the entire execution until the program finishes. Do not stop prematurely.
7. Provide the output as a JSON object, adhering to the provided schema.

Python Code:
---
${code}
---
`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            steps: {
                                type: Type.ARRAY,
                                description: "An array of debugging steps.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        line: { type: Type.INTEGER, description: "The line number where the debugger is paused." },
                                        pauseReason: { type: Type.STRING, enum: ['breakpoint', 'step'], description: "Reason for pausing." },
                                        
                                        variables: {
                                            type: Type.OBJECT,
                                            description: "A key-value map of local variables in scope.",
                                            // 1. 添加一个“虚拟”属性来满足 "non-empty" 验证要求。
                                            //    我们不在这里定义 'required' 数组，所以 _virtual 默认就是可选的。
                                            properties: {
                                                _virtual: { type: Type.STRING } 
                                            },
                                            // 2. 仍然使用 "additionalProperties" 来允许任何其他键（即我们的实际变量）。
                                            additionalProperties: {
                                                type: [Type.STRING, Type.NUMBER, Type.BOOLEAN, Type.ARRAY, Type.OBJECT, Type.NULL]
                                            }
                                        },

                                        callStack: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The current call stack." }
                                    },
                                    // 3. 在 *这个* 级别，我们仍然要求 "variables" 对象本身是必须存在的。
                                    required: ["line", "pauseReason", "variables", "callStack"]
                                }
                            }
                        },
                        required: ["steps"]
                    }
                }
            });

            const jsonString = response.text.trim();
            const parsedResponse = JSON.parse(jsonString);
            const aiSteps: AiSimulationStep[] = parsedResponse.steps;

            if (!aiSteps || !Array.isArray(aiSteps) || aiSteps.length === 0) {
                throw new Error("AI failed to generate valid simulation steps.");
            }
            
            let dapId = 1;
            const fullSimulationSteps: SimulationStep[] = aiSteps.map(step => {
                const { dapSequence, rawDapDetails, nextId } = this.createDapSequenceForStep(dapId, step);
                dapId = nextId;
                return { ...step, file: 'main.py', dapSequence, rawDapDetails };
            });

            return fullSimulationSteps;

        } catch (error) {
            console.error("Error generating simulation with Gemini API:", error);
            if (error instanceof Error && error.message.includes("API key")) {
                 throw new Error("APIKeyError: Please check if the API key is valid or provided.");
            }
            if (error instanceof Error && error.message.includes("INVALID_ARGUMENT")) {
                console.error('Gemini API Schema Error Details:', error.message);
                throw new Error("API Schema Error: The AI model could not follow the requested JSON format. Please check the schema.");
            }
            if (error instanceof ReferenceError) {
                throw new Error(error.message);
            }
            throw new Error("Failed to generate simulation. The AI model may be unavailable or the code is invalid.");
        }
    }

    async getAIDebugAction(context: string): Promise<AiResponse> {
        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
             if (!apiKey) {
                throw new Error("APIKeyError: VITE_GEMINI_API_KEY is not set. Please create a .env.local file and add your key.");
            }
            const ai = new GoogleGenAI({ apiKey });
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: context,
                config: {
                    responseMimeType: "application/json",
                    // 更新 Schema 以允许 AI 提议修复
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            tool: {
                                type: Type.STRING,
                                // 添加 'proposeFix' 到枚举
                                description: "The debugging action to take. Must be one of: 'stepOver', 'stepInto', 'continue', 'inspectVariable', 'proposeFix'."
                            },
                            variableName: {
                                type: Type.STRING,
                                description: "The name of the variable to inspect. ONLY provide if the tool is 'inspectVariable'."
                            },
                            // 添加新属性
                            fixSuggestion: {
                                type: Type.STRING,
                                description: "The suggested line of code to fix the bug. ONLY provide if the tool is 'proposeFix'."
                            },
                            explanation: {
                                type: Type.STRING,
                                description: "A brief, one-sentence explanation for why this action was chosen."
                            }
                        },
                        required: ["tool", "explanation"]
                    },
                },
            });

            const jsonString = response.text.trim();
            const parsedResponse = JSON.parse(jsonString);

            if (!parsedResponse.tool || !parsedResponse.explanation) {
                throw new Error("AI response is missing required fields.");
            }
            if (parsedResponse.tool === 'inspectVariable' && !parsedResponse.variableName) {
                throw new Error("AI response for 'inspectVariable' is missing 'variableName'.");
            }
            if (parsedResponse.tool === 'proposeFix' && !parsedResponse.fixSuggestion) {
                throw new Error("AI response for 'proposeFix' is missing 'fixSuggestion'.");
            }

            return parsedResponse as AiResponse;

        } catch (error) {
            console.error("Error calling Gemini API for debug action:", error);
            if (error instanceof Error) {
                if (error.message.includes("API key")) {
                    throw new Error("APIKeyError: The provided API key is invalid or missing.");
                }
                 if (error.message.toLowerCase().includes('failed to fetch')) {
                     throw new Error('NetworkError: Could not connect to the AI service.');
                }
            }
            throw new Error(`GeminiAPIError: A problem occurred with the Gemini API call.`);
        }
    }
}