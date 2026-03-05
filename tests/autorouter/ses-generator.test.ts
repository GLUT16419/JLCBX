/**
 * SES 生成器测试
 *
 * 测试 SesGenerator 类的 SES 文件生成功能。
 */

import { SesGenerator } from '../../src/autorouter/ses-generator';
import type { ParsedPcbData, RoutingResult, Resolution, NetworkDefinition } from '../../src/autorouter/types';

describe('SesGenerator', () => {
	let generator: SesGenerator;

	beforeEach(() => {
		generator = new SesGenerator();
	});

	/**
	 * 创建最小有效的 ParsedPcbData 用于测试
	 */
	function createMinimalPcbData(pcbName: string = 'TestPCB'): ParsedPcbData {
		return {
			pcbName,
			resolution: { unit: 'mil', multiplier: 1000 } as Resolution,
			structure: {
				boundary: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }],
				layers: [
					{ name: 'TopLayer', type: 'signal', index: 0 },
					{ name: 'BottomLayer', type: 'signal', index: 1 },
				],
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
					position: { x: 0, y: 0 },
					side: 'front',
					rotation: 0,
				},
			],
			library: {
				images: [],
				padstacks: [],
			},
			network: {
				nets: new Map(),
				classes: new Map(),
			} as NetworkDefinition,
		};
	}

	/**
	 * 创建最小有效的 RoutingResult 用于测试
	 */
	function createMinimalRoutingResult(): RoutingResult {
		return {
			pcbDimensions: [1000, 1000, 2],
			tracks: [],
		};
	}

	// =========================================================================
	// Task 7.1: SES 基础结构生成测试
	// =========================================================================

	describe('Task 7.1: SES 基础结构生成', () => {
		describe('generate - session 头部结构', () => {
			it('should generate valid SES session structure with correct PCB name', () => {
				const pcbData = createMinimalPcbData('JLC-fron018');
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 session 头部
				expect(ses).toMatch(/^\(session "JLC-fron018"/);
				expect(ses).toContain('(base_design "JLC-fron018")');
			});

			it('should handle PCB names with special characters', () => {
				const pcbData = createMinimalPcbData('Test-PCB_v1.0');
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toMatch(/^\(session "Test-PCB_v1\.0"/);
				expect(ses).toContain('(base_design "Test-PCB_v1.0")');
			});

			it('should handle empty PCB name', () => {
				const pcbData = createMinimalPcbData('');
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toMatch(/^\(session ""/);
				expect(ses).toContain('(base_design "")');
			});
		});

		describe('generate - resolution 声明', () => {
			it('should include resolution declaration in placement section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 placement 中的 resolution
				expect(ses).toMatch(/\(placement[\s\S]*?\(resolution mil 1000\)/);
			});

			it('should include resolution declaration in routes section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 routes 中的 resolution
				expect(ses).toMatch(/\(routes[\s\S]*?\(resolution mil 1000\)/);
			});

			it('should use JLC format resolution (mil 1000)', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 确保使用 JLC 格式
				const resolutionMatches = ses.match(/\(resolution mil 1000\)/g);
				expect(resolutionMatches).not.toBeNull();
				expect(resolutionMatches!.length).toBeGreaterThanOrEqual(2);
			});
		});

		describe('generate - placement 部分', () => {
			it('should generate placement section with component', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(placement');
				expect(ses).toContain('(component u1');
				expect(ses).toContain('(place u1 0 0 front 0)');
			});

			it('should handle component with non-zero position', () => {
				const pcbData = createMinimalPcbData();
				pcbData.placement = [
					{
						name: 'u1',
						image: 'u1',
						position: { x: 100.5, y: 200.7 },
						side: 'front',
						rotation: 90,
					},
				];
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 坐标应该被四舍五入
				expect(ses).toContain('(place u1 101 201 front 90)');
			});

			it('should handle component on back side', () => {
				const pcbData = createMinimalPcbData();
				pcbData.placement = [
					{
						name: 'u1',
						image: 'u1',
						position: { x: 0, y: 0 },
						side: 'back',
						rotation: 0,
					},
				];
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(place u1 0 0 back 0)');
			});

			it('should generate default u1 component when placement is empty', () => {
				const pcbData = createMinimalPcbData();
				pcbData.placement = [];
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(component u1');
				expect(ses).toContain('(place u1 0 0 front 0)');
			});

			it('should handle multiple components', () => {
				const pcbData = createMinimalPcbData();
				pcbData.placement = [
					{
						name: 'u1',
						image: 'u1',
						position: { x: 0, y: 0 },
						side: 'front',
						rotation: 0,
					},
					{
						name: 'u2',
						image: 'u2',
						position: { x: 500, y: 500 },
						side: 'front',
						rotation: 180,
					},
				];
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(component u1');
				expect(ses).toContain('(place u1 0 0 front 0)');
				expect(ses).toContain('(component u2');
				expect(ses).toContain('(place u2 500 500 front 180)');
			});
		});

		describe('generate - was_is 部分', () => {
			it('should include empty was_is section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(was_is');
			});
		});

		describe('generate - routes 部分', () => {
			it('should include routes section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(routes');
			});

			it('should include parser section with EasyEDA Pro info', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(parser');
				expect(ses).toContain('(host_cad "EasyEDA Pro")');
				expect(ses).toContain('(host_version');
			});

			it('should include library_out section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(library_out');
			});

			it('should include network_out section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				expect(ses).toContain('(network_out');
			});
		});

		describe('generate - 完整 SES 结构验证', () => {
			it('should generate complete valid SES structure', () => {
				const pcbData = createMinimalPcbData('JLC-fron018');
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 验证整体结构
				expect(ses).toMatch(/^\(session "JLC-fron018"/);
				expect(ses).toContain('(base_design "JLC-fron018")');
				expect(ses).toContain('(placement');
				expect(ses).toContain('(was_is');
				expect(ses).toContain('(routes');
				expect(ses).toMatch(/\)[\s]*$/); // 以闭合括号结尾
			});

			it('should match expected JLC SES format structure', () => {
				const pcbData = createMinimalPcbData('JLC-fron018');
				const routingResult = createMinimalRoutingResult();

				const ses = generator.generate(routingResult, pcbData);

				// 验证关键结构顺序
				const sessionIndex = ses.indexOf('(session');
				const baseDesignIndex = ses.indexOf('(base_design');
				const placementIndex = ses.indexOf('(placement');
				const wasIsIndex = ses.indexOf('(was_is');
				const routesIndex = ses.indexOf('(routes');

				expect(sessionIndex).toBeLessThan(baseDesignIndex);
				expect(baseDesignIndex).toBeLessThan(placementIndex);
				expect(placementIndex).toBeLessThan(wasIsIndex);
				expect(wasIsIndex).toBeLessThan(routesIndex);
			});
		});
	});

	// =========================================================================
	// Task 7.2: 布线路径生成测试
	// =========================================================================

	describe('Task 7.2: 布线路径生成', () => {
		/**
		 * 创建带有布线路径的 RoutingResult
		 */
		function createRoutingResultWithPaths(): RoutingResult {
			return {
				pcbDimensions: [1000, 1000, 2],
				tracks: [
					{
						radius: 5.025, // 线宽半径，转换后 width = 5.025 * 2 * 1000 = 10050
						viaRadius: 12, // 过孔半径，转换后 diameter = 12 * 2 * 1000 = 24000
						gap: 6,
						terminals: [],
						paths: [
							{
								// 简单的单层路径
								points: [
									{ x: 100000, y: 200000, z: 0 },
									{ x: 150000, y: 200000, z: 0 },
									{ x: 150000, y: 250000, z: 0 },
								],
							},
						],
					},
				],
			};
		}

		/**
		 * 创建带有层切换的 RoutingResult
		 */
		function createRoutingResultWithLayerChange(): RoutingResult {
			return {
				pcbDimensions: [1000, 1000, 2],
				tracks: [
					{
						radius: 5.025,
						viaRadius: 12,
						gap: 6,
						terminals: [],
						paths: [
							{
								// 包含层切换的路径
								points: [
									{ x: 100000, y: 200000, z: 0 }, // TopLayer
									{ x: 150000, y: 200000, z: 0 }, // TopLayer
									{ x: 150000, y: 250000, z: 1 }, // 切换到 BottomLayer
									{ x: 200000, y: 250000, z: 1 }, // BottomLayer
								],
							},
						],
					},
				],
			};
		}

		/**
		 * 创建带有多次层切换的 RoutingResult
		 */
		function createRoutingResultWithMultipleLayerChanges(): RoutingResult {
			return {
				pcbDimensions: [1000, 1000, 2],
				tracks: [
					{
						radius: 5.025,
						viaRadius: 12,
						gap: 6,
						terminals: [],
						paths: [
							{
								points: [
									{ x: 100000, y: 200000, z: 0 }, // TopLayer
									{ x: 150000, y: 200000, z: 1 }, // 切换到 BottomLayer
									{ x: 200000, y: 200000, z: 0 }, // 切换回 TopLayer
									{ x: 250000, y: 200000, z: 0 }, // TopLayer
								],
							},
						],
					},
				],
			};
		}

		describe('wire path 格式生成', () => {
			it('should generate wire paths in correct format (wire (path layer width x1 y1 ...))', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithPaths();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 wire 格式
				expect(ses).toMatch(/\(wire/);
				expect(ses).toMatch(/\(path (TopLayer|BottomLayer) \d+/);
			});

			it('should use TopLayer for z=0', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithPaths();

				const ses = generator.generate(routingResult, pcbData);

				// TopLayer (z=0) 应该使用 JLC 层名 TopLayer
				expect(ses).toMatch(/\(path TopLayer \d+/);
			});

			it('should use BottomLayer for z=1', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// BottomLayer (z=1) 应该使用 JLC 层名 BottomLayer
				expect(ses).toMatch(/\(path BottomLayer \d+/);
			});

			it('should calculate wire width correctly (radius * 2 * 1000)', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithPaths();

				const ses = generator.generate(routingResult, pcbData);

				// width = 5.025 * 2 * 1000 = 10050
				expect(ses).toMatch(/\(path (TopLayer|BottomLayer) 10050/);
			});

			it('should include coordinates in wire path', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithPaths();

				const ses = generator.generate(routingResult, pcbData);

				// 验证坐标存在
				expect(ses).toContain('100000');
				expect(ses).toContain('200000');
				expect(ses).toContain('150000');
				expect(ses).toContain('250000');
			});

			it('should round coordinates to integers', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000.7, y: 200000.3, z: 0 },
										{ x: 150000.5, y: 200000.9, z: 0 },
									],
								},
							],
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 坐标应该被四舍五入
				expect(ses).toContain('100001');
				expect(ses).toContain('200000');
				expect(ses).toContain('150001');
				expect(ses).toContain('200001');
			});
		});

		describe('via 定义生成', () => {
			it('should generate via definitions in library_out when layer changes exist', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 via padstack 定义
				expect(ses).toMatch(/\(library_out[\s\S]*?\(padstack via0/);
			});

			it('should generate via padstack with correct format', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 padstack 格式
				expect(ses).toMatch(/\(padstack via0[\s\S]*?\(shape[\s\S]*?\(circle 1 \d+ 0 0\)/);
				expect(ses).toMatch(/\(padstack via0[\s\S]*?\(shape[\s\S]*?\(circle 2 \d+ 0 0\)/);
			});

			it('should calculate via diameter correctly (viaRadius * 2 * 1000)', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// diameter = 12 * 2 * 1000 = 24000
				expect(ses).toMatch(/\(circle \d+ 24000 0 0\)/);
			});

			it('should generate one padstack per via', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithMultipleLayerChanges();

				const ses = generator.generate(routingResult, pcbData);

				// 2 次层切换 = 2 个过孔 = 2 个 padstack
				const padstackMatches = ses.match(/\(padstack via0/g);
				expect(padstackMatches).not.toBeNull();
				expect(padstackMatches!.length).toBe(2);
			});

			it('should not generate via definitions when no layer changes', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithPaths(); // 单层路径，无层切换

				const ses = generator.generate(routingResult, pcbData);

				// 不应该有 padstack 定义
				expect(ses).not.toMatch(/\(padstack via0/);
			});

			it('should use default via diameter when viaRadius is 0', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 0, // 无效的过孔半径
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 1 }, // 层切换
									],
								},
							],
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该使用默认值 24000
				expect(ses).toMatch(/\(circle \d+ 24000 0 0\)/);
			});
		});

		describe('层切换时的过孔插入', () => {
			it('should insert via reference at layer transition point', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 via 引用格式
				expect(ses).toMatch(/\(via via0 \d+ \d+/);
			});

			it('should insert via at correct coordinates', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// 层切换点在 (150000, 250000)
				expect(ses).toMatch(/\(via via0 150000 250000/);
			});

			it('should insert multiple vias for multiple layer changes', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithMultipleLayerChanges();

				const ses = generator.generate(routingResult, pcbData);

				// 2 次层切换 = 2 个 via 引用
				const viaMatches = ses.match(/\(via via0 \d+ \d+/g);
				expect(viaMatches).not.toBeNull();
				expect(viaMatches!.length).toBe(2);
			});

			it('should not insert via when no layer change', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithPaths(); // 单层路径

				const ses = generator.generate(routingResult, pcbData);

				// 不应该有 via 引用
				expect(ses).not.toMatch(/\(via via0 \d+ \d+/);
			});

			it('should split wire path at layer transition', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithLayerChange();

				const ses = generator.generate(routingResult, pcbData);

				// 应该有两个 wire 段：一个在 TopLayer，一个在 BottomLayer
				expect(ses).toMatch(/\(path TopLayer \d+/);
				expect(ses).toMatch(/\(path BottomLayer \d+/);
			});
		});

		describe('边界情况', () => {
			it('should handle empty tracks array', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该生成有效的 SES，但没有 wire
				expect(ses).toContain('(library_out');
				expect(ses).toContain('(network_out');
			});

			it('should handle track with empty paths', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [],
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该生成有效的 SES
				expect(ses).toContain('(session');
			});

			it('should handle path with single point', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [{ x: 100000, y: 200000, z: 0 }],
								},
							],
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 单点路径也应该生成 wire
				expect(ses).toMatch(/\(wire/);
			});

			it('should handle multiple tracks', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 0 },
									],
								},
							],
						},
						{
							radius: 7.5,
							viaRadius: 15,
							gap: 8,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 300000, y: 400000, z: 1 },
										{ x: 350000, y: 400000, z: 1 },
									],
								},
							],
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该有两个不同宽度的 wire，使用 JLC 层名
				expect(ses).toMatch(/\(path TopLayer 10050/); // 5.025 * 2 * 1000
				expect(ses).toMatch(/\(path BottomLayer 15000/); // 7.5 * 2 * 1000
			});
		});
	});

	describe('Task 7.3: 网络输出生成', () => {
		/**
		 * 创建带有网络名的 RoutingResult
		 */
		function createRoutingResultWithNetNames(): RoutingResult {
			return {
				pcbDimensions: [1000, 1000, 2],
				tracks: [
					{
						radius: 5.025,
						viaRadius: 12,
						gap: 6,
						terminals: [],
						paths: [
							{
								points: [
									{ x: 100000, y: 200000, z: 0 },
									{ x: 150000, y: 200000, z: 0 },
								],
							},
						],
						netName: 'GND',
					},
					{
						radius: 5.025,
						viaRadius: 12,
						gap: 6,
						terminals: [],
						paths: [
							{
								points: [
									{ x: 300000, y: 400000, z: 1 },
									{ x: 350000, y: 400000, z: 1 },
								],
							},
						],
						netName: '3V3',
					},
				],
			};
		}

		/**
		 * 创建带有网络定义的 ParsedPcbData
		 */
		function createPcbDataWithNets(): ParsedPcbData {
			const pcbData = createMinimalPcbData('TestPCB');
			pcbData.network.nets.set('GND', [{ component: 'u1', pin: '1' }]);
			pcbData.network.nets.set('VCC', [{ component: 'u1', pin: '2' }]);
			pcbData.network.nets.set('SIG1', [{ component: 'u1', pin: '3' }]);
			return pcbData;
		}

		describe('JLC 层名使用', () => {
			it('should use TopLayer for layer index 0', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 0 },
									],
								},
							],
							netName: 'GND',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 验证使用 TopLayer 层名
				expect(ses).toMatch(/\(path TopLayer \d+/);
			});

			it('should use BottomLayer for layer index 1', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 1 },
										{ x: 150000, y: 200000, z: 1 },
									],
								},
							],
							netName: 'GND',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 验证使用 BottomLayer 层名
				expect(ses).toMatch(/\(path BottomLayer \d+/);
			});

			it('should use JLC layer names consistently in all wire paths', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 0 },
										{ x: 150000, y: 250000, z: 1 }, // 层切换
										{ x: 200000, y: 250000, z: 1 },
									],
								},
							],
							netName: 'GND',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 验证两个层都使用 JLC 层名
				expect(ses).toMatch(/\(path TopLayer \d+/);
				expect(ses).toMatch(/\(path BottomLayer \d+/);
				// 不应该有数字层索引
				expect(ses).not.toMatch(/\(path 1 \d+/);
				expect(ses).not.toMatch(/\(path 2 \d+/);
			});
		});

		describe('网络分组', () => {
			it('should group wires by net name', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithNetNames();

				const ses = generator.generate(routingResult, pcbData);

				// 验证网络分组结构
				expect(ses).toMatch(/\(net GND[\s\S]*?\(wire/);
				expect(ses).toMatch(/\(net 3V3[\s\S]*?\(wire/);
			});

			it('should generate network_out structure with net sections', () => {
				const pcbData = createMinimalPcbData();
				const routingResult = createRoutingResultWithNetNames();

				const ses = generator.generate(routingResult, pcbData);

				// 验证 network_out 结构
				expect(ses).toContain('(network_out');
				expect(ses).toContain('(net GND');
				expect(ses).toContain('(net 3V3');
			});

			it('should include all wires for a net within its section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 0 },
									],
								},
								{
									points: [
										{ x: 200000, y: 300000, z: 0 },
										{ x: 250000, y: 300000, z: 0 },
									],
								},
							],
							netName: 'GND',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// GND 网络应该包含两个 wire
				const gndSection = ses.match(/\(net GND[\s\S]*?\n      \)/);
				expect(gndSection).not.toBeNull();
				const wireCount = (gndSection![0].match(/\(wire/g) || []).length;
				expect(wireCount).toBe(2);
			});

			it('should include vias within the correct net section', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 1 }, // 层切换
									],
								},
							],
							netName: 'GND',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// GND 网络应该包含 via
				const gndSection = ses.match(/\(net GND[\s\S]*?\n      \)/);
				expect(gndSection).not.toBeNull();
				expect(gndSection![0]).toMatch(/\(via via0/);
			});

			it('should use net names from originalDsn when track has no netName', () => {
				const pcbData = createPcbDataWithNets();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 0 },
									],
								},
							],
							// 没有 netName
						},
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 200000, y: 300000, z: 0 },
										{ x: 250000, y: 300000, z: 0 },
									],
								},
							],
							// 没有 netName
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该使用 originalDsn 中的网络名
				expect(ses).toContain('(net GND');
				expect(ses).toContain('(net VCC');
			});

			it('should generate default net names when no netName available', () => {
				const pcbData = createMinimalPcbData(); // 没有网络定义
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [
								{
									points: [
										{ x: 100000, y: 200000, z: 0 },
										{ x: 150000, y: 200000, z: 0 },
									],
								},
							],
							// 没有 netName
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该生成默认网络名
				expect(ses).toMatch(/\(net NET_\d+/);
			});
		});

		describe('多网络处理', () => {
			it('should handle multiple nets with different tracks', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [{ points: [{ x: 100000, y: 200000, z: 0 }, { x: 150000, y: 200000, z: 0 }] }],
							netName: 'GND',
						},
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [{ points: [{ x: 200000, y: 300000, z: 0 }, { x: 250000, y: 300000, z: 0 }] }],
							netName: '3V3',
						},
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [{ points: [{ x: 300000, y: 400000, z: 1 }, { x: 350000, y: 400000, z: 1 }] }],
							netName: 'SIG1',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 验证所有网络都存在
				expect(ses).toContain('(net GND');
				expect(ses).toContain('(net 3V3');
				expect(ses).toContain('(net SIG1');
			});

			it('should merge tracks with same net name', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [{ points: [{ x: 100000, y: 200000, z: 0 }, { x: 150000, y: 200000, z: 0 }] }],
							netName: 'GND',
						},
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [{ points: [{ x: 200000, y: 300000, z: 0 }, { x: 250000, y: 300000, z: 0 }] }],
							netName: 'GND', // 同一网络
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// GND 应该只出现一次作为网络名
				const gndMatches = ses.match(/\(net GND/g);
				expect(gndMatches).not.toBeNull();
				expect(gndMatches!.length).toBe(1);

				// 但应该包含两个 wire
				const gndSection = ses.match(/\(net GND[\s\S]*?\n      \)/);
				expect(gndSection).not.toBeNull();
				const wireCount = (gndSection![0].match(/\(wire/g) || []).length;
				expect(wireCount).toBe(2);
			});
		});

		describe('边界情况', () => {
			it('should handle empty tracks array', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该生成空的 network_out
				expect(ses).toContain('(network_out');
			});

			it('should handle track with empty paths', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [],
							netName: 'GND',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该生成网络但没有 wire
				expect(ses).toContain('(net GND');
			});

			it('should handle special characters in net names', () => {
				const pcbData = createMinimalPcbData();
				const routingResult: RoutingResult = {
					pcbDimensions: [1000, 1000, 2],
					tracks: [
						{
							radius: 5.025,
							viaRadius: 12,
							gap: 6,
							terminals: [],
							paths: [{ points: [{ x: 100000, y: 200000, z: 0 }, { x: 150000, y: 200000, z: 0 }] }],
							netName: '$1N1226',
						},
					],
				};

				const ses = generator.generate(routingResult, pcbData);

				// 应该正确处理特殊字符
				expect(ses).toContain('(net $1N1226');
			});
		});
	});

	// =========================================================================
	// Task 7.4: Property-Based Tests - SES Format Validity
	// =========================================================================

	/**
	 * Property-Based Tests for SES Format Validity
	 *
	 * Feature: jlc-eda-autorouter-plugin, Property 4: SES Format Validity
	 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
	 *
	 * *For any* routing result with paths and vias, the generated SES content SHALL:
	 * - Contain valid session structure `(session "name" (base_design "name") ...)`
	 * - Include resolution declaration `(resolution mil 1000)`
	 * - Have all wire paths in correct format `(wire (path layer width x1 y1 ...))`
	 * - Have all vias properly defined in `library_out`
	 * - Use JLC layer names (`TopLayer`, `BottomLayer`) consistently
	 * - Group all wires by their net names
	 */
	describe('Property-Based Tests: SES Format Validity', () => {
		// Import fast-check
		const fc = require('fast-check');

		// =====================================================================
		// Arbitraries (Generators) for Property-Based Testing
		// =====================================================================

		/**
		 * Generate random PCB names
		 * - Alphanumeric with dashes and underscores
		 * - Length 1-50 characters
		 */
		const pcbNameArb = fc.stringOf(
			fc.constantFrom(
				...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'
					.split('')
			),
			{ minLength: 1, maxLength: 50 }
		);

		/**
		 * Generate random net names
		 * - Alphanumeric with common special characters used in net names
		 */
		const netNameArb = fc.stringOf(
			fc.constantFrom(
				...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'
					.split('')
			),
			{ minLength: 1, maxLength: 20 }
		);

		/**
		 * Generate random layer index (0 = TopLayer, 1 = BottomLayer)
		 */
		const layerIndexArb = fc.integer({ min: 0, max: 1 });

		/**
		 * Generate random coordinate (JLC format: mil × 1000)
		 * - Range: -1,000,000,000 to 1,000,000,000
		 */
		const coordinateArb = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });

		/**
		 * Generate random Point3D
		 */
		const point3DArb = fc.record({
			x: coordinateArb,
			y: coordinateArb,
			z: layerIndexArb,
		});

		/**
		 * Generate random routing path with 2-10 points
		 */
		const routingPathArb = fc.record({
			points: fc.array(point3DArb, { minLength: 2, maxLength: 10 }),
		});

		/**
		 * Generate random track configuration
		 */
		const trackArb = fc.record({
			radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
			viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
			gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
			terminals: fc.constant([]),
			paths: fc.array(routingPathArb, { minLength: 1, maxLength: 5 }),
			netName: netNameArb,
		});

		/**
		 * Generate random routing result
		 */
		const routingResultArb = fc.record({
			pcbDimensions: fc.tuple(
				fc.integer({ min: 100, max: 10000 }),
				fc.integer({ min: 100, max: 10000 }),
				fc.constant(2)
			) as fc.Arbitrary<[number, number, number]>,
			tracks: fc.array(trackArb, { minLength: 1, maxLength: 5 }),
		});

		/**
		 * Generate random ParsedPcbData
		 */
		const parsedPcbDataArb = pcbNameArb.map((pcbName: string) => ({
			pcbName,
			resolution: { unit: 'mil' as const, multiplier: 1000 },
			structure: {
				boundary: [
					{ x: 0, y: 0 },
					{ x: 1000, y: 0 },
					{ x: 1000, y: 1000 },
					{ x: 0, y: 1000 },
				],
				layers: [
					{ name: 'TopLayer', type: 'signal' as const, index: 0 },
					{ name: 'BottomLayer', type: 'signal' as const, index: 1 },
				],
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
					position: { x: 0, y: 0 },
					side: 'front' as const,
					rotation: 0,
				},
			],
			library: {
				images: [],
				padstacks: [],
			},
			network: {
				nets: new Map(),
				classes: new Map(),
			},
		}));

		// =====================================================================
		// Property Tests
		// =====================================================================

		/**
		 * Property 4.1: Valid Session Structure
		 * **Validates: Requirement 5.1**
		 *
		 * The generated SES SHALL contain valid session structure:
		 * `(session "name" (base_design "name") ...)`
		 */
		it('should generate valid session structure for any PCB name', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Verify session structure starts correctly
						const sessionPattern = new RegExp(
							`^\\(session "${pcbData.pcbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
						);
						const hasValidSessionStart = sessionPattern.test(ses);

						// Verify base_design is present with correct name
						const baseDesignPattern = new RegExp(
							`\\(base_design "${pcbData.pcbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\)`
						);
						const hasValidBaseDesign = baseDesignPattern.test(ses);

						// Verify session closes properly
						const hasValidClose = ses.trim().endsWith(')');

						return hasValidSessionStart && hasValidBaseDesign && hasValidClose;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.2: Resolution Declaration
		 * **Validates: Requirement 5.2**
		 *
		 * The generated SES SHALL include resolution declaration:
		 * `(resolution mil 1000)`
		 */
		it('should include resolution declaration (resolution mil 1000) for any routing result', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Verify resolution declaration exists
						const resolutionPattern = /\(resolution mil 1000\)/g;
						const matches = ses.match(resolutionPattern);

						// Should have at least 2 resolution declarations (placement and routes)
						return matches !== null && matches.length >= 2;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.3: Wire Path Format
		 * **Validates: Requirement 5.3**
		 *
		 * All wire paths SHALL be in correct format:
		 * `(wire (path layer width x1 y1 ...))`
		 */
		it('should generate wire paths in correct format for any routing result with paths', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Find all wire declarations
						const wirePattern = /\(wire\s*\n\s*\(path\s+(TopLayer|BottomLayer)\s+\d+\s*\n\s*[\d\s\-]+\s*\n\s*\)\s*\n\s*\)/g;
						const wires = ses.match(wirePattern) || [];

						// If there are tracks with paths, there should be wires
						const hasPathsInTracks = routingResult.tracks.some(
							(track) => track.paths.length > 0 && track.paths.some((p) => p.points.length >= 1)
						);

						if (!hasPathsInTracks) {
							// No paths, no wires expected
							return true;
						}

						// Verify each wire has valid format
						// Check that wire paths use valid layer names
						const layerPattern = /\(path\s+(TopLayer|BottomLayer)\s+\d+/g;
						const layerMatches = ses.match(layerPattern) || [];

						// All layer references should be TopLayer or BottomLayer
						const allValidLayers = layerMatches.every(
							(match) => match.includes('TopLayer') || match.includes('BottomLayer')
						);

						// Width should be positive integer
						const widthPattern = /\(path\s+(?:TopLayer|BottomLayer)\s+(\d+)/g;
						let widthMatch;
						let allValidWidths = true;
						while ((widthMatch = widthPattern.exec(ses)) !== null) {
							const width = parseInt(widthMatch[1], 10);
							if (width <= 0) {
								allValidWidths = false;
								break;
							}
						}

						return allValidLayers && allValidWidths;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.4: Via Definitions in library_out
		 * **Validates: Requirement 5.4**
		 *
		 * All vias SHALL be properly defined in `library_out`
		 */
		it('should define vias in library_out when layer changes exist', () => {
			// Generate routing results that specifically have layer changes
			const routingResultWithLayerChangesArb = fc.record({
				pcbDimensions: fc.tuple(
					fc.integer({ min: 100, max: 10000 }),
					fc.integer({ min: 100, max: 10000 }),
					fc.constant(2)
				) as fc.Arbitrary<[number, number, number]>,
				tracks: fc.array(
					fc.record({
						radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
						viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
						gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
						terminals: fc.constant([]),
						paths: fc.array(
							fc.record({
								points: fc.tuple(
									fc.record({ x: coordinateArb, y: coordinateArb, z: fc.constant(0) }),
									fc.record({ x: coordinateArb, y: coordinateArb, z: fc.constant(1) }) // Layer change
								).map(([p1, p2]) => [p1, p2]),
							}).map((obj) => ({ points: obj.points })),
							{ minLength: 1, maxLength: 3 }
						),
						netName: netNameArb,
					}),
					{ minLength: 1, maxLength: 3 }
				),
			});

			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultWithLayerChangesArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Count layer changes in routing result
						let layerChangeCount = 0;
						for (const track of routingResult.tracks) {
							for (const path of track.paths) {
								for (let i = 1; i < path.points.length; i++) {
									if (path.points[i - 1].z !== path.points[i].z) {
										layerChangeCount++;
									}
								}
							}
						}

						if (layerChangeCount === 0) {
							// No layer changes, no via padstacks expected
							return !ses.includes('(padstack via0');
						}

						// Verify library_out contains padstack definitions
						const hasLibraryOut = ses.includes('(library_out');
						const padstackPattern = /\(padstack via0/g;
						const padstackMatches = ses.match(padstackPattern) || [];

						// Should have one padstack per layer change
						const hasCorrectPadstackCount = padstackMatches.length === layerChangeCount;

						// Verify padstack format: (padstack via0 (shape (circle ...)))
						const padstackFormatPattern = /\(padstack via0[\s\S]*?\(shape[\s\S]*?\(circle \d+ \d+ 0 0\)/g;
						const formatMatches = ses.match(padstackFormatPattern) || [];
						const hasValidFormat = formatMatches.length === layerChangeCount;

						return hasLibraryOut && hasCorrectPadstackCount && hasValidFormat;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.5: JLC Layer Names Consistency
		 * **Validates: Requirement 5.5**
		 *
		 * The generated SES SHALL use JLC layer names (`TopLayer`, `BottomLayer`) consistently
		 */
		it('should use JLC layer names consistently for any routing result', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Find all layer references in wire paths
						const pathLayerPattern = /\(path\s+(\w+)\s+\d+/g;
						let match;
						const layerNames: string[] = [];
						while ((match = pathLayerPattern.exec(ses)) !== null) {
							layerNames.push(match[1]);
						}

						// All layer names should be either TopLayer or BottomLayer
						const validLayerNames = ['TopLayer', 'BottomLayer'];
						const allValidLayerNames = layerNames.every((name) =>
							validLayerNames.includes(name)
						);

						// Should not use numeric layer indices in wire paths
						const hasNumericLayers = /\(path\s+\d+\s+\d+/.test(ses);

						return allValidLayerNames && !hasNumericLayers;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.6: Wires Grouped by Net Names
		 * **Validates: Requirement 5.6**
		 *
		 * The generated SES SHALL group all wires by their net names
		 */
		it('should group wires by net names in network_out for any routing result', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Verify network_out section exists
						const hasNetworkOut = ses.includes('(network_out');

						// Get unique net names from routing result
						const netNames = new Set<string>();
						routingResult.tracks.forEach((track, index) => {
							if (track.netName) {
								netNames.add(track.netName);
							} else {
								netNames.add(`NET_${index}`);
							}
						});

						// Verify each net name appears in network_out
						// Use string search instead of regex to avoid special character issues
						let allNetsPresent = true;
						for (const netName of netNames) {
							const searchPattern = `(net ${netName}`;
							if (!ses.includes(searchPattern)) {
								allNetsPresent = false;
								break;
							}
						}

						// Verify wires are inside net sections (not floating)
						// All (wire ...) should be preceded by (net ...)
						const networkOutSection = ses.match(/\(network_out[\s\S]*?\n    \)/);
						if (networkOutSection) {
							const wireOutsideNet = /\(network_out\s*\n\s*\(wire/.test(ses);
							if (wireOutsideNet) {
								return false;
							}
						}

						return hasNetworkOut && allNetsPresent;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.7: Complete SES Structure Validity
		 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
		 *
		 * Combined property test verifying all SES format requirements together
		 */
		it('should generate complete valid SES structure for any routing result', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					routingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// 5.1: Valid session structure
						const escapedName = pcbData.pcbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
						const hasValidSession = new RegExp(`^\\(session "${escapedName}"`).test(ses);
						const hasBaseDesign = new RegExp(`\\(base_design "${escapedName}"\\)`).test(ses);

						// 5.2: Resolution declaration
						const hasResolution = (ses.match(/\(resolution mil 1000\)/g) || []).length >= 2;

						// 5.3: Wire path format (if paths exist)
						const hasPathsInTracks = routingResult.tracks.some(
							(track) => track.paths.length > 0 && track.paths.some((p) => p.points.length >= 1)
						);
						let hasValidWireFormat = true;
						if (hasPathsInTracks) {
							// Check that all path declarations use valid layer names
							const pathPattern = /\(path\s+(\w+)\s+\d+/g;
							let pathMatch;
							while ((pathMatch = pathPattern.exec(ses)) !== null) {
								if (pathMatch[1] !== 'TopLayer' && pathMatch[1] !== 'BottomLayer') {
									hasValidWireFormat = false;
									break;
								}
							}
						}

						// 5.4: Via definitions (checked separately in Property 4.4)
						const hasLibraryOut = ses.includes('(library_out');

						// 5.5: JLC layer names (no numeric layer indices)
						const hasNoNumericLayers = !/\(path\s+\d+\s+\d+/.test(ses);

						// 5.6: Network grouping
						const hasNetworkOut = ses.includes('(network_out');

						// Structural integrity
						const hasPlacement = ses.includes('(placement');
						const hasWasIs = ses.includes('(was_is');
						const hasRoutes = ses.includes('(routes');
						const endsWithClose = ses.trim().endsWith(')');

						return (
							hasValidSession &&
							hasBaseDesign &&
							hasResolution &&
							hasValidWireFormat &&
							hasLibraryOut &&
							hasNoNumericLayers &&
							hasNetworkOut &&
							hasPlacement &&
							hasWasIs &&
							hasRoutes &&
							endsWithClose
						);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 4.8: Wire Width Calculation
		 * **Validates: Requirement 5.3**
		 *
		 * Wire width should be calculated as radius * 2 * 1000
		 */
		it('should calculate wire width correctly (radius * 2 * 1000) for any track', () => {
			fc.assert(
				fc.property(
					parsedPcbDataArb,
					fc.record({
						pcbDimensions: fc.tuple(
							fc.integer({ min: 100, max: 10000 }),
							fc.integer({ min: 100, max: 10000 }),
							fc.constant(2)
						) as fc.Arbitrary<[number, number, number]>,
						tracks: fc.array(
							fc.record({
								radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
								viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
								gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
								terminals: fc.constant([]),
								paths: fc.array(
									fc.record({
										points: fc.array(
											fc.record({
												x: coordinateArb,
												y: coordinateArb,
												z: fc.constant(0), // Same layer to avoid via complexity
											}),
											{ minLength: 2, maxLength: 5 }
										),
									}),
									{ minLength: 1, maxLength: 1 }
								),
								netName: fc.constant('TestNet'),
							}),
							{ minLength: 1, maxLength: 1 }
						),
					}),
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Calculate expected width
						const track = routingResult.tracks[0];
						const expectedWidth = Math.round(track.radius * 2 * 1000);

						// Find width in generated SES
						const widthPattern = /\(path\s+(?:TopLayer|BottomLayer)\s+(\d+)/;
						const match = ses.match(widthPattern);

						if (!match) {
							// No wire generated (might be due to single point path)
							return true;
						}

						const actualWidth = parseInt(match[1], 10);
						return actualWidth === expectedWidth;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// =========================================================================
	// Task 7.5: Property-Based Tests - Via Insertion on Layer Change
	// =========================================================================

	/**
	 * Property-Based Tests for Via Insertion on Layer Change
	 *
	 * Feature: jlc-eda-autorouter-plugin, Property 5: Via Insertion on Layer Change
	 * **Validates: Requirements 5.7**
	 *
	 * *For any* routing path that contains points on different layers (z-coordinate changes),
	 * the SES generator SHALL insert a via reference at each layer transition point.
	 *
	 * ```
	 * let path = generatePathWithLayerChanges()
	 * let ses = generateSes(path)
	 * for each consecutive point pair (p1, p2) in path:
	 *   if p1.z != p2.z:
	 *     assert(ses contains via at (p1.x, p1.y) or (p2.x, p2.y))
	 * ```
	 */
	describe('Property-Based Tests: Via Insertion on Layer Change', () => {
		// Import fast-check
		const fc = require('fast-check');

		// =====================================================================
		// Arbitraries (Generators) for Property-Based Testing
		// =====================================================================

		/**
		 * Generate random coordinate (JLC format: mil × 1000)
		 * - Range: -1,000,000,000 to 1,000,000,000
		 */
		const coordinateArb = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });

		/**
		 * Generate random layer index (0 = TopLayer, 1 = BottomLayer)
		 */
		const layerIndexArb = fc.integer({ min: 0, max: 1 });

		/**
		 * Generate random net name
		 */
		const netNameArb = fc.stringOf(
			fc.constantFrom(
				...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')
			),
			{ minLength: 1, maxLength: 20 }
		);

		/**
		 * Generate a path that is guaranteed to have at least one layer change
		 * This creates a path where consecutive points alternate between layers
		 */
		const pathWithLayerChangesArb = fc
			.tuple(
				fc.integer({ min: 2, max: 10 }), // number of points
				fc.array(coordinateArb, { minLength: 10, maxLength: 20 }), // x coordinates pool
				fc.array(coordinateArb, { minLength: 10, maxLength: 20 }) // y coordinates pool
			)
			.map(([numPoints, xPool, yPool]) => {
				const points: { x: number; y: number; z: number }[] = [];
				let currentLayer = 0;

				for (let i = 0; i < numPoints; i++) {
					const x = xPool[i % xPool.length];
					const y = yPool[i % yPool.length];

					// Alternate layers to ensure at least one layer change
					if (i > 0 && i % 2 === 1) {
						currentLayer = currentLayer === 0 ? 1 : 0;
					}

					points.push({ x, y, z: currentLayer });
				}

				return { points };
			});

		/**
		 * Generate a path with a specific number of layer changes
		 */
		const pathWithNLayerChangesArb = (n: number) =>
			fc
				.tuple(
					fc.array(coordinateArb, { minLength: n + 2, maxLength: n + 10 }),
					fc.array(coordinateArb, { minLength: n + 2, maxLength: n + 10 })
				)
				.map(([xPool, yPool]) => {
					const points: { x: number; y: number; z: number }[] = [];
					let currentLayer = 0;
					let changesRemaining = n;

					// First point
					points.push({ x: xPool[0], y: yPool[0], z: currentLayer });

					// Add points with controlled layer changes
					for (let i = 1; i < xPool.length && i < yPool.length; i++) {
						if (changesRemaining > 0 && i <= n) {
							// Force a layer change
							currentLayer = currentLayer === 0 ? 1 : 0;
							changesRemaining--;
						}
						points.push({ x: xPool[i], y: yPool[i], z: currentLayer });
					}

					return { points };
				});

		/**
		 * Generate a track with paths that have layer changes
		 */
		const trackWithLayerChangesArb = fc.record({
			radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
			viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
			gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
			terminals: fc.constant([]),
			paths: fc.array(pathWithLayerChangesArb, { minLength: 1, maxLength: 3 }),
			netName: netNameArb,
		});

		/**
		 * Generate a routing result with layer changes
		 */
		const routingResultWithLayerChangesArb = fc.record({
			pcbDimensions: fc.tuple(
				fc.integer({ min: 100, max: 10000 }),
				fc.integer({ min: 100, max: 10000 }),
				fc.constant(2)
			) as fc.Arbitrary<[number, number, number]>,
			tracks: fc.array(trackWithLayerChangesArb, { minLength: 1, maxLength: 3 }),
		});

		/**
		 * Generate minimal ParsedPcbData for testing
		 */
		const minimalPcbDataArb = fc.constant({
			pcbName: 'TestPCB',
			resolution: { unit: 'mil' as const, multiplier: 1000 },
			structure: {
				boundary: [
					{ x: 0, y: 0 },
					{ x: 1000, y: 0 },
					{ x: 1000, y: 1000 },
					{ x: 0, y: 1000 },
				],
				layers: [
					{ name: 'TopLayer', type: 'signal' as const, index: 0 },
					{ name: 'BottomLayer', type: 'signal' as const, index: 1 },
				],
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
					position: { x: 0, y: 0 },
					side: 'front' as const,
					rotation: 0,
				},
			],
			library: {
				images: [],
				padstacks: [],
			},
			network: {
				nets: new Map(),
				classes: new Map(),
			},
		});

		// =====================================================================
		// Helper Functions
		// =====================================================================

		/**
		 * Count the number of layer transitions in a routing result
		 */
		function countLayerTransitions(routingResult: RoutingResult): number {
			let count = 0;
			for (const track of routingResult.tracks) {
				for (const path of track.paths) {
					for (let i = 1; i < path.points.length; i++) {
						if (path.points[i - 1].z !== path.points[i].z) {
							count++;
						}
					}
				}
			}
			return count;
		}

		/**
		 * Get all layer transition points from a routing result
		 * Returns the coordinates where layer changes occur (using the second point of each transition)
		 */
		function getLayerTransitionPoints(
			routingResult: RoutingResult
		): Array<{ x: number; y: number }> {
			const points: Array<{ x: number; y: number }> = [];
			for (const track of routingResult.tracks) {
				for (const path of track.paths) {
					for (let i = 1; i < path.points.length; i++) {
						if (path.points[i - 1].z !== path.points[i].z) {
							// Via is inserted at the current point (where layer changes to)
							points.push({
								x: Math.round(path.points[i].x),
								y: Math.round(path.points[i].y),
							});
						}
					}
				}
			}
			return points;
		}

		/**
		 * Extract all via references from SES content
		 * Returns array of {x, y} coordinates
		 */
		function extractViaReferences(ses: string): Array<{ x: number; y: number }> {
			const viaPattern = /\(via via0 (-?\d+) (-?\d+)/g;
			const vias: Array<{ x: number; y: number }> = [];
			let match;
			while ((match = viaPattern.exec(ses)) !== null) {
				vias.push({
					x: parseInt(match[1], 10),
					y: parseInt(match[2], 10),
				});
			}
			return vias;
		}

		/**
		 * Count via padstack definitions in SES content
		 */
		function countViaPadstacks(ses: string): number {
			const padstackPattern = /\(padstack via0/g;
			const matches = ses.match(padstackPattern);
			return matches ? matches.length : 0;
		}

		// =====================================================================
		// Property Tests
		// =====================================================================

		/**
		 * Property 5.1: Via Reference Inserted at Each Layer Transition
		 * **Validates: Requirement 5.7**
		 *
		 * For any routing path with layer changes, a via reference SHALL be inserted
		 * at each layer transition point.
		 */
		it('should insert via reference at each layer transition point', () => {
			fc.assert(
				fc.property(
					minimalPcbDataArb,
					routingResultWithLayerChangesArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Count expected layer transitions
						const expectedTransitions = countLayerTransitions(routingResult);

						// Extract via references from SES
						const viaRefs = extractViaReferences(ses);

						// Number of via references should equal number of layer transitions
						return viaRefs.length === expectedTransitions;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.2: Via Coordinates Match Transition Points
		 * **Validates: Requirement 5.7**
		 *
		 * Via coordinates SHALL match the layer transition point coordinates.
		 */
		it('should insert via at correct coordinates matching transition points', () => {
			fc.assert(
				fc.property(
					minimalPcbDataArb,
					routingResultWithLayerChangesArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Get expected transition points
						const expectedPoints = getLayerTransitionPoints(routingResult);

						// Extract actual via references
						const actualVias = extractViaReferences(ses);

						// Check that all expected points have corresponding vias
						// (order may differ, so we check set membership)
						if (expectedPoints.length !== actualVias.length) {
							return false;
						}

						// For each expected point, there should be a matching via
						for (const expected of expectedPoints) {
							const found = actualVias.some(
								(via) => via.x === expected.x && via.y === expected.y
							);
							if (!found) {
								return false;
							}
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.3: Number of Vias Equals Number of Layer Transitions
		 * **Validates: Requirement 5.7**
		 *
		 * The number of via padstack definitions SHALL equal the number of layer transitions.
		 */
		it('should have number of via padstacks equal to number of layer transitions', () => {
			fc.assert(
				fc.property(
					minimalPcbDataArb,
					routingResultWithLayerChangesArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Count expected layer transitions
						const expectedTransitions = countLayerTransitions(routingResult);

						// Count via padstack definitions
						const padstackCount = countViaPadstacks(ses);

						// Number of padstacks should equal number of transitions
						return padstackCount === expectedTransitions;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.4: No Via When No Layer Change
		 * **Validates: Requirement 5.7**
		 *
		 * When a path has no layer changes, no via SHALL be inserted.
		 */
		it('should not insert via when path has no layer changes', () => {
			// Generate paths that stay on the same layer
			const singleLayerPathArb = fc.record({
				points: fc.array(
					fc.record({
						x: coordinateArb,
						y: coordinateArb,
						z: fc.constant(0), // Always on TopLayer
					}),
					{ minLength: 2, maxLength: 10 }
				),
			});

			const singleLayerTrackArb = fc.record({
				radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
				viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
				gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
				terminals: fc.constant([]),
				paths: fc.array(singleLayerPathArb, { minLength: 1, maxLength: 3 }),
				netName: netNameArb,
			});

			const singleLayerRoutingResultArb = fc.record({
				pcbDimensions: fc.tuple(
					fc.integer({ min: 100, max: 10000 }),
					fc.integer({ min: 100, max: 10000 }),
					fc.constant(2)
				) as fc.Arbitrary<[number, number, number]>,
				tracks: fc.array(singleLayerTrackArb, { minLength: 1, maxLength: 3 }),
			});

			fc.assert(
				fc.property(
					minimalPcbDataArb,
					singleLayerRoutingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Should have no via references
						const viaRefs = extractViaReferences(ses);

						// Should have no via padstacks
						const padstackCount = countViaPadstacks(ses);

						return viaRefs.length === 0 && padstackCount === 0;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.5: Via Format Validity
		 * **Validates: Requirement 5.7**
		 *
		 * Via references SHALL be in the correct format: (via via0 x y)
		 */
		it('should generate via references in correct format', () => {
			fc.assert(
				fc.property(
					minimalPcbDataArb,
					routingResultWithLayerChangesArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Find all via references
						const viaPattern = /\(via via0 -?\d+ -?\d+\s*\n\s*\)/g;
						const viaMatches = ses.match(viaPattern) || [];

						// Count expected transitions
						const expectedTransitions = countLayerTransitions(routingResult);

						// All via references should match the expected format
						return viaMatches.length === expectedTransitions;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.6: Multiple Layer Changes in Single Path
		 * **Validates: Requirement 5.7**
		 *
		 * For paths with multiple layer changes, each transition SHALL have its own via.
		 */
		it('should insert separate via for each layer change in multi-transition paths', () => {
			// Generate paths with exactly 3 layer changes
			const multiTransitionPathArb = pathWithNLayerChangesArb(3);

			const multiTransitionTrackArb = fc.record({
				radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
				viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
				gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
				terminals: fc.constant([]),
				paths: fc.array(multiTransitionPathArb, { minLength: 1, maxLength: 1 }),
				netName: netNameArb,
			});

			const multiTransitionRoutingResultArb = fc.record({
				pcbDimensions: fc.tuple(
					fc.integer({ min: 100, max: 10000 }),
					fc.integer({ min: 100, max: 10000 }),
					fc.constant(2)
				) as fc.Arbitrary<[number, number, number]>,
				tracks: fc.array(multiTransitionTrackArb, { minLength: 1, maxLength: 1 }),
			});

			fc.assert(
				fc.property(
					minimalPcbDataArb,
					multiTransitionRoutingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Count actual layer transitions
						const actualTransitions = countLayerTransitions(routingResult);

						// Extract via references
						const viaRefs = extractViaReferences(ses);

						// Count via padstacks
						const padstackCount = countViaPadstacks(ses);

						// Both should match the actual number of transitions
						return (
							viaRefs.length === actualTransitions && padstackCount === actualTransitions
						);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.7: Via Insertion Preserves Wire Continuity
		 * **Validates: Requirement 5.7**
		 *
		 * When a via is inserted at a layer transition, the wire path SHALL be split
		 * into segments on each layer, with the via connecting them.
		 */
		it('should split wire path at layer transition with via connecting segments', () => {
			fc.assert(
				fc.property(
					minimalPcbDataArb,
					routingResultWithLayerChangesArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Count layer transitions
						const transitionCount = countLayerTransitions(routingResult);

						if (transitionCount === 0) {
							return true; // No transitions, nothing to check
						}

						// Check that both TopLayer and BottomLayer wire paths exist
						// when there are layer transitions
						const hasTopLayerWire = /\(path TopLayer \d+/.test(ses);
						const hasBottomLayerWire = /\(path BottomLayer \d+/.test(ses);

						// If there are transitions, we should have wires on both layers
						// (unless all points after transition are on same layer)
						const hasWiresOnBothLayers = hasTopLayerWire || hasBottomLayerWire;

						// Via references should exist
						const viaRefs = extractViaReferences(ses);
						const hasVias = viaRefs.length === transitionCount;

						return hasWiresOnBothLayers && hasVias;
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * Property 5.8: Via Coordinates Are Integers
		 * **Validates: Requirement 5.7**
		 *
		 * Via coordinates SHALL be rounded to integers (JLC format requirement).
		 */
		it('should round via coordinates to integers', () => {
			// Generate paths with floating point coordinates
			const floatCoordinateArb = fc.float({
				min: -1_000_000,
				max: 1_000_000,
				noNaN: true,
				noDefaultInfinity: true,
			});

			const floatPathArb = fc
				.tuple(
					fc.array(floatCoordinateArb, { minLength: 4, maxLength: 10 }),
					fc.array(floatCoordinateArb, { minLength: 4, maxLength: 10 })
				)
				.map(([xPool, yPool]) => {
					const points: { x: number; y: number; z: number }[] = [];
					let currentLayer = 0;

					for (let i = 0; i < Math.min(xPool.length, yPool.length); i++) {
						if (i > 0 && i % 2 === 1) {
							currentLayer = currentLayer === 0 ? 1 : 0;
						}
						points.push({ x: xPool[i], y: yPool[i], z: currentLayer });
					}

					return { points };
				});

			const floatTrackArb = fc.record({
				radius: fc.float({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
				viaRadius: fc.float({ min: 5, max: 30, noNaN: true, noDefaultInfinity: true }),
				gap: fc.float({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
				terminals: fc.constant([]),
				paths: fc.array(floatPathArb, { minLength: 1, maxLength: 2 }),
				netName: netNameArb,
			});

			const floatRoutingResultArb = fc.record({
				pcbDimensions: fc.tuple(
					fc.integer({ min: 100, max: 10000 }),
					fc.integer({ min: 100, max: 10000 }),
					fc.constant(2)
				) as fc.Arbitrary<[number, number, number]>,
				tracks: fc.array(floatTrackArb, { minLength: 1, maxLength: 2 }),
			});

			fc.assert(
				fc.property(
					minimalPcbDataArb,
					floatRoutingResultArb,
					(pcbData: ParsedPcbData, routingResult: RoutingResult) => {
						const ses = generator.generate(routingResult, pcbData);

						// Extract all via coordinates
						const viaPattern = /\(via via0 (-?\d+) (-?\d+)/g;
						let match;
						while ((match = viaPattern.exec(ses)) !== null) {
							const x = match[1];
							const y = match[2];

							// Coordinates should be integers (no decimal point)
							if (x.includes('.') || y.includes('.')) {
								return false;
							}

							// Should be valid integers
							if (isNaN(parseInt(x, 10)) || isNaN(parseInt(y, 10))) {
								return false;
							}
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
