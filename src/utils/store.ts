import { create } from 'zustand';

export interface AppSettings {
  isEnabled: boolean;
  preset: string;
  hrtfProfile: string; // 'kemar' | 'cipic' | 'sadie'
  volume: number; // 0.0 to 1.0
  surroundIntensity: number; // 0.0 to 1.0
  bassBoost: number; // 0.0 to 1.0
  dialogueEnhance: number; // 0.0 to 1.0
  roomReflections: number; // 0.0 to 1.0
  crosstalkCancellation: boolean;
  dynamicEQ: boolean;
  customIRName: string | null;
  customIRData: string | null; // Base64 encoded WAV or null
}

export interface PresetDef {
  name: string;
  settings: Partial<AppSettings>;
}

export const PRESETS: { [key: string]: PresetDef } = {
  cinema: {
    name: "Cinema Mode",
    settings: {
      volume: 0.85,
      surroundIntensity: 0.85,
      bassBoost: 0.75,
      dialogueEnhance: 0.5,
      roomReflections: 0.6,
      hrtfProfile: "sadie",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  },
  imax: {
    name: "IMAX-style Mode",
    settings: {
      volume: 0.95,
      surroundIntensity: 1.0,
      bassBoost: 0.95,
      dialogueEnhance: 0.45,
      roomReflections: 0.8,
      hrtfProfile: "sadie",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  },
  gaming_fps: {
    name: "Gaming FPS Mode",
    settings: {
      volume: 0.8,
      surroundIntensity: 0.9,
      bassBoost: 0.25,
      dialogueEnhance: 0.65,
      roomReflections: 0.15,
      hrtfProfile: "cipic",
      crosstalkCancellation: false,
      dynamicEQ: true
    }
  },
  gaming_open: {
    name: "Open World Gaming",
    settings: {
      volume: 0.85,
      surroundIntensity: 0.8,
      bassBoost: 0.55,
      dialogueEnhance: 0.4,
      roomReflections: 0.5,
      hrtfProfile: "cipic",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  },
  music_hall: {
    name: "Music Hall",
    settings: {
      volume: 0.75,
      surroundIntensity: 0.7,
      bassBoost: 0.45,
      dialogueEnhance: 0.2,
      roomReflections: 0.75,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: false
    }
  },
  concert_arena: {
    name: "Concert Arena",
    settings: {
      volume: 0.88,
      surroundIntensity: 0.95,
      bassBoost: 0.65,
      dialogueEnhance: 0.3,
      roomReflections: 0.85,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  },
  dialogue: {
    name: "Dialogue Clarity",
    settings: {
      volume: 0.8,
      surroundIntensity: 0.35,
      bassBoost: 0.15,
      dialogueEnhance: 1.0,
      roomReflections: 0.25,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  },
  night: {
    name: "Night Mode",
    settings: {
      volume: 0.65,
      surroundIntensity: 0.5,
      bassBoost: 0.3,
      dialogueEnhance: 0.6,
      roomReflections: 0.35,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  },
  studio: {
    name: "Studio Monitor",
    settings: {
      volume: 0.75,
      surroundIntensity: 0.0,
      bassBoost: 0.0,
      dialogueEnhance: 0.0,
      roomReflections: 0.0,
      hrtfProfile: "kemar",
      crosstalkCancellation: false,
      dynamicEQ: false
    }
  },
  bass: {
    name: "Bass Boost",
    settings: {
      volume: 0.85,
      surroundIntensity: 0.65,
      bassBoost: 1.0,
      dialogueEnhance: 0.3,
      roomReflections: 0.45,
      hrtfProfile: "sadie",
      crosstalkCancellation: true,
      dynamicEQ: true
    }
  }
};

const DEFAULT_SETTINGS: AppSettings = {
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
};

interface StoreState extends AppSettings {
  isInitialized: boolean;
  activeTabTitle: string;
  initStore: () => Promise<void>;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  applyPreset: (presetKey: string) => void;
  toggleEnabled: () => void;
  uploadCustomIR: (name: string, base64Wav: string) => void;
  clearCustomIR: () => void;
  setActiveTabTitle: (title: string) => void;
}

// Check Chrome API safety
const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const useStore = create<StoreState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isInitialized: false,
  activeTabTitle: "No active audio tab",

  initStore: async () => {
    if (get().isInitialized) return;
    
    let loadedSettings: Partial<AppSettings> = {};
    if (hasChromeStorage) {
      const data = await chrome.storage.local.get('surround_settings');
      if (data.surround_settings) {
        loadedSettings = data.surround_settings;
      }
    } else {
      const localData = localStorage.getItem('surround_settings');
      if (localData) {
        try {
          loadedSettings = JSON.parse(localData);
        } catch (_) {}
      }
    }

    set({ ...DEFAULT_SETTINGS, ...loadedSettings, isInitialized: true });

    // Read active tab title if in extension popup
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.title) {
          set({ activeTabTitle: tabs[0].title });
        }
      });
    }
  },

  setSetting: (key, value) => {
    set((state) => {
      const newState = { ...state, [key]: value };
      
      // If we change preset-related parameters manually, revert the preset dropdown to 'custom'
      let preset = newState.preset;
      const dspKeys: (keyof AppSettings)[] = [
        'volume', 'surroundIntensity', 'bassBoost', 'dialogueEnhance', 
        'roomReflections', 'hrtfProfile', 'crosstalkCancellation', 'dynamicEQ'
      ];
      
      if (key !== 'preset' && key !== 'isEnabled' && key !== 'customIRName' && key !== 'customIRData') {
        // Check if matching any preset
        let foundPreset = 'custom';
        for (const [pKey, pDef] of Object.entries(PRESETS)) {
          const match = dspKeys.every(k => pDef.settings[k] === undefined || pDef.settings[k] === newState[k]);
          if (match) {
            foundPreset = pKey;
            break;
          }
        }
        preset = foundPreset;
      }

      const updatedState = { ...newState, preset };
      
      // Save
      const cleanSettings = {
        isEnabled: updatedState.isEnabled,
        preset: updatedState.preset,
        hrtfProfile: updatedState.hrtfProfile,
        volume: updatedState.volume,
        surroundIntensity: updatedState.surroundIntensity,
        bassBoost: updatedState.bassBoost,
        dialogueEnhance: updatedState.dialogueEnhance,
        roomReflections: updatedState.roomReflections,
        crosstalkCancellation: updatedState.crosstalkCancellation,
        dynamicEQ: updatedState.dynamicEQ,
        customIRName: updatedState.customIRName,
        customIRData: updatedState.customIRData
      };

      if (hasChromeStorage) {
        chrome.storage.local.set({ 'surround_settings': cleanSettings });
        // Send real-time configuration update message to background/offscreen
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings: cleanSettings }).catch(() => {});
      } else {
        localStorage.setItem('surround_settings', JSON.stringify(cleanSettings));
      }

      return updatedState;
    });
  },

  applyPreset: (presetKey) => {
    const presetDef = PRESETS[presetKey];
    if (!presetDef) return;
    
    set((state) => {
      const newState = {
        ...state,
        ...presetDef.settings,
        preset: presetKey
      };

      // Save
      const cleanSettings = {
        isEnabled: newState.isEnabled,
        preset: newState.preset,
        hrtfProfile: newState.hrtfProfile,
        volume: newState.volume,
        surroundIntensity: newState.surroundIntensity,
        bassBoost: newState.bassBoost,
        dialogueEnhance: newState.dialogueEnhance,
        roomReflections: newState.roomReflections,
        crosstalkCancellation: newState.crosstalkCancellation,
        dynamicEQ: newState.dynamicEQ,
        customIRName: newState.customIRName,
        customIRData: newState.customIRData
      };

      if (hasChromeStorage) {
        chrome.storage.local.set({ 'surround_settings': cleanSettings });
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings: cleanSettings }).catch(() => {});
      } else {
        localStorage.setItem('surround_settings', JSON.stringify(cleanSettings));
      }

      return newState;
    });
  },

  toggleEnabled: () => {
    const isEnabled = !get().isEnabled;
    get().setSetting('isEnabled', isEnabled);
    
    // Send explicit command to background script to start/stop capture
    if (hasChromeStorage) {
      chrome.runtime.sendMessage({ 
        type: isEnabled ? 'START_SPATIALIZER' : 'STOP_SPATIALIZER' 
      }).catch(() => {});
    }
  },

  uploadCustomIR: (name, base64Wav) => {
    set((state) => {
      const newState = {
        ...state,
        customIRName: name,
        customIRData: base64Wav
      };
      
      const cleanSettings = {
        isEnabled: newState.isEnabled,
        preset: newState.preset,
        hrtfProfile: newState.hrtfProfile,
        volume: newState.volume,
        surroundIntensity: newState.surroundIntensity,
        bassBoost: newState.bassBoost,
        dialogueEnhance: newState.dialogueEnhance,
        roomReflections: newState.roomReflections,
        crosstalkCancellation: newState.crosstalkCancellation,
        dynamicEQ: newState.dynamicEQ,
        customIRName: newState.customIRName,
        customIRData: newState.customIRData
      };

      if (hasChromeStorage) {
        chrome.storage.local.set({ 'surround_settings': cleanSettings });
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings: cleanSettings }).catch(() => {});
      } else {
        localStorage.setItem('surround_settings', JSON.stringify(cleanSettings));
      }
      return newState;
    });
  },

  clearCustomIR: () => {
    set((state) => {
      const newState = {
        ...state,
        customIRName: null,
        customIRData: null
      };

      const cleanSettings = {
        isEnabled: newState.isEnabled,
        preset: newState.preset,
        hrtfProfile: newState.hrtfProfile,
        volume: newState.volume,
        surroundIntensity: newState.surroundIntensity,
        bassBoost: newState.bassBoost,
        dialogueEnhance: newState.dialogueEnhance,
        roomReflections: newState.roomReflections,
        crosstalkCancellation: newState.crosstalkCancellation,
        dynamicEQ: newState.dynamicEQ,
        customIRName: null,
        customIRData: null
      };

      if (hasChromeStorage) {
        chrome.storage.local.set({ 'surround_settings': cleanSettings });
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings: cleanSettings }).catch(() => {});
      } else {
        localStorage.setItem('surround_settings', JSON.stringify(cleanSettings));
      }
      return newState;
    });
  },

  setActiveTabTitle: (title) => {
    set({ activeTabTitle: title });
  }
}));
