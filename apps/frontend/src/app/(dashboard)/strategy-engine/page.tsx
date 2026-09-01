'use client';

import {
  PromptInputPanel,
  UrlInputPanel,
  AnalyzedStrategyPanel,
  StrategyJsonPanel,
  ValidationStatusCard,
  SaveStrategyPanel,
  RecentlyImportedTable,
  useStrategyGeneration,
} from '../../../features/strategy-generation';

export default function StrategyEnginePage() {
  const {
    promptText,
    setPromptText,
    urlText,
    setUrlText,
    isGenerating,
    activeKind,
    generation,
    generationError,
    paramsText,
    handleParamsTextChange,
    paramsValidation,
    renderedParams,
    isParamsDirty,
    handleAnalyzePrompt,
    handleExtractUrl,
    handleClearPrompt,
    saveName,
    setSaveName,
    saveDescription,
    setSaveDescription,
    saveTags,
    setSaveTags,
    saveLibraryVersion,
    setSaveLibraryVersion,
    isSaving,
    saveError,
    handleSave,
    recentStrategies,
    isLoadingRecent,
  } = useStrategyGeneration();

  const validationStatus = generationError
    ? 'error'
    : !generation
      ? 'idle'
      : paramsValidation.status === 'checking'
        ? 'checking'
        : paramsValidation.status === 'valid'
          ? 'valid'
          : 'error';

  const validationMessage =
    generationError ??
    (paramsValidation.status === 'invalid' ||
    paramsValidation.status === 'syntax-error'
      ? paramsValidation.message
      : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Create a Strategy from a Prompt or URL
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter natural language or a website link and the system generates a
          strategy you can save to the library
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-3">
          <PromptInputPanel
            promptText={promptText}
            onChangePromptText={setPromptText}
            onAnalyze={() => void handleAnalyzePrompt()}
            onClear={handleClearPrompt}
            isAnalyzing={isGenerating && activeKind === 'USER_PROMPT'}
            hasUnsavedEdits={isParamsDirty}
          />
          <UrlInputPanel
            urlText={urlText}
            onChangeUrlText={setUrlText}
            onExtract={() => void handleExtractUrl()}
            isExtracting={isGenerating && activeKind === 'WEB_IMPORT'}
            hasUnsavedEdits={isParamsDirty}
          />
        </div>

        <div className="lg:col-span-3">
          {generation && renderedParams ? (
            <AnalyzedStrategyPanel
              params={renderedParams}
              unsupportedRequests={generation.response.unsupportedRequests}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-xs text-slate-400">
              Analysis results will appear here after you analyze a description
              or URL.
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          {generation && (
            <StrategyJsonPanel
              paramsText={paramsText}
              onChangeParamsText={handleParamsTextChange}
              validation={paramsValidation}
            />
          )}
        </div>

        <div className="space-y-6 lg:col-span-3">
          <ValidationStatusCard
            status={validationStatus}
            message={validationMessage}
          />
          <SaveStrategyPanel
            disabled={!generation}
            paramsAreValid={paramsValidation.status === 'valid'}
            source={generation?.source ?? null}
            name={saveName}
            onChangeName={setSaveName}
            description={saveDescription}
            onChangeDescription={setSaveDescription}
            tags={saveTags}
            onChangeTags={setSaveTags}
            libraryVersion={saveLibraryVersion}
            onChangeLibraryVersion={setSaveLibraryVersion}
            isSaving={isSaving}
            saveError={saveError}
            onSave={() => void handleSave()}
          />
        </div>
      </div>

      <RecentlyImportedTable
        entries={recentStrategies}
        isLoading={isLoadingRecent}
      />
    </div>
  );
}
