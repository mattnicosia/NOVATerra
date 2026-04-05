/**
 * vectorCoordinates.test.js — Verify coordinate conversion between PDF and canvas spaces
 *
 * This is the critical alignment test. If this passes, vector-extracted walls
 * and takeoff-measured walls will render in the same position in 3D.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the stores that getPxPerFoot reads from
vi.mock("@/stores/drawingPipelineStore", () => ({
  useDrawingPipelineStore: {
    getState: () => ({
      drawingScales: {},
      drawingDpi: {},
      tkCalibrations: {
        "test-drawing": {
          // User calibrated a 10-foot line that measures 150 canvas pixels
          // This means: 150 px / 10 ft = 15 px per foot (in canvas space at 108 DPI)
          p1: { x: 100, y: 200 },
          p2: { x: 250, y: 200 },
          realDist: 10, // 10 feet
        },
      },
    }),
  },
}));

vi.mock("@/stores/itemsStore", () => ({
  useItemsStore: { getState: () => ({ items: [] }) },
}));

vi.mock("@/stores/moduleStore", () => ({
  useModuleStore: { getState: () => ({}) },
}));

import {
  pdfPointToCanvasPixel,
  pdfPointToFeet,
  wallSegmentToFeet,
  roomPolygonToFeet,
  canRenderArchitectSketch,
  getConversionFactor,
  bezierToPolyline,
} from "@/utils/vectorCoordinates";
import { getPxPerFoot } from "@/utils/geometryBuilder";

describe("vectorCoordinates", () => {
  describe("pdfPointToCanvasPixel", () => {
    it("multiplies by 1.5 (72 DPI → 108 DPI)", () => {
      const result = pdfPointToCanvasPixel({ x: 100, y: 200 });
      expect(result.x).toBe(150);
      expect(result.y).toBe(300);
    });

    it("handles zero coordinates", () => {
      const result = pdfPointToCanvasPixel({ x: 0, y: 0 });
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });
  });

  describe("pdfPointToFeet", () => {
    it("converts PDF points to feet using calibration", () => {
      // Calibration: 15 canvas px per foot
      // PDF point 100 → canvas pixel 150 → feet = 150/15 = 10 feet
      const result = pdfPointToFeet({ x: 100, y: 0 }, "test-drawing");
      expect(result).not.toBeNull();
      expect(result.x).toBeCloseTo(10, 1);
    });

    it("returns null for uncalibrated drawings", () => {
      const result = pdfPointToFeet({ x: 100, y: 0 }, "no-such-drawing");
      expect(result).toBeNull();
    });
  });

  describe("wallSegmentToFeet", () => {
    it("converts a wall segment from PDF points to feet", () => {
      const segment = {
        start: [0, 0],
        end: [100, 0],
        thickness: 4, // 4 PDF points thick
        weight: 1.2,
        id: "wall-1",
      };
      const result = wallSegmentToFeet(segment, "test-drawing");
      expect(result).not.toBeNull();
      // 100 PDF points × 1.5 = 150 canvas px ÷ 15 ppf = 10 feet
      expect(result.end[0] - result.start[0]).toBeCloseTo(10, 1);
    });

    it("returns null for uncalibrated drawings", () => {
      const result = wallSegmentToFeet({ start: [0, 0], end: [100, 0] }, "uncalibrated");
      expect(result).toBeNull();
    });
  });

  describe("ALIGNMENT TEST — vector wall matches takeoff wall", () => {
    it("a 10-foot wall extracted from PDF and measured in takeoffs should be the same length in feet", () => {
      // Scenario: A wall that is exactly 10 feet long in real life
      //
      // TAKEOFF MEASUREMENT (canvas pixel space):
      // User drew from pixel (100, 200) to pixel (250, 200) = 150 px apart
      // Calibration says 150 px = 10 feet → ppf = 15
      // Length in feet: 150 / 15 = 10.0 feet ✓
      //
      // VECTOR EXTRACTION (PDF point space):
      // PyMuPDF extracted the same wall as (66.67, 133.33) to (166.67, 133.33) = 100 pts apart
      // (Because 150 canvas px ÷ 1.5 = 100 PDF points)
      //
      // CONVERSION:
      // 100 PDF points × 1.5 = 150 canvas px ÷ 15 ppf = 10.0 feet ✓
      //
      // BOTH SHOULD EQUAL 10 FEET

      const ppf = getPxPerFoot("test-drawing");
      expect(ppf).toBeCloseTo(15, 1);

      // Takeoff measurement in canvas pixels
      const takeoffLengthPx = 150; // pixels apart
      const takeoffFeet = takeoffLengthPx / ppf;

      // Vector extraction in PDF points
      const vectorLengthPts = 100; // PDF points apart (= 150px ÷ 1.5)
      const vectorResult = pdfPointToFeet({ x: vectorLengthPts, y: 0 }, "test-drawing");

      // CRITICAL: both must produce the same feet measurement
      expect(takeoffFeet).toBeCloseTo(10.0, 1);
      expect(vectorResult.x).toBeCloseTo(10.0, 1);
      expect(takeoffFeet).toBeCloseTo(vectorResult.x, 2); // alignment within 0.01 feet
    });
  });

  describe("canRenderArchitectSketch", () => {
    it("returns true for calibrated drawing", () => {
      const result = canRenderArchitectSketch("test-drawing");
      expect(result.canRender).toBe(true);
    });

    it("returns false with reason for uncalibrated drawing", () => {
      const result = canRenderArchitectSketch("uncalibrated");
      expect(result.canRender).toBe(false);
      expect(result.reason).toContain("calibrate");
    });
  });

  describe("bezierToPolyline", () => {
    it("converts a straight-line Bezier to points along the line", () => {
      // Straight line from (0,0) to (10,0) with control points on the line
      const points = bezierToPolyline([0, 0], [3, 0], [7, 0], [10, 0], 4);
      expect(points.length).toBe(5); // 4 segments + 1
      expect(points[0][0]).toBeCloseTo(0);
      expect(points[4][0]).toBeCloseTo(10);
    });

    it("produces a curve for non-linear control points", () => {
      // Quarter circle approximation
      const points = bezierToPolyline([0, 0], [0, 5.5], [4.5, 10], [10, 10], 8);
      expect(points.length).toBe(9);
      // Midpoint should be above the straight line (curved)
      const midY = points[4][1];
      expect(midY).toBeGreaterThan(0);
      expect(midY).toBeLessThan(10);
    });
  });

  describe("getConversionFactor", () => {
    it("returns the combined PDF→feet factor", () => {
      const factor = getConversionFactor("test-drawing");
      expect(factor).not.toBeNull();
      // factor = 1.5 / 15 = 0.1 (each PDF point = 0.1 feet)
      expect(factor).toBeCloseTo(0.1, 3);
    });

    it("returns null for uncalibrated", () => {
      expect(getConversionFactor("nope")).toBeNull();
    });
  });
});
