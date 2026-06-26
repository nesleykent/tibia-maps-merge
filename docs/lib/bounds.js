import { TILE_SIZE } from './constants.js';

export function floorId(z) {
  return String(z).padStart(2, '0');
}

export function boundsFromXYZ(coords) {
  const list = [...coords];
  if (list.length === 0) throw new Error('cannot compute bounds from an empty set of coordinates');
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  const floorSet = new Set();
  for (const [x, y, z] of list) {
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    floorSet.add(floorId(z));
  }
  return {
    xMin, xMax, yMin, yMax, zMin, zMax,
    width: TILE_SIZE + xMax - xMin,
    height: TILE_SIZE + yMax - yMin,
    floorIDs: [...floorSet].sort(),
  };
}

export function unionBounds(boundsList) {
  const list = boundsList.filter(Boolean);
  if (list.length === 0) throw new Error('cannot union an empty list of bounds');
  const xMin = Math.min(...list.map((b) => b.xMin));
  const xMax = Math.max(...list.map((b) => b.xMax));
  const yMin = Math.min(...list.map((b) => b.yMin));
  const yMax = Math.max(...list.map((b) => b.yMax));
  const zMin = Math.min(...list.map((b) => b.zMin));
  const zMax = Math.max(...list.map((b) => b.zMax));
  const floorSet = new Set(list.flatMap((b) => b.floorIDs));
  return {
    xMin, xMax, yMin, yMax, zMin, zMax,
    width: TILE_SIZE + xMax - xMin,
    height: TILE_SIZE + yMax - yMin,
    floorIDs: [...floorSet].sort(),
  };
}
