import { sortMarkers } from './markers.js';
import { canvasToPngBytes, getFloorMapCanvas, getFloorPathCanvas } from './render.js';

export async function convertFromMinimap(source, { includeMarkers = true, markersOnly = false, floors = null, onProgress } = {}) {
  let floorIds = source.bounds.floorIDs;
  if (floors) floorIds = floorIds.filter((fid) => floors.has(Number(fid)));

  const files = [];
  if (!markersOnly) {
    for (const fid of floorIds) {
      onProgress?.(`Rendering floor ${fid}...`);
      const z = Number(fid);
      const mapCanvas = await getFloorMapCanvas(source, z);
      if (mapCanvas) files.push({ name: `floor-${fid}-map.png`, data: await canvasToPngBytes(mapCanvas) });
      const pathCanvas = await getFloorPathCanvas(source, z);
      if (pathCanvas) files.push({ name: `floor-${fid}-path.png`, data: await canvasToPngBytes(pathCanvas) });
    }
    files.push({ name: 'bounds.json', data: new TextEncoder().encode(JSON.stringify(source.bounds, null, 4)) });
  }

  const markers = includeMarkers ? sortMarkers(await source.markers()) : [];
  files.push({ name: 'markers.json', data: new TextEncoder().encode(JSON.stringify(markers, null, 4)) });

  return {
    files,
    bounds: source.bounds,
    markerCount: markers.length,
    floorsRendered: markersOnly ? [] : floorIds,
  };
}
