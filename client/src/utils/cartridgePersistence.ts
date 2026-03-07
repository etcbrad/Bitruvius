import type { SkeletonState } from '../engine/types';
import { serializeEngineState, deserializeEngineState } from '../engine/serialization';

export interface CartridgeState {
  mode: 'fk' | 'ik';
  state: SkeletonState;
  timestamp: number;
  version: string;
}

export interface CartridgePersistenceData {
  currentMode: 'fk' | 'ik';
  fkState: SkeletonState;
  ikState: SkeletonState;
  lastSaved: number;
  version: string;
}

const CARTRIDGE_PERSISTENCE_KEY = 'bitruvius_cartridge_states';
const CURRENT_VERSION = '1.0.0';

export class CartridgePersistence {
  private static instance: CartridgePersistence;
  
  static getInstance(): CartridgePersistence {
    if (!CartridgePersistence.instance) {
      CartridgePersistence.instance = new CartridgePersistence();
    }
    return CartridgePersistence.instance;
  }

  saveCartridgeState(mode: 'fk' | 'ik', state: SkeletonState): void {
    try {
      const existing = this.loadPersistenceData();
      const updated: CartridgePersistenceData = {
        ...existing,
        [`${mode}State`]: state,
        currentMode: mode,
        lastSaved: Date.now(),
        version: CURRENT_VERSION,
      };
      
      const serialized = JSON.stringify(updated);
      localStorage.setItem(CARTRIDGE_PERSISTENCE_KEY, serialized);
      console.log(`[CartridgePersistence] Saved ${mode.toUpperCase()} state`);
    } catch (error) {
      console.error('[CartridgePersistence] Failed to save state:', error);
    }
  }

  loadCartridgeState(mode: 'fk' | 'ik'): SkeletonState | null {
    try {
      const data = this.loadPersistenceData();
      const state = data[`${mode}State` as keyof CartridgePersistenceData] as SkeletonState;
      
      if (state) {
        console.log(`[CartridgePersistence] Loaded ${mode.toUpperCase()} state`);
        return state;
      }
      
      return null;
    } catch (error) {
      console.error(`[CartridgePersistence] Failed to load ${mode} state:`, error);
      return null;
    }
  }

  getCurrentMode(): 'fk' | 'ik' {
    try {
      const data = this.loadPersistenceData();
      return data.currentMode || 'fk';
    } catch {
      return 'fk';
    }
  }

  setCurrentMode(mode: 'fk' | 'ik'): void {
    try {
      const existing = this.loadPersistenceData();
      const updated: CartridgePersistenceData = {
        ...existing,
        currentMode: mode,
        lastSaved: Date.now(),
        version: CURRENT_VERSION,
      };
      
      const serialized = JSON.stringify(updated);
      localStorage.setItem(CARTRIDGE_PERSISTENCE_KEY, serialized);
    } catch (error) {
      console.error('[CartridgePersistence] Failed to set current mode:', error);
    }
  }

  private loadPersistenceData(): CartridgePersistenceData {
    try {
      const serialized = localStorage.getItem(CARTRIDGE_PERSISTENCE_KEY);
      if (!serialized) {
        return this.getDefaultPersistenceData();
      }
      
      const data = JSON.parse(serialized) as CartridgePersistenceData;
      
      // Version migration if needed
      if (data.version !== CURRENT_VERSION) {
        console.log(`[CartridgePersistence] Migrating from version ${data.version} to ${CURRENT_VERSION}`);
        return this.migrateData(data);
      }
      
      return data;
    } catch (error) {
      console.error('[CartridgePersistence] Failed to load persistence data:', error);
      return this.getDefaultPersistenceData();
    }
  }

  private getDefaultPersistenceData(): CartridgePersistenceData {
    return {
      currentMode: 'fk',
      fkState: this.createDefaultFKState(),
      ikState: this.createDefaultIKState(),
      lastSaved: Date.now(),
      version: CURRENT_VERSION,
    };
  }

  private createDefaultFKState(): SkeletonState {
    // This should match the default FK state from CartridgeLoader
    return {
      // Add default FK state properties here
      // This is a placeholder - should match the actual default state
    } as SkeletonState;
  }

  private createDefaultIKState(): SkeletonState {
    // This should match the default IK state from CartridgeLoader
    return {
      // Add default IK state properties here
      // This is a placeholder - should match the actual default state
    } as SkeletonState;
  }

  private migrateData(data: CartridgePersistenceData): CartridgePersistenceData {
    // Handle version migrations here
    // For now, just update the version
    return {
      ...data,
      version: CURRENT_VERSION,
      lastSaved: Date.now(),
    };
  }

  clearPersistence(): void {
    try {
      localStorage.removeItem(CARTRIDGE_PERSISTENCE_KEY);
      console.log('[CartridgePersistence] Cleared all persisted data');
    } catch (error) {
      console.error('[CartridgePersistence] Failed to clear persistence:', error);
    }
  }

  exportData(): string | null {
    try {
      const data = this.loadPersistenceData();
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('[CartridgePersistence] Failed to export data:', error);
      return null;
    }
  }

  importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData) as CartridgePersistenceData;
      
      // Validate data structure
      if (!data.fkState || !data.ikState || !data.currentMode) {
        throw new Error('Invalid data structure');
      }
      
      const serialized = JSON.stringify({
        ...data,
        version: CURRENT_VERSION,
        lastSaved: Date.now(),
      });
      localStorage.setItem(CARTRIDGE_PERSISTENCE_KEY, serialized);
      console.log('[CartridgePersistence] Successfully imported data');
      return true;
    } catch (error) {
      console.error('[CartridgePersistence] Failed to import data:', error);
      return false;
    }
  }
}

export const cartridgePersistence = CartridgePersistence.getInstance();
