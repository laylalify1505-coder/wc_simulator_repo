/**
 * Radio types used in the Russia-Ukraine war context, each with different
 * frequency bands, coverage patterns, and tactical roles.
 */
export type RadioType = 'vhf' | 'uhf' | 'hf' | 'directional';

export interface RadioConfig {
  type: RadioType;
  label: string;
  coverageRadiusKm: [number, number];  // min, max
  beamWidthDeg?: number;                // for directional only
  unit: string;
  role: string;
  color: string;
}

export const RADIO_TYPES: RadioConfig[] = [
  {
    type: 'vhf',
    label: 'VHF Handheld',
    coverageRadiusKm: [5, 15],
    unit: 'Motorola XTS-5000',
    role: 'Tactical Squad',
    color: '#00bcd4',
  },
  {
    type: 'uhf',
    label: 'UHF Vehicular',
    coverageRadiusKm: [20, 50],
    unit: 'Harris RF-7800V',
    role: 'Armoured Convoy',
    color: '#ff9800',
  },
  {
    type: 'hf',
    label: 'HF Long-Range',
    coverageRadiusKm: [80, 250],
    unit: 'Codan 2110M',
    role: 'Battalion HQ',
    color: '#e91e63',
  },
  {
    type: 'directional',
    label: 'Directional Relay',
    coverageRadiusKm: [40, 100],
    beamWidthDeg: 60,
    unit: 'Raytheon MPM-10',
    role: 'Forward Observer',
    color: '#4caf50',
  },
];

/**
 * Describes a single simulated radio at an instant in time.
 */
export interface RadioEntity {
  id: string;              // R-001 … R-300
  type: RadioType;
  lat: number;
  lon: number;
  bearing: number;         // 0–360 (direction it's pointing)
  coverageRadiusKm: number;
  beamWidthDeg: number;    // 360 for omni, 60 for directional
  signalStrength: number;  // 0–100
  interference: number;    // 0–100
  battery: number;         // 0–100
  unit: string;
  role: string;
}

/**
 * The Esri-format feature sent over the wire.
 */
export interface ArcGisFeature {
  geometry: {
    x: number;
    y: number;
    spatialReference: { wkid: number };
  } | {
    rings: number[][][];
    spatialReference: { wkid: number };
  };
  attributes: Record<string, unknown>;
}

/**
 * Formats used in the ArcGIS StreamLayer handshake.
 */
export const ARCGIS_STREAM_FORMAT = {
  spatialReference: { wkid: 4326 },
  format: 'websocket',
};
