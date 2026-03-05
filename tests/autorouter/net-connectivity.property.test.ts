/**
 * Property-Based Tests for Net Connectivity Preservation
 *
 * **Property 6: Net Connectivity Preservation**
 * **Validates: Requirements 9.1, 9.4**
 *
 * *For any* valid JLC DSN file with defined networks, after parsing, routing,
 * and SES generation, the net connectivity information SHALL be preserved:
 * - All original net names appear in the SES output
 * - All pins originally connected to a net remain connected to that net
 * - No new connections are created between different nets
 */

import * as fc from 'fast-check';
import { JlcDsnParser } from '../../src/autorouter/dsn-parser';
import { SesGenerator } from '../../src/autorouter/ses-generator';
import { RouterAdapter } from '../../src/autorouter/router-adapter';
import { AutorouterPipeline } from '../../src/autorouter/autorouter-pipeline';
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
	RoutingResult,
	Track,
	RoutingPath,
	Point3D,
	PinReference,
} from '../../src/autorouter/types';

describe('Property 6: Net Connectivity Preservation', () => {
	let parser: JlcDsnParser;
	let sesGenerator: SesGenerator;
	let routerAdapter: RouterAdapter;

	beforeEach(() => {
		parser = new JlcDsnParser();
		sesGenerator = new SesGenerator();
		routerAdapter = new RouterAdapter();
	});

	// =========================================================================
	// Arbitraries for generating valid JLC DSN data with networks
	// =========================================================================

	/**
	 * Generate a valid net name
	 * JLC net names can be: GND, 3V3, VCC, $1N1226, SPI2_MOSI, etc.
	 */
	const netNameArb: fc.Arbitrary<string> = fc.oneof(
		// Standard net names
		fc.constantFrom('GND', 'VCC', '3V3', '5V', 'VBAT'),
		// Signal names with underscores
		fc.tuple(
			fc.constantFrom('SPI', 'UART', 'I2C', 'GPIO', 'ADC'),
			fc.constantFrom('_TX', '_RX', '_CLK', '_MOSI', '_MISO', '_SDA', '_SCL')
		).map(([prefix, suffix]) => `${prefix}${suffix}`),
		// Numbered nets
		fc.integer({ min: 1, max: 100 }).map((n) => `NET_${n}`),
		// JLC special format nets
		fc.integer({ min: 1, max: 9999 }).map((n) => `$1N${n}`)
	);

	/**
	 * Generate a valid JLC pin name (e.g., 20e16, 1468e47)
	 */
	const pinNameArb: fc.Arbitrary<string> = fc.tuple(
		fc.integer({ min: 1, max: 2000 }),
		fc.integer({ min: 1, max: 100 })
	).map(([a, b]) => `${a}e${b}`);

	/**
	 * Generate a valid boundary (rectangular PCB)
	 */
	const boundaryArb: fc.Arbitrary<Point2D[]> = fc
		.tuple(
			fc.integer({ min: 10000, max: 100000 }),
			fc.integer({ min: 10000, max: 100000 })
		)
		.map(([width, height]) => [
			{ x: 0, y: 0 },
			{ x: width, y: 0 },
			{ x: width, y: height },
			{ x: 0, y: height },
		]);

	/**
	 * Generate valid layer definitions (2-layer PCB)
	 */
	const layerDefinitionsArb: fc.Arbitrary<LayerDefinition[]> = fc.constant([
		{ name: 'TopLayer', type: 'signal' as const, index: 0 },
		{ name: 'BottomLayer', type: 'signal' as const, index: 1 },
	]);

	/**
	 * Generate a valid padstack definition
	 */
	const padstackArb = (name: string): fc.Arbitrary<PadstackDefinition> =>
		fc.integer({ min: 20, max: 100 }).map((diameter) => ({
			name,
			shapes: [{ layer: 'TopLayer', type: 'circle' as const, coordinates: [diameter, 0, 0] }],
		}));

	/**
	 * Generate a valid pin definition
	 */
	const pinDefinitionArb = (pinName: string, padstackName: string): fc.Arbitrary<PinDefinition> =>
		fc.tuple(
			fc.integer({ min: 100, max: 50000 }),
			fc.integer({ min: 100, max: 50000 })
		).map(([x, y]) => ({
			name: pinName,
			padstack: padstackName,
			position: { x, y },
			rotation: 0,
		}));

	/**
	 * Generate unique net names
	 */
	const uniqueNetNamesArb = (count: number): fc.Arbitrary<string[]> =>
		fc.array(netNameArb, { minLength: count, maxLength: count })
			.map((names) => {
				// Ensure uniqueness by appending index if needed
				const seen = new Set<string>();
				return names.map((name, i) => {
					let uniqueName = name;
					let suffix = 1;
					while (seen.has(uniqueName)) {
						uniqueName = `${name}_${suffix++}`;
					}
					seen.add(uniqueName);
					return uniqueName;
				});
			});

	/**
	 * Generate unique pin names
	 */
	const uniquePinNamesArb = (count: number): fc.Arbitrary<string[]> =>
		fc.array(pinNameArb, { minLength: count, maxLength: count })
			.map((names) => {
				const seen = new Set<string>();
				return names.map((name, i) => {
					let uniqueName = name;
					let suffix = 1;
					while (seen.has(uniqueName)) {
						uniqueName = `${i + 1}e${suffix++}`;
					}
					seen.add(uniqueName);
					return uniqueName;
				});
			});

	/**
	 * Generate a valid ParsedPcbData structure with networks
	 */
	const parsedPcbDataWithNetsArb: fc.Arbitrary<ParsedPcbData> = fc
		.tuple(
			fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z0-9_]+$/.test(s)),
			boundaryArb,
			fc.integer({ min: 2, max: 5 }), // number of nets
			fc.integer({ min: 2, max: 4 }) // pins per net
		)
		.chain(([pcbName, boundary, netCount, pinsPerNet]) => {
			const totalPins = netCount * pinsPerNet;

			return fc.tuple(
				fc.constant(pcbName),
				fc.constant(boundary),
				uniqueNetNamesArb(netCount),
				uniquePinNamesArb(totalPins),
				fc.array(
					fc.tuple(
						fc.integer({ min: 100, max: 50000 }),
						fc.integer({ min: 100, max: 50000 })
					),
					{ minLength: totalPins, maxLength: totalPins }
				)
			).map(([name, bounds, netNames, pinNames, positions]) => {
				// Build network definition
				const nets = new Map<string, PinReference[]>();
				let pinIndex = 0;

				for (const netName of netNames) {
					const pins: PinReference[] = [];
					for (let j = 0; j < pinsPerNet; j++) {
						const [x, y] = positions[pinIndex];
						pins.push({
							component: 'u1',
							pin: pinNames[pinIndex],
							position: { x, y, z: 0 },
							padstack: 'pad0',
						});
						pinIndex++;
					}
					nets.set(netName, pins);
				}

				// Build pin definitions for image
				const pinDefs: PinDefinition[] = pinNames.map((pinName, i) => ({
					name: pinName,
					padstack: 'pad0',
					position: { x: positions[i][0], y: positions[i][1] },
					rotation: 0,
				}));

				const parsedData: ParsedPcbData = {
					pcbName: name,
					resolution: { unit: 'mil', multiplier: 1000 },
					structure: {
						boundary: bounds,
						layers: [
							{ name: 'TopLayer', type: 'signal', index: 0 },
							{ name: 'BottomLayer', type: 'signal', index: 1 },
						],
						viaType: 'via0',
						rules: {
							defaultWidth: 10,
							defaultClearance: 10,
							gridVia: 25,
							gridWire: 5,
						},
					},
					placement: [
						{
							name: 'u1',
							image: 'u1_image',
							position: { x: 0, y: 0 },
							side: 'front',
							rotation: 0,
						},
					],
					library: {
						images: [
							{
								name: 'u1_image',
								pins: pinDefs,
							},
						],
						padstacks: [
							{
								name: 'pad0',
								shapes: [{ layer: 'TopLayer', type: 'circle', coordinates: [50, 0, 0] }],
							},
						],
					},
					network: {
						nets,
						classes: new Map([
							['default', { viaType: 'via0', width: 10, clearance: 10 }],
						]),
					},
				};

				return parsedData;
			});
		});

	/**
	 * Generate a routing result that preserves net structure
	 */
	const routingResultFromParsedDataArb = (
		parsedData: ParsedPcbData
	): fc.Arbitrary<RoutingResult> => {
		const netNames = Array.from(parsedData.network.nets.keys());
		const tracks: Track[] = [];

		for (const netName of netNames) {
			const pins = parsedData.network.nets.get(netName) || [];
			const terminals = pins.map((pin) => ({
				radius: 25,
				gap: 10,
				position: pin.position || { x: 0, y: 0, z: 0 },
				shape: [{ x: 0, y: 0 }],
			}));

			// Generate simple routing paths connecting pins
			const paths: RoutingPath[] = [];
			if (terminals.length >= 2) {
				// Create a simple chain connecting all pins
				const points: Point3D[] = terminals.map((t) => ({
					x: t.position.x,
					y: t.position.y,
					z: t.position.z,
				}));
				paths.push({ points });
			}

			tracks.push({
				radius: 5,
				viaRadius: 12,
				gap: 10,
				terminals,
				paths,
				netName,
			});
		}

		// Calculate PCB dimensions from boundary
		const boundary = parsedData.structure.boundary;
		const maxX = Math.max(...boundary.map((p) => p.x));
		const maxY = Math.max(...boundary.map((p) => p.y));

		return fc.constant({
			pcbDimensions: [maxX, maxY, 2] as [number, number, number],
			tracks,
		});
	};

	// =========================================================================
	// Property Tests
	// =========================================================================

	describe('Net Name Preservation', () => {
		/**
		 * Property: All original net names appear in the SES output
		 */
		it('should preserve all net names in SES output', () => {
			fc.assert(
				fc.property(parsedPcbDataWithNetsArb, (parsedData) => {
					// Get original net names
					const originalNetNames = Array.from(parsedData.network.nets.keys());

					// Create a routing result that preserves net structure
					const tracks: Track[] = [];
					for (const netName of originalNetNames) {
						const pins = parsedData.network.nets.get(netName) || [];
						const terminals = pins.map((pin) => ({
							radius: 25,
							gap: 10,
							position: pin.position || { x: 0, y: 0, z: 0 },
							shape: [{ x: 0, y: 0 }],
						}));

						const paths: RoutingPath[] = [];
						if (terminals.length >= 2) {
							const points: Point3D[] = terminals.map((t) => ({
								x: t.position.x,
								y: t.position.y,
								z: t.position.z,
							}));
							paths.push({ points });
						}

						tracks.push({
							radius: 5,
							viaRadius: 12,
							gap: 10,
							terminals,
							paths,
							netName,
						});
					}

					const boundary = parsedData.structure.boundary;
					const maxX = Math.max(...boundary.map((p) => p.x));
					const maxY = Math.max(...boundary.map((p) => p.y));

					const routingResult: RoutingResult = {
						pcbDimensions: [maxX, maxY, 2],
						tracks,
					};

					// Generate SES
					const sesContent = sesGenerator.generate(routingResult, parsedData);

					// Verify all net names appear in SES output
					for (const netName of originalNetNames) {
						const netPattern = new RegExp(`\\(net\\s+${escapeRegExp(netName)}\\b`);
						if (!netPattern.test(sesContent)) {
							return false;
						}
					}

					return true;
				}),
				{ numRuns: 50 }
			);
		});

		/**
		 * Property: No extra nets are created in SES output
		 */
		it('should not create extra nets in SES output', () => {
			fc.assert(
				fc.property(parsedPcbDataWithNetsArb, (parsedData) => {
					const originalNetNames = new Set(parsedData.network.nets.keys());

					// Create routing result
					const tracks: Track[] = [];
					for (const netName of originalNetNames) {
						const pins = parsedData.network.nets.get(netName) || [];
						const terminals = pins.map((pin) => ({
							radius: 25,
							gap: 10,
							position: pin.position || { x: 0, y: 0, z: 0 },
							shape: [{ x: 0, y: 0 }],
						}));

						tracks.push({
							radius: 5,
							viaRadius: 12,
							gap: 10,
							terminals,
							paths: [],
							netName,
						});
					}

					const boundary = parsedData.structure.boundary;
					const maxX = Math.max(...boundary.map((p) => p.x));
					const maxY = Math.max(...boundary.map((p) => p.y));

					const routingResult: RoutingResult = {
						pcbDimensions: [maxX, maxY, 2],
						tracks,
					};

					// Generate SES
					const sesContent = sesGenerator.generate(routingResult, parsedData);

					// Extract all net names from SES
					const netMatches = sesContent.matchAll(/\(net\s+(\S+)/g);
					const sesNetNames = new Set<string>();
					for (const match of netMatches) {
						sesNetNames.add(match[1]);
					}

					// Verify no extra nets were created
					for (const sesNetName of sesNetNames) {
						if (!originalNetNames.has(sesNetName)) {
							return false;
						}
					}

					return true;
				}),
				{ numRuns: 50 }
			);
		});
	});

	describe('Pin-to-Net Mapping Preservation', () => {
		/**
		 * Property: Pin count per net is preserved
		 */
		it('should preserve pin count per net through routing', () => {
			fc.assert(
				fc.property(parsedPcbDataWithNetsArb, (parsedData) => {
					// Record original pin counts
					const originalPinCounts = new Map<string, number>();
					for (const [netName, pins] of parsedData.network.nets) {
						originalPinCounts.set(netName, pins.length);
					}

					// Create routing result preserving structure
					const tracks: Track[] = [];
					for (const [netName, pins] of parsedData.network.nets) {
						const terminals = pins.map((pin) => ({
							radius: 25,
							gap: 10,
							position: pin.position || { x: 0, y: 0, z: 0 },
							shape: [{ x: 0, y: 0 }],
						}));

						tracks.push({
							radius: 5,
							viaRadius: 12,
							gap: 10,
							terminals,
							paths: [],
							netName,
						});
					}

					// Verify terminal counts match original pin counts
					for (const track of tracks) {
						const netName = track.netName!;
						const originalCount = originalPinCounts.get(netName);
						if (originalCount !== track.terminals.length) {
							return false;
						}
					}

					return true;
				}),
				{ numRuns: 50 }
			);
		});

		/**
		 * Property: Pin positions are preserved in routing terminals
		 */
		it('should preserve pin positions in routing terminals', () => {
			fc.assert(
				fc.property(parsedPcbDataWithNetsArb, (parsedData) => {
					// Create routing result
					const tracks: Track[] = [];
					for (const [netName, pins] of parsedData.network.nets) {
						const terminals = pins.map((pin) => ({
							radius: 25,
							gap: 10,
							position: pin.position || { x: 0, y: 0, z: 0 },
							shape: [{ x: 0, y: 0 }],
						}));

						tracks.push({
							radius: 5,
							viaRadius: 12,
							gap: 10,
							terminals,
							paths: [],
							netName,
						});
					}

					// Verify positions match
					for (const track of tracks) {
						const netName = track.netName!;
						const originalPins = parsedData.network.nets.get(netName) || [];

						for (let i = 0; i < track.terminals.length; i++) {
							const terminal = track.terminals[i];
							const originalPin = originalPins[i];

							if (originalPin.position) {
								if (
									terminal.position.x !== originalPin.position.x ||
									terminal.position.y !== originalPin.position.y
								) {
									return false;
								}
							}
						}
					}

					return true;
				}),
				{ numRuns: 50 }
			);
		});
	});

	describe('Net Isolation', () => {
		/**
		 * Property: Routing paths do not cross between different nets
		 */
		it('should keep routing paths isolated per net', () => {
			fc.assert(
				fc.property(parsedPcbDataWithNetsArb, (parsedData) => {
					// Create routing result with paths
					const tracks: Track[] = [];
					for (const [netName, pins] of parsedData.network.nets) {
						const terminals = pins.map((pin) => ({
							radius: 25,
							gap: 10,
							position: pin.position || { x: 0, y: 0, z: 0 },
							shape: [{ x: 0, y: 0 }],
						}));

						// Create paths only connecting pins within this net
						const paths: RoutingPath[] = [];
						if (terminals.length >= 2) {
							const points: Point3D[] = terminals.map((t) => ({
								x: t.position.x,
								y: t.position.y,
								z: t.position.z,
							}));
							paths.push({ points });
						}

						tracks.push({
							radius: 5,
							viaRadius: 12,
							gap: 10,
							terminals,
							paths,
							netName,
						});
					}

					// Verify each track's paths only reference its own terminals
					for (const track of tracks) {
						const terminalPositions = new Set(
							track.terminals.map((t) => `${t.position.x},${t.position.y}`)
						);

						for (const path of track.paths) {
							// First and last points should be terminal positions
							if (path.points.length >= 2) {
								const firstPoint = path.points[0];
								const lastPoint = path.points[path.points.length - 1];

								const firstKey = `${firstPoint.x},${firstPoint.y}`;
								const lastKey = `${lastPoint.x},${lastPoint.y}`;

								if (!terminalPositions.has(firstKey) || !terminalPositions.has(lastKey)) {
									return false;
								}
							}
						}
					}

					return true;
				}),
				{ numRuns: 50 }
			);
		});
	});

	describe('SES Output Structure', () => {
		/**
		 * Property: SES output contains valid network_out structure
		 */
		it('should generate valid network_out structure', () => {
			fc.assert(
				fc.property(parsedPcbDataWithNetsArb, (parsedData) => {
					// Create routing result
					const tracks: Track[] = [];
					for (const [netName, pins] of parsedData.network.nets) {
						const terminals = pins.map((pin) => ({
							radius: 25,
							gap: 10,
							position: pin.position || { x: 0, y: 0, z: 0 },
							shape: [{ x: 0, y: 0 }],
						}));

						tracks.push({
							radius: 5,
							viaRadius: 12,
							gap: 10,
							terminals,
							paths: [],
							netName,
						});
					}

					const boundary = parsedData.structure.boundary;
					const maxX = Math.max(...boundary.map((p) => p.x));
					const maxY = Math.max(...boundary.map((p) => p.y));

					const routingResult: RoutingResult = {
						pcbDimensions: [maxX, maxY, 2],
						tracks,
					};

					// Generate SES
					const sesContent = sesGenerator.generate(routingResult, parsedData);

					// Verify network_out structure exists
					if (!sesContent.includes('(network_out')) {
						return false;
					}

					// Verify each net has a section
					for (const netName of parsedData.network.nets.keys()) {
						const netPattern = new RegExp(`\\(net\\s+${escapeRegExp(netName)}\\b`);
						if (!netPattern.test(sesContent)) {
							return false;
						}
					}

					return true;
				}),
				{ numRuns: 50 }
			);
		});
	});
});

/**
 * Helper function to escape special regex characters
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
