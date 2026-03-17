import { describe, it, expect } from "vitest";
import {
  detectWalls,
  buildWallGraph,
  findWallChains,
  detectRooms,
  detectOpenings,
  associateTagsWithWalls,
  associateTagsWithRooms,
  generateAutoMeasurements,
} from "@/utils/geometryEngine";

// ─── Helper: make a line segment with length pre-computed ────────

function mkLine(x1, y1, x2, y2) {
  return {
    x1,
    y1,
    x2,
    y2,
    length: Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
  };
}

// ─── Vector math utilities (inline tests of the private helpers) ─

describe("distance / geometry math", () => {
  it("Euclidean distance is correct", () => {
    // 3-4-5 triangle
    expect(Math.sqrt((4 - 0) ** 2 + (3 - 0) ** 2)).toBe(5);
  });
});

// ─── detectWalls() ───────────────────────────────────────────────

describe("detectWalls()", () => {
  it("returns empty array for empty input", () => {
    expect(detectWalls([])).toEqual([]);
  });

  it("returns empty array when lines are too short", () => {
    const lines = [mkLine(0, 0, 5, 0), mkLine(0, 10, 5, 10)];
    expect(detectWalls(lines)).toEqual([]);
  });

  it("detects a wall from two parallel horizontal lines", () => {
    // Two parallel horizontal lines 20px apart, each 200px long
    const lines = [mkLine(0, 0, 200, 0), mkLine(0, 20, 200, 20)];
    const walls = detectWalls(lines);
    expect(walls.length).toBe(1);
    expect(walls[0].width).toBeCloseTo(20, 0);
    expect(walls[0].length).toBeGreaterThan(190);
    expect(walls[0].confidence).toBeGreaterThan(0);
  });

  it("detects a wall from two parallel vertical lines", () => {
    const lines = [mkLine(0, 0, 0, 200), mkLine(15, 0, 15, 200)];
    const walls = detectWalls(lines);
    expect(walls.length).toBe(1);
    expect(walls[0].width).toBeCloseTo(15, 0);
  });

  it("does not pair non-parallel lines", () => {
    const lines = [
      mkLine(0, 0, 200, 0), // horizontal
      mkLine(0, 20, 0, 220), // vertical
    ];
    const walls = detectWalls(lines);
    expect(walls.length).toBe(0);
  });

  it("does not pair parallel lines that are too far apart", () => {
    const lines = [
      mkLine(0, 0, 200, 0),
      mkLine(0, 100, 200, 100), // 100px apart > WALL_MAX_WIDTH (55)
    ];
    const walls = detectWalls(lines);
    expect(walls.length).toBe(0);
  });

  it("does not pair parallel lines that are too close (duplicates)", () => {
    const lines = [
      mkLine(0, 0, 200, 0),
      mkLine(0, 1, 200, 1), // 1px apart < WALL_MIN_WIDTH (3)
    ];
    const walls = detectWalls(lines);
    expect(walls.length).toBe(0);
  });

  it("assigns higher confidence to thinner walls", () => {
    const thinWall = [mkLine(0, 0, 200, 0), mkLine(0, 10, 200, 10)];
    const thickWall = [mkLine(0, 0, 200, 0), mkLine(0, 40, 200, 40)];
    const thin = detectWalls(thinWall);
    const thick = detectWalls(thickWall);
    expect(thin[0].confidence).toBeGreaterThan(thick[0].confidence);
  });

  it("detects multiple walls from multiple pairs", () => {
    const lines = [
      // Wall 1: horizontal pair
      mkLine(0, 0, 200, 0),
      mkLine(0, 20, 200, 20),
      // Wall 2: another horizontal pair far away
      mkLine(0, 300, 200, 300),
      mkLine(0, 320, 200, 320),
    ];
    const walls = detectWalls(lines);
    expect(walls.length).toBe(2);
  });

  it("walls have required properties", () => {
    const lines = [mkLine(0, 0, 200, 0), mkLine(0, 20, 200, 20)];
    const walls = detectWalls(lines);
    const w = walls[0];
    expect(w).toHaveProperty("id");
    expect(w).toHaveProperty("centerline");
    expect(w).toHaveProperty("width");
    expect(w).toHaveProperty("length");
    expect(w).toHaveProperty("angle");
    expect(w).toHaveProperty("sourceLines");
    expect(w).toHaveProperty("endpoints");
    expect(w).toHaveProperty("confidence");
    expect(w.endpoints).toHaveLength(2);
    expect(w.sourceLines).toHaveLength(2);
  });
});

