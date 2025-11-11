import React from 'react';
// FIX: Removed file extension from import for proper module resolution.
import type { AiResponse } from '../types';
// Fix: Remove file extensions from imports to fix module resolution errors.
import { useI18n } from '../lib/i18n';
// Fix: Remove file extensions from imports to fix module resolution errors.
// --- 变更 (STAGE 1) ---
// 导入一个新的图标
import { SparklesIcon, ExclamationTriangleIcon, FilterIcon, ServerStackIcon, WrenchScrewdriverIcon } from './icons';
// --- 变更结束 ---

interface AIAgentPanelProps {
    context: string;
    rawDapPayloads: object | null;
    response: AiResponse | null;
    isLoading: boolean;
    error: string | null;
    // --- 变更 (STAGE 1) ---
    // 添加 onApplyFix 属性
    onApplyFix: (fix: string) => void;
    // --- 变更结束 ---
}

const LoadingSpinner: React.FC = () => {
    const { t } = useI18n();
    return (
        <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            <span className="text-gray-400">{t('ai.loading')}</span>
        </div>
    );
};

export const AIAgentPanel: React.FC<AIAgentPanelProps> = ({ context, rawDapPayloads, response, isLoading, error, onApplyFix }) => {
    const { t } = useI18n();

    const renderResponse = () => {
        if (!response) return null;

        // --- 变更 (STAGE 1) ---
        // 添加一个分支来渲染“提议修复”
        if (response.tool === 'proposeFix' && response.fixSuggestion) {
            return (
                <div className="w-full text-left space-y-3">
                    <div className="font-mono bg-yellow-900/50 p-2 rounded text-yellow-300">
                        <div className="flex items-center font-bold">
                             <WrenchScrewdriverIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                            <span>AI 提议修复 (Propose Fix):</span>
                        </div>
                        <pre className="text-white text-xs pl-6 mt-1 whitespace-pre-wrap">{response.fixSuggestion}</pre>
                    </div>
                    <p className="text-gray-300 text-xs italic">"{response.explanation}"</p>
                    <button
                        onClick={() => onApplyFix(response.fixSuggestion!)}
                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-yellow-600 rounded-md shadow-md hover:bg-yellow-700 disabled:bg-gray-500 transition-colors"
                    >
                        应用修复 (Apply Fix)
                    </button>
                </div>
            );
        }
        // --- 变更结束 ---

        // 现有的工具渲染逻辑
        const toolText = response.tool === 'inspectVariable' && response.variableName
            ? t('ai.tool.inspectVariableDetail').replace('{variableName}', response.variableName)
            : t(`ai.tool.${response.tool as 'stepOver' | 'stepInto' | 'continue' | 'inspectVariable'}`) || response.tool;

        return (
            <div className="w-full text-left">
                <div className="font-mono bg-indigo-900/50 p-2 rounded">
                    <span className="text-indigo-300 font-bold">{t('ai.toolCall')}</span>
                    <span className="text-white ml-2">{toolText}</span>
                </div>
                <p className="mt-2 text-gray-300 text-xs italic">"{response.explanation}"</p>
            </div>
        );
    };

    return (
        <div className="bg-gray-800/50 rounded-lg shadow-lg border border-gray-700 h-[32rem] flex flex-col">
            <div className="flex items-center p-3 bg-gray-700/50 border-b border-gray-600">
                <SparklesIcon className="w-5 h-5 text-indigo-400 mr-2" />
                <h3 className="font-semibold text-white">{t('ai.title')}</h3>
            </div>
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                
                {/* Context Engineering Pipeline */}
                <div>
                    <h4 className="font-medium text-sm text-gray-300 mb-2">{t('ai.pipeline.title')}</h4>
                    <div className="space-y-2">
                        {/* 1. Raw Payloads */}
                        <div className="bg-gray-900/70 p-3 rounded-md">
                            <div className="flex items-center text-xs text-gray-400 mb-2">
                                <ServerStackIcon className="w-4 h-4 mr-2" />
                                <span>{t('ai.pipeline.rawTitle')}</span>
                            </div>
                            <pre className="text-xs text-gray-500 overflow-x-auto h-20">
                                {rawDapPayloads ? JSON.stringify(rawDapPayloads, null, 2) : <span className="italic">{t('ai.contextInitial')}</span>}
                            </pre>
                        </div>

                        {/* Arrow and Filter */}
                         <div className="flex justify-center items-center py-1 text-gray-600">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 12a.75.75 0 01-.75-.75V5.56l-1.97 1.97a.75.75 0 11-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 01-1.06 1.06L10.75 5.56V11.25A.75.75 0 0110 12z" clipRule="evenodd" /></svg>
                            <FilterIcon className="w-5 h-5 mx-2 text-indigo-400"/>
                            <span className="text-xs font-semibold text-indigo-400">{t('ai.pipeline.filterTitle')}</span>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 12a.75.75 0 01-.75-.75V5.56l-1.97 1.97a.75.75 0 11-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 01-1.06 1.06L10.75 5.56V11.25A.75.75 0 0110 12z" clipRule="evenodd" /></svg>
                        </div>
                        
                        {/* 2. Golden Context */}
                        <div className="bg-gray-900/70 p-3 rounded-md">
                             <div className="flex items-center text-xs text-gray-400 mb-2">
                                <SparklesIcon className="w-4 h-4 mr-2" />
                                <span>{t('ai.pipeline.goldenTitle')}</span>
                            </div>
                            <pre className="text-xs overflow-x-auto h-20">
                                {context || <span className="text-gray-500 italic">{t('ai.contextInitial')}</span>}
                            </pre>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 className="font-medium text-sm text-gray-300 mb-2">{t('ai.responseTitle')}</h4>
                    <div className="text-sm bg-gray-900 p-3 rounded-md min-h-[80px] flex items-center justify-center">
                        {isLoading && <LoadingSpinner />}
                        {error && (
                             <div className="text-red-400 flex items-center text-center">
                                <ExclamationTriangleIcon className="w-6 h-6 mr-3 flex-shrink-0"/>
                                <div>
                                    <p className="font-bold">{t('ai.error.title')}</p>
                                    <p className="text-xs mt-1">{error}</p>
                                </div>
                             </div>
                        )}
                        {!isLoading && !error && response && renderResponse()}
                        {!isLoading && !error && !response && (
                             <p className="text-gray-500 italic text-center">{t('ai.responseInitial')}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};