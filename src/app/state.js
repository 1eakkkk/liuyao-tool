// Shared session state; no storage writes during initialization.
export const state = {
svgHtml: '',
knownCastDate: null,
daySelectionMode: 'auto',
castMode: 'system',
confirmChain: Promise.resolve(),
onboardPreviouslyFocused: null,
currentConversation: null,
currentHistorySessionId: null,
lastExportCastText: null,
lastExportQuestion: null,
activeAbortController: null
};