// ─── buildWallGraph() ────────────────────────────────────────────

describe("buildWallGraph()", () => {
  it("returns empty graph for no walls", () => {
    const graph = buildWallGraph([]);
    expect(graph.size).toBe(0);
  });

  it("connects walls that share an endpoint", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        id: "w2",
        endpoints: [
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    ];
    const graph = buildWallGraph(walls);
    expect(graph.get("w1").has("w2")).toBe(true);
    expect(graph.get("w2").has("w1")).toBe(true);
  });

  it("does not connect walls with distant endpoints", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        id: "w2",
        endpoints: [
          { x: 200, y: 200 },
          { x: 300, y: 200 },
        ],
      },
    ];
    const graph = buildWallGraph(walls);
    expect(graph.get("w1").has("w2")).toBe(false);
  });

  it("snaps endpoints within ENDPOINT_SNAP tolerance (15px)", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        id: "w2",
        endpoints: [
          { x: 110, y: 5 },
          { x: 110, y: 100 },
        ], // 110,5 is ~14px from 100,0
      },
    ];
    const graph = buildWallGraph(walls);
    expect(graph.get("w1").has("w2")).toBe(true);
  });
});

// ─── findWallChains() ────────────────────────────────────────────

describe("findWallChains()", () => {
  it("groups connected walls into chains", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        id: "w2",
        endpoints: [
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      },
      {
        id: "w3",
        endpoints: [
          { x: 500, y: 500 },
          { x: 600, y: 500 },
        ],
      }, // disconnected
    ];
    const graph = buildWallGraph(walls);
    const chains = findWallChains(walls, graph);
    expect(chains.length).toBe(2);
    // One chain has w1+w2, other has w3
    const sizes = chains.map(c => c.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it("returns one chain when all walls are connected", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        id: "w2",
        endpoints: [
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      },
      {
        id: "w3",
        endpoints: [
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    ];
    const graph = buildWallGraph(walls);
    const chains = findWallChains(walls, graph);
    expect(chains.length).toBe(1);
    expect(chains[0].length).toBe(3);
  });
});

// ─── detectRooms() ───────────────────────────────────────────────

describe("detectRooms()", () => {
  it("returns empty array when fewer than 3 walls", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
    ];
    const graph = buildWallGraph(walls);
    expect(detectRooms(walls, graph)).toEqual([]);
  });

  it("detects a rectangular room from 4 connected walls", () => {
    // Build a 200x200 room using wall detection from line pairs
    // Manually specify walls with endpoints forming a rectangle
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        length: 200,
      },
      {
        id: "w2",
        endpoints: [
          { x: 200, y: 0 },
          { x: 200, y: 200 },
        ],
        length: 200,
      },
      {
        id: "w3",
        endpoints: [
          { x: 200, y: 200 },
          { x: 0, y: 200 },
        ],
        length: 200,
      },
      {
        id: "w4",
        endpoints: [
          { x: 0, y: 200 },
          { x: 0, y: 0 },
        ],
        length: 200,
      },
    ];
    const graph = buildWallGraph(walls);
    const rooms = detectRooms(walls, graph);
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    // The detected room should have area close to 200*200 = 40000
    const mainRoom = rooms.find(r => r.area > 30000 && r.area < 50000);
    expect(mainRoom).toBeDefined();
    expect(mainRoom.polygon.length).toBeGreaterThanOrEqual(3);
    expect(mainRoom.wallIds.length).toBe(4);
  });

  it("room objects have required properties", () => {
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        length: 200,
      },
      {
        id: "w2",
        endpoints: [
          { x: 200, y: 0 },
          { x: 200, y: 200 },
        ],
        length: 200,
      },
      {
        id: "w3",
        endpoints: [
          { x: 200, y: 200 },
          { x: 0, y: 200 },
        ],
        length: 200,
      },
      {
        id: "w4",
        endpoints: [
          { x: 0, y: 200 },
          { x: 0, y: 0 },
        ],
        length: 200,
      },
    ];
    const graph = buildWallGraph(walls);
    const rooms = detectRooms(walls, graph);
    if (rooms.length > 0) {
      const r = rooms[0];
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("polygon");
      expect(r).toHaveProperty("area");
      expect(r).toHaveProperty("centroid");
      expect(r).toHaveProperty("wallIds");
      expect(r).toHaveProperty("perimeter");
      expect(r).toHaveProperty("confidence");
    }
  });

  it("filters out rooms with tiny area (< 500 px^2)", () => {
    // 3 walls forming a very small triangle (area < 500)
    const walls = [
      {
        id: "w1",
        endpoints: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        length: 10,
      },
      {
        id: "w2",
        endpoints: [
          { x: 10, y: 0 },
          { x: 5, y: 5 },
        ],
        length: 7,
      },
      {
        id: "w3",
        endpoints: [
          { x: 5, y: 5 },
          { x: 0, y: 0 },
        ],
        length: 7,
      },
    ];
    const graph = buildWallGraph(walls);
    const rooms = detectRooms(walls, graph);
    // Area = 25, which is < 500, so should be filtered
    expect(rooms.length).toBe(0);
  });
});

