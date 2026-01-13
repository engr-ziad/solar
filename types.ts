export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export enum ComponentType {
  PV_ARRAY = 'PV_ARRAY',
  DC_COMBINER = 'DC_COMBINER',
  DC_BREAKER = 'DC_BREAKER',
  DC_SPD = 'DC_SPD',
  INVERTER = 'INVERTER',
  AC_BREAKER = 'AC_BREAKER',
  AC_SPD = 'AC_SPD',
  AC_DISTRIBUTION = 'AC_DISTRIBUTION',
  METER = 'METER',
  GRID = 'GRID',
  LOAD = 'LOAD'
}

export interface SolarComponent {
  id: string;
  type: ComponentType;
  label: string;
  specs: string[]; // e.g. ["550W Monocrystalline", "20 Strings"]
  x?: number; // Calculated by frontend
  y?: number; // Calculated by frontend
}

export interface Connection {
  from: string; // Component ID
  to: string;   // Component ID
  label: string; // e.g. "4x6mm² DC Cable"
  type: 'DC' | 'AC' | 'GROUND';
}

export interface ProjectMeta {
  projectName: string;
  location: string;
  totalCapacity: string;
  systemVoltage: string;
}

export interface SolarSystemData {
  meta: ProjectMeta;
  components: SolarComponent[];
  connections: Connection[];
}

export const INITIAL_SYSTEM: SolarSystemData = {
  meta: {
    projectName: "New Project",
    location: "Unknown",
    totalCapacity: "0 kWp",
    systemVoltage: "0 V"
  },
  components: [
    { id: 'grid', type: ComponentType.GRID, label: 'Utility Grid', specs: ['380V / 50Hz'] }
  ],
  connections: []
};