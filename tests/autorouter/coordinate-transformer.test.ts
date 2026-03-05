/**
 * 坐标转换器测试
 *
 * 测试 CoordinateTransformer 类的坐标转换功能。
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import * as fc from 'fast-check';
import { CoordinateTransformer } from '../../src/autorouter/coordinate-transformer';
import type { Point2D, Resolution } from '../../src/autorouter/types';

describe('CoordinateTransformer', () => {
	let transformer: CoordinateTransformer;
	const jlcResolution: Resolution = { unit: 'mil', multiplier: 1000 };

	beforeEach(() => {
		transformer = new CoordinateTransformer();
	});

	describe('jlcToInternal', () => {
		/**
		 * **Validates: Requirement 2.1**
		 * THE Coordinate_Transformer SHALL convert JLC coordinates (mil × 1000) to JS-PCB internal units
		 */
		it('should convert JLC coordinates to internal format', () => {
			const result = transformer.jlcToInternal(1000, 2000, jlcResolution);

			// X should be preserved
			expect(result.x).toBe(1000);
			// Y should be negated (JLC Y-up to JS-PCB Y-down)
			expect(result.y).toBe(-2000);
		});

		it('should handle zero coordinates', () => {
			const result = transformer.jlcToInternal(0, 0, jlcResolution);

			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
		});

		/**
		 * **Validates: Requirement 2.3**
		 * WHEN converting coordinates, THE Coordinate_Transformer SHALL correctly handle negative Y-axis transformation
		 */
		it('should handle negative coordinates', () => {
			const result = transformer.jlcToInternal(-500, -1000, jlcResolution);

			expect(result.x).toBe(-500);
			// Negative Y becomes positive after negation
			expect(result.y).toBe(1000);
		});

		it('should handle large coordinates', () => {
			const result = transformer.jlcToInternal(
				1000000000,
				500000000,
				jlcResolution,
			);

			expect(result.x).toBe(1000000000);
			expect(result.y).toBe(-500000000);
		});

		it('should throw error for NaN values', () => {
			expect(() =>
				transformer.jlcToInternal(NaN, 100, jlcResolution),
			).toThrow('Invalid coordinate values');
		});

		it('should throw error for Infinity values', () => {
			expect(() =>
				transformer.jlcToInternal(100, Infinity, jlcResolution),
			).toThrow('Invalid coordinate values');
		});
	});

	describe('internalToJlc', () => {
		/**
		 * **Validates: Requirement 2.4**
		 * THE Coordinate_Transformer SHALL support bidirectional conversion (JLC to JS-PCB and JS-PCB to JLC)
		 */
		it('should convert internal coordinates to JLC format', () => {
			const result = transformer.internalToJlc(1000, -2000, jlcResolution);

			// X should be preserved
			expect(result.x).toBe(1000);
			// Y should be negated back (JS-PCB Y-down to JLC Y-up)
			expect(result.y).toBe(2000);
		});

		it('should handle zero coordinates', () => {
			const result = transformer.internalToJlc(0, 0, jlcResolution);

			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
		});

		it('should handle negative coordinates', () => {
			const result = transformer.internalToJlc(-500, 1000, jlcResolution);

			expect(result.x).toBe(-500);
			// Positive internal Y becomes negative JLC Y
			expect(result.y).toBe(-1000);
		});

		it('should throw error for NaN values', () => {
			expect(() =>
				transformer.internalToJlc(NaN, 100, jlcResolution),
			).toThrow('Invalid coordinate values');
		});

		it('should throw error for Infinity values', () => {
			expect(() =>
				transformer.internalToJlc(100, -Infinity, jlcResolution),
			).toThrow('Invalid coordinate values');
		});
	});

	describe('transformPath', () => {
		it('should transform an array of coordinates to internal format', () => {
			const path: Point2D[] = [
				{ x: 100, y: 200 },
				{ x: 300, y: 400 },
				{ x: 500, y: 600 },
			];

			const result = transformer.transformPath(
				path,
				'toInternal',
				jlcResolution,
			);

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ x: 100, y: -200 });
			expect(result[1]).toEqual({ x: 300, y: -400 });
			expect(result[2]).toEqual({ x: 500, y: -600 });
		});

		it('should transform an array of coordinates to JLC format', () => {
			const path: Point2D[] = [
				{ x: 100, y: -200 },
				{ x: 300, y: -400 },
				{ x: 500, y: -600 },
			];

			const result = transformer.transformPath(
				path,
				'toJlc',
				jlcResolution,
			);

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ x: 100, y: 200 });
			expect(result[1]).toEqual({ x: 300, y: 400 });
			expect(result[2]).toEqual({ x: 500, y: 600 });
		});

		it('should handle empty path', () => {
			const result = transformer.transformPath([], 'toInternal', jlcResolution);

			expect(result).toEqual([]);
		});

		it('should handle single point path', () => {
			const path: Point2D[] = [{ x: 100, y: 200 }];

			const result = transformer.transformPath(
				path,
				'toInternal',
				jlcResolution,
			);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ x: 100, y: -200 });
		});
	});

	describe('round-trip conversion', () => {
		/**
		 * **Validates: Requirement 2.2, 2.4**
		 * THE Coordinate_Transformer SHALL preserve coordinate precision during conversion with tolerance less than 0.001 mil
		 * THE Coordinate_Transformer SHALL support bidirectional conversion
		 */
		it('should preserve coordinates through round-trip conversion', () => {
			const originalX = 12345;
			const originalY = 67890;

			// JLC -> Internal -> JLC
			const internal = transformer.jlcToInternal(
				originalX,
				originalY,
				jlcResolution,
			);
			const roundTrip = transformer.internalToJlc(
				internal.x,
				internal.y,
				jlcResolution,
			);

			expect(roundTrip.x).toBe(originalX);
			expect(roundTrip.y).toBe(originalY);
		});

		it('should preserve negative coordinates through round-trip conversion', () => {
			const originalX = -12345;
			const originalY = -67890;

			// JLC -> Internal -> JLC
			const internal = transformer.jlcToInternal(
				originalX,
				originalY,
				jlcResolution,
			);
			const roundTrip = transformer.internalToJlc(
				internal.x,
				internal.y,
				jlcResolution,
			);

			expect(roundTrip.x).toBe(originalX);
			expect(roundTrip.y).toBe(originalY);
		});

		it('should preserve path through round-trip conversion', () => {
			const originalPath: Point2D[] = [
				{ x: 100, y: 200 },
				{ x: -300, y: 400 },
				{ x: 500, y: -600 },
			];

			// JLC -> Internal -> JLC
			const internalPath = transformer.transformPath(
				originalPath,
				'toInternal',
				jlcResolution,
			);
			const roundTripPath = transformer.transformPath(
				internalPath,
				'toJlc',
				jlcResolution,
			);

			expect(roundTripPath).toEqual(originalPath);
		});
	});

	/**
	 * Property-Based Tests for Coordinate Round-Trip Consistency
	 *
	 * **Property 2: Coordinate Round-Trip Consistency**
	 * **Validates: Requirements 2.2, 2.4, 2.5, 9.2**
	 *
	 * *For any* valid coordinate pair (x, y) in JLC format (mil × 1000),
	 * converting to JS-PCB internal format and back to JLC format SHALL
	 * produce coordinates within 0.001 mil tolerance of the original values.
	 */
	describe('Property-Based Tests: Coordinate Round-Trip Consistency', () => {
		// Tolerance: 0.001 mil × 1000 = 1 (in JLC units)
		const TOLERANCE = 1;

		/**
		 * Property 2: Coordinate Round-Trip Consistency
		 * **Validates: Requirements 2.2, 2.4, 2.5, 9.2**
		 *
		 * Tests that any valid coordinate pair maintains precision through
		 * round-trip conversion (JLC → Internal → JLC).
		 */
		it('should preserve coordinates through round-trip conversion for any valid coordinate pair', () => {
			fc.assert(
				fc.property(
					// Generate coordinates in JLC format range (mil × 1000)
					// Using integer values since JLC coordinates are typically integers
					fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
					fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
					(originalX, originalY) => {
						const resolution: Resolution = { unit: 'mil', multiplier: 1000 };

						// Convert JLC → Internal
						const internal = transformer.jlcToInternal(
							originalX,
							originalY,
							resolution,
						);

						// Convert Internal → JLC (round-trip)
						const roundTrip = transformer.internalToJlc(
							internal.x,
							internal.y,
							resolution,
						);

						// Verify round-trip produces coordinates within tolerance
						const xDiff = Math.abs(originalX - roundTrip.x);
						const yDiff = Math.abs(originalY - roundTrip.y);

						return xDiff < TOLERANCE && yDiff < TOLERANCE;
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 2: Coordinate Round-Trip Consistency (Float variant)
		 * **Validates: Requirements 2.2, 2.4, 2.5, 9.2**
		 *
		 * Tests round-trip consistency with floating-point coordinates,
		 * including negative values and large numbers.
		 */
		it('should preserve floating-point coordinates through round-trip conversion', () => {
			fc.assert(
				fc.property(
					// Generate floating-point coordinates
					fc.float({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
					fc.float({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
					(originalX, originalY) => {
						const resolution: Resolution = { unit: 'mil', multiplier: 1000 };

						// Convert JLC → Internal
						const internal = transformer.jlcToInternal(
							originalX,
							originalY,
							resolution,
						);

						// Convert Internal → JLC (round-trip)
						const roundTrip = transformer.internalToJlc(
							internal.x,
							internal.y,
							resolution,
						);

						// Verify round-trip produces coordinates within tolerance
						const xDiff = Math.abs(originalX - roundTrip.x);
						const yDiff = Math.abs(originalY - roundTrip.y);

						return xDiff < TOLERANCE && yDiff < TOLERANCE;
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 2: Coordinate Round-Trip Consistency (Path variant)
		 * **Validates: Requirements 2.2, 2.4, 2.5, 9.2**
		 *
		 * Tests that paths (arrays of coordinates) maintain consistency
		 * through round-trip conversion.
		 */
		it('should preserve path coordinates through round-trip conversion', () => {
			// Custom arbitrary for generating coordinate points
			const pointArb = fc.record({
				x: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
				y: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
			});

			fc.assert(
				fc.property(
					// Generate arrays of 1-20 points
					fc.array(pointArb, { minLength: 1, maxLength: 20 }),
					(originalPath) => {
						const resolution: Resolution = { unit: 'mil', multiplier: 1000 };

						// Convert path JLC → Internal
						const internalPath = transformer.transformPath(
							originalPath,
							'toInternal',
							resolution,
						);

						// Convert path Internal → JLC (round-trip)
						const roundTripPath = transformer.transformPath(
							internalPath,
							'toJlc',
							resolution,
						);

						// Verify all points in path are within tolerance
						if (originalPath.length !== roundTripPath.length) {
							return false;
						}

						return originalPath.every((original, index) => {
							const roundTrip = roundTripPath[index];
							const xDiff = Math.abs(original.x - roundTrip.x);
							const yDiff = Math.abs(original.y - roundTrip.y);
							return xDiff < TOLERANCE && yDiff < TOLERANCE;
						});
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 2: Coordinate Round-Trip Consistency (Edge cases)
		 * **Validates: Requirements 2.2, 2.4, 2.5, 9.2**
		 *
		 * Tests round-trip consistency with edge case values:
		 * - Zero coordinates
		 * - Very small values
		 * - Very large values
		 * - Mixed positive/negative values
		 */
		it('should preserve edge case coordinates through round-trip conversion', () => {
			// Custom arbitrary for edge case coordinates
			const edgeCaseArb = fc.oneof(
				// Zero
				fc.constant(0),
				// Very small positive
				fc.integer({ min: 1, max: 100 }),
				// Very small negative
				fc.integer({ min: -100, max: -1 }),
				// Large positive
				fc.integer({ min: 100_000_000, max: 1_000_000_000 }),
				// Large negative
				fc.integer({ min: -1_000_000_000, max: -100_000_000 }),
				// Medium range
				fc.integer({ min: -10_000_000, max: 10_000_000 }),
			);

			fc.assert(
				fc.property(edgeCaseArb, edgeCaseArb, (originalX, originalY) => {
					const resolution: Resolution = { unit: 'mil', multiplier: 1000 };

					// Convert JLC → Internal
					const internal = transformer.jlcToInternal(
						originalX,
						originalY,
						resolution,
					);

					// Convert Internal → JLC (round-trip)
					const roundTrip = transformer.internalToJlc(
						internal.x,
						internal.y,
						resolution,
					);

					// Verify round-trip produces coordinates within tolerance
					const xDiff = Math.abs(originalX - roundTrip.x);
					const yDiff = Math.abs(originalY - roundTrip.y);

					return xDiff < TOLERANCE && yDiff < TOLERANCE;
				}),
				{ numRuns: 100 },
			);
		});
	});
});