// ─── detectOpenings() ────────────────────────────────────────────

describe("detectOpenings()", () => {
  it("returns empty for walls with no gaps", () => {
    const walls = [
      {
        id: "w1",
        angle: 0,
        width: 20,
        centerline: { x1: 0, y1: 10, x2: 200, y2: 10 },
      },
    ];
    // Continuous line — no gap
    const lines = [mkLine(0, 0, 200, 0), mkLine(0, 20, 200, 20)];
    const openings = detectOpenings(walls, lines);
    expect(openings.length).toBe(0);
  });

  it("detects an opening (gap) in a wall", () => {
    const walls = [
      {
        id: "w1",
        angle: 0,
        width: 20,
        centerline: { x1: 0, y1: 10, x2: 300, y2: 10 },
      },
    ];
    // Two line segments with a 40px gap (door-sized)
    const lines = [mkLine(0, 0, 100, 0), mkLine(140, 0, 300, 0), mkLine(0, 20, 100, 20), mkLine(140, 20, 300, 20)];
    const openings = detectOpenings(walls, lines);
    expect(openings.length).toBeGreaterThanOrEqual(1);
  });

  it("opening objects have required properties", () => {
    const walls = [
      {
        id: "w1",
        angle: 0,
        width: 20,
        centerline: { x1: 0, y1: 10, x2: 300, y2: 10 },
      },
    ];
    const lines = [mkLine(0, 0, 100, 0), mkLine(160, 0, 300, 0)];
    const openings = detectOpenings(walls, lines);
    if (openings.length > 0) {
      const o = openings[0];
      expect(o).toHaveProperty("id");
      expect(o).toHaveProperty("wallId");
      expect(o).toHaveProperty("position");
      expect(o).toHaveProperty("width");
      expect(o).toHaveProperty("type");
      expect(o).toHaveProperty("confidence");
    }
  });
});

// ─── associateTagsWithWalls() ────────────────────────────────────

describe("associateTagsWithWalls()", () => {
  const walls = [
    {
      id: "w1",
      centerline: { x1: 0, y1: 0, x2: 200, y2: 0 },
    },
  ];

  it("associates a nearby short tag with the wall", () => {
    const texts = [{ text: "A1", x: 100, y: 15 }];
    const assocs = associateTagsWithWalls(texts, walls);
    expect(assocs.length).toBe(1);
    expect(assocs[0].tag).toBe("A1");
    expect(assocs[0].wallId).toBe("w1");
  });

  it("skips long text items (> 6 chars)", () => {
    const texts = [{ text: "This is a sentence", x: 100, y: 15 }];
    const assocs = associateTagsWithWalls(texts, walls);
    expect(assocs.length).toBe(0);
  });

  it("skips tags that are too far from any wall", () => {
    const texts = [{ text: "B2", x: 100, y: 200 }]; // 200px away
    const assocs = associateTagsWithWalls(texts, walls, 60);
    expect(assocs.length).toBe(0);
  });

  it("assigns higher confidence to closer tags", () => {
    const texts = [
      { text: "A1", x: 100, y: 10 }, // close
      { text: "B2", x: 100, y: 50 }, // farther
    ];
    const assocs = associateTagsWithWalls(texts, walls);
    const a1 = assocs.find(a => a.tag === "A1");
    const b2 = assocs.find(a => a.tag === "B2");
    if (a1 && b2) {
      expect(a1.confidence).toBeGreaterThanOrEqual(b2.confidence);
    }
  });
});

