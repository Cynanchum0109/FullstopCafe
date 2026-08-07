import * as THREE from "three";
import { palette } from "./palette";
import { boxAt, flatMaterial } from "./materials";

/** Interior floor size. The room is a cutaway box: only -X and -Z walls exist. */
export const ROOM = {
  width: 8,
  depth: 6,
  // Roughly twice a character's height: tall enough to feel like a real office,
  // low enough that the walls do not swallow the actors at this camera angle.
  wallHeight: 2.4,
  wallThickness: 0.2,
} as const;

export const ROOM_MIN_X = -ROOM.width / 2;
export const ROOM_MAX_X = ROOM.width / 2;
export const ROOM_MIN_Z = -ROOM.depth / 2;
export const ROOM_MAX_Z = ROOM.depth / 2;

/**
 * The room shell: floor, two walls, a window, a rug. Furniture lives in its own
 * module so this stays purely architectural.
 */
export class Office {
  readonly group = new THREE.Group();
  /** Emissive glass plane; `setNight` swaps its colour with the day/night cycle. */
  private readonly glass: THREE.Mesh;

  constructor() {
    this.group.name = "office";
    this.buildFloor();
    this.buildRug();
    this.glass = this.buildBackWall();
    this.buildSideWall();
  }

  /** Blend the window glass between its day and night colours, 0..1. */
  setNight(amount: number): void {
    const material = this.glass.material as THREE.MeshBasicMaterial;
    material.color
      .setHex(palette.windowGlassDay)
      .lerp(new THREE.Color(palette.windowGlassNight), amount);
  }

  private buildFloor(): void {
    const floor = boxAt(
      ROOM.width,
      0.3,
      ROOM.depth,
      palette.floor,
      0,
      -0.15,
      0,
      { castShadow: false },
    );
    this.group.add(floor);

    // Thin grooves standing in for plank seams. Narrow on purpose: wide bands
    // read as stripes painted on the floor rather than as boards.
    const spacing = 0.62;
    const count = Math.floor(ROOM.depth / spacing);
    for (let i = 1; i < count; i++) {
      const z = ROOM_MIN_Z + i * spacing;
      const groove = boxAt(
        ROOM.width,
        0.02,
        0.05,
        palette.floorPlank,
        0,
        0.005,
        z,
        { castShadow: false },
      );
      this.group.add(groove);
    }
  }

  private buildRug(): void {
    const rug = boxAt(3.2, 0.04, 2.3, palette.rug, 1.0, 0.02, 1.0, {
      castShadow: false,
    });
    this.group.add(rug);
    const trim = boxAt(2.8, 0.05, 1.9, palette.rugTrim, 1.0, 0.03, 1.0, {
      castShadow: false,
    });
    this.group.add(trim);
  }

  /** The -Z wall, with a window punched through it. Returns the glass mesh. */
  private buildBackWall(): THREE.Mesh {
    const z = ROOM_MIN_Z - ROOM.wallThickness / 2;
    const windowCentreX = -1.6;
    const windowWidth = 2.2;
    const windowBottom = 0.95;
    const windowTop = 2.0;

    // Wall built as four slabs around the opening rather than a real boolean.
    const leftWidth = windowCentreX - windowWidth / 2 - ROOM_MIN_X;
    const rightWidth = ROOM_MAX_X - (windowCentreX + windowWidth / 2);

    this.group.add(
      boxAt(
        leftWidth,
        ROOM.wallHeight,
        ROOM.wallThickness,
        palette.wallBack,
        ROOM_MIN_X + leftWidth / 2,
        ROOM.wallHeight / 2,
        z,
        { castShadow: false },
      ),
    );
    this.group.add(
      boxAt(
        rightWidth,
        ROOM.wallHeight,
        ROOM.wallThickness,
        palette.wallBack,
        ROOM_MAX_X - rightWidth / 2,
        ROOM.wallHeight / 2,
        z,
        { castShadow: false },
      ),
    );
    this.group.add(
      boxAt(
        windowWidth,
        windowBottom,
        ROOM.wallThickness,
        palette.wallBack,
        windowCentreX,
        windowBottom / 2,
        z,
        { castShadow: false },
      ),
    );
    this.group.add(
      boxAt(
        windowWidth,
        ROOM.wallHeight - windowTop,
        ROOM.wallThickness,
        palette.wallBack,
        windowCentreX,
        (ROOM.wallHeight + windowTop) / 2,
        z,
        { castShadow: false },
      ),
    );

    // Frame + mullion.
    const frameColor = palette.windowFrame;
    this.group.add(
      boxAt(windowWidth + 0.2, 0.12, 0.28, frameColor, windowCentreX, windowBottom, z),
    );
    this.group.add(
      boxAt(windowWidth + 0.2, 0.12, 0.28, frameColor, windowCentreX, windowTop, z),
    );
    this.group.add(
      boxAt(
        0.1,
        windowTop - windowBottom,
        0.28,
        frameColor,
        windowCentreX,
        (windowBottom + windowTop) / 2,
        z,
      ),
    );

    // Glass is unlit on purpose: it stands in for the sky outside, so it should
    // not darken when the room does.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(windowWidth, windowTop - windowBottom),
      new THREE.MeshBasicMaterial({ color: palette.windowGlassDay }),
    );
    glass.position.set(windowCentreX, (windowBottom + windowTop) / 2, z + 0.02);
    this.group.add(glass);

    this.group.add(
      boxAt(
        ROOM.width,
        0.16,
        ROOM.wallThickness + 0.06,
        palette.skirting,
        0,
        0.08,
        z,
        { castShadow: false },
      ),
    );

    return glass;
  }

  /** The -X wall. Plain, it mostly reads as a backdrop for the desks. */
  private buildSideWall(): void {
    const x = ROOM_MIN_X - ROOM.wallThickness / 2;
    this.group.add(
      boxAt(
        ROOM.wallThickness,
        ROOM.wallHeight,
        ROOM.depth,
        palette.wallSide,
        x,
        ROOM.wallHeight / 2,
        0,
        { castShadow: false },
      ),
    );
    this.group.add(
      boxAt(
        ROOM.wallThickness + 0.06,
        0.16,
        ROOM.depth,
        palette.skirting,
        x,
        0.08,
        0,
        { castShadow: false },
      ),
    );

    // Door opening on the side wall, where visitors will arrive later.
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.9, 1.0),
      flatMaterial(palette.woodDark),
    );
    doorFrame.position.set(x + 0.02, 0.95, 1.9);
    doorFrame.castShadow = true;
    doorFrame.receiveShadow = true;
    this.group.add(doorFrame);
  }
}
