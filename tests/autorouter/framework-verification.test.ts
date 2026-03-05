/**
 * 测试框架验证
 *
 * 验证 Jest 和 fast-check 测试框架配置正确。
 * 此文件用于确认测试基础设施正常工作。
 */

import * as fc from 'fast-check';

describe('Test Framework Verification', () => {
	describe('Jest', () => {
		it('should run basic assertions', () => {
			expect(1 + 1).toBe(2);
			expect('hello').toContain('ell');
			expect([1, 2, 3]).toHaveLength(3);
		});

		it('should support async tests', async () => {
			const result = await Promise.resolve(42);
			expect(result).toBe(42);
		});

		it('should support TypeScript types', () => {
			interface TestType {
				name: string;
				value: number;
			}
			const obj: TestType = { name: 'test', value: 123 };
			expect(obj.name).toBe('test');
			expect(obj.value).toBe(123);
		});
	});

	describe('fast-check', () => {
		it('should run property-based tests with integers', () => {
			fc.assert(
				fc.property(fc.integer(), fc.integer(), (a, b) => {
					// 加法交换律
					return a + b === b + a;
				}),
				{ numRuns: 100 },
			);
		});

		it('should run property-based tests with floats', () => {
			fc.assert(
				fc.property(
					fc.float({ min: -1e6, max: 1e6, noNaN: true }),
					fc.float({ min: -1e6, max: 1e6, noNaN: true }),
					(a, b) => {
						// 加法交换律（浮点数）
						return Math.abs(a + b - (b + a)) < 1e-10;
					},
				),
				{ numRuns: 100 },
			);
		});

		it('should run property-based tests with strings', () => {
			fc.assert(
				fc.property(fc.string(), (s) => {
					// 字符串长度非负
					return s.length >= 0;
				}),
				{ numRuns: 100 },
			);
		});

		it('should run property-based tests with arrays', () => {
			fc.assert(
				fc.property(fc.array(fc.integer()), (arr) => {
					// 数组反转两次等于原数组
					const reversed = [...arr].reverse().reverse();
					return arr.length === reversed.length && arr.every((v, i) => v === reversed[i]);
				}),
				{ numRuns: 100 },
			);
		});

		it('should support custom arbitraries', () => {
			// 自定义生成器：生成坐标点
			const pointArb = fc.record({
				x: fc.float({ min: -1e9, max: 1e9, noNaN: true }),
				y: fc.float({ min: -1e9, max: 1e9, noNaN: true }),
			});

			fc.assert(
				fc.property(pointArb, (point) => {
					// 验证点的属性
					return typeof point.x === 'number' && typeof point.y === 'number';
				}),
				{ numRuns: 100 },
			);
		});
	});
});
