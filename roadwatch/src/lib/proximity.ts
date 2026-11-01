import { angleDiff, bearing, distance, type LatLng } from './geo';
import type { Hazard, HazardKind } from './hazards';

/** One GPS fix. `speed` is m/s and `heading` degrees; either may be missing or meaningless. */
export type Fix = LatLng & {
  speed: number | null;
  heading: number | null;
  accuracy?: number | null;
  timestamp: number;
};

export type AlertConfig = {
  /** Warn when a hazard is this close (metres). */
  alertDistance: number;
  kinds: Record<HazardKind, boolean>;
  /** When moving, only warn about hazards in front of the car, not ones already passed. */
  aheadOnly: boolean;
};

export type Nearby = { hazard: Hazard; distance: number };

export type ProximityResult = {
  /** Hazards that just came within alert distance: notify, beep, speak. */
  fresh: Nearby[];
  /** Everything currently within alert distance and still ahead (for the on-screen banner). */
  inRange: Nearby[];
  /** The closest hazard ahead beyond alert distance, up to `UPCOMING_RANGE`. */
  upcoming: Nearby | null;
  /** Direction of travel, if known. */
  course: number | null;
  moving: boolean;
};

/** Below this speed (m/s, ≈ 9 km/h) the heading is noise, so every direction counts as ahead. */
export const MOVING_SPEED = 2.5;
/** Hazards within this cone either side of the direction of travel count as ahead. */
export const AHEAD_CONE = 70;
/** Closer than this a hazard always counts as ahead (GPS jitter when passing right by it). */
const ALWAYS_AHEAD = 40;
export const UPCOMING_RANGE = 1500;
/** Move at least this far before trusting a course computed from two fixes. */
const COURSE_MIN_MOVE = 15;

/**
 * Decides when to warn. Each hazard warns once per approach: it re-arms only after the car is
 * well clear of it (twice the alert distance, and at least 300 m more), so waiting at a red light
 * next to a camera doesn't beep every second, but driving the same road later warns again.
 */
export class ProximityEngine {
  private alerted = new Set<string>();
  private anchor: Fix | null = null;
  private lastCourse: { value: number; at: number } | null = null;

  reset() {
    this.alerted.clear();
    this.anchor = null;
    this.lastCourse = null;
  }

  /** Mark a hazard as already announced (for example, one the driver reported themselves). */
  suppress(id: string) {
    this.alerted.add(id);
  }

  update(fix: Fix, hazards: Hazard[], config: AlertConfig): ProximityResult {
    const { course, moving } = this.trackCourse(fix);
    const rearmDistance = Math.max(config.alertDistance * 2, config.alertDistance + 300);

    const fresh: Nearby[] = [];
    const inRange: Nearby[] = [];
    let upcoming: Nearby | null = null;
    const seen = new Set<string>();

    for (const hazard of hazards) {
      const d = distance(fix, hazard);
      if (this.alerted.has(hazard.id)) {
        seen.add(hazard.id);
        if (d > rearmDistance) this.alerted.delete(hazard.id);
      }
      if (!config.kinds[hazard.kind]) continue;
      if (d > UPCOMING_RANGE) continue;

      const ahead =
        !config.aheadOnly ||
        !moving ||
        course === null ||
        d <= ALWAYS_AHEAD ||
        angleDiff(course, bearing(fix, hazard)) <= AHEAD_CONE;
      if (!ahead) continue;

      if (d <= config.alertDistance) {
        const item = { hazard, distance: d };
        inRange.push(item);
        if (!this.alerted.has(hazard.id)) {
          this.alerted.add(hazard.id);
          seen.add(hazard.id);
          fresh.push(item);
        }
      } else if (!upcoming || d < upcoming.distance) {
        upcoming = { hazard, distance: d };
      }
    }

    // Forget hazards that vanished from the data (an expired police report, a refreshed feed).
    for (const id of this.alerted) if (!seen.has(id)) this.alerted.delete(id);

    const byDistance = (a: Nearby, b: Nearby) => a.distance - b.distance;
    return { fresh: fresh.sort(byDistance), inRange: inRange.sort(byDistance), upcoming, course, moving };
  }

  /**
   * Course from movement between fixes is more reliable than the reported heading (which is 0 on
   * many Android phones when unknown), so prefer it while it's fresh.
   */
  private trackCourse(fix: Fix): { course: number | null; moving: boolean } {
    let derivedSpeed: number | null = null;
    if (!this.anchor || fix.timestamp - this.anchor.timestamp > 60_000) {
      this.anchor = fix;
    } else {
      const moved = distance(this.anchor, fix);
      if (moved >= COURSE_MIN_MOVE) {
        const seconds = Math.max(0.5, (fix.timestamp - this.anchor.timestamp) / 1000);
        derivedSpeed = moved / seconds;
        this.lastCourse = { value: bearing(this.anchor, fix), at: fix.timestamp };
        this.anchor = fix;
      }
    }

    const speed = fix.speed !== null && fix.speed >= 0 ? fix.speed : derivedSpeed;
    const moving = speed !== null && speed >= MOVING_SPEED;
    if (!moving) return { course: null, moving: false };

    if (this.lastCourse && fix.timestamp - this.lastCourse.at <= 10_000) {
      return { course: this.lastCourse.value, moving };
    }
    if (fix.heading !== null && fix.heading >= 0) return { course: fix.heading % 360, moving };
    return { course: null, moving };
  }
}
