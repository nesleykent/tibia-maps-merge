// Abstractions over the two directory shapes this tool reads from, built on
// top of a plain `Map<basename, File>` (produced by `fileListToMap` from a
// `webkitdirectory` file input's FileList).
import { boundsFromXYZ, floorId } from './bounds.js';
import { parseMarkersBin } from './markers.js';

const TILE_RE = /^Minimap_(Color|WaypointCost)_(-?\d+)_(-?\d+)_(\d+)\.png$/;

export function fileListToMap(fileList) {
  const map = new Map();
  for (const file of fileList) {
    const rel = file.webkitRelativePath || file.name;
    const name = rel.split('/').pop();
    map.set(name, file);
  }
  return map;
}

export function detectKind(fileMap) {
  return fileMap.has('bounds.json') ? 'data' : 'raw';
}

export class RawMinimapSource {
  constructor(fileMap, label) {
    this.kind = 'raw';
    this.label = label || 'raw export';
    this.fileMap = fileMap;
    this.colorTiles = new Map(); // key "x_y_z" -> {file, x, y, z}
    this.pathTiles = new Map();
    this.markersBinFile = fileMap.get('minimapmarkers.bin') || null;
    for (const [name, file] of fileMap) {
      const match = TILE_RE.exec(name);
      if (!match) continue;
      const [, kind, xs, ys, zs] = match;
      const x = Number(xs), y = Number(ys), z = Number(zs);
      const key = `${x}_${y}_${z}`;
      (kind === 'Color' ? this.colorTiles : this.pathTiles).set(key, { file, x, y, z });
    }
    const coords = [...this.colorTiles.values(), ...this.pathTiles.values()].map((v) => [v.x, v.y, v.z]);
    this.bounds = boundsFromXYZ(coords);
  }

  async markers() {
    if (!this.markersBinFile) return [];
    const buf = await this.markersBinFile.arrayBuffer();
    try {
      return parseMarkersBin(buf, { source: this.markersBinFile.name });
    } catch (err) {
      console.warn(`Could not parse ${this.markersBinFile.name}: ${err.message}`);
      return [];
    }
  }
}

export class ConvertedDataSource {
  constructor(fileMap, label) {
    this.kind = 'data';
    this.label = label || 'data folder';
    this.fileMap = fileMap;
  }

  async load() {
    const boundsFile = this.fileMap.get('bounds.json');
    this.bounds = JSON.parse(await boundsFile.text());
    return this;
  }

  floorMapFile(z) {
    const fid = floorId(z);
    if (!this.bounds.floorIDs.includes(fid)) return null;
    return this.fileMap.get(`floor-${fid}-map.png`) || null;
  }

  floorPathFile(z) {
    const fid = floorId(z);
    if (!this.bounds.floorIDs.includes(fid)) return null;
    return this.fileMap.get(`floor-${fid}-path.png`) || null;
  }

  async markers() {
    const file = this.fileMap.get('markers.json');
    if (!file) return [];
    return JSON.parse(await file.text());
  }
}

export async function openSource(fileMap, label) {
  if (detectKind(fileMap) === 'data') {
    return new ConvertedDataSource(fileMap, label).load();
  }
  return new RawMinimapSource(fileMap, label);
}
