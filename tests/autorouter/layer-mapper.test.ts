/**
 * 层名映射器测试
 *
 * 测试 LayerMapper 类的层名映射功能。
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 9.3**
 */

import * as fc from 'fast-check';
import { LayerMapper, DEFAULT_LAYER_MAPPINGS } from '../../src/autorouter/layer-mapper';

describe('LayerMapper', () => {
	let mapper: LayerMapper;
	let warnings: string[];

	beforeEach(() => {
		warnings = [];
		// 使用自定义警告回调来捕获警告消息
		mapper = new LayerMapper((msg) => warnings.push(msg));
	});

	describe('jlcToIndex', () => {
		it('should map TopLayer to index 0', () => {
			// Requirement 3.1: THE Layer_Mapper SHALL map `TopLayer` to internal layer index 0
			expect(mapper.jlcToIndex('TopLayer')).toBe(0);
		});

		it('should map BottomLayer to index 1', () => {
			// Requirement 3.2: THE Layer_Mapper SHALL map `BottomLayer` to internal layer index 1
			expect(mapper.jlcToIndex('BottomLayer')).toBe(1);
		});

		it('should map inner layers correctly', () => {
			expect(mapper.jlcToIndex('InnerLayer1')).toBe(2);
			expect(mapper.jlcToIndex('InnerLayer2')).toBe(3);
			expect(mapper.jlcToIndex('InnerLayer3')).toBe(4);
			expect(mapper.jlcToIndex('InnerLayer4')).toBe(5);
			expect(mapper.jlcToIndex('InnerLayer5')).toBe(6);
			expect(mapper.jlcToIndex('InnerLayer6')).toBe(7);
		});

		it('should handle unknown layer names with warning and default mapping', () => {
			// Requirement 3.4: IF an unknown layer name is encountered, THEN THE Layer_Mapper SHALL log a warning and use a default mapping
			const result = mapper.jlcToIndex('UnknownLayer');

			expect(result).toBe(0); // Default to TopLayer index
			expect(warnings.length).toBe(1);
			expect(warnings[0]).toContain('Unknown layer name');
			expect(warnings[0]).toContain('UnknownLayer');
		});

		it('should handle empty string layer name', () => {
			const result = mapper.jlcToIndex('');

			expect(result).toBe(0);
			expect(warnings.length).toBe(1);
		});
	});

	describe('indexToJlc', () => {
		it('should map index 0 to TopLayer', () => {
			// Requirement 3.3: WHEN generating SES output, THE Layer_Mapper SHALL convert layer indices back to JLC layer names
			expect(mapper.indexToJlc(0)).toBe('TopLayer');
		});

		it('should map index 1 to BottomLayer', () => {
			expect(mapper.indexToJlc(1)).toBe('BottomLayer');
		});

		it('should map inner layer indices correctly', () => {
			expect(mapper.indexToJlc(2)).toBe('InnerLayer1');
			expect(mapper.indexToJlc(3)).toBe('InnerLayer2');
			expect(mapper.indexToJlc(4)).toBe('InnerLayer3');
			expect(mapper.indexToJlc(5)).toBe('InnerLayer4');
			expect(mapper.indexToJlc(6)).toBe('InnerLayer5');
			expect(mapper.indexToJlc(7)).toBe('InnerLayer6');
		});

		it('should handle unknown indices with warning and default layer name', () => {
			const result = mapper.indexToJlc(99);

			expect(result).toBe('TopLayer'); // Default layer name
			expect(warnings.length).toBe(1);
			expect(warnings[0]).toContain('Unknown layer index');
			expect(warnings[0]).toContain('99');
		});

		it('should handle negative indices', () => {
			const result = mapper.indexToJlc(-1);

			expect(result).toBe('TopLayer');
			expect(warnings.length).toBe(1);
		});
	});

	describe('getMappings', () => {
		it('should return all layer mappings', () => {
			const mappings = mapper.getMappings();

			expect(mappings.size).toBe(Object.keys(DEFAULT_LAYER_MAPPINGS).length);
			expect(mappings.get('TopLayer')).toBe(0);
			expect(mappings.get('BottomLayer')).toBe(1);
		});

		it('should return a copy of the mappings (not the original)', () => {
			const mappings1 = mapper.getMappings();
			const mappings2 = mapper.getMappings();

			// Modify the first copy
			mappings1.set('TestLayer', 100);

			// Second copy should not be affected
			expect(mappings2.has('TestLayer')).toBe(false);

			// Original mapper should not be affected
			expect(mapper.jlcToIndex('TestLayer')).toBe(0); // Unknown layer, returns default
		});
	});

	describe('constructor', () => {
		it('should work without warning callback', () => {
			const mapperWithoutCallback = new LayerMapper();

			// Should not throw when encountering unknown layer
			const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

			const result = mapperWithoutCallback.jlcToIndex('UnknownLayer');

			expect(result).toBe(0);
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	/**
	 * Property-Based Tests for Layer Mapping Round-Trip
	 *
	 * **Property 3: Layer Mapping Round-Trip**
	 * **Validates: Requirements 3.1, 3.2, 3.3, 9.3**
	 *
	 * *For any* valid JLC layer name, converting to internal index and back
	 * to JLC layer name SHALL produce the original layer name.
	 */
	describe('Property-Based Tests: Layer Mapping Round-Trip', () => {
		/**
		 * All valid JLC layer names that should be supported
		 */
		const VALID_JLC_LAYER_NAMES = [
			'TopLayer',
			'BottomLayer',
			'InnerLayer1',
			'InnerLayer2',
			'InnerLayer3',
			'InnerLayer4',
			'InnerLayer5',
			'InnerLayer6',
		];

		/**
		 * Custom arbitrary for generating valid JLC layer names
		 */
		const jlcLayerNameArb = fc.constantFrom(...VALID_JLC_LAYER_NAMES);

		/**
		 * Property 3: Layer Mapping Round-Trip
		 * **Validates: Requirements 3.1, 3.2, 3.3, 9.3**
		 *
		 * Tests that any valid JLC layer name maintains identity through
		 * round-trip conversion (JLC name → Index → JLC name).
		 */
		it('should preserve layer name through round-trip conversion for any valid JLC layer name', () => {
			fc.assert(
				fc.property(jlcLayerNameArb, (layerName) => {
					// Convert JLC layer name → Internal index
					const index = mapper.jlcToIndex(layerName);

					// Convert Internal index → JLC layer name (round-trip)
					const roundTrip = mapper.indexToJlc(index);

					// Verify round-trip produces the original layer name
					return layerName === roundTrip;
				}),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 3: Layer Mapping Round-Trip (Index variant)
		 * **Validates: Requirements 3.1, 3.2, 3.3, 9.3**
		 *
		 * Tests that any valid layer index maintains identity through
		 * round-trip conversion (Index → JLC name → Index).
		 */
		it('should preserve layer index through round-trip conversion for any valid layer index', () => {
			// Valid layer indices are 0-7 (corresponding to the 8 defined layers)
			const validIndexArb = fc.integer({ min: 0, max: 7 });

			fc.assert(
				fc.property(validIndexArb, (index) => {
					// Convert Internal index → JLC layer name
					const layerName = mapper.indexToJlc(index);

					// Convert JLC layer name → Internal index (round-trip)
					const roundTrip = mapper.jlcToIndex(layerName);

					// Verify round-trip produces the original index
					return index === roundTrip;
				}),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 3: Layer Mapping Round-Trip (Exhaustive verification)
		 * **Validates: Requirements 3.1, 3.2, 3.3, 9.3**
		 *
		 * Tests that all valid JLC layer names have consistent round-trip behavior.
		 * This test verifies the property holds for every single valid layer name.
		 */
		it('should preserve all valid layer names through round-trip conversion', () => {
			fc.assert(
				fc.property(
					fc.constant(VALID_JLC_LAYER_NAMES),
					(layerNames) => {
						return layerNames.every((layerName) => {
							const index = mapper.jlcToIndex(layerName);
							const roundTrip = mapper.indexToJlc(index);
							return layerName === roundTrip;
						});
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 3: Layer Mapping Round-Trip (Bijection verification)
		 * **Validates: Requirements 3.1, 3.2, 3.3, 9.3**
		 *
		 * Tests that the mapping is a bijection (one-to-one correspondence)
		 * between valid layer names and their indices.
		 */
		it('should maintain bijection between layer names and indices', () => {
			fc.assert(
				fc.property(
					jlcLayerNameArb,
					jlcLayerNameArb,
					(layerName1, layerName2) => {
						const index1 = mapper.jlcToIndex(layerName1);
						const index2 = mapper.jlcToIndex(layerName2);

						// If layer names are different, indices should be different
						// If layer names are the same, indices should be the same
						if (layerName1 === layerName2) {
							return index1 === index2;
						} else {
							return index1 !== index2;
						}
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 3: Layer Mapping Round-Trip (Specific layer verification)
		 * **Validates: Requirements 3.1, 3.2**
		 *
		 * Tests that TopLayer and BottomLayer specifically map to indices 0 and 1.
		 */
		it('should map TopLayer to 0 and BottomLayer to 1 consistently', () => {
			fc.assert(
				fc.property(
					fc.constantFrom('TopLayer', 'BottomLayer'),
					(layerName) => {
						const index = mapper.jlcToIndex(layerName);
						const roundTrip = mapper.indexToJlc(index);

						// Verify specific mappings per requirements
						if (layerName === 'TopLayer') {
							return index === 0 && roundTrip === 'TopLayer';
						} else {
							return index === 1 && roundTrip === 'BottomLayer';
						}
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Property 3: Layer Mapping Round-Trip (No warnings for valid layers)
		 * **Validates: Requirements 3.1, 3.2, 3.3**
		 *
		 * Tests that valid layer names do not trigger any warnings during conversion.
		 */
		it('should not produce warnings for valid layer names', () => {
			fc.assert(
				fc.property(jlcLayerNameArb, (layerName) => {
					// Clear any previous warnings
					warnings.length = 0;

					// Perform round-trip conversion
					const index = mapper.jlcToIndex(layerName);
					mapper.indexToJlc(index);

					// No warnings should be generated for valid layer names
					return warnings.length === 0;
				}),
				{ numRuns: 100 },
			);
		});
	});
});
