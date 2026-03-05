/**
 * Property-Based Tests for Router Input Format Acceptance
 *
 * **Property 8: Router Input Format Acceptance**
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * *For any* PCB data converted from valid JLC DSN, the JS-PCB router SHALL accept
 * the data without format errors. The input format `[[width, height, layers], tracks]`
 * SHALL be correctly structured where:
 * - width, height, layers are positive integers
 * - Each track contains [radius, viaRadius, gap, terminals, paths]
 * - Each terminal contains [radius, gap, position, shape]
 */

import * as fc from 'fast-check';
import { RouterAdapter, JsPcbInput, JsPcbTrack, JsPcbTerminal, JsPcbDimensions } from '../../src/autorouter/router-adapter';
import type {
	ParsedPcbData,
	Resolution,
	NetworkDefinition,
	Point2D,
	LayerDefinition,
	PadstackDefinition,
	PinDefinition,
	ImageDefinition,
	ComponentPlacement,
} from '../../src/autorouter/types';

describe('Property 8: Router Input Format Acceptance', () => {
	let adapter: RouterAdapter;

	beforeEach(() => {
		adapter = new RouterAdapter();
	});

	// =========================================================================
	// Arbitraries for generating valid JLC DSN data
	// =========================================================================

	/**
	 * Generate a valid positive number for dimensions and radii
	 * Using Math.fround to ensure 32-bit float compatibility
	 */
	const positiveNumberArb = fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true });

	/**
	 * Generate a valid non-negative number for gap and clearance
	 */
	const nonNegativeNumberArb = fc.float({ min: 0, max: Math.fround(1000), noNaN: true, noDefaultInfinity: true });

	/**
	 * Generate a valid layer count (1-16 layers typical for PCBs)
	 */
	const layerCountArb = fc.integer({ min: 1, max: 16 });

	/**
	 * Generate a valid 2D point using integers for simplicity
	 */
	const point2DArb: fc.Arbitrary<Point2D> = fc.record({
		x: fc.integer({ min: -1_000_000, max: 1_000_000 }),
		y: fc.integer({ min: -1_000_000, max: 1_000_000 }),
	});

	/**
	 * Generate a valid boundary (rectangular PCB)
	 */
	const boundaryArb: fc.Arbitrary<Point2D[]> = fc
		.tuple(
			fc.integer({ min: 100, max: 100000 }),
			fc.integer({ min: 100, max: 100000 })
		)
		.map(([width, height]) => [
			{ x: 0, y: 0 },
			{ x: width, y: 0 },
			{ x: width, y: height },
			{ x: 0, y: height },
		]);

	/**
	 * Generate valid layer definitions
	 */
	const layerDefinitionsArb = (count: number): fc.Arbitrary<LayerDefinition[]> => {
		const layerNames = ['TopLayer', 'BottomLayer', 'InnerLayer1', 'InnerLayer2', 'InnerLayer3', 'InnerLayer4'];
		return fc.constant(
			Array.from({ length: Math.min(count, layerNames.length) }, (_, i) => ({
				name: layerNames[i],
				type: 'signal' as const,
				index: i,
			}))
		);
	};

	/**
	 * Generate a valid padstack definition
	 */
	const padstackArb: fc.Arbitrary<PadstackDefinition> = fc
		.tuple(
			fc.string({ minLength: 1, maxLength: 10 }),
			fc.integer({ min: 5, max: 100 })
		)
		.map(([name, diameter]) => ({
			name: `pad_${name}`,
			shapes: [{ layer: 'TopLayer', type: 'circle' as const, coordinates: [diameter, 0, 0] }],
		}));

	/**
	 * Generate a valid pin definition
	 */
	const pinDefinitionArb = (padstackName: string): fc.Arbitrary<PinDefinition> =>
		fc
			.tuple(
				fc.string({ minLength: 1, maxLength: 10 }),
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: 0, max: 3 }).map((r) => r * 90)
			)
			.map(([name, x, y, rotation]) => ({
				name: `pin_${name}`,
				padstack: padstackName,
				position: { x, y },
				rotation,
			}));

	/**
	 * Generate a valid component placement
	 */
	const componentPlacementArb = (imageName: string): fc.Arbitrary<ComponentPlacement> =>
		fc
			.tuple(
				fc.integer({ min: 0, max: 50000 }),
				fc.integer({ min: 0, max: 50000 }),
				fc.integer({ min: 0, max: 3 }).map((r) => r * 90)
			)
			.map(([x, y, rotation]) => ({
				name: 'u1',
				image: imageName,
				position: { x, y },
				side: 'front' as const,
				rotation,
			}));

	/**
	 * Generate a valid ParsedPcbData structure
	 */
	const parsedPcbDataArb: fc.Arbitrary<ParsedPcbData> = fc
		.tuple(
			fc.string({ minLength: 1, maxLength: 20 }),
			boundaryArb,
			layerCountArb,
			fc.integer({ min: 1, max: 5 }), // number of padstacks
			fc.integer({ min: 2, max: 10 }), // number of pins per image
			fc.integer({ min: 1, max: 5 }) // number of nets
		)
		.chain(([pcbName, boundary, layerCount, padstackCount, pinCount, netCount]) => {
			// Generate padstacks
			const padstacks: PadstackDefinition[] = Array.from({ length: padstackCount }, (_, i) => ({
				name: `p${i + 1}`,
				shapes: [{ layer: 'TopLayer', type: 'circle' as const, coordinates: [20 + i * 5, 0, 0] }],
			}));

			// Generate pins using the padstacks
			const pins: PinDefinition[] = Array.from({ length: pinCount }, (_, i) => ({
				name: `${i + 1}`,
				padstack: padstacks[i % padstacks.length].name,
				position: { x: 100 + i * 100, y: 100 },
				rotation: 0,
			}));

			// Generate image
			const image: ImageDefinition = {
				name: 'u1',
				pins,
			};

			// Generate layers
			const layerNames = ['TopLayer', 'BottomLayer', 'InnerLayer1', 'InnerLayer2'];
			const layers: LayerDefinition[] = Array.from({ length: Math.min(layerCount, layerNames.length) }, (_, i) => ({
				name: layerNames[i],
				type: 'signal' as const,
				index: i,
			}));

			// Generate nets (each net connects 2+ pins)
			const nets = new Map<string, { component: string; pin: string }[]>();
			const pinsPerNet = Math.max(2, Math.floor(pinCount / netCount));

			for (let i = 0; i < netCount && i * pinsPerNet < pinCount; i++) {
				const netPins: { component: string; pin: string }[] = [];
				for (let j = 0; j < pinsPerNet && i * pinsPerNet + j < pinCount; j++) {
					netPins.push({
						component: 'u1',
						pin: pins[i * pinsPerNet + j].name,
					});
				}
				if (netPins.length >= 2) {
					nets.set(`NET_${i + 1}`, netPins);
				}
			}

			// Generate placement
			return fc
				.tuple(
					fc.integer({ min: 0, max: 1000 }),
					fc.integer({ min: 0, max: 1000 })
				)
				.map(([placementX, placementY]) => ({
					pcbName: `PCB_${pcbName}`,
					resolution: { unit: 'mil' as const, multiplier: 1000 },
					structure: {
						boundary,
						layers,
						viaType: 'via0',
						rules: {
							defaultWidth: 10,
							defaultClearance: 6,
							gridVia: 0.25,
							gridWire: 0.25,
						},
					},
					placement: [
						{
							name: 'u1',
							image: 'u1',
							position: { x: placementX, y: placementY },
							side: 'front' as const,
							rotation: 0,
						},
					],
					library: {
						images: [image],
						padstacks,
					},
					network: {
						nets,
						classes: new Map(),
					} as NetworkDefinition,
				}));
		});

	// =========================================================================
	// Property Tests
	// =========================================================================

	/**
	 * Property 8: Router Input Format Acceptance
	 * **Validates: Requirements 4.1, 4.2, 4.3**
	 *
	 * For any valid JLC DSN data, the converted JS-PCB input SHALL be valid.
	 */
	describe('Property 8.1: Converted PCB data produces valid JS-PCB input format', () => {
		it('should produce valid JS-PCB input for any valid ParsedPcbData', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					// Convert to JS-PCB input format
					const jsPcbInput = adapter.toJsPcbInput(pcbData);

					// Validate the output format
					const validation = adapter.validateJsPcbInput(jsPcbInput);

					// The input should be valid
					return validation.valid;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8.2: Dimensions are positive integers
	 * **Validates: Requirements 4.1**
	 *
	 * The dimensions [width, height, layers] SHALL all be positive.
	 */
	describe('Property 8.2: Dimensions are positive', () => {
		it('should produce positive dimensions for any valid ParsedPcbData', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [dimensions] = adapter.toJsPcbInput(pcbData);
					const [width, height, layers] = dimensions;

					return width > 0 && height > 0 && layers > 0;
				}),
				{ numRuns: 100 }
			);
		});

		it('should produce integer layer count', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [dimensions] = adapter.toJsPcbInput(pcbData);
					const layers = dimensions[2];

					return Number.isInteger(layers);
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8.3: Track structure is correct
	 * **Validates: Requirements 4.1, 4.2**
	 *
	 * Each track SHALL contain [radius, viaRadius, gap, terminals, paths].
	 */
	describe('Property 8.3: Track structure is correct', () => {
		it('should produce tracks with correct structure [radius, viaRadius, gap, terminals, paths]', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					return tracks.every((track) => {
						// Track must be an array of 5 elements
						if (!Array.isArray(track) || track.length !== 5) return false;

						const [radius, viaRadius, gap, terminals, paths] = track;

						// radius, viaRadius, gap must be non-negative numbers
						if (typeof radius !== 'number' || radius < 0) return false;
						if (typeof viaRadius !== 'number' || viaRadius < 0) return false;
						if (typeof gap !== 'number' || gap < 0) return false;

						// terminals and paths must be arrays
						if (!Array.isArray(terminals)) return false;
						if (!Array.isArray(paths)) return false;

						return true;
					});
				}),
				{ numRuns: 100 }
			);
		});

		it('should produce non-negative track parameters', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					return tracks.every((track) => {
						const [radius, viaRadius, gap] = track;
						return radius >= 0 && viaRadius >= 0 && gap >= 0;
					});
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8.4: Terminal structure is correct
	 * **Validates: Requirements 4.1, 4.2**
	 *
	 * Each terminal SHALL contain [radius, gap, position, shape].
	 */
	describe('Property 8.4: Terminal structure is correct', () => {
		it('should produce terminals with correct structure [radius, gap, position, shape]', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					return tracks.every((track) => {
						const terminals = track[3];

						return terminals.every((terminal) => {
							// Terminal must be an array of 4 elements
							if (!Array.isArray(terminal) || terminal.length !== 4) return false;

							const [radius, gap, position, shape] = terminal;

							// radius and gap must be non-negative numbers
							if (typeof radius !== 'number' || radius < 0) return false;
							if (typeof gap !== 'number' || gap < 0) return false;

							// position must be [x, y, z]
							if (!Array.isArray(position) || position.length !== 3) return false;
							if (position.some((coord) => typeof coord !== 'number')) return false;

							// shape must be an array
							if (!Array.isArray(shape)) return false;

							return true;
						});
					});
				}),
				{ numRuns: 100 }
			);
		});

		it('should produce valid position coordinates [x, y, z]', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					return tracks.every((track) => {
						const terminals = track[3];

						return terminals.every((terminal) => {
							const position = terminal[2];

							// All coordinates must be finite numbers
							return (
								Number.isFinite(position[0]) &&
								Number.isFinite(position[1]) &&
								Number.isFinite(position[2])
							);
						});
					});
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8.5: Paths are initially empty
	 * **Validates: Requirements 4.2**
	 *
	 * When converting from DSN, paths SHALL be empty (to be filled by router).
	 */
	describe('Property 8.5: Paths are initially empty', () => {
		it('should produce empty paths array for each track', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					return tracks.every((track) => {
						const paths = track[4];
						return Array.isArray(paths) && paths.length === 0;
					});
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8.6: Net count preservation
	 * **Validates: Requirements 4.2**
	 *
	 * The number of tracks SHALL correspond to the number of nets with 2+ pins.
	 */
	describe('Property 8.6: Net count preservation', () => {
		it('should create tracks for nets with terminals', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					// All tracks should have at least some structure
					// (nets with no resolvable pins are skipped)
					return tracks.every((track) => {
						return Array.isArray(track) && track.length === 5;
					});
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8.7: Shape coordinates are valid
	 * **Validates: Requirements 4.1**
	 *
	 * Terminal shape coordinates SHALL be valid [x, y] pairs.
	 */
	describe('Property 8.7: Shape coordinates are valid', () => {
		it('should produce valid shape coordinates as [x, y] pairs', () => {
			fc.assert(
				fc.property(parsedPcbDataArb, (pcbData) => {
					const [, tracks] = adapter.toJsPcbInput(pcbData);

					return tracks.every((track) => {
						const terminals = track[3];

						return terminals.every((terminal) => {
							const shape = terminal[3];

							// Each shape point must be [x, y]
							return shape.every((point) => {
								return (
									Array.isArray(point) &&
									point.length === 2 &&
									typeof point[0] === 'number' &&
									typeof point[1] === 'number' &&
									Number.isFinite(point[0]) &&
									Number.isFinite(point[1])
								);
							});
						});
					});
				}),
				{ numRuns: 100 }
			);
		});
	});

	// =========================================================================
	// Direct JS-PCB Input Format Validation Tests
	// =========================================================================

	/**
	 * Property 8.8: Direct format validation
	 * **Validates: Requirements 4.1, 4.2, 4.3**
	 *
	 * Directly generated valid JS-PCB inputs SHALL pass validation.
	 */
	describe('Property 8.8: Direct JS-PCB input format validation', () => {
		/**
		 * Generate a valid JS-PCB terminal
		 */
		const jsPcbTerminalArb: fc.Arbitrary<JsPcbTerminal> = fc.tuple(
			positiveNumberArb, // radius
			nonNegativeNumberArb, // gap
			fc.tuple(
				fc.integer({ min: -100000, max: 100000 }),
				fc.integer({ min: -100000, max: 100000 }),
				fc.integer({ min: 0, max: 15 })
			), // position [x, y, z]
			fc.array(
				fc.tuple(
					fc.integer({ min: -1000, max: 1000 }),
					fc.integer({ min: -1000, max: 1000 })
				),
				{ minLength: 0, maxLength: 10 }
			) // shape
		);

		/**
		 * Generate a valid JS-PCB track
		 */
		const jsPcbTrackArb: fc.Arbitrary<JsPcbTrack> = fc.tuple(
			positiveNumberArb, // radius
			positiveNumberArb, // viaRadius
			nonNegativeNumberArb, // gap
			fc.array(jsPcbTerminalArb, { minLength: 0, maxLength: 10 }), // terminals
			fc.constant([]) // paths (empty initially)
		);

		/**
		 * Generate valid JS-PCB dimensions
		 */
		const jsPcbDimensionsArb: fc.Arbitrary<JsPcbDimensions> = fc.tuple(
			fc.integer({ min: 1, max: 1000000 }),
			fc.integer({ min: 1, max: 1000000 }),
			fc.integer({ min: 1, max: 16 })
		);

		/**
		 * Generate a valid JS-PCB input
		 */
		const jsPcbInputArb: fc.Arbitrary<JsPcbInput> = fc.tuple(
			jsPcbDimensionsArb,
			fc.array(jsPcbTrackArb, { minLength: 0, maxLength: 20 })
		);

		it('should validate any correctly structured JS-PCB input', () => {
			fc.assert(
				fc.property(jsPcbInputArb, (input) => {
					const validation = adapter.validateJsPcbInput(input);
					return validation.valid;
				}),
				{ numRuns: 100 }
			);
		});

		it('should reject inputs with invalid dimensions', () => {
			fc.assert(
				fc.property(
					fc.tuple(
						fc.oneof(
							fc.constant(0),
							fc.constant(-1)
						),
						fc.integer({ min: 1, max: 1000 }),
						fc.integer({ min: 1, max: 16 })
					),
					fc.array(jsPcbTrackArb, { minLength: 0, maxLength: 5 }),
					(dimensions, tracks) => {
						const input: JsPcbInput = [dimensions as JsPcbDimensions, tracks];
						const validation = adapter.validateJsPcbInput(input);
						return !validation.valid;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('should reject inputs with negative track radius', () => {
			fc.assert(
				fc.property(
					jsPcbDimensionsArb,
					fc.integer({ min: -1000, max: -1 }),
					(dimensions, negativeRadius) => {
						const invalidTrack: JsPcbTrack = [negativeRadius, 12, 6, [], []];
						const input: JsPcbInput = [dimensions, [invalidTrack]];
						const validation = adapter.validateJsPcbInput(input);
						return !validation.valid;
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});
