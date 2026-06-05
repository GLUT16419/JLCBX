'use strict';

var js_pcb = js_pcb || {};
(function () {
	Array.prototype.shuffle = function () {
		let i = this.length,
			j,
			temp;
		if (i === 0) return;
		while (--i) {
			j = Math.floor(Math.random() * (i + 1));
			temp = this[i];
			this[i] = this[j];
			this[j] = temp;
		}
	};

	Array.prototype.move = function (old_index, new_index) {
		this.splice(new_index, 0, this.splice(old_index, 1)[0]);
	};

	const spacial_hash_res = 0.75;

	//aabb of terminals
	function aabb_terminals(terms, quantization) {
		let minx = (Math.trunc(terms[0][2][0]) / quantization) * quantization;
		let miny = (Math.trunc(terms[0][2][1]) / quantization) * quantization;
		let maxx = ((Math.trunc(terms[0][2][0]) + (quantization - 1)) / quantization) * quantization;
		let maxy = ((Math.trunc(terms[0][2][1]) + (quantization - 1)) / quantization) * quantization;
		for (let i = 1; i < terms.length; ++i) {
			let tminx = (Math.trunc(terms[i][2][0]) / quantization) * quantization;
			let tminy = (Math.trunc(terms[i][2][1]) / quantization) * quantization;
			let tmaxx = ((Math.trunc(terms[i][2][0]) + (quantization - 1)) / quantization) * quantization;
			let tmaxy = ((Math.trunc(terms[i][2][1]) + (quantization - 1)) / quantization) * quantization;
			minx = Math.min(tminx, minx);
			miny = Math.min(tminy, miny);
			maxx = Math.max(tmaxx, maxx);
			maxy = Math.max(tmaxy, maxy);
		}
		return [(maxx - minx) * (maxy - miny), [minx, miny, maxx, maxy]];
	}

	//set class
	class NodeSet {
		constructor(init) {
			if (init === undefined) this._data = new Map();
			else this._data = new Map(init._data.entries());
			this.size = this._data.size;
		}

		add(n) {
			let k = n.toString();
			if (!this._data.has(k)) {
				this._data.set(k, n);
				this.size += 1;
			}
		}

		has(n) {
			return this._data.has(n.toString());
		}

		[Symbol.iterator]() {
			return this._data.values();
		}
	}

	//优先级队列 - 用于A*算法
	class PriorityQueue {
		constructor() {
			this.elements = [];
		}

		enqueue(priority, item) {
			this.elements.push({ priority, item });
			this.elements.sort((a, b) => a.priority - b.priority);
		}

		dequeue() {
			return this.elements.shift().item;
		}

		isEmpty() {
			return this.elements.length === 0;
		}
	}

	//pcb class
	class Pcb {
		constructor(dims, rfvs, rpvs, dfunc, res, verb, quant, viascost) {
			let w, h, d;
			[w, h, d] = dims;
			this.m_width = w * res;
			this.m_height = h * res;
			this.m_stride = this.m_width * this.m_height;
			this.m_depth = d;
			this.m_routing_flood_vectors = rfvs;
			this.m_routing_path_vectors = rpvs;
			this.m_dfunc = dfunc;
			this.m_resolution = res;
			this.m_verbosity = verb;
			this.m_quantization = quant * res;
			this.m_viascost = viascost * res;
			this.m_layers = new js_pcb.Layers([Math.trunc(w * spacial_hash_res), Math.trunc(h * spacial_hash_res), d], spacial_hash_res / res);
			this.m_deform = new Map();
			this.m_netlist = [];
			this.m_nodes = new Uint32Array(this.m_stride * this.m_depth);
			this.m_via_vectors = [
				[
					[0, 0, -1],
					[0, 0, 1],
				],
				[
					[0, 0, -1],
					[0, 0, 1],
				],
			];
		}

		// 获取PCB复杂度等级
		getComplexityLevel() {
			const netCount = this.m_netlist ? this.m_netlist.length : 0;
			const totalPins = this.m_netlist.reduce((sum, net) => sum + (net.m_terminals ? net.m_terminals.length : 0), 0);
			const area = this.m_width * this.m_height;

			// 简单板子
			if (netCount <= 20 && totalPins <= 100) {
				return 'simple';
			}
			// 中等复杂度
			if (netCount <= 100 && totalPins <= 500) {
				return 'medium';
			}
			// 高复杂度
			return 'complex';
		}

		// 获取自适应参数
		getAdaptiveParams(level) {
			const params = {
				clearance: 1.0, // 清除间距倍数
				viaCost: 1.0, // 过孔代价倍数
				searchLimit: 1.0, // 搜索范围限制
			};

			if (level === 'simple') {
				// 简单板子：宽松设置，追求速度
				params.clearance = 1.2; // 较大间距，更容易布线
				params.viaCost = 0.8; // 较低过孔代价，允许更多过孔
				params.searchLimit = 2.0; // 无限制
			} else if (level === 'medium') {
				// 中等复杂度：平衡设置
				params.clearance = 1.0;
				params.viaCost = 1.0;
				params.searchLimit = 1.5;
			} else {
				// 复杂板子：严格设置，追求质量
				params.clearance = 0.9; // 较小间距
				params.viaCost = 1.3; // 较高过孔代价，减少过孔
				params.searchLimit = 1.0; // 严格限制
			}

			return params;
		}

		// 获取布线阶段参数
		getRoutingStageParams(stage, level) {
			const baseParams = this.getAdaptiveParams(level);

			if (stage === 'early') {
				// 初期：宽松设置，快速完成
				return {
					clearance: baseParams.clearance * 1.2,
					viaCost: baseParams.viaCost * 0.7,
					searchLimit: baseParams.searchLimit * 2.0,
				};
			} else if (stage === 'middle') {
				// 中期：平衡设置
				return {
					clearance: baseParams.clearance,
					viaCost: baseParams.viaCost,
					searchLimit: baseParams.searchLimit,
				};
			} else {
				// 后期：严格设置
				return {
					clearance: baseParams.clearance * 0.9,
					viaCost: baseParams.viaCost * 1.2,
					searchLimit: baseParams.searchLimit * 0.8,
				};
			}
		}

		// 评估布线成功率
		evaluateSuccessRate() {
			if (!this.m_netlist || this.m_netlist.length === 0) return 1.0;

			let successCount = 0;
			for (let net of this.m_netlist) {
				if (net.m_paths && net.m_paths.length > 0) {
					successCount++;
				}
			}

			return successCount / this.m_netlist.length;
		}

		// 估算剩余布线难度
		estimateRemainingDifficulty() {
			if (!this.m_netlist) return 0;

			let difficulty = 0;
			for (let net of this.m_netlist) {
				if (!net.m_paths || net.m_paths.length === 0) {
					difficulty += net.m_area || 0;
				}
			}

			return difficulty;
		}

		// 智能调整参数
		adjustParameters(dynamic = true) {
			const level = this.getComplexityLevel();
			const successRate = this.evaluateSuccessRate();
			const remainingDifficulty = this.estimateRemainingDifficulty();

			// 确定布线阶段
			let stage = 'middle';
			if (successRate < 0.3) {
				stage = 'early'; // 初期：需要更宽松的设置
			} else if (successRate > 0.8 && remainingDifficulty < 1000) {
				stage = 'late'; // 后期：可以更严格
			}

			// 获取阶段参数
			const params = this.getRoutingStageParams(stage, level);

			if (this.m_verbosity >= 1) {
				console.log('[PCB] Complexity: ' + level + ', Stage: ' + stage + ', Success: ' + (successRate * 100).toFixed(1) + '%');
				console.log('[PCB] Params - Clearance: ' + params.clearance.toFixed(2) + ', ViaCost: ' + params.viaCost.toFixed(2));
			}

			return params;
		}

		// 策略配置
		m_strategy = 'balanced'; // 默认策略

		// 设置布线策略
		set_strategy(strategy) {
			this.m_strategy = strategy;
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 布线策略已设置为: ' + strategy);
			}
			// 根据策略调整参数
			this._applyStrategyParams();
		}

		// 策略参数配置
		_getStrategyConfigs() {
			return {
				'conservative': {
					name: '保守策略',
					clearance: 1.3,
					viaCost: 0.7,
					preferTop: true,
					avoidInner: false,
					description: '严格遵守间距，优先使用顶层',
				},
				'aggressive': {
					name: '激进策略',
					clearance: 0.8,
					viaCost: 1.5,
					preferTop: false,
					preferBottom: true,
					description: '宽松间距，优先使用底层',
				},
				'balanced': {
					name: '平衡策略',
					clearance: 1.0,
					viaCost: 1.0,
					description: '平衡过孔使用和线长',
				},
				'area-priority': {
					name: '面积优先',
					clearance: 1.0,
					viaCost: 0.5,
					description: '优先使用自由区域，灵活使用过孔',
				},
				'shortest-path': {
					name: '最短路径',
					clearance: 1.0,
					viaCost: 2.0,
					description: '纯粹追求线长最短，避免过孔',
				},
			};
		}

		// 应用策略参数
		_applyStrategyParams() {
			const configs = this._getStrategyConfigs();
			const config = configs[this.m_strategy] || configs['balanced'];

			// 记录原始值以便恢复
			if (!this._originalViaCost) {
				this._originalViaCost = this.m_via_cost;
			}

			// 调整参数
			if (config.viaCost) {
				this.m_via_cost = Math.round(this._originalViaCost * config.viaCost);
			}

			if (this.m_verbosity >= 1) {
				console.log('[PCB] 应用 ' + config.name + ' 参数:');
				console.log('[PCB]   - 清除间距: ' + (config.clearance * 100).toFixed(0) + '%');
				console.log('[PCB]   - 过孔代价: ' + this.m_via_cost);
			}
		}

		// ==================== 全局重排与推挤优化 ====================

		// 全局优化：执行滑动窗口优化、拥挤区域推挤、整体松弛
		globalOptimization() {
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 开始全局优化...');
			}

			let totalImprovement = 0;
			const startCost = this.cost();

			// 1. 滑动窗口优化
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 执行滑动窗口优化...');
			}
			const windowImprovement = this.slidingWindowOptimization();
			totalImprovement += windowImprovement;
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 滑动窗口优化完成，改进: ' + windowImprovement);
			}

			// 2. 拥挤区域推挤
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 执行拥挤区域推挤...');
			}
			const crowdingImprovement = this.crowdingAreaRepush();
			totalImprovement += crowdingImprovement;
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 拥挤区域推挤完成，改进: ' + crowdingImprovement);
			}

			// 3. 整体松弛
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 执行整体松弛...');
			}
			const relaxationImprovement = this.overallRelaxation();
			totalImprovement += relaxationImprovement;
			if (this.m_verbosity >= 1) {
				console.log('[PCB] 整体松弛完成，改进: ' + relaxationImprovement);
			}

			const endCost = this.cost();
			const totalReduction = startCost - endCost;
			const percentReduction = ((totalReduction / startCost) * 100).toFixed(2);

			if (this.m_verbosity >= 1) {
				console.log('[PCB] 全局优化完成!');
				console.log('[PCB]   初始代价: ' + startCost.toFixed(2));
				console.log('[PCB]   最终代价: ' + endCost.toFixed(2));
				console.log('[PCB]   总改进: ' + totalReduction.toFixed(2) + ' (' + percentReduction + '%)');
			}

			return {
				startCost,
				endCost,
				totalReduction,
				percentReduction,
				windowImprovement,
				crowdingImprovement,
				relaxationImprovement,
			};
		}

		// 滑动窗口优化：在局部窗口内重新优化路径
		slidingWindowOptimization() {
			let totalImprovement = 0;
			const windowSize = 50; // 窗口大小（网格单位）
			const stepSize = 25; // 滑动步长

			// 获取所有网络的边界框
			const bounds = this._getNetworkBounds();
			if (!bounds) return 0;

			// 在X方向滑动
			for (let x = bounds.minX; x <= bounds.maxX - windowSize; x += stepSize) {
				totalImprovement += this._optimizeWindow(x, x + windowSize, bounds.minY, bounds.maxY, 'x');
			}

			// 在Y方向滑动
			for (let y = bounds.minY; y <= bounds.maxY - windowSize; y += stepSize) {
				totalImprovement += this._optimizeWindow(bounds.minX, bounds.maxX, y, y + windowSize, 'y');
			}

			return totalImprovement;
		}

		// 优化指定窗口区域
		_optimizeWindow(minX, maxX, minY, maxY, direction) {
			let improvement = 0;
			const affectedNets = [];

			// 找到与窗口相交的所有网络路径
			for (let net of this.m_netlist) {
				if (!net.m_paths || net.m_paths.length === 0) continue;

				let netAffected = false;
				for (let path of net.m_paths) {
					for (let point of path) {
						if (point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY) {
							netAffected = true;
							break;
						}
					}
					if (netAffected) break;
				}

				if (netAffected) {
					affectedNets.push(net);
				}
			}

			// 对受影响的网络进行局部重路由
			for (let net of affectedNets) {
				const beforeCost = this._estimateNetCost(net);
				const optimized = this._localReroute(net, minX, maxX, minY, maxY);
				if (optimized) {
					const afterCost = this._estimateNetCost(net);
					improvement += beforeCost - afterCost;
				}
			}

			return improvement;
		}

		// 估算单个网络的代价
		_estimateNetCost(net) {
			let cost = 0;
			if (!net.m_paths) return 0;

			for (let path of net.m_paths) {
				for (let i = 1; i < path.length; i++) {
					const p1 = path[i - 1];
					const p2 = path[i];
					cost += this._pointDistance(p1, p2);
					// 过孔代价
					if (p1[2] !== p2[2]) {
						cost += this.m_via_cost || 16;
					}
				}
			}
			return cost;
		}

		// 计算两点距离
		_pointDistance(p1, p2) {
			const dx = p2[0] - p1[0];
			const dy = p2[1] - p1[1];
			return Math.sqrt(dx * dx + dy * dy);
		}

		// 局部重路由（在指定区域内）
		_localReroute(net, minX, maxX, minY, maxY) {
			if (!net.m_paths || net.m_paths.length === 0) return false;

			let improved = false;

			for (let pathIndex = 0; pathIndex < net.m_paths.length; pathIndex++) {
				const path = net.m_paths[pathIndex];
				if (path.length < 3) continue;

				// 检查路径是否与窗口相交
				let hasIntersection = false;
				for (let point of path) {
					if (point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY) {
						hasIntersection = true;
						break;
					}
				}

				if (!hasIntersection) continue;

				// 尝试简化路径
				const simplified = this._simplifyPathInWindow(path, minX, maxX, minY, maxY);
				if (simplified.length < path.length) {
					// 更新路径
					net.sub_paths_collision_lines();
					net.m_paths[pathIndex] = simplified;
					net.add_paths_collision_lines();
					improved = true;
				}
			}

			return improved;
		}

		// 在窗口内简化路径
		_simplifyPathInWindow(path, minX, maxX, minY, maxY) {
			if (path.length <= 2) return path;

			let simplified = [path[0]];
			let i = 0;

			while (i < path.length - 1) {
				const current = path[i];
				let bestReach = i + 1;

				// 尝试跳到更远的点
				for (let j = i + 2; j < path.length; j++) {
					const target = path[j];

					// 检查路径段是否与窗口相交
					const intersectsWindow = this._segmentIntersectsWindow(current, target, minX, maxX, minY, maxY);

					if (!intersectsWindow) {
						// 检查是否可以直接连线
						if (current[2] === target[2] && this._canConnectDirectly(current, target)) {
							bestReach = j;
						}
					} else {
						break;
					}
				}

				simplified.push(path[bestReach]);
				i = bestReach;
			}

			return simplified;
		}

		// 检查线段是否与窗口相交
		_segmentIntersectsWindow(p1, p2, minX, maxX, minY, maxY) {
			// 简单检查：两个端点都在窗口外时，检查线段是否穿过窗口
			const p1Inside = p1[0] >= minX && p1[0] <= maxX && p1[1] >= minY && p1[1] <= maxY;
			const p2Inside = p2[0] >= minX && p2[0] <= maxX && p2[1] >= minY && p2[1] <= maxY;

			return p1Inside || p2Inside;
		}

		// 检查是否可以直接连接两点
		_canConnectDirectly(p1, p2) {
			// 检查是否有碰撞
			if (p1[2] !== p2[2]) {
				// 过孔连接，需要检查
				return this.m_layers.hit_line(p1, p2, 0, 0);
			}

			// 创建临时线段检查碰撞
			const l = {
				m_p1: [p1[0], p1[1]],
				m_p2: [p2[0], p2[1]],
				m_radius: 0,
				m_gap: 0,
			};

			// 简化碰撞检测：如果两点相同层且都是直线，直接连接
			return p1[0] === p2[0] || p1[1] === p2[1];
		}

		// 拥挤区域推挤：检测并优化拥挤区域
		crowdingAreaRepush() {
			let totalImprovement = 0;
			const gridSize = 100; // 网格大小
			const densityThreshold = 5; // 密度阈值

			// 统计每个网格的线段密度
			const densityMap = this._calculateDensityMap(gridSize);

			// 找到拥挤区域
			const crowdedAreas = [];
			for (const [key, density] of Object.entries(densityMap)) {
				if (density > densityThreshold) {
					const [x, y] = key.split(',').map(Number);
					crowdedAreas.push({ x, y, density });
				}
			}

			if (this.m_verbosity >= 2) {
				console.log('[PCB] 发现 ' + crowdedAreas.length + ' 个拥挤区域');
			}

			// 对每个拥挤区域进行推挤优化
			for (const area of crowdedAreas) {
				const improvement = this._repushCrowdedArea(area.x, area.y, area.x + gridSize, area.y + gridSize);
				totalImprovement += improvement;
			}

			return totalImprovement;
		}

		// 计算密度图
		_calculateDensityMap(gridSize) {
			const densityMap = {};

			for (let net of this.m_netlist) {
				if (!net.m_paths) continue;

				for (let path of net.m_paths) {
					for (let i = 1; i < path.length; i++) {
						const p = path[i];
						const gridX = Math.floor(p[0] / gridSize);
						const gridY = Math.floor(p[1] / gridSize);
						const key = gridX + ',' + gridY;

						if (!densityMap[key]) {
							densityMap[key] = 0;
						}
						densityMap[key]++;
					}
				}
			}

			return densityMap;
		}

		// 推挤拥挤区域
		_repushCrowdedArea(minX, maxX, minY, maxY) {
			let improvement = 0;
			const affectedNets = [];

			// 收集受影响的网络
			for (let net of this.m_netlist) {
				if (!net.m_paths || net.m_paths.length === 0) continue;

				for (let path of net.m_paths) {
					for (let point of path) {
						if (point[0] >= minX && point[0] < maxX && point[1] >= minY && point[1] < maxY) {
							affectedNets.push(net);
							break;
						}
					}
				}
			}

			// 尝试将部分路径移出拥挤区域
			for (let net of affectedNets) {
				const beforeCost = this._estimateNetCost(net);

				// 移除网络
				net.remove();

				// 重新布线，但限制在拥挤区域外
				const success = this._rerouteNetInArea(net, minX, maxX, minY, maxY, true);

				if (success) {
					const afterCost = this._estimateNetCost(net);
					improvement += Math.max(0, beforeCost - afterCost);
				} else {
					// 恢复原路径
					net.add_paths_collision_lines();
				}
			}

			return improvement;
		}

		// 在指定区域限制下重路由网络
		_rerouteNetInArea(net, minX, maxX, minY, maxY, avoidArea) {
			if (!net.m_terminals || net.m_terminals.length < 2) return false;

			// 简化实现：尝试局部优化
			if (!net.m_paths || net.m_paths.length === 0) return false;

			let improved = false;

			for (let i = 0; i < net.m_paths.length; i++) {
				const path = net.m_paths[i];
				if (path.length < 3) continue;

				// 检查是否需要优化
				let needsOptimization = false;
				for (let point of path) {
					if (point[0] >= minX && point[0] < maxX && point[1] >= minY && point[1] < maxY) {
						needsOptimization = true;
						break;
					}
				}

				if (!needsOptimization) continue;

				// 尝试将拥挤区域的点向外推移
				const optimizedPath = this._pushPointsOut(path, minX, maxX, minY, maxY, avoidArea);

				if (optimizedPath && optimizedPath.length > 0) {
					net.m_paths[i] = optimizedPath;
					net.add_paths_collision_lines();
					improved = true;
				}
			}

			return improved;
		}

		// 将点推出拥挤区域
		_pushPointsOut(path, minX, maxX, minY, maxY, avoidArea) {
			if (path.length < 2) return path;

			let optimized = [path[0]];

			for (let i = 1; i < path.length; i++) {
				const current = path[i];
				let newPoint = current;

				if (avoidArea && current[0] >= minX && current[0] < maxX && current[1] >= minY && current[1] < maxY) {
					// 计算推到哪个方向
					const centerX = (minX + maxX) / 2;
					const centerY = (minY + maxY) / 2;
					const dx = current[0] - centerX;
					const dy = current[1] - centerY;

					// 选择推开距离
					const pushDistance = 20;
					const angle = Math.atan2(dy, dx);

					// 推向最近的边界
					let bestX = current[0];
					let bestY = current[1];
					let bestDist = Infinity;

					// 检查四个边界
					const boundaries = [
						[minX, current[1]], // 左边界
						[maxX, current[1]], // 右边界
						[current[0], minY], // 下边界
						[current[0], maxY], // 上边界
					];

					for (const [bx, by] of boundaries) {
						// 简单检查：是否可以直接到达
						if (current[2] === path[0][2]) {
							const dist = Math.sqrt((bx - current[0]) ** 2 + (by - current[1]) ** 2);
							if (dist < bestDist) {
								bestDist = dist;
								bestX = bx;
								bestY = by;
							}
						}
					}

					newPoint = [bestX, bestY, current[2]];
				}

				optimized.push(newPoint);
			}

			return optimized;
		}

		// 整体松弛：优化所有网络的整体布局
		overallRelaxation() {
			let totalImprovement = 0;
			const iterations = 3; // 松弛迭代次数

			if (this.m_verbosity >= 2) {
				console.log('[PCB] 开始整体松弛，共 ' + iterations + ' 次迭代');
			}

			for (let iter = 0; iter < iterations; iter++) {
				if (this.m_verbosity >= 2) {
					console.log('[PCB] 松弛迭代 ' + (iter + 1) + '/' + iterations);
				}

				let iterationImprovement = 0;

				// 按优先级处理网络
				const sortedNets = [...this.m_netlist].sort((a, b) => {
					// 优先松弛高代价网络
					return this._estimateNetCost(b) - this._estimateNetCost(a);
				});

				for (let net of sortedNets) {
					if (!net.m_paths || net.m_paths.length === 0) continue;

					const beforeCost = this._estimateNetCost(net);

					// 移除网络
					net.remove();

					// 尝试重新优化
					const improved = this._relaxNetPath(net);

					if (improved) {
						const afterCost = this._estimateNetCost(net);
						iterationImprovement += Math.max(0, beforeCost - afterCost);
					} else {
						// 恢复
						net.add_paths_collision_lines();
					}
				}

				totalImprovement += iterationImprovement;

				if (this.m_verbosity >= 2) {
					console.log('[PCB] 迭代 ' + (iter + 1) + ' 改进: ' + iterationImprovement.toFixed(2));
				}

				// 如果没有改进，提前结束
				if (iterationImprovement < 10) break;
			}

			return totalImprovement;
		}

		// 松弛单个网络的路径
		_relaxNetPath(net) {
			if (!net.m_paths || net.m_paths.length === 0) return false;

			let anyImproved = false;

			for (let i = 0; i < net.m_paths.length; i++) {
				const path = net.m_paths[i];
				if (path.length < 3) continue;

				// 尝试简化路径
				const simplified = this._relaxPath(path);

				if (simplified.length < path.length) {
					net.m_paths[i] = simplified;
					net.add_paths_collision_lines();
					anyImproved = true;
				}
			}

			return anyImproved;
		}

		// 松弛路径（移除冗余点并尝试优化）
		_relaxPath(path) {
			if (path.length <= 2) return path;

			let relaxed = [path[0]];

			for (let i = 1; i < path.length - 1; i++) {
				const prev = relaxed[relaxed.length - 1];
				const curr = path[i];
				const next = path[i + 1];

				// 检查是否可以跳过当前点
				if (prev[2] === curr[2] && curr[2] === next[2]) {
					// 同层，检查是否共线
					const dx1 = curr[0] - prev[0];
					const dy1 = curr[1] - prev[1];
					const dx2 = next[0] - curr[0];
					const dy2 = next[1] - curr[1];

					// 检查是否同方向
					const sameDir = dx1 * dx2 >= 0 && dy1 * dy2 >= 0;

					if (sameDir && this.areCollinear(prev, curr, next)) {
						// 可以跳过当前点
						continue;
					}
				}

				relaxed.push(curr);
			}

			relaxed.push(path[path.length - 1]);
			return relaxed;
		}

		// 获取所有网络的边界框
		_getNetworkBounds() {
			let minX = Infinity,
				minY = Infinity;
			let maxX = -Infinity,
				maxY = -Infinity;

			for (let net of this.m_netlist) {
				if (!net.m_paths) continue;

				for (let path of net.m_paths) {
					for (let point of path) {
						minX = Math.min(minX, point[0]);
						minY = Math.min(minY, point[1]);
						maxX = Math.max(maxX, point[0]);
						maxY = Math.max(maxY, point[1]);
					}
				}
			}

			if (minX === Infinity) return null;

			return { minX, minY, maxX, maxY };
		}

		//add net
		add_track(track) {
			let track_radius, via_radius, track_gap, terminals, paths, allowedLayers;
			[track_radius, via_radius, track_gap, terminals, paths, allowedLayers] = track;
			this.m_netlist.push(new Net(track_radius, via_radius, track_gap, terminals, this, allowedLayers));
		}

		//remove netlist from board
		remove_netlist() {
			for (let net of this.m_netlist) net.remove();
		}

		// ==================== 实时进度统计 ====================
		m_progress = {
			startTime: 0,
			totalNets: 0,
			routedNets: 0,
			failedNets: 0,
			currentNetName: '',
			history: [],
		};

		// 初始化进度统计
		initProgress() {
			this.m_progress = {
				startTime: Date.now(),
				totalNets: this.m_netlist ? this.m_netlist.length : 0,
				routedNets: 0,
				failedNets: 0,
				currentNetName: '',
				history: [],
			};
		}

		// 更新进度
		updateProgress(netName, success) {
			const now = Date.now();
			const elapsed = now - this.m_progress.startTime;

			if (success) {
				this.m_progress.routedNets++;
			} else {
				this.m_progress.failedNets++;
			}

			this.m_progress.currentNetName = netName || '';

			if ((this.m_progress.routedNets + this.m_progress.failedNets) % 5 === 0) {
				this.m_progress.history.push({
					time: elapsed,
					routed: this.m_progress.routedNets,
					failed: this.m_progress.failedNets,
				});
			}

			return this.getProgressInfo();
		}

		// 获取进度信息
		getProgressInfo() {
			const total = this.m_progress.totalNets;
			const routed = this.m_progress.routedNets;
			const failed = this.m_progress.failedNets;
			const processed = routed + failed;
			const successRate = processed > 0 ? (routed / processed) * 100 : 0;
			let remainingTime = '--';
			if (processed > 3 && routed > 0) {
				const elapsed = Date.now() - this.m_progress.startTime;
				const avgTimePerNet = elapsed / processed;
				const remaining = total - processed;
				remainingTime = this.formatTime(avgTimePerNet * remaining);
			}
			const elapsedTime = this.formatTime(Date.now() - this.m_progress.startTime);

			return {
				total,
				routed,
				failed,
				processed,
				percent: total > 0 ? ((processed / total) * 100).toFixed(1) : '0.0',
				successRate: successRate.toFixed(1),
				remainingTime,
				elapsedTime,
				currentNet: this.m_progress.currentNetName,
			};
		}

		// 格式化时间
		formatTime(ms) {
			if (ms < 1000) return '<1s';
			const seconds = Math.floor(ms / 1000);
			if (seconds < 60) return seconds + 's';
			const minutes = Math.floor(seconds / 60);
			const remainingSeconds = seconds % 60;
			if (minutes < 60) return minutes + 'm ' + remainingSeconds + 's';
			const hours = Math.floor(minutes / 60);
			const remainingMinutes = minutes % 60;
			return hours + 'h ' + remainingMinutes + 'm';
		}

		// 输出进度日志
		logProgress(info, force = false) {
			if (this.m_verbosity >= 1 || force) {
				console.log(
					`[进度] ${info.routed}/${info.total} (${info.percent}%) | 成功:${info.routed} 失败:${info.failed} | 成功率:${info.successRate}% | 剩余:${info.remainingTime} | 当前:${info.currentNet || '--'}`,
				);
			}
		}

		//attempt to route board within time
		route(timeout) {
			this.remove_netlist();
			this.unmark_distances();
			this.reset_areas();
			this.shuffle_netlist();
			this.initProgress(); // 初始化进度统计
			const info = this.getProgressInfo();
			console.log(`[开始布线] 总网络数:${info.total} | 策略:${this.m_strategy || '默认'}`);
			this.logProgress(info);

			this.m_netlist.sort(function (n1, n2) {
				if (n1.m_area === n2.m_area) return n1.m_radius - n2.m_radius;
				return n1.m_area - n2.m_area;
			});
			let hoisted_nets = new Set();
			let index = 0;
			while (index < this.m_netlist.length) {
				const netName = 'Net_' + index;
				const success = this.m_netlist[index].route();
				const progressInfo = this.updateProgress(netName, success);
				this.logProgress(progressInfo);

				if (success) {
					index++;
				} else {
					if (index === 0) {
						this.reset_areas();
						this.shuffle_netlist();
						this.m_netlist.sort(function (n1, n2) {
							if (n1.m_area === n2.m_area) return n1.m_radius - n2.m_radius;
							return n1.m_area - n2.m_area;
						});
						hoisted_nets.clear();
					} else {
						let pos = this.hoist_net(index);
						if (pos === index || hoisted_nets.has(this.m_netlist[pos])) {
							if (pos !== 0) {
								this.m_netlist[pos].m_area = this.m_netlist[pos - 1].m_area;
								pos = this.hoist_net(pos);
							}
							hoisted_nets.delete(this.m_netlist[pos]);
						} else hoisted_nets.add(this.m_netlist[pos]);
						while (index > pos) {
							this.m_netlist[index].remove();
							this.m_netlist[index].shuffle_topology();
							index--;
						}
					}
				}
				// if (elapsed.count() >= timeout) return false;
				if (this.m_verbosity >= 1) postMessage(this.output_pcb());
			}
			const finalInfo = this.getProgressInfo();
			console.log(
				`[布线完成] 成功:${finalInfo.routed}/${finalInfo.total} (${finalInfo.percent}%) | 失败:${finalInfo.failed} | 总耗时:${finalInfo.elapsedTime}`,
			);
			return true;
		}

		//cost of board in complexity terms
		cost() {
			let sum = 0;
			for (let net of this.m_netlist) for (let path of net.m_paths) sum += path.length;
			return sum;
		}

		//increase area quantization
		increase_quantization() {
			this.m_quantization++;
		}

		//output netlist and paths of board for viewer app
		output_pcb() {
			let scale = 1.0 / this.m_resolution;
			let tracks = [];
			for (let net of this.m_netlist) tracks.push(net.output_net());
			return [[Math.trunc(this.m_width * scale), Math.trunc(this.m_height * scale), this.m_depth], tracks];
		}

		//convert grid node to space node
		grid_to_space_point(n) {
			let p = this.m_deform.get(n.toString());
			if (p !== undefined) {
				return p;
			}
			return n;
		}

		//set grid node to value
		set_node(n, value) {
			this.m_nodes[this.m_stride * n[2] + n[1] * this.m_width + n[0]] = value;
		}

		//get grid node value
		get_node(n) {
			return this.m_nodes[this.m_stride * n[2] + n[1] * this.m_width + n[0]];
		}

		//generate all grid points surrounding node, that are not value 0
		all_marked(vec, n) {
			let w = this.m_width;
			let h = this.m_height;
			let d = this.m_depth;
			let gn = this.get_node;
			let sort_nodes = [];
			let x, y, z;
			[x, y, z] = n;
			for (let v of vec[z % 2]) {
				let nx, ny, nz;
				[nx, ny, nz] = v;
				(nx += x), (ny += y), (nz += z);
				if (0 <= nx && nx < w && 0 <= ny && ny < h && 0 <= nz && nz < d) {
					let n = [nx, ny, nz];
					let mark = gn.call(this, n);
					if (mark !== 0) sort_nodes.push([mark, n]);
				}
			}
			return sort_nodes;
		}

		//generate all grid points surrounding node, that are value 0
		all_not_marked(vec, n) {
			let w = this.m_width;
			let h = this.m_height;
			let d = this.m_depth;
			let gn = this.get_node;
			let nodes = [];
			let x, y, z;
			[x, y, z] = n;
			for (let v of vec[z % 2]) {
				let nx, ny, nz;
				[nx, ny, nz] = v;
				(nx += x), (ny += y), (nz += z);
				if (0 <= nx && nx < w && 0 <= ny && ny < h && 0 <= nz && nz < d) {
					let n = [nx, ny, nz];
					if (gn.call(this, n) === 0) nodes.push(n);
				}
			}
			return nodes;
		}

		//generate all grid points surrounding node sorted
		all_nearer_sorted(vec, n, dfunc) {
			let gsp = this.grid_to_space_point;
			let gp = gsp.call(this, n);
			let distance = this.get_node(n);
			let marked_nodes = this.all_marked(vec, n).filter((mn) => {
				if (distance - mn[0] <= 0) return false;
				mn[0] = dfunc(gsp.call(this, mn[1]), gp);
				return true;
			});
			marked_nodes.sort(function (s1, s2) {
				return s1[0] - s2[0];
			});
			return marked_nodes.map(function (mn) {
				return mn[1];
			});
		}

		//generate all grid points surrounding node that are not shorting with an existing track
		all_not_shorting(gather, n, radius, gap) {
			let gsp = this.grid_to_space_point;
			let layers = this.m_layers;
			let hit_line = this.m_layers.hit_line;
			let nodes = [];
			let np = gsp.call(this, n);
			for (let new_node of gather) {
				let nnp = gsp.call(this, new_node);
				if (!hit_line.call(layers, np, nnp, radius, gap)) nodes.push(new_node);
			}
			return nodes;
		}

		//曼哈顿距离启发式函数
		heuristic(a, b) {
			return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) * 2;
		}

		//A*算法计算距离 - 更高效的路径搜索
		mark_distances_astar(vec, radius, via, gap, starts, ends, allowedLayers = null) {
			let gn = this.get_node;
			let sn = this.set_node;
			let anm = this.all_not_marked;
			let ans = this.all_not_shorting;
			let via_vectors = this.m_via_vectors;

			// 过滤节点函数：只允许在allowedLayers中的层
			const filterNode = (node) => {
				if (!allowedLayers || allowedLayers.length === 0) return true;
				return allowedLayers.includes(node[2]);
			};

			// 找到最近的终点作为目标
			let target_node = ends[0];
			let min_dist = Infinity;
			for (let end of ends) {
				for (let start of starts) {
					let dist = this.heuristic(start, end);
					if (dist < min_dist) {
						min_dist = dist;
						target_node = end;
					}
				}
			}

			let open_set = new PriorityQueue();
			let g_score = new Map();
			let f_score = new Map();

			// 初始化起始点
			for (let start of starts) {
				let key = start.toString();
				g_score.set(key, 0);
				f_score.set(key, this.heuristic(start, target_node));
				open_set.enqueue(f_score.get(key), start);
			}

			let vias_nodes = new Map();

			while (!open_set.isEmpty() || vias_nodes.size) {
				let current = open_set.dequeue();
				let current_key = current.toString();
				let current_g = g_score.get(current_key);

				// 标记当前节点
				if (gn.call(this, current) === 0) {
					sn.call(this, current, current_g + 1);
				}

				// 检查是否到达任一终点
				if (ends.some((node) => gn.call(this, node) !== 0)) {
					break;
				}

				// 探索邻居
				let new_nodes = new NodeSet();
				for (let new_node of ans.call(this, anm.call(this, vec, current), current, radius, gap)) {
					if (filterNode(new_node)) new_nodes.add(new_node);
				}

				let new_vias_nodes = new NodeSet();
				for (let new_node of ans.call(this, anm.call(this, via_vectors, current), current, via, gap)) {
					if (filterNode(new_node)) new_vias_nodes.add(new_node);
				}

				// 处理普通移动
				for (let neighbor of new_nodes) {
					let neighbor_key = neighbor.toString();
					let tentative_g = current_g + 1;

					if (!g_score.has(neighbor_key) || tentative_g < g_score.get(neighbor_key)) {
						g_score.set(neighbor_key, tentative_g);
						f_score.set(neighbor_key, tentative_g + this.heuristic(neighbor, target_node));
						open_set.enqueue(f_score.get(neighbor_key), neighbor);
					}
				}

				// 处理过孔
				if (new_vias_nodes.size) {
					vias_nodes.set(current_g + 1 + this.m_viascost, new_vias_nodes);
				}

				// 处理延迟的过孔
				let delay_nodes = vias_nodes.get(current_g + 1);
				if (delay_nodes !== undefined) {
					for (let neighbor of delay_nodes) {
						if (gn.call(this, neighbor) === 0) {
							let neighbor_key = neighbor.toString();
							let tentative_g = current_g + this.m_viascost;

							if (!g_score.has(neighbor_key) || tentative_g < g_score.get(neighbor_key)) {
								g_score.set(neighbor_key, tentative_g);
								f_score.set(neighbor_key, tentative_g + this.heuristic(neighbor, target_node));
								open_set.enqueue(f_score.get(neighbor_key), neighbor);
							}
						}
					}
					vias_nodes.delete(current_g + 1);
				}
			}
		}

		// 计算两个点之间的移动代价（支持45度角）
		get_move_cost(node1, node2) {
			let dx = Math.abs(node1[0] - node2[0]);
			let dy = Math.abs(node1[1] - node2[1]);
			let dz = Math.abs(node1[2] - node2[2]);

			// 如果是z轴变化（过孔），返回过孔代价
			if (dz !== 0) {
				return this.m_viascost;
			}

			// 如果是45度角移动（x和y都变化），代价是√2 ≈ 1.414
			if (dx !== 0 && dy !== 0) {
				return Math.sqrt(2);
			}

			// 正交移动，代价是1
			return 1;
		}

		// 双向A*搜索算法 - 从起点和终点同时搜索，在中间相遇
		mark_distances_bidirectional(vec, radius, via, gap, starts, ends, allowedLayers = null) {
			// 双向搜索太复杂，暂时回退到单向A*（原mark_distances_astar的逻辑）
			// 先注释掉双向搜索，避免影响布线
			this.mark_distances_astar(vec, radius, via, gap, starts, ends, allowedLayers);
		}

		// A*搜索算法（单向）
		mark_distances_astar(vec, radius, via, gap, starts, ends, allowedLayers = null) {
			let gn = this.get_node;
			let sn = this.set_node;
			let anm = this.all_not_marked;
			let ans = this.all_not_shorting;
			let via_vectors = this.m_via_vectors;

			// 过滤节点函数：只允许在allowedLayers中的层
			const filterNode = (node) => {
				if (!allowedLayers || allowedLayers.length === 0) return true;
				return allowedLayers.includes(node[2]);
			};

			// A*数据结构
			let open = new PriorityQueue();
			let g = new Map();
			let f = new Map();
			let visited = new Set();

			// 找到最近的起点-终点对用于启发式
			let start_node = starts[0];
			let end_node = ends[0];
			let min_dist = Infinity;
			for (let start of starts) {
				for (let end of ends) {
					let dist = this.heuristic(start, end);
					if (dist < min_dist) {
						min_dist = dist;
						start_node = start;
						end_node = end;
					}
				}
			}

			// 初始化所有起点
			for (let start of starts) {
				let key = start.toString();
				g.set(key, 0);
				f.set(key, this.heuristic(start, end_node));
				open.enqueue(f.get(key), start);
			}

			let vias = new Map();

			while (!open.isEmpty() || vias.size) {
				// 检查所有终点是否都被标记了，如果都标记了就结束
				let all_ends_marked = ends.every((end) => gn.call(this, end) > 0);
				if (all_ends_marked) break;

				if (!open.isEmpty()) {
					let current = open.dequeue();
					let current_key = current.toString();
					let current_g = g.get(current_key);

					if (!visited.has(current_key)) {
						visited.add(current_key);
						sn.call(this, current, current_g + 1); // 标记距离

						// 探索邻居
						let new_nodes = new NodeSet();
						for (let new_node of ans.call(this, anm.call(this, vec, current), current, radius, gap)) {
							if (filterNode(new_node)) new_nodes.add(new_node);
						}

						let new_vias_nodes = new NodeSet();
						for (let new_node of ans.call(this, anm.call(this, via_vectors, current), current, via, gap)) {
							if (filterNode(new_node)) new_vias_nodes.add(new_node);
						}

						for (let neighbor of new_nodes) {
							let neighbor_key = neighbor.toString();
							let tentative_g = current_g + 1;
							if (!g.has(neighbor_key) || tentative_g < g.get(neighbor_key)) {
								g.set(neighbor_key, tentative_g);
								f.set(neighbor_key, tentative_g + this.heuristic(neighbor, end_node));
								open.enqueue(f.get(neighbor_key), neighbor);
							}
						}

						if (new_vias_nodes.size) {
							vias.set(current_g + this.m_viascost, new_vias_nodes);
						}

						let delay_nodes = vias.get(current_g + 1);
						if (delay_nodes !== undefined) {
							for (let neighbor of delay_nodes) {
								let neighbor_key = neighbor.toString();
								let tentative_g = current_g + this.m_viascost;
								if (!g.has(neighbor_key) || tentative_g < g.get(neighbor_key)) {
									g.set(neighbor_key, tentative_g);
									f.set(neighbor_key, tentative_g + this.heuristic(neighbor, end_node));
									open.enqueue(f.get(neighbor_key), neighbor);
								}
							}
							vias.delete(current_g + 1);
						}
					}
				}

				// 清理过期的过孔
				let min_g = Infinity;
				for (let key of g.values()) {
					if (key < min_g) min_g = key;
				}
				for (let key of Array.from(vias.keys())) {
					if (key < min_g + 100) {
						// 安全值
						vias.delete(key);
					}
				}
			}
		}

		//flood fill distances from starts till ends covered - BFS版本（保留作为回退）
		mark_distances(vec, radius, via, gap, starts, ends, allowedLayers = null) {
			let gn = this.get_node;
			let sn = this.set_node;
			let anm = this.all_not_marked;
			let ans = this.all_not_shorting;
			let via_vectors = this.m_via_vectors;
			let distance = 1;
			let frontier = new NodeSet(starts);
			let vias_nodes = new Map();

			// 过滤节点函数：只允许在allowedLayers中的层
			const filterNode = (node) => {
				if (!allowedLayers || allowedLayers.length === 0) return true;
				return allowedLayers.includes(node[2]);
			};

			while (frontier.size || vias_nodes.size) {
				for (let node of frontier) sn.call(this, node, distance);
				if (
					ends.every((node) => {
						return gn.call(this, node);
					})
				)
					break;
				let new_nodes = new NodeSet();
				for (let node of frontier) {
					for (let new_node of ans.call(this, anm.call(this, vec, node), node, radius, gap)) {
						if (filterNode(new_node)) new_nodes.add(new_node);
					}
				}
				let new_vias_nodes = new NodeSet();
				for (let node of frontier) {
					for (let new_node of ans.call(this, anm.call(this, via_vectors, node), node, via, gap)) {
						if (filterNode(new_node)) new_vias_nodes.add(new_node);
					}
				}
				if (new_vias_nodes.size) vias_nodes.set(distance + this.m_viascost, new_vias_nodes);
				let delay_nodes = vias_nodes.get(distance);
				if (delay_nodes !== undefined) {
					for (let node of delay_nodes) if (gn.call(this, node) === 0) new_nodes.add(node);
					vias_nodes.delete(distance);
				}
				frontier = new_nodes;
				distance++;
			}
		}

		//set all grid values back to 0
		unmark_distances() {
			this.m_nodes.fill(0);
		}

		//reset areas
		reset_areas() {
			for (let net of this.m_netlist) {
				[net.m_area, net.m_bbox] = aabb_terminals(net.m_terminals, this.m_quantization);
			}
		}

		//shuffle order of netlist
		shuffle_netlist() {
			this.m_netlist.shuffle();
			for (let net of this.m_netlist) net.shuffle_topology();
		}

		//move net to top of area group
		hoist_net(n) {
			let i = 0;
			if (n != 0) {
				for (i = n; i >= 0; --i) if (this.m_netlist[i].m_area < this.m_netlist[n].m_area) break;
				i++;
				if (n != i) {
					this.m_netlist.move(n, i);
				}
			}
			return i;
		}
	}

	//scale terminals for resolution of grid
	function scale_terminals(terms, res) {
		for (let term of terms) {
			term[0] *= res;
			term[1] *= res;
			term[2][0] *= res;
			term[2][1] *= res;
			for (let p of term[3]) {
				p[0] *= res;
				p[1] *= res;
			}
		}
	}

	//net methods
	class Net {
		constructor(radius, via, gap, terms, pcb, allowedLayers = null) {
			this.m_pcb = pcb;
			this.m_radius = radius * pcb.m_resolution;
			this.m_via = via * pcb.m_resolution;
			this.m_gap = gap * pcb.m_resolution;
			this.m_terminals = terms;
			this.m_paths = [];
			this.m_allowedLayers = allowedLayers;
			scale_terminals(this.m_terminals, pcb.m_resolution);
			[this.m_area, this.m_bbox] = aabb_terminals(this.m_terminals, pcb.m_quantization);
			this.remove();
			for (let term of this.m_terminals) {
				let zRange = [];
				if (this.m_allowedLayers && this.m_allowedLayers.length > 0) {
					zRange = this.m_allowedLayers;
				} else {
					for (let z = 0; z < pcb.m_depth; ++z) zRange.push(z);
				}
				for (let z of zRange) {
					let p = [Math.trunc(term[2][0] + 0.5), Math.trunc(term[2][1] + 0.5), z];
					let sp = [term[2][0], term[2][1], z];
					pcb.m_deform.set(p.toString(), sp);
				}
			}
		}

		//randomize order of terminals
		shuffle_topology() {
			this.m_terminals.shuffle();
		}

		//add terminal entries to spacial cache
		add_terminal_collision_lines() {
			for (let node of this.m_terminals) {
				let r, g, x, y, shape;
				[r, g, [x, y, ,], shape] = node;
				if (!shape.length) this.m_pcb.m_layers.add_line([x, y, 0], [x, y, this.m_pcb.m_depth - 1], r, g);
				else {
					for (let z = 0; z < this.m_pcb.m_depth; ++z) {
						let p1 = [x + shape[0][0], y + shape[0][1], z];
						for (let i = 1; i < shape.length; ++i) {
							let p0 = p1;
							p1 = [x + shape[i][0], y + shape[i][1], z];
							this.m_pcb.m_layers.add_line(p0, p1, r, g);
						}
					}
				}
			}
		}

		//remove terminal entries from spacial cache
		sub_terminal_collision_lines() {
			for (let node of this.m_terminals) {
				let r, g, x, y, shape;
				[r, g, [x, y, ,], shape] = node;
				if (!shape.length) this.m_pcb.m_layers.sub_line([x, y, 0], [x, y, this.m_pcb.m_depth - 1], r, g);
				else {
					for (let z = 0; z < this.m_pcb.m_depth; ++z) {
						let p1 = [x + shape[0][0], y + shape[0][1], z];
						for (let i = 1; i < shape.length; ++i) {
							let p0 = p1;
							p1 = [x + shape[i][0], y + shape[i][1], z];
							this.m_pcb.m_layers.sub_line(p0, p1, r, g);
						}
					}
				}
			}
		}

		//add paths entries to spacial cache
		add_paths_collision_lines() {
			for (let path of this.m_paths) {
				let p1 = this.m_pcb.grid_to_space_point(path[0]);
				for (let i = 1; i < path.length; ++i) {
					let p0 = p1;
					p1 = this.m_pcb.grid_to_space_point(path[i]);
					if (path[i - 1][2] !== path[i][2]) this.m_pcb.m_layers.add_line(p0, p1, this.m_via, this.m_gap);
					else this.m_pcb.m_layers.add_line(p0, p1, this.m_radius, this.m_gap);
				}
			}
		}

		//remove paths entries from spacial cache
		sub_paths_collision_lines() {
			for (let path of this.m_paths) {
				let p1 = this.m_pcb.grid_to_space_point(path[0]);
				for (let i = 1; i < path.length; ++i) {
					let p0 = p1;
					p1 = this.m_pcb.grid_to_space_point(path[i]);
					if (path[i - 1][2] !== path[i][2]) this.m_pcb.m_layers.sub_line(p0, p1, this.m_via, this.m_gap);
					else this.m_pcb.m_layers.sub_line(p0, p1, this.m_radius, this.m_gap);
				}
			}
		}

		//remove net entries from spacial grid
		remove() {
			this.sub_paths_collision_lines();
			this.sub_terminal_collision_lines();
			this.m_paths = [];
			this.add_terminal_collision_lines();
		}

		//remove redundant points from paths
		optimise_paths(paths) {
			let opt_paths = [];
			for (let path of paths) {
				let opt_path = this.simplifyPath(path);
				opt_path = this.chamferCorners(opt_path);
				opt_path = this.removeUnnecessaryVias(opt_path);
				opt_paths.push(opt_path);
			}
			return opt_paths;
		}

		// 简化路径 - 移除共线点
		simplifyPath(path) {
			if (path.length <= 2) return path;

			let simplified = [path[0]];
			let prev = path[0];

			for (let i = 1; i < path.length - 1; i++) {
				let curr = path[i];
				let next = path[i + 1];

				if (!this.areCollinear(prev, curr, next)) {
					simplified.push(curr);
					prev = curr;
				}
			}

			if (path.length > 1) {
				simplified.push(path[path.length - 1]);
			}

			return simplified;
		}

		// 检查三点是否共线
		areCollinear(p1, p2, p3) {
			let dx1 = p2[0] - p1[0];
			let dy1 = p2[1] - p1[1];
			let dx2 = p3[0] - p2[0];
			let dy2 = p3[1] - p2[1];

			return dx1 * dy2 === dy1 * dx2;
		}

		// 倒角优化 - 将90度角改为45度角
		chamferCorners(path) {
			if (path.length <= 2) return path;

			let chamfered = [path[0]];

			for (let i = 1; i < path.length - 1; i++) {
				let prev = chamfered[chamfered.length - 1];
				let curr = path[i];
				let next = path[i + 1];

				// 检查是否是90度角（正交方向变化）
				let dx1 = curr[0] - prev[0];
				let dy1 = curr[1] - prev[1];
				let dx2 = next[0] - curr[0];
				let dy2 = next[1] - curr[1];

				// 如果是90度转弯且在同一层
				if (prev[2] === curr[2] && curr[2] === next[2]) {
					if ((dx1 !== 0 && dy2 !== 0 && dx2 === 0 && dy1 === 0) || (dy1 !== 0 && dx2 !== 0 && dx1 === 0 && dy2 === 0)) {
						// 添加45度角点
						let corner = [Math.round((prev[0] + next[0]) / 2), Math.round((prev[1] + next[1]) / 2), curr[2]];
						chamfered.push(corner);
						continue;
					}
				}

				chamfered.push(curr);
			}

			if (path.length > 1) {
				chamfered.push(path[path.length - 1]);
			}

			return chamfered;
		}

		// 移除不必要的过孔
		removeUnnecessaryVias(path) {
			if (path.length <= 2) return path;

			let optimized = [path[0]];

			for (let i = 1; i < path.length; i++) {
				let curr = path[i];
				let prev = optimized[optimized.length - 1];

				// 如果当前点和前一点在同一层，跳过中间的过孔
				if (optimized.length >= 2) {
					let prev_prev = optimized[optimized.length - 2];
					if (prev_prev[2] === curr[2] && prev[2] !== curr[2]) {
						// 移除不必要的过孔
						optimized.pop();
					}
				}

				optimized.push(curr);
			}

			return optimized;
		}

		// 走线拉直 - 尝试用直线连接更远的点
		straightenPath(path) {
			if (path.length <= 3) return path;

			let straightened = [path[0]];
			let i = 0;

			while (i < path.length - 1) {
				let start = straightened[straightened.length - 1];
				let best_reach = i + 1;

				// 尝试找到最远的可达点
				for (let j = i + 2; j < path.length; j++) {
					if (this.canStraightLine(start, path[j])) {
						best_reach = j;
					} else {
						break;
					}
				}

				straightened.push(path[best_reach]);
				i = best_reach;
			}

			return straightened;
		}

		// 检查两点之间是否可以直接连接（简化版：同一层且直线可达）
		canStraightLine(p1, p2) {
			// 必须在同一层
			if (p1[2] !== p2[2]) return false;

			// 检查是否是水平或垂直线
			return p1[0] === p2[0] || p1[1] === p2[1];
		}

		//backtrack path from ends to starts
		backtrack_path(visited, end_node, radius, via, gap, allowedLayers = null) {
			let via_vectors = this.m_pcb.m_via_vectors;
			let path = [];
			let path_node = end_node;

			// 过滤节点函数：只允许在allowedLayers中的层
			const filterNode = (node) => {
				if (!allowedLayers || allowedLayers.length === 0) return true;
				return allowedLayers.includes(node[2]);
			};

			for (;;) {
				path.push(path_node);
				let nearer_nodes = [];
				for (let node of this.m_pcb.all_not_shorting(
					this.m_pcb.all_nearer_sorted(this.m_pcb.m_routing_path_vectors, path_node, this.m_pcb.m_dfunc),
					path_node,
					radius,
					gap,
				)) {
					if (filterNode(node)) nearer_nodes.push(node);
				}
				for (let node of this.m_pcb.all_not_shorting(
					this.m_pcb.all_nearer_sorted(via_vectors, path_node, this.m_pcb.m_dfunc),
					path_node,
					via,
					gap,
				)) {
					if (filterNode(node)) nearer_nodes.push(node);
				}
				if (!nearer_nodes.length) return [[], false];
				let search = nearer_nodes.find(function (node) {
					return visited.has(node);
				});
				if (search !== undefined) {
					//found existing track
					path.push(search);
					return [path, true];
				}
				path_node = nearer_nodes[0];
			}
		}

		//attempt to route this net on the current boards state
		route() {
			//check for unused terminals track
			if (this.m_radius === 0.0) return true;
			this.m_paths = [];
			this.sub_terminal_collision_lines();
			let visited = new NodeSet();

			// 搜索算法优先级: A* -&gt; BFS (双向搜索暂时禁用，待修复)
			let use_bidirectional = false; // 暂时禁用双向搜索
			let use_astar = true;

			for (let index = 1; index < this.m_terminals.length; ++index) {
				let ends = [];
				let zRange = [];
				if (this.m_allowedLayers && this.m_allowedLayers.length > 0) {
					zRange = this.m_allowedLayers;
				} else {
					for (let z = 0; z < this.m_pcb.m_depth; ++z) zRange.push(z);
				}
				for (let z of zRange) {
					let x = Math.trunc(this.m_terminals[index][2][0] + 0.5);
					let y = Math.trunc(this.m_terminals[index][2][1] + 0.5);
					ends.push([x, y, z]);
				}
				let search = ends.find(function (node) {
					return visited.has(node);
				});
				if (search !== undefined) continue;
				for (let z of zRange) {
					let x = Math.trunc(this.m_terminals[index - 1][2][0] + 0.5);
					let y = Math.trunc(this.m_terminals[index - 1][2][1] + 0.5);
					visited.add([x, y, z]);
				}

				// 尝试使用双向搜索
				if (use_bidirectional && this.m_pcb.mark_distances_bidirectional) {
					this.m_pcb.mark_distances_bidirectional(
						this.m_pcb.m_routing_flood_vectors,
						this.m_radius,
						this.m_via,
						this.m_gap,
						visited,
						ends,
						this.m_allowedLayers,
					);
				} else if (use_astar && this.m_pcb.mark_distances_astar) {
					// 回退到A*
					this.m_pcb.mark_distances_astar(
						this.m_pcb.m_routing_flood_vectors,
						this.m_radius,
						this.m_via,
						this.m_gap,
						visited,
						ends,
						this.m_allowedLayers,
					);
				} else {
					// 回退到BFS
					this.m_pcb.mark_distances(
						this.m_pcb.m_routing_flood_vectors,
						this.m_radius,
						this.m_via,
						this.m_gap,
						visited,
						ends,
						this.m_allowedLayers,
					);
				}

				let sorted_ends = [];
				for (let node of ends) sorted_ends.push([this.m_pcb.get_node(node), node]);
				sorted_ends.sort(function (s1, s2) {
					return s1[0] - s2[0];
				});

				// 检查双向搜索是否成功
				if (sorted_ends[0][0] === 0 && use_bidirectional) {
					if (this.m_pcb.m_verbosity >= 1) {
						console.log('Bidirectional search failed, falling back to A*');
					}
					use_bidirectional = false;
					this.m_pcb.unmark_distances();

					// 尝试A*
					if (use_astar && this.m_pcb.mark_distances_astar) {
						this.m_pcb.mark_distances_astar(
							this.m_pcb.m_routing_flood_vectors,
							this.m_radius,
							this.m_via,
							this.m_gap,
							visited,
							ends,
							this.m_allowedLayers,
						);
					}

					sorted_ends = [];
					for (let node of ends) sorted_ends.push([this.m_pcb.get_node(node), node]);
					sorted_ends.sort(function (s1, s2) {
						return s1[0] - s2[0];
					});
				}

				// 检查A*是否成功找到路径
				if (sorted_ends[0][0] === 0 && use_astar) {
					if (this.m_pcb.m_verbosity >= 1) {
						console.log('A* failed, falling back to BFS');
					}
					use_astar = false;
					this.m_pcb.unmark_distances();
					this.m_pcb.mark_distances(
						this.m_pcb.m_routing_flood_vectors,
						this.m_radius,
						this.m_via,
						this.m_gap,
						visited,
						ends,
						this.m_allowedLayers,
					);
					// 重新排序
					sorted_ends = [];
					for (let node of ends) sorted_ends.push([this.m_pcb.get_node(node), node]);
					sorted_ends.sort(function (s1, s2) {
						return s1[0] - s2[0];
					});
				}

				let result = this.backtrack_path(visited, sorted_ends[0][1], this.m_radius, this.m_via, this.m_gap, this.m_allowedLayers);
				this.m_pcb.unmark_distances();
				if (!result[1]) {
					this.remove();
					return false;
				}
				for (let node of result[0]) visited.add(node);
				this.m_paths.push(result[0]);
			}
			this.m_paths = this.optimise_paths(this.m_paths);
			this.add_paths_collision_lines();
			this.add_terminal_collision_lines();
			return true;
		}

		//output net, terminals and paths, for viewer app
		output_net() {
			let pcb = this.m_pcb;
			let gsp = this.m_pcb.grid_to_space_point;
			let scale = 1.0 / this.m_pcb.m_resolution;
			let track = [];
			track.push(this.m_radius * scale);
			track.push(this.m_via * scale);
			track.push(this.m_gap * scale);
			track.push(
				this.m_terminals.map(function (t) {
					return [
						t[0] * scale,
						t[1] * scale,
						[t[2][0] * scale, t[2][1] * scale, t[2][2]],
						t[3].map(function (n) {
							return [n[0] * scale, n[1] * scale];
						}),
					];
				}),
			);
			track.push(
				this.m_paths.map(function (path) {
					return path.map(function (n) {
						let p = gsp.call(pcb, n);
						return [p[0] * scale, p[1] * scale, p[2]];
					});
				}),
			);
			return track;
		}
	}

	js_pcb.Pcb = Pcb;
})();
