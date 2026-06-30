/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Browser document-scan primitives, ported from jscanify (MIT — ColonelParrot
 * and contributors, https://github.com/puffinsoft/jscanify) and rewritten as a
 * typed module that takes OpenCV (`cv`) explicitly.
 *
 * Why ported instead of `npm i jscanify`: the jscanify package declares the
 * native `canvas` build as a hard dependency (for its Node entry, which we
 * never use). Installing a native image lib has repeatedly crashed Vercel here
 * — same family as `sharp` — so we keep only the ~3 browser functions we need
 * and run them against the lazy-loaded OpenCV.js. All browser-only (uses
 * `document`); never call these during SSR.
 */

export type Pt = { x: number; y: number };
export type Corners = {
  topLeftCorner: Pt;
  topRightCorner: Pt;
  bottomLeftCorner: Pt;
  bottomRightCorner: Pt;
};

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Largest contour in the image (the paper), as a cv.Mat — or null. */
export function findPaperContour(cv: any, img: any): any | null {
  const gray = new cv.Mat();
  cv.Canny(img, gray, 50, 200);
  const blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
  const thresh = new cv.Mat();
  cv.threshold(blur, thresh, 0, 255, cv.THRESH_OTSU);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

  let maxArea = 0;
  let maxIndex = -1;
  for (let i = 0; i < contours.size(); i++) {
    const area = cv.contourArea(contours.get(i));
    if (area > maxArea) {
      maxArea = area;
      maxIndex = i;
    }
  }
  const maxContour = maxIndex >= 0 ? contours.get(maxIndex) : null;

  gray.delete();
  blur.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();
  return maxContour;
}

/** The 4 extreme corners of a contour, by quadrant relative to its center. */
export function getCornerPoints(cv: any, contour: any): Partial<Corners> {
  const rect = cv.minAreaRect(contour);
  const center = rect.center;

  let topLeftCorner: Pt | undefined;
  let topLeftDist = 0;
  let topRightCorner: Pt | undefined;
  let topRightDist = 0;
  let bottomLeftCorner: Pt | undefined;
  let bottomLeftDist = 0;
  let bottomRightCorner: Pt | undefined;
  let bottomRightDist = 0;

  for (let i = 0; i < contour.data32S.length; i += 2) {
    const p: Pt = { x: contour.data32S[i], y: contour.data32S[i + 1] };
    const d = distance(p, center);
    if (p.x < center.x && p.y < center.y) {
      if (d > topLeftDist) {
        topLeftCorner = p;
        topLeftDist = d;
      }
    } else if (p.x > center.x && p.y < center.y) {
      if (d > topRightDist) {
        topRightCorner = p;
        topRightDist = d;
      }
    } else if (p.x < center.x && p.y > center.y) {
      if (d > bottomLeftDist) {
        bottomLeftCorner = p;
        bottomLeftDist = d;
      }
    } else if (p.x > center.x && p.y > center.y) {
      if (d > bottomRightDist) {
        bottomRightCorner = p;
        bottomRightDist = d;
      }
    }
  }

  return { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner };
}

/** Auto-detect the page's 4 corners; falls back to an inset rectangle. */
export function detectCorners(cv: any, src: HTMLCanvasElement): Corners {
  const w = src.width;
  const h = src.height;
  const fallback: Corners = {
    topLeftCorner: { x: w * 0.08, y: h * 0.08 },
    topRightCorner: { x: w * 0.92, y: h * 0.08 },
    bottomLeftCorner: { x: w * 0.08, y: h * 0.92 },
    bottomRightCorner: { x: w * 0.92, y: h * 0.92 },
  };
  let mat: any = null;
  let contour: any = null;
  try {
    mat = cv.imread(src);
    contour = findPaperContour(cv, mat);
    if (!contour) return fallback;
    const c = getCornerPoints(cv, contour);
    if (
      !c.topLeftCorner ||
      !c.topRightCorner ||
      !c.bottomLeftCorner ||
      !c.bottomRightCorner
    ) {
      return fallback;
    }
    return c as Corners;
  } catch {
    return fallback;
  } finally {
    mat?.delete?.();
    contour?.delete?.();
  }
}

/** Perspective-dewarp the quad (in source-pixel coords) to a flat rectangle. */
export function extractPaper(
  cv: any,
  image: HTMLCanvasElement,
  resultWidth: number,
  resultHeight: number,
  corners: Corners,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const img = cv.imread(image);
  const warped = new cv.Mat();
  const dsize = new cv.Size(resultWidth, resultHeight);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners.topLeftCorner.x,
    corners.topLeftCorner.y,
    corners.topRightCorner.x,
    corners.topRightCorner.y,
    corners.bottomLeftCorner.x,
    corners.bottomLeftCorner.y,
    corners.bottomRightCorner.x,
    corners.bottomRightCorner.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    resultWidth,
    0,
    0,
    resultHeight,
    resultWidth,
    resultHeight,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(
    img,
    warped,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(),
  );
  cv.imshow(canvas, warped);

  img.delete();
  warped.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();
  return canvas;
}
