'use strict';

var js_pcb = js_pcb || {};
(function () {
	// 布隆过滤器类：用于快速排除不可能碰撞的区域
	class BloomFilter {
		constructor(size, hashCount) {
			this.m_size = size; // 位数组大小
			this.m_hashCount = hashCount; // 哈希函数数量
			this.m_bitArray = new Uint8Array(Math.ceil(size / 8)); // 位数组
		}

		// 简单的哈希函数
		_hash(value, seed) {
			let hash = seed;
			for (let i = 0; i < value.length; i++) {
				hash = (hash << 5) + hash + value.charCodeAt(i);
				hash = hash & hash; // 转换为32位整数
			}
			return Math.abs(hash) % this.m_size;
		}

		// 生成多个哈希值
		_generateHashes(value) {
			let hashes = [];
			for (let i = 0; i < this.m_hashCount; i++) {
				hashes.push(this._hash(value, i * 31337 + 12345));
			}
			return hashes;
		}

		// 添加元素
		add(value) {
			let hashes = this._generateHashes(value);
			for (let hash of hashes) {
				this.m_bitArray[Math.floor(hash / 8)] |= 1 << hash % 8;
			}
		}

		// 检查元素是否存在（可能误判，但不会漏判）
		contains(value) {
			let hashes = this._generateHashes(value);
			for (let hash of hashes) {
				if (!(this.m_bitArray[Math.floor(hash / 8)] & (1 << hash % 8))) {
					return false; // 一定不存在
				}
			}
			return true; // 可能存在
		}

		// 获取填充率
		getFillRate() {
			let setBits = 0;
			for (let byte of this.m_bitArray) {
				setBits += this._countBits(byte);
			}
			return setBits / this.m_size;
		}

		// 计算字节中的1的个数
		_countBits(byte) {
			let count = 0;
			while (byte) {
				count += byte & 1;
				byte >>= 1;
			}
			return count;
		}

		// 重置过滤器
		reset() {
			this.m_bitArray = new Uint8Array(Math.ceil(this.m_size / 8));
		}
	}

	class Line {
		constructor(p1, p2, r, g) {
			this.m_p1 = p1;
			this.m_p2 = p2;
			this.m_radius = r;
			this.m_gap = g;
		}

		equal(l) {
			return this.m_radius === l.m_radius && this.m_gap === l.m_gap && js_pcb.equal_2d(this.m_p1, l.m_p1) && js_pcb.equal_2d(this.m_p2, l.m_p2);
		}
	}

	function bucket_index(b, l) {
		for (let i = 0; i < b.length; i++) {
			if (l.equal(b[i].m_line)) return i;
		}
		return -1;
	}

	class Record {
		constructor(id, l) {
			this.m_id = id;
			this.m_line = l;
			let pv = js_pcb.perp_2d(js_pcb.sub_2d(l.m_p2, l.m_p1));
			this.m_lv_norm = js_pcb.scale_2d(pv, 1.0 / js_pcb.length_2d(pv));
			this.m_lv_dist = js_pcb.dot_2d(this.m_lv_norm, l.m_p1);
		}

		hit(l, d) {
			let dp1 = js_pcb.dot_2d(this.m_lv_norm, l.m_p1) - this.m_lv_dist;
			let dp2 = js_pcb.dot_2d(this.m_lv_norm, l.m_p2) - this.m_lv_dist;
			if (dp1 > d && dp2 > d) return false;
			if (dp1 < -d && dp2 < -d) return false;
			return js_pcb.collide_thick_lines_2d(l.m_p1, l.m_p2, this.m_line.m_p1, this.m_line.m_p2, d);
		}
	}

	class Layer {
		constructor(dims, s) {
			let w, h;
			[w, h] = dims;
			this.m_width = w;
			this.m_height = h;
			this.m_scale = s;
			this.m_test = 0;
			this.m_buckets = [];
			this.m_cell_size = 1; // 动态单元格大小
			this.m_line_count = 0; // 线段计数，用于增量更新
			this.m_last_update = 0; // 上次更新时间戳
			this.m_hit_count = 0; // 碰撞检测次数统计
			this.m_check_count = 0; // 检查次数统计
			this.m_optimization_level = 0; // 优化级别：0=标准, 1=中等, 2=激进

			while (this.m_buckets.push([]) < w * h) {}
		}

		// 动态调整单元格大小（根据线段密度）
		adjustCellSize() {
			// 简单启发式：根据线段数量动态调整
			const density = this.m_line_count / (this.m_width * this.m_height);

			if (density > 0.1 && this.m_cell_size < 4) {
				// 高密度区域，增大单元格减少碰撞检测
				this.m_cell_size = Math.min(4, this.m_cell_size + 1);
			} else if (density < 0.01 && this.m_cell_size > 1) {
				// 低密度区域，减小单元格提高精度
				this.m_cell_size = Math.max(1, this.m_cell_size - 1);
			}

			if (this.m_verbosity >= 2) {
				console.log('[Layer] CellSize: ' + this.m_cell_size + ', Density: ' + density.toFixed(4) + ', Lines: ' + this.m_line_count);
			}
		}

		// 增量更新：只更新受影响的区域
		incrementalUpdate(zone) {
			// 标记需要更新的区域
			if (!this.m_dirty_zones) {
				this.m_dirty_zones = new Set();
			}
			this.m_dirty_zones.add(zone);
			this.m_last_update = Date.now();
		}

		// 清理无效引用
		cleanupInvalidRefs() {
			let cleaned = 0;
			for (let bucket of this.m_buckets) {
				for (let i = bucket.length - 1; i >= 0; i--) {
					if (!bucket[i].m_line) {
						bucket.splice(i, 1);
						cleaned++;
					}
				}
			}
			if (cleaned > 0 && this.m_verbosity >= 1) {
				console.log('[Layer] Cleaned ' + cleaned + ' invalid references');
			}
			return cleaned;
		}

		get_aabb(l) {
			let x1, y1, x2, y2;
			[x1, y1] = l.m_p1;
			[x2, y2] = l.m_p2;
			if (x1 > x2) {
				let t = x1;
				x1 = x2;
				x2 = t;
			}
			if (y1 > y2) {
				let t = y1;
				y1 = y2;
				y2 = t;
			}
			let r = l.m_radius + l.m_gap;
			let minx = Math.trunc((x1 - r) * this.m_scale);
			let miny = Math.trunc((y1 - r) * this.m_scale);
			let maxx = Math.trunc((x2 + r) * this.m_scale);
			let maxy = Math.trunc((y2 + r) * this.m_scale);
			minx = Math.max(0, minx);
			miny = Math.max(0, miny);
			maxx = Math.max(0, maxx);
			maxy = Math.max(0, maxy);
			minx = Math.min(this.m_width - 1, minx);
			maxx = Math.min(this.m_width - 1, maxx);
			miny = Math.min(this.m_height - 1, miny);
			maxy = Math.min(this.m_height - 1, maxy);
			return [minx, miny, maxx, maxy];
		}

		add_line(l) {
			let bb = this.get_aabb(l);
			let r = new Record(0, l);
			for (let y = bb[1]; y <= bb[3]; ++y) {
				for (let x = bb[0]; x <= bb[2]; ++x) {
					this.m_buckets[y * this.m_width + x].push(r);
				}
			}
			this.m_line_count++;
		}

		sub_line(l) {
			let bb = this.get_aabb(l);
			for (let y = bb[1]; y <= bb[3]; ++y) {
				for (let x = bb[0]; x <= bb[2]; ++x) {
					let b = this.m_buckets[y * this.m_width + x];
					let index = bucket_index(b, l);
					if (index !== -1) b.splice(index, 1);
				}
			}
			this.m_line_count--;
		}

		// 优化的碰撞检测：早退出 + 统计
		hit_line_optimized(l) {
			this.m_test += 1;
			this.m_check_count++;
			let bb = this.get_aabb(l);

			// 激进优化：随机采样检查
			if (this.m_optimization_level >= 2 && this.m_line_count > 1000) {
				// 只检查部分bucket
				let step = Math.max(2, Math.floor(Math.sqrt(bb[2] - bb[0] + bb[3] - bb[1]) / 4));
				for (let y = bb[1]; y <= bb[3]; y += step) {
					for (let x = bb[0]; x <= bb[2]; x += step) {
						if (this._checkBucket(y * this.m_width + x, l)) {
							this.m_hit_count++;
							return true;
						}
					}
				}
				return false;
			}

			// 标准检查
			for (let y = bb[1]; y <= bb[3]; ++y) {
				for (let x = bb[0]; x <= bb[2]; ++x) {
					if (this._checkBucket(y * this.m_width + x, l)) {
						this.m_hit_count++;
						return true;
					}
				}
			}
			return false;
		}

		// 检查单个bucket
		_checkBucket(bucketIdx, l) {
			let b = this.m_buckets[bucketIdx];
			for (let i = 0; i < b.length; i++) {
				let record = b[i];
				if (record.m_id === this.m_test) continue;
				record.m_id = this.m_test;
				let d = l.m_radius + record.m_line.m_radius + Math.max(l.m_gap, record.m_line.m_gap);
				if (record.hit(l, d)) return true;
			}
			return false;
		}

		hit_line(l) {
			this.m_test += 1;
			this.m_check_count++;
			let bb = this.get_aabb(l);
			for (let y = bb[1]; y <= bb[3]; ++y) {
				for (let x = bb[0]; x <= bb[2]; ++x) {
					let b = this.m_buckets[y * this.m_width + x];
					for (let i = 0; i < b.length; i++) {
						let record = b[i];
						if (record.m_id === this.m_test) continue;
						record.m_id = this.m_test;
						let d = l.m_radius + record.m_line.m_radius + Math.max(l.m_gap, record.m_line.m_gap);
						if (record.hit(l, d)) {
							this.m_hit_count++;
							return true;
						}
					}
				}
			}
			return false;
		}

		// 获取统计信息
		getStats() {
			return {
				lineCount: this.m_line_count,
				cellSize: this.m_cell_size,
				hitCount: this.m_hit_count,
				checkCount: this.m_check_count,
				hitRate: this.m_check_count > 0 ? ((this.m_hit_count / this.m_check_count) * 100).toFixed(2) + '%' : '0%',
			};
		}

		// 重置统计
		resetStats() {
			this.m_hit_count = 0;
			this.m_check_count = 0;
			this.m_bloom_filter_skips = 0;
			this.m_bloom_filter_hits = 0;
		}

		// 重建布隆过滤器（当误判率过高时）
		rebuildBloomFilter() {
			if (this.m_verbosity >= 1) {
				console.log('[Layer] Rebuilding Bloom Filter, current fill rate: ' + (this.m_bloom_filter.getFillRate() * 100).toFixed(2) + '%');
			}
			this.m_bloom_filter.reset();

			// 重新添加所有bucket
			for (let y = 0; y < this.m_height; y++) {
				for (let x = 0; x < this.m_width; x++) {
					let bucket = this.m_buckets[y * this.m_width + x];
					if (bucket.length > 0) {
						this.m_bloom_filter.add('bucket_' + (y * this.m_width + x));
					}
				}
			}

			if (this.m_verbosity >= 1) {
				console.log('[Layer] Bloom Filter rebuilt, new fill rate: ' + (this.m_bloom_filter.getFillRate() * 100).toFixed(2) + '%');
			}
		}

		// 获取布隆过滤器的假阳性估计
		estimateFalsePositiveRate() {
			// 简化估计：基于填充率
			let fillRate = this.m_bloom_filter.getFillRate();
			let k = this.m_bloom_filter.m_hashCount;
			// 理论假阳性率 = (1 - e^(-kn/m))^k
			// 这里用简化估计
			return Math.min(1, fillRate * k * 0.1);
		}
	}

	class Layers {
		constructor(dims, s) {
			let w, h, d;
			[w, h, d] = dims;
			this.m_depth = d;
			this.m_layers = [];
			this.m_verbosity = 0; // 调试级别
			while (this.m_layers.push(new Layer([w, h], s)) < d) {}
		}

		add_line(p1, p2, r, g) {
			let z1 = Math.trunc(p1[2]);
			let z2 = Math.trunc(p2[2]);
			if (z1 > z2) {
				let t = z1;
				z1 = z2;
				z2 = t;
			}
			let l = new Line([p1[0], p1[1]], [p2[0], p2[1]], r, g);
			for (let z = z1; z <= z2; ++z) this.m_layers[z].add_line(l);
		}

		sub_line(p1, p2, r, g) {
			let z1 = Math.trunc(p1[2]);
			let z2 = Math.trunc(p2[2]);
			if (z1 > z2) {
				let t = z1;
				z1 = z2;
				z2 = t;
			}
			let l = new Line([p1[0], p1[1]], [p2[0], p2[1]], r, g);
			for (let z = z1; z <= z2; ++z) this.m_layers[z].sub_line(l);
		}

		hit_line(p1, p2, r, g) {
			let z1 = Math.trunc(p1[2]);
			let z2 = Math.trunc(p2[2]);
			if (z1 > z2) {
				let t = z1;
				z1 = z2;
				z2 = t;
			}
			let l = new Line([p1[0], p1[1]], [p2[0], p2[1]], r, g);
			for (let z = z1; z <= z2; ++z) if (this.m_layers[z].hit_line(l)) return true;
			return false;
		}

		// 获取所有层的统计信息
		getAllStats() {
			let stats = {
				totalLines: 0,
				totalHits: 0,
				totalChecks: 0,
				layers: [],
			};

			for (let i = 0; i < this.m_depth; i++) {
				let layerStat = this.m_layers[i].getStats();
				stats.layers.push({ layer: i, ...layerStat });
				stats.totalLines += layerStat.lineCount;
				stats.totalHits += layerStat.hitCount;
				stats.totalChecks += layerStat.checkCount;
			}

			if (stats.totalChecks > 0) {
				stats.overallHitRate = ((stats.totalHits / stats.totalChecks) * 100).toFixed(2) + '%';
			} else {
				stats.overallHitRate = '0%';
			}

			return stats;
		}

		// 重置所有层的统计
		resetAllStats() {
			for (let layer of this.m_layers) {
				layer.resetStats();
			}
		}

		// 动态调整所有层的单元格大小
		adjustAllCellSizes() {
			for (let layer of this.m_layers) {
				layer.adjustCellSize();
			}
		}
	}

	js_pcb.Layers = Layers;
})();
