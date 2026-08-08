/**
 * Turn a painted alpha channel into a polygon outline.
 *
 * This is what lets you draw a shape on the paint board and get real geometry
 * out of it -- with sides, thickness and a shadow -- instead of a flat card
 * that happens to have a hole in it. The boards are 64-192px, so tracing and
 * simplifying costs well under a millisecond and can run on a button press.
 */

/** Alpha above this counts as solid. */
const ALPHA_THRESHOLD = 128;
/** Simplification tolerance, in pixels. Higher means blockier. */
const SIMPLIFY_EPSILON = 1.1;
/** Refuse to emit a contour with fewer points than this; it is noise. */
const MIN_POINTS = 3;

export interface TracedPoint {
  /** 0..1 across the canvas, left to right. */
  x: number;
  /** 0..1 down the canvas, top to bottom. */
  y: number;
}

/**
 * Trace the outer boundary of the painted region.
 *
 * Returns normalised coordinates so the result survives resizing the piece:
 * the path is stored against the card rectangle, and width, length and pad
 * keep scaling it afterwards.
 *
 * Only the outer contour of the largest blob is followed. Holes and detached
 * islands are ignored -- a single closed outline is what an extrude needs.
 */
export function traceOutline(canvas: HTMLCanvasElement): TracedPoint[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);

  const solid = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return (data[(y * width + x) * 4 + 3] ?? 0) >= ALPHA_THRESHOLD;
  };

  const start = findStart(solid, width, height);
  if (!start) return [];

  const contour = mooreTrace(solid, start);
  if (contour.length < MIN_POINTS) return [];

  const simplified = simplify(contour, SIMPLIFY_EPSILON);
  if (simplified.length < MIN_POINTS) return [];

  return simplified.map((point) => ({
    x: point.x / width,
    y: point.y / height,
  }));
}

interface Pixel {
  x: number;
  y: number;
}

/** Topmost-then-leftmost solid pixel, which is guaranteed to be on a boundary. */
function findStart(
  solid: (x: number, y: number) => boolean,
  width: number,
  height: number,
): Pixel | null {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (solid(x, y)) return { x, y };
    }
  }
  return null;
}

// Clockwise ring of the eight neighbours, starting due west.
const NEIGHBOURS: Pixel[] = [
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
];

/**
 * Moore-neighbourhood boundary following.
 *
 * Walks the ring of neighbours around the current boundary pixel, starting from
 * where the previous step came in, and steps to the first solid one found. That
 * hugs the outside of the blob all the way round.
 */
function mooreTrace(
  solid: (x: number, y: number) => boolean,
  start: Pixel,
): Pixel[] {
  const contour: Pixel[] = [start];
  let current = start;
  // Entered the start pixel from the west, since nothing above or left is solid.
  let backtrackIndex = 0;

  // A boundary can be at most a few times the pixel count; bail out rather than
  // spin forever if the walk ever fails to close.
  const limit = 8192;

  for (let step = 0; step < limit; step++) {
    let found = false;
    for (let i = 1; i <= NEIGHBOURS.length; i++) {
      const index = (backtrackIndex + i) % NEIGHBOURS.length;
      const offset = NEIGHBOURS[index];
      if (!offset) continue;
      const candidate = { x: current.x + offset.x, y: current.y + offset.y };
      if (!solid(candidate.x, candidate.y)) continue;

      // Re-enter the next pixel from the direction we just left, so the walk
      // keeps turning the same way around the blob.
      backtrackIndex = (index + 4) % NEIGHBOURS.length;
      current = candidate;
      found = true;
      break;
    }

    if (!found) break;
    if (current.x === start.x && current.y === start.y) break;
    contour.push(current);
  }

  return contour;
}

/** Ramer-Douglas-Peucker: drop points that sit close to the line they span. */
function simplify(points: Pixel[], epsilon: number): Pixel[] {
  if (points.length < 3) return points;

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;

  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    if (!point) continue;
    const distance = perpendicular(point, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= epsilon) return [first, last];

  const head = simplify(points.slice(0, index + 1), epsilon);
  const tail = simplify(points.slice(index), epsilon);
  return [...head.slice(0, -1), ...tail];
}

function perpendicular(point: Pixel, a: Pixel, b: Pixel): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const area = Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x);
  return area / Math.sqrt(lengthSquared);
}
