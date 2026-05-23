// serviceWorker.ts
// Background service worker for Chrome Extension Manifest V3.
// Coordinates tabCapture streams, hotkeys, and the offscreen audio renderer.

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let activeCapturedTabId: number | null = null;
let refreshingTabId: number | null = null;
const activeUIPorts = new Set<chrome.runtime.Port>();

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

  // Update the offscreen document instantly (software bypass)
  await forwardToOffscreen({ type: 'SETTINGS_UPDATE', settings });

  if (settings.isEnabled) {
    await startTabAudioCapture();
  }
}

async function startTabAudioCapture() {
  try {
    // 1. Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error("No active tab found to capture.");
    }

    // Check if we are already capturing this active tab
    if (activeCapturedTabId === tab.id) {
      const hasDoc = await hasOffscreenDocument();
      if (hasDoc) {
        console.log(`Already capturing tab ${tab.id}. Skipping recapture.`);
        return { tabTitle: tab.title };
      }
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

    // 5. Send capture trigger to offscreen with UI active state
    await chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      streamId,
      settings,
      isUIActive: activeUIPorts.size > 0
    });

    console.log(`Successfully started surround sound processing for tab: ${tab.title} (${tab.id})`);
    activeCapturedTabId = tab.id;
    return { tabTitle: tab.title };
  } catch (err: any) {
    console.error('Failed to start tab audio capture:', err);
    throw err;
  }
}

async function stopTabAudioCapture(keepSettingsEnabled: boolean = false) {
  try {
    const data = await chrome.storage.local.get('surround_settings');
    const settings = data.surround_settings || {};
    
    if (!keepSettingsEnabled) {
      settings.isEnabled = false;
      await chrome.storage.local.set({ 'surround_settings': settings });
      // Notify any open Popups or Dashboards to sync their UI state
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings }).catch(() => {});
    }

    const hasDoc = await hasOffscreenDocument();
    if (hasDoc) {
      await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
      await chrome.offscreen.closeDocument();
    }
    activeCapturedTabId = null;
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

// Monitor captured tab lifecycle events to stop capturing when tab is closed or navigated
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeCapturedTabId) {
    console.log(`Captured tab ${tabId} removed. Releasing spatializer.`);
    stopTabAudioCapture().catch(() => {});
  }
  if (tabId === refreshingTabId) {
    refreshingTabId = null;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (tabId === activeCapturedTabId && changeInfo.status === 'loading') {
    console.log(`Captured tab ${tabId} refreshed or navigated. Releasing spatializer temporarily.`);
    refreshingTabId = tabId;
    await stopTabAudioCapture(true); // keepSettingsEnabled = true
  } else if (tabId === refreshingTabId && changeInfo.status === 'complete') {
    console.log(`Captured tab ${tabId} finished reloading. Re-establishing spatializer capture.`);
    refreshingTabId = null;
    
    // Check if the tab is still active before attempting recapture
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id === tabId) {
      const data = await chrome.storage.local.get('surround_settings');
      const settings = data.surround_settings || {};
      if (settings.isEnabled) {
        try {
          await startTabAudioCapture();
        } catch (e) {
          console.warn("Failed to automatically recapture tab after refresh:", e);
        }
      }
    }
  }
});

// Set initial configuration parameters upon extension install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('surround_settings');
  if (!data.surround_settings) {
    await chrome.storage.local.set({
      'surround_settings': {
        isEnabled: false,
        preset: 'cinema_ref',
        hrtfProfile: 'sadie',
        volume: 0.85,
        surroundIntensity: 0.85,
        bassBoost: 0.75,
        dialogueEnhance: 0.5,
        roomReflections: 0.6,
        crosstalkCancellation: true,
        dynamicEQ: true,
        customIRName: null,
        customIRData: null,
        isAIEnabled: false,
        hearingProfile: {
          left: [0, 0, 0, 0],
          right: [0, 0, 0, 0]
        },
        headphoneProfile: 'none',
        roomSize: 0.5,
        roomAbsorption: 0.5,
        deEsserIntensity: 0.4,
        spectralWarmth: 0.3,
        driftAmount: 0.2
      }
    });
  }
});

// Track active UI port connections to enable/disable worklet telemetry dynamically
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'spatial-cinema-ui') {
    activeUIPorts.add(port);
    console.log(`UI connection established. Active clients: ${activeUIPorts.size}`);
    updateUIActiveState(true).catch(() => {});

    port.onDisconnect.addListener(() => {
      activeUIPorts.delete(port);
      console.log(`UI connection closed. Active clients: ${activeUIPorts.size}`);
      if (activeUIPorts.size === 0) {
        updateUIActiveState(false).catch(() => {});
      }
    });
  }
});

async function updateUIActiveState(isActive: boolean) {
  try {
    const hasDoc = await hasOffscreenDocument();
    if (hasDoc) {
      await chrome.runtime.sendMessage({
        type: 'UI_ACTIVE_STATE',
        isActive
      });
    }
  } catch (e) {
    // Suppress context invalidation/routing errors
  }
}
