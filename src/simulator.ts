import { RadioEntity, RadioType, RADIO_TYPES, ArcGisFeature } from './types';

/**
 * The core simulator: creates 300 radios, moves them around Ukraine,
 * computes coverage, and emits features every tick.
 */
export class Simulator {
  private radios: RadioEntity[] = [];
  private tickMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickCallback: ((points: ArcGisFeature[], polygons: ArcGisFeature[]) => void) | null = null;

  // Bounding box roughly covering Ukraine
  private readonly BOUNDS = {
    minLat: 44.0, maxLat: 52.5,
    minLon: 22.0, maxLon: 40.0,
  };

  constructor(tickMs = 800) {
    this.tickMs = tickMs;
  }

  /** Register a callback for each simulation tick. */
  onTick(cb: (points: ArcGisFeature[], polygons: ArcGisFeature[]) => void): void {
    this.tickCallback = cb;
  }

  /** Start the simulation loop. */
  start(): void {
    this.initializeRadios();
    console.log(`Simulator started with ${this.radios.length} radios`);

    // Send handshake-establishing data and initial state
    this.emitTick();

    this.intervalId = setInterval(() => this.tick(), this.tickMs);
  }

  /** Stop the simulation. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ── Initialisation ──────────────────────────────────────────────────────

  private initializeRadios(): void {
    this.radios = [];
    for (let i = 1; i <= 300; i++) {
      const id = `R-${String(i).padStart(3, '0')}`;
      const config = RADIO_TYPES[i % RADIO_TYPES.length];
      const radius = this.randRange(config.coverageRadiusKm[0], config.coverageRadiusKm[1]);
      this.radios.push({
        id,
        type: config.type,
        lat: this.randRange(this.BOUNDS.minLat, this.BOUNDS.maxLat),
        lon: this.randRange(this.BOUNDS.minLon, this.BOUNDS.maxLon),
        bearing: Math.random() * 360,
        coverageRadiusKm: Math.round(radius),
        beamWidthDeg: config.beamWidthDeg || 360,
        signalStrength: Math.round(this.randRange(40, 100)),
        interference: Math.round(this.randRange(0, 60)),
        battery: Math.round(this.randRange(50, 100)),
        unit: config.unit,
        role: config.role,
      });
    }
  }

  // ── Per-tick update ─────────────────────────────────────────────────────

  private tick(): void {
    const rng = Math.random;

    for (const radio of this.radios) {
      // ~8% chance the radio moves
      if (rng() < 0.08) {
        // Move a random distance (5–50 km ≈ 0.05°–0.45° at this latitude)
        const distDeg = 0.05 + rng() * 0.4;
        const newBearing = rng() * 360;
        const rad = (newBearing * Math.PI) / 180;
        radio.bearing = newBearing;
        radio.lat += distDeg * Math.cos(rad);
        radio.lon += (distDeg * Math.sin(rad)) / Math.cos((radio.lat * Math.PI) / 180);

        // Clamp to Ukraine bounds
        radio.lat = Math.max(this.BOUNDS.minLat, Math.min(this.BOUNDS.maxLat, radio.lat));
        radio.lon = Math.max(this.BOUNDS.minLon, Math.min(this.BOUNDS.maxLon, radio.lon));
      }

      // Jitter signal, interference, battery
      radio.signalStrength = Math.max(0, Math.min(100, radio.signalStrength + (rng() - 0.5) * 6));
      radio.interference = Math.max(0, Math.min(100, radio.interference + (rng() - 0.5) * 4));
      radio.battery = Math.max(0, radio.battery - rng() * 0.15);
    }

    this.emitTick();
  }

  // ── Emit features ──────────────────────────────────────────────────────

  private emitTick(): void {
    const now = Date.now();
    const points: ArcGisFeature[] = [];
    const polygons: ArcGisFeature[] = [];

    for (const radio of this.radios) {
      // ── Point feature (radio location) ────────────────────────────────
      points.push({
        geometry: { x: radio.lon, y: radio.lat, spatialReference: { wkid: 4326 } },
        attributes: {
          OBJECTID: this.objectId(radio.id),
          TRACKID: radio.id,
          TIMESTAMP: now,
          type: radio.type,
          signalStrength: Math.round(radio.signalStrength),
          interference: Math.round(radio.interference),
          battery: Math.round(radio.battery),
          unit: radio.unit,
          role: radio.role,
        },
      });

      // ── Polygon feature (coverage area) ───────────────────────────────
      let rings: number[][][];

      if (radio.beamWidthDeg >= 360) {
        // Omnidirectional → circle approximated by 32-point polygon
        rings = [this.buildCircleRing(radio.lat, radio.lon, radio.coverageRadiusKm, 32)];
      } else {
        // Directional → cone sector
        rings = [this.buildConeRing(radio.lat, radio.lon, radio.coverageRadiusKm, radio.bearing, radio.beamWidthDeg, 16)];
      }

      polygons.push({
        geometry: { rings, spatialReference: { wkid: 4326 } },
        attributes: {
          OBJECTID: this.objectId(`cov-${radio.id}`),
          TRACKID: radio.id,
          TIMESTAMP: now,
          type: radio.type,
          coverageAreaKm2: Math.round(radio.coverageRadiusKm * radio.coverageRadiusKm * Math.PI),
          beamWidth: radio.beamWidthDeg,
        },
      });
    }

    this.tickCallback?.(points, polygons);
  }

  // ── Geometry helpers ───────────────────────────────────────────────────

  /** Build a circle ring (as latitude/longitude). */
  private buildCircleRing(lat: number, lon: number, radiusKm: number, segments: number): number[][] {
    const kmPerDeg = 111.0;
    const latDeg = radiusKm / kmPerDeg;
    const lonDeg = radiusKm / (kmPerDeg * Math.cos((lat * Math.PI) / 180));
    const pts: number[][] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      pts.push([lon + lonDeg * Math.cos(a), lat + latDeg * Math.sin(a)]);
    }
    return pts;
  }

  /** Build a cone/sector ring. */
  private buildConeRing(lat: number, lon: number, radiusKm: number, bearing: number, beamWidthDeg: number, segments: number): number[][] {
    const kmPerDeg = 111.0;
    const rDeg = radiusKm / kmPerDeg;
    const halfBeam = beamWidthDeg / 2;
    const bearingRad = (bearing * Math.PI) / 180;
    const pts: number[][] = [];

    // Apex = radio position
    pts.push([lon, lat]);

    for (let i = 0; i <= segments; i++) {
      const angle = bearingRad - (halfBeam * Math.PI) / 180 + (beamWidthDeg * Math.PI * i) / (180 * segments);
      const dlat = rDeg * Math.cos(angle);
      const dlon = rDeg * Math.sin(angle) / Math.cos((lat * Math.PI) / 180);
      pts.push([lon + dlon, lat + dlat]);
    }

    pts.push([lon, lat]); // close back to apex
    return pts;
  }

  // ── Utils ──────────────────────────────────────────────────────────────

  /** Deterministic object ID based on radio ID string. */
  private objectId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  private randRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
