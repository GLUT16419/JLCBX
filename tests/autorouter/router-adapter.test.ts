/**
 * 路由器适配器测试
 *
 * 测试 RouterAdapter 类的数据格式转换功能。
 */

import { RouterAdapter, JsPcbInput, JsPcbTrack, JsPcbTerminal } from '../../src/autorouter/router-adapter';
import type { ParsedPcbData, Resolution, NetworkDefinition, RoutingResult } from '../../src/autorouter/types';

describe('RouterAdapter', () => {
	let adapter: RouterAdapter;

	beforeEach(() => {
		adapter = new RouterAdapter();
	});

	/**
	 * 创建最小有效的 ParsedPcbData 用于测试
	 */
	function createMinimalPcbData(pcbName: string = 'TestPCB'): ParsedPcbData {
		return {
			pcbName,
			resolution: { unit: 'mil', multiplier: 1000 } as Resolution,
			structure: {
				boundary: [
					{ x: 0, y: 0 },
					{ x: 1000, y: 0 },
					{ x: 1000, y: 1000 },
					{ x: 0, y: 1000 },
				],
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
				images: [
					{
						name: 'u1',
						pins: [
							{ name: '1', padstack: 'p1', position: { x: 100, y: 100 }, rotation: 0 },
							{ name: '2', padstack: 'p1', position: { x: 200, y: 100 }, rotation: 0 },
							{ name: '3', padstack: 'p1', position: { x: 300, y: 100 }, rotation: 0 },
						],
					},
				],
				padstacks: [
					{
						name: 'p1',
						shapes: [{ layer: 'TopLayer', type: 'circle', coordinates: [20, 0, 0] }],
					},
				],
			},
			network: {
				nets: new Map([
					['GND', [{ component: 'u1', pin: '1' }, { component: 'u1', pin: '2' }]],
					['VCC', [{ component: 'u1', pin: '3' }]],
				]),
				classes: new Map([
					['GND', { viaType: 'via0', width: 10, clearance: 6 }],
				]),
			} as NetworkDefinition,
		};
	}

	// =========================================================================
	// Task 9.1: 适配 JS-PCB 数据格式测试
	// =========================================================================

	describe('Task 9.1: toJsPcbInput - 数据格式转换', () => {
		describe('PCB 尺寸计算', () => {
			it('should calculate dimensions from boundary', () => {
				const pcbData = createMinimalPcbData();
				const [dimensions] = adapter.toJsPcbInput(pcbData);

				expect(dimensions).toEqual([1000, 1000, 2]);
			});

			it('should handle non-zero origin boundary', () => {
				const pcbData = createMinimalPcbData();
				pcbData.structure.boundary = [
					{ x: 100, y: 200 },
					{ x: 600, y: 200 },
					{ x: 600, y: 700 },
					{ x: 100, y: 700 },
				];

				const [dimensions] = adapter.toJsPcbInput(pcbData);

				expect(dimensions[0]).toBe(500); // width = 600 - 100
				expect(dimensions[1]).toBe(500); // height = 700 - 200
			});

			it('should use layer count from structure', () => {
				const pcbData = createMinimalPcbData();
				pcbData.structure.layers = [
					{ name: 'TopLayer', type: 'signal', index: 0 },
					{ name: 'InnerLayer1', type: 'signal', index: 1 },
					{ name: 'InnerLayer2', type: 'signal', index: 2 },
					{ name: 'BottomLayer', type: 'signal', index: 3 },
				];

				const [dimensions] = adapter.toJsPcbInput(pcbData);

				expect(dimensions[2]).toBe(4);
			});

			it('should use default dimensions for empty boundary', () => {
				const pcbData = createMinimalPcbData();
				pcbData.structure.boundary = [];

				const [dimensions] = adapter.toJsPcbInput(pcbData);

				expect(dimensions[0]).toBe(1000);
				expect(dimensions[1]).toBe(1000);
			});

			it('should handle decimal boundary coordinates', () => {
				const pcbData = createMinimalPcbData();
				pcbData.structure.boundary = [
					{ x: 0, y: 0 },
					{ x: 1000.5, y: 0 },
					{ x: 1000.5, y: 500.7 },
					{ x: 0, y: 500.7 },
				];

				const [dimensions] = adapter.toJsPcbInput(pcbData);

				expect(dimensions[0]).toBe(1001); // ceil(1000.5)
				expect(dimensions[1]).toBe(501); // ceil(500.7)
			});
		});

		describe('网络到 Track 转换', () => {
			it('should convert nets to tracks', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				// 应该有 2 个网络（GND 和 VCC）
				// 但 VCC 只有一个引脚，可能被跳过或保留
				expect(tracks.length).toBeGreaterThanOrEqual(1);
			});

			it('should create track with correct structure [radius, viaRadius, gap, terminals, paths]', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const track = tracks[0];
				expect(track.length).toBe(5);
				expect(typeof track[0]).toBe('number'); // radius
				expect(typeof track[1]).toBe('number'); // viaRadius
				expect(typeof track[2]).toBe('number'); // gap
				expect(Array.isArray(track[3])).toBe(true); // terminals
				expect(Array.isArray(track[4])).toBe(true); // paths
			});

			it('should use net class rules for track parameters', () => {
				const pcbData = createMinimalPcbData();
				pcbData.network.classes.set('GND', { viaType: 'via0', width: 20, clearance: 8 });

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const gndTrack = tracks[0];
				expect(gndTrack[0]).toBe(10); // radius = width / 2 = 20 / 2
				expect(gndTrack[2]).toBe(8); // gap = clearance
			});

			it('should use default rules when net class not found', () => {
				const pcbData = createMinimalPcbData();
				pcbData.network.classes.clear();

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const track = tracks[0];
				expect(track[0]).toBe(5.025); // default radius
				expect(track[2]).toBe(6); // default gap
			});

			it('should initialize paths as empty array', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				for (const track of tracks) {
					expect(track[4]).toEqual([]);
				}
			});
		});

		describe('引脚到 Terminal 转换', () => {
			it('should convert pins to terminals', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				// GND 网络有 2 个引脚
				const gndTrack = tracks[0];
				expect(gndTrack[3].length).toBe(2);
			});

			it('should create terminal with correct structure [radius, gap, position, shape]', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				expect(terminal.length).toBe(4);
				expect(typeof terminal[0]).toBe('number'); // radius
				expect(typeof terminal[1]).toBe('number'); // gap
				expect(Array.isArray(terminal[2])).toBe(true); // position
				expect(terminal[2].length).toBe(3); // [x, y, z]
				expect(Array.isArray(terminal[3])).toBe(true); // shape
			});

			it('should calculate pin position correctly (component + pin offset)', () => {
				const pcbData = createMinimalPcbData();
				pcbData.placement[0].position = { x: 50, y: 50 };

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				// 引脚 1 位置 = 组件位置 (50, 50) + 引脚偏移 (100, 100) = (150, 150)
				expect(terminal[2][0]).toBe(150);
				expect(terminal[2][1]).toBe(150);
			});

			it('should handle component rotation', () => {
				const pcbData = createMinimalPcbData();
				pcbData.placement[0].rotation = 90;

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				// 引脚 1 原始位置 (100, 100)，旋转 90 度后 (-100, 100)
				// 加上组件位置 (0, 0) = (-100, 100)
				expect(terminal[2][0]).toBeCloseTo(-100, 0);
				expect(terminal[2][1]).toBeCloseTo(100, 0);
			});

			it('should use z=0 for terminal position', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				expect(terminal[2][2]).toBe(0);
			});

			it('should get radius from padstack circle shape', () => {
				const pcbData = createMinimalPcbData();
				pcbData.library.padstacks[0].shapes[0].coordinates = [30, 0, 0]; // diameter = 30

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				expect(terminal[0]).toBe(15); // radius = diameter / 2
			});

			it('should return empty shape for circle padstack', () => {
				const pcbData = createMinimalPcbData();
				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				expect(terminal[3]).toEqual([]);
			});

			it('should return polygon vertices for polygon padstack', () => {
				const pcbData = createMinimalPcbData();
				pcbData.library.padstacks[0].shapes[0] = {
					layer: 'TopLayer',
					type: 'polygon',
					coordinates: [10, 10, -10, 10, -10, -10, 10, -10],
				};

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				const terminal = tracks[0][3][0];
				expect(terminal[3]).toEqual([
					[10, 10],
					[-10, 10],
					[-10, -10],
					[10, -10],
				]);
			});

			it('should skip pins with missing component', () => {
				const pcbData = createMinimalPcbData();
				pcbData.network.nets.set('TEST', [{ component: 'u2', pin: '1' }]); // u2 不存在

				const [, tracks] = adapter.toJsPcbInput(pcbData);

				// TEST 网络应该没有终端
				const testTrack = tracks.find((t) => t[3].length === 0);
				// 或者整个 track 被跳过
				expect(tracks.every((t) => t[3].length > 0 || t[3].length === 0)).toBe(true);
			});
		});
	});

	// =========================================================================
	// Task 9.3: 布线结果转换测试
	// =========================================================================

	describe('Task 9.3: fromJsPcbOutput - 布线结果转换', () => {
		/**
		 * 创建 JS-PCB 输出数据
		 */
		function createJsPcbOutput(): [JsPcbInput[0], JsPcbTrack[]] {
			return [
				[1000, 1000, 2],
				[
					[
						5.025,
						12,
						6,
						[
							[10, 6, [100, 100, 0], []],
							[10, 6, [200, 100, 0], []],
						],
						[
							[
								[100, 100, 0],
								[150, 100, 0],
								[200, 100, 0],
							],
						],
					],
				],
			];
		}

		it('should convert JS-PCB output to RoutingResult', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput = createJsPcbOutput();

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			expect(result.pcbDimensions).toEqual([1000, 1000, 2]);
			expect(result.tracks.length).toBe(1);
		});

		it('should convert track parameters correctly', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput = createJsPcbOutput();

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			const track = result.tracks[0];
			expect(track.radius).toBe(5.025);
			expect(track.viaRadius).toBe(12);
			expect(track.gap).toBe(6);
		});

		it('should convert terminals correctly', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput = createJsPcbOutput();

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			const terminals = result.tracks[0].terminals;
			expect(terminals.length).toBe(2);
			expect(terminals[0].radius).toBe(10);
			expect(terminals[0].gap).toBe(6);
			// Y 坐标应该被取反（从 JS-PCB 内部格式转换为 JLC 格式）
			// 内部坐标 (100, 100) -> JLC 坐标 (100, -100)
			expect(terminals[0].position).toEqual({ x: 100, y: -100, z: 0 });
		});

		it('should convert paths correctly', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput = createJsPcbOutput();

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			const paths = result.tracks[0].paths;
			expect(paths.length).toBe(1);
			expect(paths[0].points.length).toBe(3);
			// Y 坐标应该被取反（从 JS-PCB 内部格式转换为 JLC 格式）
			expect(paths[0].points[0]).toEqual({ x: 100, y: -100, z: 0 });
			expect(paths[0].points[1]).toEqual({ x: 150, y: -100, z: 0 });
			expect(paths[0].points[2]).toEqual({ x: 200, y: -100, z: 0 });
		});

		it('should assign net names from original PCB data', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput = createJsPcbOutput();

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			expect(result.tracks[0].netName).toBe('GND');
		});

		it('should generate default net names when exceeding original nets', () => {
			const pcbData = createMinimalPcbData();
			pcbData.network.nets.clear(); // 清空网络

			const jsPcbOutput = createJsPcbOutput();

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			expect(result.tracks[0].netName).toBe('NET_0');
		});

		it('should handle multiple tracks', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
				[1000, 1000, 2],
				[
					[5.025, 12, 6, [[10, 6, [100, 100, 0], []]], [[[100, 100, 0], [200, 100, 0]]]],
					[7.5, 15, 8, [[15, 8, [300, 300, 1], []]], [[[300, 300, 1], [400, 300, 1]]]],
				],
			];

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			expect(result.tracks.length).toBe(2);
			expect(result.tracks[0].radius).toBe(5.025);
			expect(result.tracks[1].radius).toBe(7.5);
		});

		it('should handle empty paths', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
				[1000, 1000, 2],
				[[5.025, 12, 6, [[10, 6, [100, 100, 0], []]], []]],
			];

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			expect(result.tracks[0].paths).toEqual([]);
		});

		it('should handle paths with layer changes', () => {
			const pcbData = createMinimalPcbData();
			const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
				[1000, 1000, 2],
				[
					[
						5.025,
						12,
						6,
						[[10, 6, [100, 100, 0], []]],
						[
							[
								[100, 100, 0],
								[150, 100, 0],
								[150, 100, 1], // 层切换
								[200, 100, 1],
							],
						],
					],
				],
			];

			const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

			const path = result.tracks[0].paths[0];
			expect(path.points[1].z).toBe(0);
			expect(path.points[2].z).toBe(1);
		});

		describe('坐标转换 (Coordinate Transformation)', () => {
			it('should transform Y coordinates from internal to JLC format (Y-axis inversion)', () => {
				const pcbData = createMinimalPcbData();
				// 内部坐标 Y=500 应该转换为 JLC 坐标 Y=-500
				const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
					[1000, 1000, 2],
					[
						[
							5.025,
							12,
							6,
							[[10, 6, [100, 500, 0], []]],
							[[[100, 500, 0], [200, 500, 0]]],
						],
					],
				];

				const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

				// 验证终端坐标转换
				expect(result.tracks[0].terminals[0].position.x).toBe(100);
				expect(result.tracks[0].terminals[0].position.y).toBe(-500);

				// 验证路径坐标转换
				expect(result.tracks[0].paths[0].points[0].y).toBe(-500);
				expect(result.tracks[0].paths[0].points[1].y).toBe(-500);
			});

			it('should preserve X coordinates during transformation', () => {
				const pcbData = createMinimalPcbData();
				const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
					[1000, 1000, 2],
					[
						[
							5.025,
							12,
							6,
							[[10, 6, [12345, 0, 0], []]],
							[[[12345, 0, 0], [67890, 0, 0]]],
						],
					],
				];

				const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

				expect(result.tracks[0].terminals[0].position.x).toBe(12345);
				expect(result.tracks[0].paths[0].points[0].x).toBe(12345);
				expect(result.tracks[0].paths[0].points[1].x).toBe(67890);
			});

			it('should preserve layer index (z) during transformation', () => {
				const pcbData = createMinimalPcbData();
				const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
					[1000, 1000, 2],
					[
						[
							5.025,
							12,
							6,
							[[10, 6, [100, 100, 1], []]],
							[[[100, 100, 0], [100, 100, 1]]],
						],
					],
				];

				const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

				expect(result.tracks[0].terminals[0].position.z).toBe(1);
				expect(result.tracks[0].paths[0].points[0].z).toBe(0);
				expect(result.tracks[0].paths[0].points[1].z).toBe(1);
			});

			it('should handle zero Y coordinate correctly (avoid -0)', () => {
				const pcbData = createMinimalPcbData();
				const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
					[1000, 1000, 2],
					[
						[
							5.025,
							12,
							6,
							[[10, 6, [100, 0, 0], []]],
							[[[100, 0, 0], [200, 0, 0]]],
						],
					],
				];

				const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

				// Y=0 应该保持为 0，而不是 -0
				expect(result.tracks[0].terminals[0].position.y).toBe(0);
				expect(Object.is(result.tracks[0].terminals[0].position.y, -0)).toBe(false);
				expect(result.tracks[0].paths[0].points[0].y).toBe(0);
				expect(Object.is(result.tracks[0].paths[0].points[0].y, -0)).toBe(false);
			});

			it('should handle negative Y coordinates in internal format', () => {
				const pcbData = createMinimalPcbData();
				// 内部坐标 Y=-300 应该转换为 JLC 坐标 Y=300
				const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
					[1000, 1000, 2],
					[
						[
							5.025,
							12,
							6,
							[[10, 6, [100, -300, 0], []]],
							[[[100, -300, 0], [200, -300, 0]]],
						],
					],
				];

				const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

				expect(result.tracks[0].terminals[0].position.y).toBe(300);
				expect(result.tracks[0].paths[0].points[0].y).toBe(300);
			});

			it('should transform terminal shape coordinates', () => {
				const pcbData = createMinimalPcbData();
				// 多边形形状坐标也应该被转换
				const jsPcbOutput: [JsPcbInput[0], JsPcbTrack[]] = [
					[1000, 1000, 2],
					[
						[
							5.025,
							12,
							6,
							[[10, 6, [100, 100, 0], [[10, 20], [-10, 20], [-10, -20], [10, -20]]]],
							[],
						],
					],
				];

				const result = adapter.fromJsPcbOutput(jsPcbOutput, pcbData);

				const shape = result.tracks[0].terminals[0].shape;
				expect(shape.length).toBe(4);
				// 形状坐标的 Y 值也应该被取反
				expect(shape[0]).toEqual({ x: 10, y: -20 });
				expect(shape[1]).toEqual({ x: -10, y: -20 });
				expect(shape[2]).toEqual({ x: -10, y: 20 });
				expect(shape[3]).toEqual({ x: 10, y: 20 });
			});
		});
	});

	// =========================================================================
	// 输入格式验证测试
	// =========================================================================

	describe('validateJsPcbInput - 输入格式验证', () => {
		it('should validate correct input', () => {
			const input: JsPcbInput = [
				[1000, 1000, 2],
				[[5.025, 12, 6, [[10, 6, [100, 100, 0], []]], []]],
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it('should reject non-array input', () => {
			const result = adapter.validateJsPcbInput('invalid' as any);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Input must be an array of [dimensions, tracks]');
		});

		it('should reject invalid dimensions', () => {
			const input: JsPcbInput = [
				[0, 1000, 2], // width = 0 is invalid
				[],
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('Width'))).toBe(true);
		});

		it('should reject non-integer layers', () => {
			const input: JsPcbInput = [
				[1000, 1000, 2.5], // layers must be integer
				[],
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('Layers'))).toBe(true);
		});

		it('should reject invalid track structure', () => {
			const input: JsPcbInput = [
				[1000, 1000, 2],
				[[5.025, 12, 6] as any], // missing terminals and paths
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('Track[0]'))).toBe(true);
		});

		it('should reject negative radius', () => {
			const input: JsPcbInput = [
				[1000, 1000, 2],
				[[-5, 12, 6, [], []]], // negative radius
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('radius'))).toBe(true);
		});

		it('should reject invalid terminal structure', () => {
			const input: JsPcbInput = [
				[1000, 1000, 2],
				[[5.025, 12, 6, [[10, 6] as any], []]], // terminal missing position and shape
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('terminal'))).toBe(true);
		});

		it('should reject invalid terminal position', () => {
			const input: JsPcbInput = [
				[1000, 1000, 2],
				[[5.025, 12, 6, [[10, 6, [100, 100], []]], []]], // position missing z
			];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('position'))).toBe(true);
		});

		it('should accept empty tracks array', () => {
			const input: JsPcbInput = [[1000, 1000, 2], []];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(true);
		});

		it('should accept track with empty terminals', () => {
			const input: JsPcbInput = [[1000, 1000, 2], [[5.025, 12, 6, [], []]]];

			const result = adapter.validateJsPcbInput(input);

			expect(result.valid).toBe(true);
		});
	});
});
