import * as THREE from "three";
import { palette } from "./palette";
import { box, boxAt } from "./materials";
import { ROOM_MAX_X, ROOM_MAX_Z, ROOM_MIN_X, ROOM_MIN_Z } from "./Office";

/**
 * What an actor can do at a floor anchor. Animation names land later; for now
 * these tags are enough for spawn defaults and the future utility AI.
 */
export type SpotKind = "sit" | "lie" | "stand" | "work" | "look";

export interface InteractionSpot {
  id: string;
  furnitureId: string;
  kind: SpotKind;
  /** World-space floor position the actor roots at. */
  position: THREE.Vector3;
  /** Radians, Y-up. Face direction after arriving. */
  yaw: number;
  /** Soft bias for AI / default spawn — never a hard lock. */
  preferredActorId?: string;
}

/**
 * Low-poly office set for a combat-commission agency.
 *
 * Layout notes live in `docs/DESIGN.md`. Meshes are pure boxes on purpose:
 * readable at isometric distance, cheap to iterate, no GLTF step.
 */
export class Furniture {
  readonly group = new THREE.Group();
  readonly spots: InteractionSpot[] = [];

  constructor() {
    this.group.name = "furniture";

    // --- Boss corner (+X, -Z): Honglu's desk, moneyed but still geometric. ---
    this.buildBossDesk(2.45, -1.85);
    this.buildVisitorChairs(1.55, -1.55);

    // --- Ops / intel table centre: briefings, Sinclair's homework. ----------
    this.buildOpsTable(0.15, 0.15);

    // --- Task board on the back wall, camera-facing. ----------------------
    this.buildTaskBoard(0.55, ROOM_MIN_Z + 0.12);

    // --- Armoury along -X: gun safe + long weapon bench. ------------------
    this.buildGunSafe(ROOM_MIN_X + 0.45, -1.7);
    this.buildWeaponBench(ROOM_MIN_X + 0.55, -0.35);

    // --- Lounge: Heath's nap zone. Rug stays under Office; sofa sits near. --
    this.buildSofa(1.35, 1.55);
    this.buildCoffeeTable(1.35, 0.85);

    // --- Filing: contracts Sinclair will actually read. -------------------
    this.buildFilingCabinet(ROOM_MIN_X + 0.55, 0.85);

    // --- Desk lamp pool of luxury on the boss desk (mesh only). -----------
    // (built inside boss desk)
  }

  // -----------------------------------------------------------------------
  // Builders
  // -----------------------------------------------------------------------

  private buildBossDesk(x: number, z: number): void {
    const id = "boss-desk";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);

    // Thick dark top — heavier than the ops table, so it reads as the money seat.
    const topW = 1.55;
    const topD = 0.85;
    const topH = 0.07;
    const surfaceY = 0.78;
    root.add(boxAt(topW, topH, topD, palette.woodDark, 0, surfaceY, 0));
    // Leather blotter.
    root.add(boxAt(0.9, 0.02, 0.55, palette.suitCharcoal, 0, surfaceY + 0.04, 0.02));
    // Goldish edge strip (Honglu is rich; one thin accent is enough).
    root.add(boxAt(topW + 0.04, 0.03, 0.04, palette.woodLight, 0, surfaceY + 0.01, topD / 2));

    // Pedestals.
    root.add(boxAt(0.38, 0.72, 0.7, palette.woodMid, -0.52, 0.36, 0));
    root.add(boxAt(0.38, 0.72, 0.7, palette.woodMid, 0.52, 0.36, 0));
    // Drawer faces.
    root.add(boxAt(0.34, 0.14, 0.04, palette.woodLight, -0.52, 0.55, 0.36));
    root.add(boxAt(0.34, 0.14, 0.04, palette.woodLight, 0.52, 0.55, 0.36));

    // Paper stack + folder.
    root.add(boxAt(0.28, 0.03, 0.36, palette.paper, -0.42, surfaceY + 0.05, -0.15));
    root.add(boxAt(0.22, 0.02, 0.3, palette.hongluTie, -0.38, surfaceY + 0.08, -0.12));

    // Desk lamp.
    root.add(boxAt(0.08, 0.28, 0.08, palette.metal, 0.52, surfaceY + 0.17, -0.22));
    root.add(boxAt(0.22, 0.06, 0.16, palette.lampWarm, 0.52, surfaceY + 0.36, -0.18));