// ─── associateTagsWithRooms() ────────────────────────────────────

describe("associateTagsWithRooms()", () => {
  it("associates text near room centroid", () => {
    const rooms = [
      {
        id: "room-0",
        centroid: { x: 100, y: 100 },
        area: 10000, // sqrt = 100, so maxDist = 50
      },
    ];
    const texts = [{ text: "101", x: 105, y: 95 }];
    const assocs = associateTagsWithRooms(texts, rooms);
    expect(assocs.length).toBe(1);
    expect(assocs[0].label).toBe("101");
    expect(assocs[0].roomId).toBe("room-0");
  });

  it("ignores text too far from centroid", () => {
    const rooms = [
      {
        id: "room-0",
        centroid: { x: 100, y: 100 },
        area: 100, // sqrt = 10, maxDist = 5
      },
    ];
    const texts = [{ text: "101", x: 200, y: 200 }];
    const assocs = associateTagsWithRooms(texts, rooms);
    expect(assocs.length).toBe(0);
  });
});

// ─── generateAutoMeasurements() ──────────────────────────────────

describe("generateAutoMeasurements()", () => {
  const geometryResult = {
    walls: [
      {
        id: "wall-0",
        endpoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        length: 100,
        width: 10,
        confidence: 0.9,
      },
    ],
    rooms: [
      {
        id: "room-0",
        polygon: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        area: 10000,
        perimeter: 400,
        confidence: 0.85,
      },
    ],
    openings: [
      {
        id: "opening-0",
        wallId: "wall-0",
        position: { x: 50, y: 0 },
        width: 36,
        type: "door",
        confidence: 0.6,
      },
    ],
    wallTags: [{ tag: "A1", wallId: "wall-0", distance: 10, confidence: 0.9 }],
    roomLabels: [{ roomId: "room-0", label: "101", confidence: 0.85 }],
  };

  it("generates wall (linear), room (area), and opening (count) measurements", () => {
    const measurements = generateAutoMeasurements(geometryResult, "dwg-1");
    const types = measurements.map(m => m.type);
    expect(types).toContain("linear");
    expect(types).toContain("area");
    expect(types).toContain("count");
  });

  it("respects includeWalls=false option", () => {
    const m = generateAutoMeasurements(geometryResult, "dwg-1", { includeWalls: false });
    expect(m.filter(x => x.type === "linear").length).toBe(0);
  });

  it("respects includeRooms=false option", () => {
    const m = generateAutoMeasurements(geometryResult, "dwg-1", { includeRooms: false });
    expect(m.filter(x => x.type === "area").length).toBe(0);
  });

  it("respects includeOpenings=false option", () => {
    const m = generateAutoMeasurements(geometryResult, "dwg-1", { includeOpenings: false });
    expect(m.filter(x => x.type === "count").length).toBe(0);
  });

  it("all measurements have source='geometry'", () => {
    const m = generateAutoMeasurements(geometryResult, "dwg-1");
    m.forEach(meas => expect(meas.source).toBe("geometry"));
  });

  it("uses room label from roomLabels association", () => {
    const m = generateAutoMeasurements(geometryResult, "dwg-1");
    const roomMeas = m.find(x => x.type === "area");
    expect(roomMeas.tag).toBe("101");
  });

  it("returns empty array when geometry has no data and options exclude all", () => {
    const empty = { walls: [], rooms: [], openings: [], wallTags: [], roomLabels: [] };
    expect(generateAutoMeasurements(empty, "dwg-1")).toEqual([]);
  });
});
