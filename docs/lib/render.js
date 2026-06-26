// Canvas-based rendering. Browser-only (uses `document`/`createImageBitmap`).
import { floorId } from './bounds.js';
import { UNEXPLORED_MAP_COLOR, UNEXPLORED_PATH_COLOR } from './constants.js';

function makeCanvas(width, height, fillColor) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (fillColor) {
    ctx.fillStyle = `rgb(${fillColor.join(',')})`;
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
}

async function drawTiles(canvas, tiles, z, bounds) {
  const ctx = canvas.getContext('2d');
  for (const { file, x, y, z: tileZ } of tiles.values()) {
    if (tileZ !== z) continue;
    const bitmap = await createImageBitmap(file);
    ctx.drawImage(bitmap, x - bounds.xMin, y - bounds.yMin);
    bitmap.close?.();
  }
}

export async function renderRawFloorMap(source, z) {
  if (!source.bounds.floorIDs.includes(floorId(z))) return null;
  const canvas = makeCanvas(source.bounds.width, source.bounds.height, UNEXPLORED_MAP_COLOR);
  await drawTiles(canvas, source.colorTiles, z, source.bounds);
  return canvas;
}

export async function renderRawFloorPath(source, z) {
  if (!source.bounds.floorIDs.includes(floorId(z))) return null;
  const canvas = makeCanvas(source.bounds.width, source.bounds.height, UNEXPLORED_PATH_COLOR);
  await drawTiles(canvas, source.pathTiles, z, source.bounds);
  return canvas;
}

export async function loadCanvasFromFile(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
}

export async function getFloorMapCanvas(source, z) {
  if (source.kind === 'raw') return renderRawFloorMap(source, z);
  const file = source.floorMapFile(z);
  return file ? loadCanvasFromFile(file) : null;
}

export async function getFloorPathCanvas(source, z) {
  if (source.kind === 'raw') return renderRawFloorPath(source, z);
  const file = source.floorPathFile(z);
  return file ? loadCanvasFromFile(file) : null;
}

/** Copy only "explored" pixels (those differing from `unexploredColor`) from
 * `sourceCanvas` onto `destCtx` at the given offset, leaving everything else
 * in the destination untouched. */
export function pasteExploredOnly(destCtx, sourceCanvas, offsetX, offsetY, unexploredColor) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const srcData = sourceCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const destImageData = destCtx.getImageData(offsetX, offsetY, w, h);
  const destData = destImageData.data;
  const [ur, ug, ub] = unexploredColor;
  for (let i = 0; i < srcData.length; i += 4) {
    if (srcData[i] !== ur || srcData[i + 1] !== ug || srcData[i + 2] !== ub) {
      destData[i] = srcData[i];
      destData[i + 1] = srcData[i + 1];
      destData[i + 2] = srcData[i + 2];
      destData[i + 3] = 255;
    }
  }
  destCtx.putImageData(destImageData, offsetX, offsetY);
}

export function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}