    // Chair back (mesh behind the sit spot for silhouette).
    root.add(boxAt(0.48, 0.55, 0.08, palette.suitCharcoal, 0, 0.72, 0.58));
    root.add(boxAt(0.48, 0.08, 0.42, palette.suitCharcoal, 0, 0.42, 0.42));

    this.group.add(root);

    // Sit behind the desk, facing into the room (-Z wall is behind Honglu).
    this.addSpot({
      id: "boss-desk:sit",
      furnitureId: id,
      kind: "sit",
      position: new THREE.Vector3(x, 0, z + 0.62),
      yaw: Math.PI,
      preferredActorId: "honglu",
    });
    // Stand at the open side to hand papers across.
    this.addSpot({
      id: "boss-desk:stand-side",
      furnitureId: id,
      kind: "stand",
      position: new THREE.Vector3(x - 0.95, 0, z),
      yaw: Math.PI * 0.5,
    });
  }

  private buildVisitorChairs(x: number, z: number): void {
    const id = "visitor-chairs";
    for (let i = 0; i < 2; i++) {
      const ox = x - i * 0.55;
      const root = new THREE.Group();
      root.name = `${id}:${i}`;
      root.position.set(ox, 0, z);

      root.add(boxAt(0.4, 0.06, 0.4, palette.woodMid, 0, 0.42, 0));
      root.add(boxAt(0.4, 0.4, 0.06, palette.woodMid, 0, 0.64, 0.17));
      // Legs.
      for (const [lx, lz] of [
        [-0.14, -0.14],
        [0.14, -0.14],
        [-0.14, 0.14],
        [0.14, 0.14],
      ] as const) {
        root.add(boxAt(0.05, 0.4, 0.05, palette.woodDark, lx, 0.2, lz));
      }
      this.group.add(root);

      this.addSpot({
        id: `visitor-chair:${i}:sit`,
        furnitureId: id,
        kind: "sit",
        position: new THREE.Vector3(ox, 0, z - 0.05),
        // Face the boss desk (+X / slightly +Z of chairs — desk is further +X -Z).
        yaw: -0.4,
      });
    }
  }

  private buildOpsTable(x: number, z: number): void {
    const id = "ops-table";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);

    const topW = 1.9;
    const topD = 1.15;
    const surfaceY = 0.74;
    root.add(boxAt(topW, 0.06, topD, palette.woodMid, 0, surfaceY, 0));
    // Four legs.
    for (const [lx, lz] of [
      [-0.82, -0.48],
      [0.82, -0.48],
      [-0.82, 0.48],
      [0.82, 0.48],
    ] as const) {
      root.add(boxAt(0.08, 0.7, 0.08, palette.woodDark, lx, 0.35, lz));
    }
    // Map sheet + photo stack — mission clutter without readable text.
    root.add(boxAt(0.7, 0.015, 0.5, palette.paper, -0.25, surfaceY + 0.04, 0.05));
    root.add(boxAt(0.35, 0.02, 0.28, palette.metalDark, 0.35, surfaceY + 0.04, -0.2));
    root.add(boxAt(0.22, 0.015, 0.18, palette.hongluHairShade, 0.45, surfaceY + 0.06, 0.15));
    // Small ammo / case box.
    root.add(boxAt(0.28, 0.12, 0.18, palette.metal, 0.55, surfaceY + 0.09, 0.35));

    this.group.add(root);

    // Three stand points around the table.
    const stands: Array<{ id: string; dx: number; dz: number; yaw: number; preferred?: string }> = [
      { id: "ops-table:north", dx: 0, dz: -0.85, yaw: 0, preferred: "sinclair" },
      { id: "ops-table:east", dx: 1.15, dz: 0.1, yaw: -Math.PI / 2 },
      { id: "ops-table:west", dx: -1.15, dz: 0.1, yaw: Math.PI / 2 },
    ];
    for (const s of stands) {
      this.addSpot({
        id: s.id,
        furnitureId: id,
        kind: "stand",
        position: new THREE.Vector3(x + s.dx, 0, z + s.dz),
        yaw: s.yaw,
        ...(s.preferred ? { preferredActorId: s.preferred } : {}),
      });
    }
  }

  private buildTaskBoard(x: number, z: number): void {
    const id = "task-board";
    const root = new THREE.Group();
    root.name = id;
    // Hangs on the back wall; slight push into the room so it clears skirting.
    root.position.set(x, 0, z);

    const boardW = 1.35;
    const boardH = 0.95;
    const boardY = 1.25;
    root.add(boxAt(boardW, boardH, 0.05, palette.metal, 0, boardY, 0));
    // Cork / note panels.
    root.add(boxAt(0.38, 0.28, 0.03, palette.paper, -0.38, boardY + 0.18, 0.04));
    root.add(boxAt(0.32, 0.22, 0.03, palette.paper, 0.08, boardY + 0.1, 0.04));
    root.add(boxAt(0.28, 0.2, 0.03, palette.hongluTie, 0.42, boardY - 0.15, 0.04));
    root.add(boxAt(0.3, 0.18, 0.03, palette.fabricSofa, -0.2, boardY - 0.22, 0.04));
    // Frame.
    root.add(boxAt(boardW + 0.08, 0.05, 0.07, palette.woodDark, 0, boardY + boardH / 2, 0));
    root.add(boxAt(boardW + 0.08, 0.05, 0.07, palette.woodDark, 0, boardY - boardH / 2, 0));

    this.group.add(root);

    this.addSpot({
      id: "task-board:look",
      furnitureId: id,
      kind: "look",
      position: new THREE.Vector3(x, 0, z + 0.55),
      yaw: Math.PI,
      preferredActorId: "sinclair",
    });
  }

  private buildGunSafe(x: number, z: number): void {
    const id = "gun-safe";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);

    root.add(boxAt(0.55, 1.35, 0.42, palette.metalDark, 0, 0.675, 0));
    // Door seam + handle.
    root.add(boxAt(0.52, 1.28, 0.03, palette.metal, 0.02, 0.68, 0.22));
    root.add(boxAt(0.05, 0.14, 0.06, palette.woodLight, 0.18, 0.72, 0.26));
    // Small "locked" plate.
    root.add(boxAt(0.12, 0.08, 0.02, palette.metal, -0.1, 1.05, 0.24));

    this.group.add(root);

    this.addSpot({
      id: "gun-safe:stand",
      furnitureId: id,
      kind: "stand",
      position: new THREE.Vector3(x + 0.55, 0, z),
      yaw: -Math.PI / 2,
    });
  }

  private buildWeaponBench(x: number, z: number): void {
    const id = "weapon-bench";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);
    // Long enough for a sniper silhouette later.
    const topW = 0.55;
    const topD = 1.55;
    const surfaceY = 0.85;
    root.add(boxAt(topW, 0.06, topD, palette.woodDark, 0, surfaceY, 0));
    root.add(boxAt(0.5, 0.78, 1.45, palette.metalDark, 0, 0.39, 0));
    // Tool tray + cloth.
    root.add(boxAt(0.35, 0.04, 0.45, palette.metal, 0.02, surfaceY + 0.05, -0.4));
    root.add(boxAt(0.4, 0.02, 0.55, palette.paper, 0, surfaceY + 0.04, 0.25));
    // Under-mount light rail.
    root.add(boxAt(0.08, 0.06, 0.9, palette.lampWarm, 0.22, surfaceY + 0.12, 0));

    this.group.add(root);

    this.addSpot({
      id: "weapon-bench:work",
      furnitureId: id,
      kind: "work",
      position: new THREE.Vector3(x + 0.55, 0, z),
      yaw: -Math.PI / 2,
      preferredActorId: "heath",
    });
  }

  private buildSofa(x: number, z: number): void {
    const id = "sofa";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);
    // Faces roughly toward -Z (into the room / ops area). Heath sprawls here.
    const seatW = 1.7;
    const seatD = 0.7;
    root.add(boxAt(seatW, 0.28, seatD, palette.fabricSofa, 0, 0.28, 0));
    // Back.
    root.add(boxAt(seatW, 0.5, 0.16, palette.fabricSofa, 0, 0.58, 0.28));
    // Arms.
    root.add(boxAt(0.16, 0.38, seatD + 0.05, palette.fabricCushion, -seatW / 2 + 0.02, 0.42, 0));
    root.add(boxAt(0.16, 0.38, seatD + 0.05, palette.fabricCushion, seatW / 2 - 0.02, 0.42, 0));
    // Cushions.
    root.add(boxAt(0.7, 0.1, 0.55, palette.fabricCushion, -0.35, 0.45, -0.02));
    root.add(boxAt(0.7, 0.1, 0.55, palette.fabricCushion, 0.35, 0.45, -0.02));

    this.group.add(root);

    // Lie along the length of the sofa (Heath's default nap pose).
    this.addSpot({
      id: "sofa:lie",
      furnitureId: id,
      kind: "lie",
      position: new THREE.Vector3(x, 0, z - 0.05),
      yaw: Math.PI * 0.5,
      preferredActorId: "heath",
    });
    this.addSpot({
      id: "sofa:sit",
      furnitureId: id,
      kind: "sit",
      position: new THREE.Vector3(x + 0.45, 0, z - 0.15),
      yaw: Math.PI,
    });
  }

  private buildCoffeeTable(x: number, z: number): void {
    const id = "coffee-table";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);
    root.add(boxAt(0.9, 0.05, 0.5, palette.woodLight, 0, 0.35, 0));
    for (const [lx, lz] of [
      [-0.35, -0.18],
      [0.35, -0.18],
      [-0.35, 0.18],
      [0.35, 0.18],
    ] as const) {
      root.add(boxAt(0.06, 0.32, 0.06, palette.woodDark, lx, 0.16, lz));
    }
    // Mug + magazine blob.
    root.add(boxAt(0.1, 0.1, 0.1, palette.hongluTie, -0.2, 0.42, 0.05));
    root.add(boxAt(0.28, 0.02, 0.2, palette.paper, 0.15, 0.39, -0.05));
    this.group.add(root);
  }

  private buildFilingCabinet(x: number, z: number): void {
    const id = "filing-cabinet";
    const root = new THREE.Group();
    root.name = id;
    root.position.set(x, 0, z);
    root.add(boxAt(0.5, 1.05, 0.45, palette.metal, 0, 0.525, 0));
    for (let i = 0; i < 3; i++) {
      const y = 0.25 + i * 0.28;
      root.add(boxAt(0.46, 0.22, 0.03, palette.metalDark, 0, y, 0.23));
      root.add(boxAt(0.12, 0.03, 0.04, palette.woodLight, 0, y, 0.26));
    }
    this.group.add(root);

    this.addSpot({
      id: "filing-cabinet:work",
      furnitureId: id,
      kind: "work",
      position: new THREE.Vector3(x + 0.5, 0, z),
      yaw: -Math.PI / 2,
      preferredActorId: "sinclair",
    });
  }

  // -----------------------------------------------------------------------

  private addSpot(spot: InteractionSpot): void {
    // Keep anchors inside the walkable pad so phase-1 WASD and future nav agree.
    const margin = 0.35;
    spot.position.x = THREE.MathUtils.clamp(
      spot.position.x,
      ROOM_MIN_X + margin,
      ROOM_MAX_X - margin,
    );
    spot.position.z = THREE.MathUtils.clamp(
      spot.position.z,
      ROOM_MIN_Z + margin,
      ROOM_MAX_Z - margin,
    );
    this.spots.push(spot);
  }

  /** Lookup by id for AI / debug. */
  getSpot(id: string): InteractionSpot | undefined {
    return this.spots.find((s) => s.id === id);
  }

  /** Soft preference: first spot tagged for this actor, else undefined. */
  preferredSpotFor(actorId: string): InteractionSpot | undefined {
    return this.spots.find((s) => s.preferredActorId === actorId);
  }
}

/** Debug helper: small coloured posts at every interaction spot. Off by default. */
export function debugSpotMarkers(furniture: Furniture): THREE.Group {
  const g = new THREE.Group();
  g.name = "spot-debug";
  for (const spot of furniture.spots) {
    const color =
      spot.kind === "lie"
        ? 0xc07090
        : spot.kind === "sit"
          ? 0x70a0c0
          : spot.kind === "work"
            ? 0xc0a050
            : spot.kind === "look"
              ? 0x70c090
              : 0x909090;
    const m = box(0.08, 0.18, 0.08, color);
    m.position.copy(spot.position);
    m.position.y = 0.09;
    const nose = boxAt(0.04, 0.04, 0.16, color, 0, 0.2, -0.12);
    m.add(nose);
    m.rotation.y = spot.yaw;
    g.add(m);
  }
  return g;
}
