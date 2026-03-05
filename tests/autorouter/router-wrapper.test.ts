/**
 * 布线引擎封装测试
 *
 * 测试 RouterWrapper 类的参数配置和进度回调功能。
 */

import {
	RouterWrapper,
	RoutingConfig,
	RoutingProgress,
	DEFAULT_ROUTING_CONFIG,
} from '../../src/autorouter/router-wrapper';
import type { ParsedPcbData, Resolution, NetworkDefinition } from '../../src/autorouter/types';

describe('RouterWrapper', () => {
	let wrapper: RouterWrapper;

	beforeEach(() => {
		wrapper = new RouterWrapper();
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
				nets: new Map([['GND', [{ component: 'u1', pin: '1' }, { component: 'u1', pin: '2' }]]]),
				classes: new Map(),
			} as NetworkDefinition,
		};
	}

	// =========================================================================
	// Task 9.2: 封装布线调用接口测试
	// =========================================================================

	describe('Task 9.2: 参数配置', () => {
		describe('默认配置', () => {
			it('should use default config when no config provided', () => {
				const config = wrapper.getConfig();

				expect(config.timeout).toBe(DEFAULT_ROUTING_CONFIG.timeout);
				expect(config.viaCost).toBe(DEFAULT_ROUTING_CONFIG.viaCost);
				expect(config.resolution).toBe(DEFAULT_ROUTING_CONFIG.resolution);
				expect(config.quantization).toBe(DEFAULT_ROUTING_CONFIG.quantization);
				expect(config.samples).toBe(DEFAULT_ROUTING_CONFIG.samples);
			});

			it('should have sensible default values', () => {
				expect(DEFAULT_ROUTING_CONFIG.timeout).toBeGreaterThan(0);
				expect(DEFAULT_ROUTING_CONFIG.viaCost).toBeGreaterThanOrEqual(0);
				expect(DEFAULT_ROUTING_CONFIG.resolution).toBeGreaterThan(0);
				expect(DEFAULT_ROUTING_CONFIG.quantization).toBeGreaterThan(0);
				expect(DEFAULT_ROUTING_CONFIG.samples).toBeGreaterThan(0);
			});
		});

		describe('自定义配置', () => {
			it('should accept partial config in constructor', () => {
				const customWrapper = new RouterWrapper({ timeout: 300, viaCost: 50 });
				const config = customWrapper.getConfig();

				expect(config.timeout).toBe(300);
				expect(config.viaCost).toBe(50);
				// 其他值应该是默认值
				expect(config.resolution).toBe(DEFAULT_ROUTING_CONFIG.resolution);
			});

			it('should update config with setConfig', () => {
				wrapper.setConfig({ timeout: 120 });
				const config = wrapper.getConfig();

				expect(config.timeout).toBe(120);
			});

			it('should preserve existing config when updating', () => {
				wrapper.setConfig({ timeout: 120 });
				wrapper.setConfig({ viaCost: 200 });
				const config = wrapper.getConfig();

				expect(config.timeout).toBe(120);
				expect(config.viaCost).toBe(200);
			});

			it('should return a copy of config (not reference)', () => {
				const config1 = wrapper.getConfig();
				config1.timeout = 999;
				const config2 = wrapper.getConfig();

				expect(config2.timeout).toBe(DEFAULT_ROUTING_CONFIG.timeout);
			});
		});

		describe('配置验证', () => {
			it('should validate valid config', () => {
				const result = RouterWrapper.validateConfig({
					timeout: 300,
					viaCost: 100,
					resolution: 1,
					quantization: 1,
					samples: 5,
				});

				expect(result.valid).toBe(true);
				expect(result.errors).toEqual([]);
			});

			it('should reject negative timeout', () => {
				const result = RouterWrapper.validateConfig({ timeout: -1 });

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.includes('timeout'))).toBe(true);
			});

			it('should reject zero timeout', () => {
				const result = RouterWrapper.validateConfig({ timeout: 0 });

				expect(result.valid).toBe(false);
			});

			it('should reject negative viaCost', () => {
				const result = RouterWrapper.validateConfig({ viaCost: -1 });

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.includes('viaCost'))).toBe(true);
			});

			it('should accept zero viaCost', () => {
				const result = RouterWrapper.validateConfig({ viaCost: 0 });

				expect(result.valid).toBe(true);
			});

			it('should reject non-positive resolution', () => {
				const result = RouterWrapper.validateConfig({ resolution: 0 });

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.includes('resolution'))).toBe(true);
			});

			it('should reject non-integer samples', () => {
				const result = RouterWrapper.validateConfig({ samples: 1.5 });

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.includes('samples'))).toBe(true);
			});

			it('should reject invalid verbosity', () => {
				const result = RouterWrapper.validateConfig({ verbosity: 3 });

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.includes('verbosity'))).toBe(true);
			});

			it('should reject invalid distanceFunction', () => {
				const result = RouterWrapper.validateConfig({ distanceFunction: 5 });

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.includes('distanceFunction'))).toBe(true);
			});

			it('should collect multiple errors', () => {
				const result = RouterWrapper.validateConfig({
					timeout: -1,
					viaCost: -1,
					samples: 0,
				});

				expect(result.valid).toBe(false);
				expect(result.errors.length).toBeGreaterThanOrEqual(3);
			});
		});
	});

	describe('Task 9.2: 状态管理', () => {
		it('should start in idle state', () => {
			expect(wrapper.getState()).toBe('idle');
		});

		it('should reset to idle state', () => {
			wrapper.reset();
			expect(wrapper.getState()).toBe('idle');
		});
	});

	describe('Task 9.2: 进度回调', () => {
		it('should accept progress callback', () => {
			const callback = jest.fn();
			wrapper.onProgress(callback);

			// 回调应该被设置（内部状态）
			expect(callback).not.toHaveBeenCalled();
		});

		it('should call progress callback during routing', async () => {
			const progressUpdates: RoutingProgress[] = [];
			wrapper.onProgress((progress) => {
				progressUpdates.push({ ...progress });
			});

			const pcbData = createMinimalPcbData();
			await wrapper.route(pcbData);

			// 应该至少有开始和完成两次回调
			expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
		});

		it('should report progress with correct structure', async () => {
			let lastProgress: RoutingProgress | null = null;
			wrapper.onProgress((progress) => {
				lastProgress = progress;
			});

			const pcbData = createMinimalPcbData();
			await wrapper.route(pcbData);

			expect(lastProgress).not.toBeNull();
			expect(lastProgress!.state).toBe('complete');
			expect(lastProgress!.progress).toBe(100);
			expect(typeof lastProgress!.currentIteration).toBe('number');
			expect(typeof lastProgress!.totalIterations).toBe('number');
		});

		it('should report initial progress as 0', async () => {
			let firstProgress: RoutingProgress | null = null;
			wrapper.onProgress((progress) => {
				if (firstProgress === null) {
					firstProgress = { ...progress };
				}
			});

			const pcbData = createMinimalPcbData();
			await wrapper.route(pcbData);

			expect(firstProgress).not.toBeNull();
			expect(firstProgress!.progress).toBe(0);
			expect(firstProgress!.state).toBe('routing');
		});
	});

	describe('Task 9.2: 布线执行', () => {
		it('should execute routing and return result', async () => {
			const pcbData = createMinimalPcbData();
			const result = await wrapper.route(pcbData);

			expect(result).toBeDefined();
			expect(result.pcbDimensions).toBeDefined();
			expect(result.tracks).toBeDefined();
		});

		it('should return result with correct dimensions', async () => {
			const pcbData = createMinimalPcbData();
			const result = await wrapper.route(pcbData);

			expect(result.pcbDimensions[0]).toBe(1000);
			expect(result.pcbDimensions[1]).toBe(1000);
			expect(result.pcbDimensions[2]).toBe(2);
		});

		it('should throw error when routing already in progress', async () => {
			const pcbData = createMinimalPcbData();

			// 开始第一次布线
			const firstRoute = wrapper.route(pcbData);

			// 尝试开始第二次布线应该抛出错误
			await expect(wrapper.route(pcbData)).rejects.toThrow('Routing already in progress');

			// 等待第一次完成
			await firstRoute;
		});

		it('should update state to complete after routing', async () => {
			const pcbData = createMinimalPcbData();
			await wrapper.route(pcbData);

			expect(wrapper.getState()).toBe('complete');
		});

		it('should handle empty network', async () => {
			const pcbData = createMinimalPcbData();
			pcbData.network.nets.clear();

			const result = await wrapper.route(pcbData);

			expect(result.tracks).toEqual([]);
		});
	});

	describe('Task 9.2: 取消布线', () => {
		it('should cancel routing', () => {
			wrapper.cancel();
			expect(wrapper.getState()).toBe('cancelled');
		});

		it('should notify progress on cancel', () => {
			let lastProgress: RoutingProgress | null = null;
			wrapper.onProgress((progress) => {
				lastProgress = progress;
			});

			wrapper.cancel();

			expect(lastProgress).not.toBeNull();
			expect(lastProgress!.state).toBe('cancelled');
		});

		it('should reset state after cancel and reset', () => {
			wrapper.cancel();
			wrapper.reset();

			expect(wrapper.getState()).toBe('idle');
		});
	});

	describe('边界情况', () => {
		it('should handle PCB with no pins', async () => {
			const pcbData = createMinimalPcbData();
			pcbData.library.images[0].pins = [];

			const result = await wrapper.route(pcbData);

			expect(result).toBeDefined();
		});

		it('should handle PCB with single pin net', async () => {
			const pcbData = createMinimalPcbData();
			pcbData.network.nets.set('SINGLE', [{ component: 'u1', pin: '1' }]);

			const result = await wrapper.route(pcbData);

			expect(result).toBeDefined();
		});

		it('should handle custom config during routing', async () => {
			const customWrapper = new RouterWrapper({
				timeout: 60,
				samples: 2,
				verbosity: 0,
			});

			const pcbData = createMinimalPcbData();
			const result = await customWrapper.route(pcbData);

			expect(result).toBeDefined();
		});
	});
});
