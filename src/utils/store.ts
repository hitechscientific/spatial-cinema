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
  isAIEnabled: boolean;
  hearingProfile: {
    left: number[]; // 4 bands: [250Hz, 1kHz, 4kHz, 8kHz]
    right: number[];
  };
  // v3 Additions
  headphoneProfile: 'none' | 'open_back' | 'closed_back' | 'gaming_headset' | 'earbuds';
  roomSize: number; // 0.0 to 1.0
  roomAbsorption: number; // 0.0 to 1.0
  deEsserIntensity: number; // 0.0 to 1.0
  spectralWarmth: number; // 0.0 to 1.0
  driftAmount: number; // 0.0 to 1.0
}

export interface PresetDef {
  name: string;
  settings: Partial<AppSettings>;
}

export const PRESETS: { [key: string]: PresetDef } = {
  cinema_ref: {
    name: "Cinema Reference",
    settings: {
      volume: 0.85,
      surroundIntensity: 0.9,
      bassBoost: 0.8,
      dialogueEnhance: 0.5,
      roomReflections: 0.55,
      hrtfProfile: "sadie",
      crosstalkCancellation: true,
      dynamicEQ: true,
      roomSize: 0.65,
      roomAbsorption: 0.6,
      deEsserIntensity: 0.3,
      spectralWarmth: 0.3,
      driftAmount: 0.2
    }
  },
  large_hall: {
    name: "Large Hall",
    settings: {
      volume: 0.8,
      surroundIntensity: 1.2,
      bassBoost: 0.9,
      dialogueEnhance: 0.3,
      roomReflections: 0.85,
      hrtfProfile: "sadie",
      crosstalkCancellation: true,
      dynamicEQ: true,
      roomSize: 0.9,
      roomAbsorption: 0.45,
      deEsserIntensity: 0.4,
      spectralWarmth: 0.4,
      driftAmount: 0.4
    }
  },
  intimate_studio: {
    name: "Intimate Studio",
    settings: {
      volume: 0.8,
      surroundIntensity: 0.6,
      bassBoost: 0.4,
      dialogueEnhance: 0.3,
      roomReflections: 0.25,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: false,
      roomSize: 0.3,
      roomAbsorption: 0.75,
      deEsserIntensity: 0.2,
      spectralWarmth: 0.2,
      driftAmount: 0.1
    }
  },
  competitive_fps: {
    name: "Competitive FPS",
    settings: {
      volume: 0.8,
      surroundIntensity: 1.25,
      bassBoost: 0.15,
      dialogueEnhance: 0.95,
      roomReflections: 0.05,
      hrtfProfile: "cipic",
      crosstalkCancellation: true,
      dynamicEQ: false,
      roomSize: 0.1,
      roomAbsorption: 0.9,
      deEsserIntensity: 0.1,
      spectralWarmth: 0.1,
      driftAmount: 0.05
    }
  },
  concert_arena: {
    name: "Concert Arena",
    settings: {
      volume: 0.85,
      surroundIntensity: 1.35,
      bassBoost: 1.0,
      dialogueEnhance: 0.2,
      roomReflections: 0.9,
      hrtfProfile: "kemar",
      crosstalkCancellation: false,
      dynamicEQ: true,
      roomSize: 0.85,
      roomAbsorption: 0.4,
      deEsserIntensity: 0.5,
      spectralWarmth: 0.5,
      driftAmount: 0.5
    }
  },
  dialogue_focus: {
    name: "Dialogue Focus",
    settings: {
      volume: 0.8,
      surroundIntensity: 0.4,
      bassBoost: 0.2,
      dialogueEnhance: 1.0,
      roomReflections: 0.15,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: false,
      roomSize: 0.4,
      roomAbsorption: 0.8,
      deEsserIntensity: 0.3,
      spectralWarmth: 0.2,
      driftAmount: 0.1
    }
  },
  relaxed_night: {
    name: "Relaxed Night",
    settings: {
      volume: 0.7,
      surroundIntensity: 0.5,
      bassBoost: 0.3,
      dialogueEnhance: 0.75,
      roomReflections: 0.3,
      hrtfProfile: "kemar",
      crosstalkCancellation: true,
      dynamicEQ: true,
      roomSize: 0.5,
      roomAbsorption: 0.65,
      deEsserIntensity: 0.8,
      spectralWarmth: 0.7,
      driftAmount: 0.1
    }
  }
};

