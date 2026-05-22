// serviceWorker.ts
// Background service worker for Chrome Extension Manifest V3.
// Coordinates tabCapture streams, hotkeys, and the offscreen audio renderer.

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-surround') {
    handleToggleCommand();
  }
});

// Listen for messages from the React Popup or Offscreen Document
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_SPATIALIZER') {
    startTabAudioCapture()
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  } else if (message.type === 'STOP_SPATIALIZER') {
    stopTabAudioCapture()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'SETTINGS_UPDATE') {
    // Forward settings update to the offscreen document
    forwardToOffscreen(message)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  } else if (message.type === 'LEVEL_METERS_UI' || message.type === 'SPECTRUM_DATA_UI') {
    // These messages come from the Offscreen Document.
    // Broadcast them to the Popup UI if it is currently open.
    chrome.runtime.sendMessage(message).catch(() => {
      // Suppress error if popup is closed (normal behavior)
    });
    sendResponse({ success: true });
    return false;
  }
  return false;
});

async function handleToggleCommand() {
  const data = await chrome.storage.local.get('surround_settings');
  const settings = data.surround_settings || { isEnabled: false };
  
  settings.isEnabled = !settings.isEnabled;
  
  await chrome.storage.local.set({ 'surround_settings': settings });
  
  // Notify any open Popups to sync their checkbox/toggle UI states
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings }).catch(() => {});

  if (settings.isEnabled) {
    await startTabAudioCapture();
  } else {
    await stopTabAudioCapture();
  }
}

async function startTabAudioCapture() {
  try {
    // 1. Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error("No active tab found to capture.");
    }

    // 2. Fetch settings
    const data = await chrome.storage.local.get('surround_settings');
    const settings = data.surround_settings || {};
    settings.isEnabled = true; // Make sure it's set to true
    await chrome.storage.local.set({ 'surround_settings': settings });

    // 3. Get Media Stream ID for the active tab (requires tabCapture permission)
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!streamId) {
          reject(new Error("Failed to get stream ID."));
        } else {
          resolve(streamId);
        }
      });
    });

    // 4. Ensure Offscreen Document is opened
    await ensureOffscreenDocument();

    // 5. Send capture trigger to offscreen
    await chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      streamId,
      settings
    });

    console.log(`Successfully started surround sound processing for tab: ${tab.title} (${tab.id})`);
    return { tabTitle: tab.title };
  } catch (err: any) {
    console.error('Failed to start tab audio capture:', err);
    throw err;
  }
}

async function stopTabAudioCapture() {
  try {
    const data = await chrome.storage.local.get('surround_settings');
    const settings = data.surround_settings || {};
    settings.isEnabled = false;
    await chrome.storage.local.set({ 'surround_settings': settings });

    const hasDoc = await hasOffscreenDocument();
    if (hasDoc) {
      await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
      await chrome.offscreen.closeDocument();
    }
    console.log('Stopped tab audio capture and closed offscreen document.');
  } catch (err) {
    console.error('Failed to stop tab audio capture:', err);
    throw err;
  }
}

async function forwardToOffscreen(message: any) {
  const hasDoc = await hasOffscreenDocument();
  if (hasDoc) {
    await chrome.runtime.sendMessage(message).catch(() => {});
  }
}

async function ensureOffscreenDocument() {
  const hasDoc = await hasOffscreenDocument();
  if (hasDoc) return;

  // Create the offscreen document for User Media audio routing
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Captures active tab stream and processes spatial audio filters inside Web Audio API context.'
  });
}

async function hasOffscreenDocument(): Promise<boolean> {
  // Query all context views in MV3 to see if offscreen page exists
  if ('hasDocument' in chrome.offscreen) {
    // Modern Chrome API support
    return await (chrome.offscreen as any).hasDocument();
  }
  
  // Fallback check: query contexts
  const contexts = await (chrome.runtime as any).getContexts?.({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return contexts && contexts.length > 0;
}

// Set initial configuration parameters upon extension install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('surround_settings');
  if (!data.surround_settings) {
    await chrome.storage.local.set({
      'surround_settings': {
        isEnabled: false,
        preset: 'cinema',
        hrtfProfile: 'sadie',
        volume: 0.85,
        surroundIntensity: 0.85,
        bassBoost: 0.75,
        dialogueEnhance: 0.5,
        roomReflections: 0.6,
        crosstalkCancellation: true,
        dynamicEQ: true,
        customIRName: null,
        customIRData: null
      }
    });
  }
});
