interface Point3D {
  x: number;
  y: number;
  z: number;
}

export function distance3D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Converts Minecraft's rotation (x = pitch, y = yaw, both in degrees) into a
 * forward-facing unit vector in Minecraft's coordinate space (+X east,
 * +Y up, +Z south) — matches the game's own yaw/pitch convention.
 */
export function directionFromRotation(rotation: { x: number; y: number }): Point3D {
  const pitchRad = (rotation.x * Math.PI) / 180;
  const yawRad = (rotation.y * Math.PI) / 180;
  return {
    x: -Math.sin(yawRad) * Math.cos(pitchRad),
    y: -Math.sin(pitchRad),
    z: Math.cos(yawRad) * Math.cos(pitchRad),
  };
}

/**
 * 0-1 volume multiplier based on distance vs the server's max hearing range.
 * Eased slightly (not pure linear) so it stays close to full volume nearby
 * and fades out faster near the edge, rather than a flat ramp the whole way.
 */
export function proximityVolume(distance: number, maxDistance: number): number {
  if (maxDistance <= 0) return 1;
  const t = Math.max(0, Math.min(1, 1 - distance / maxDistance));
  return Math.pow(t, 1.5);
}