const DEFAULT_SETTINGS: AppSettings = {
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
  disconnectCapture: () => void;
}

const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
let uiPort: any = null;

export const useStore = create<StoreState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isInitialized: false,
  activeTabTitle: "No active audio tab",

  initStore: async () => {
    if (get().isInitialized) return;
    
    let loadedSettings: Partial<AppSettings> = {};
    if (hasChromeStorage) {
      // Establish port connection to background to track active UI state
      try {
        uiPort = chrome.runtime.connect({ name: 'spatial-cinema-ui' });
        if (uiPort) {
          console.log("Active UI port initialized");
        }
      } catch (e) {
        console.warn("Failed to connect UI port:", e);
      }

      const data = await chrome.storage.local.get('surround_settings');
      if (data.surround_settings) {
        loadedSettings = data.surround_settings;
      }

      // Auto-synchronize Zustand state when storage updates (e.g. from hotkeys or background events)
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.surround_settings) {
          const newSettings = changes.surround_settings.newValue;
          if (newSettings) {
            set((state) => ({ ...state, ...newSettings }));
          }
        }
      });
    } else {
      const localData = localStorage.getItem('surround_settings');
      if (localData) {
        try {
          loadedSettings = JSON.parse(localData);
        } catch (_) {}
      }
    }

    set({ ...DEFAULT_SETTINGS, ...loadedSettings, isInitialized: true });

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
      
      let preset = newState.preset;
      const dspKeys: (keyof AppSettings)[] = [
        'volume', 'surroundIntensity', 'bassBoost', 'dialogueEnhance', 
        'roomReflections', 'hrtfProfile', 'crosstalkCancellation', 'dynamicEQ',
        'roomSize', 'roomAbsorption', 'deEsserIntensity', 'spectralWarmth', 'driftAmount'
      ];
      
      if (key !== 'preset' && key !== 'isEnabled' && key !== 'customIRName' && key !== 'customIRData' && key !== 'isAIEnabled' && key !== 'hearingProfile' && key !== 'headphoneProfile') {
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
        customIRData: updatedState.customIRData,
        isAIEnabled: updatedState.isAIEnabled,
        hearingProfile: updatedState.hearingProfile,
        headphoneProfile: updatedState.headphoneProfile,
        roomSize: updatedState.roomSize,
        roomAbsorption: updatedState.roomAbsorption,
        deEsserIntensity: updatedState.deEsserIntensity,
        spectralWarmth: updatedState.spectralWarmth,
        driftAmount: updatedState.driftAmount
      };

      if (hasChromeStorage) {
        chrome.storage.local.set({ 'surround_settings': cleanSettings });
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
        customIRData: newState.customIRData,
        isAIEnabled: newState.isAIEnabled,
        hearingProfile: newState.hearingProfile,
        headphoneProfile: newState.headphoneProfile,
        roomSize: newState.roomSize,
        roomAbsorption: newState.roomAbsorption,
        deEsserIntensity: newState.deEsserIntensity,
        spectralWarmth: newState.spectralWarmth,
        driftAmount: newState.driftAmount
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
    
    if (hasChromeStorage) {
      if (isEnabled) {
        chrome.runtime.sendMessage({ type: 'START_SPATIALIZER' }).catch(() => {});
      }
      // If bypass is active, keep capture stream open to route bypassed clean audio context.
    }
  },

  disconnectCapture: () => {
    set({ isEnabled: false, activeTabTitle: "" });
    if (hasChromeStorage) {
      chrome.runtime.sendMessage({ type: 'STOP_SPATIALIZER' }).catch(() => {});
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
        customIRData: newState.customIRData,
        isAIEnabled: newState.isAIEnabled,
        hearingProfile: newState.hearingProfile,
        headphoneProfile: newState.headphoneProfile,
        roomSize: newState.roomSize,
        roomAbsorption: newState.roomAbsorption,
        deEsserIntensity: newState.deEsserIntensity,
        spectralWarmth: newState.spectralWarmth,
        driftAmount: newState.driftAmount
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
        customIRData: null,
        isAIEnabled: newState.isAIEnabled,
        hearingProfile: newState.hearingProfile,
        headphoneProfile: newState.headphoneProfile,
        roomSize: newState.roomSize,
        roomAbsorption: newState.roomAbsorption,
        deEsserIntensity: newState.deEsserIntensity,
        spectralWarmth: newState.spectralWarmth,
        driftAmount: newState.driftAmount
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
