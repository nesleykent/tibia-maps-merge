import { unionBounds } from './bounds.js';
import { UNEXPLORED_MAP_COLOR, UNEXPLORED_PATH_COLOR } from './constants.js';
import { mergeMarkers } from './markers.js';
import { canvasToPngBytes, getFloorMapCanvas, getFloorPathCanvas, pasteExploredOnly } from './render.js';

function makeCanvas(width, height, fillColor) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${fillColor.join(',')})`;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

export async function mergeSources(sources, { includeMarkers = true, includeMaps = true, floors = null, onProgress } = {}) {
  if (sources.length < 2) throw new Error('need at least two sources to merge');
  const union = unionBounds(sources.map((s) => s.bounds));
  let floorIds = union.floorIDs;
  if (floors) floorIds = floorIds.filter((fid) => floors.has(Number(fid)));

  const files = [];
  const floorStats = {};

  if (includeMaps) {
    for (const fid of floorIds) {
      onProgress?.(`Merging floor ${fid}...`);
      const z = Number(fid);
      const mapCanvas = makeCanvas(union.width, union.height, UNEXPLORED_MAP_COLOR);
      const pathCanvas = makeCanvas(union.width, union.height, UNEXPLORED_PATH_COLOR);
      const mapCtx = mapCanvas.getContext('2d');
      const pathCtx = pathCanvas.getContext('2d');

      let contributors = 0;
      for (const source of sources) {
        const offsetX = source.bounds.xMin - union.xMin;
        const offsetY = source.bounds.yMin - union.yMin;
        const srcMap = await getFloorMapCanvas(source, z);
        if (srcMap) {
          pasteExploredOnly(mapCtx, srcMap, offsetX, offsetY, UNEXPLORED_MAP_COLOR);
          contributors += 1;
        }
        const srcPath = await getFloorPathCanvas(source, z);
        if (srcPath) pasteExploredOnly(pathCtx, srcPath, offsetX, offsetY, UNEXPLORED_PATH_COLOR);
      }
      files.push({ name: `floor-${fid}-map.png`, data: await canvasToPngBytes(mapCanvas) });
      files.push({ name: `floor-${fid}-path.png`, data: await canvasToPngBytes(pathCanvas) });
      floorStats[fid] = contributors;
    }
    files.push({ name: 'bounds.json', data: new TextEncoder().encode(JSON.stringify(union, null, 4)) });
  }

  let markers = [];
  if (includeMarkers) {
    const groups = await Promise.all(sources.map((s) => s.markers()));
    markers = mergeMarkers(...groups);
  }
  files.push({ name: 'markers.json', data: new TextEncoder().encode(JSON.stringify(markers, null, 4)) });

  return { files, bounds: union, markerCount: markers.length, floors: floorStats };
}
