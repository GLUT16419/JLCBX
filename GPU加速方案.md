# 自动布线器 GPU 加速方案

## 1. 方案概述

### 1.1 目标

利用现代浏览器的 **WebGPU** 技术，将自动布线的计算密集型任务（特别是路径搜索和碰撞检测）并行化到 GPU 上执行，从而获得 **10-100x** 的性能提升。

### 1.2 适用场景

- 大型 PCB（>500网络）
- 高密度设计（BGA、细间距）
- 多层板（6层以上）
- 需要多次迭代优化的场景

---

## 2. 技术选型

| 技术              | 描述              | 兼容性      | 性能 | 适用场景           |
| ----------------- | ----------------- | ----------- | ---- | ------------------ |
| **WebGPU**        | 现代浏览器GPU API | Chrome 113+ | 最佳 | 路径搜索、碰撞检测 |
| **WebGL Compute** | WebGL 扩展        | 较老浏览器  | 好   | 简单并行任务       |
| **WebNN**         | 神经网络API       | 有限        | 中   | 机器学习辅助       |
| **GPU.js**        | WebGL包装库       | 广泛        | 好   | 简单数学运算       |

**推荐方案**：WebGPU（Compute Shaders）

---

## 3. 核心功能模块

### 3.1 模块一：并行路径搜索（GPU加速）

**场景**：多个网络同时进行路径搜索

**实现架构**：

```
┌─────────────────────────────────────────────────────────┐
│                    CPU 协调层                           │
│  - 任务分发  │  - 结果收集  │  - 网络调度                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  WebGPU 计算着色器                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 网络1搜索│ │ 网络2搜索│ │ 网络3搜索│ │ 网络4搜索│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 网络5搜索│ │ 网络6搜索│ │ 网络7搜索│ │ 网络8搜索│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│        ↑               ↑               ↑               │
│   共享障碍物纹理    共享网格距离场  共享网络边界       │
└─────────────────────────────────────────────────────────┘
```

**WGSL 计算着色器代码示例**：

```wgsl
// 路径搜索的计算着色器
struct SearchParams {
    start_x: u32,
    start_y: u32,
    start_z: u32,
    end_x: u32,
    end_y: u32,
    end_z: u32,
    max_iterations: u32,
    grid_width: u32,
    grid_height: u32,
    grid_depth: u32
}

struct GridCell {
    distance: f32,
    visited: u32,
    prev_x: u32,
    prev_y: u32,
    prev_z: u32
}

@group(0) @binding(0) var<storage, read> params: SearchParams;
@group(0) @binding(1) var<storage, read_write> grid: array<GridCell>;
@group(0) @binding(2) var<storage, read> obstacles: array<u32>;
@group(0) @binding(3) var<storage, write> result: array<i32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x + global_id.y * params.grid_width +
              global_id.z * params.grid_width * params.grid_height;

    if (global_id.x >= params.grid_width ||
        global_id.y >= params.grid_height ||
        global_id.z >= params.grid_depth) {
        return;
    }

    // 检查是否是障碍物
    let obstacle_idx = global_id.x + global_id.y * params.grid_width;
    if (obstacles[obstacle_idx] != 0) {
        return;
    }

    // BFS 搜索实现...
}
```

---

### 3.2 模块二：批量碰撞检测（GPU加速）

**场景**：检查新路径是否与已有网络碰撞

**加速原理**：

- 使用 GPU 的 **纹理采样** 和 **并行比较**
- 空间哈希预计算在 GPU 中
- 批量处理数千个线段碰撞检测

**实现**：

```wgsl
// 线段碰撞检测的计算着色器
struct LineSegment {
    x1: f32, y1: f32, z1: f32,
    x2: f32, y2: f32, z2: f32,
    radius: f32
}

@group(0) @binding(0) var<storage, read> segments_a: array<LineSegment>;
@group(0) @binding(1) var<storage, read> segments_b: array<LineSegment>;
@group(0) @binding(2) var<storage, write> collisions: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= arrayLength(&segments_a)) {
        return;
    }

    let a = segments_a[idx];
    var collision_count = 0u;

    // 并行检查与所有线段的碰撞
    for (var i = 0u; i < arrayLength(&segments_b); i++) {
        let b = segments_b[i];
        if (check_line_collision(a, b)) {
            collision_count++;
        }
    }

    collisions[idx] = collision_count;
}

fn check_line_collision(a: LineSegment, b: LineSegment) -> bool {
    // 线段相交检测算法
    // 简化版，实际使用 Sweep and Prune 或 GJK
    let min_dist = a.radius + b.radius;
    let dist = distance_between_lines(a, b);
    return dist < min_dist;
}
```

---

### 3.3 模块三：距离场预处理（GPU加速）

**场景**：预计算距离场，加速后续路径搜索

**技术**：

- **快速行进法（FMM）** GPU 实现
- **Voronoi 图** 并行计算
- **曼哈顿距离** 批量预计算

---

### 3.4 模块四：多策略并行评估（GPU加速）

**场景**：同时尝试多种布线策略，选择最优

**实现**：

1. 每个 GPU workgroup 处理一种策略
2. 并行计算 8-16 种不同策略
3. GPU 内部投票选择最优解

---

## 4. 完整架构设计

### 4.1 系统框图

```
┌──────────────────────────────────────────────────────────┐
│                   主程序（JS）                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │  网络预处理 & 任务调度器                          │  │
│  └──────────────────────────────────────────────────┘  │
│                           ↓                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  WebGPU 接口层（wgpu-native / browser）          │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│                    GPU 计算层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ 路径搜索管线 │  │碰撞检测管线│ │距离场管线  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  共享内存    │  │ 纹理缓存     │  │原子操作     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│                   结果后处理（JS）                        │
└──────────────────────────────────────────────────────────┘
```

---

### 4.2 关键数据结构

**1. 网格距离场（3D Texture）**

```javascript
// 3D 网格纹理，存储距离场
const distanceFieldTexture = device.createTexture({
	size: {
		width: gridWidth,
		height: gridHeight,
		depthOrArrayLayers: layerCount,
	},
	format: 'r32float',
	usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
});
```

**2. 障碍物纹理（2D 或 3D）**

```javascript
// 二值化障碍物图
const obstacleTexture = device.createTexture({
	size: [gridWidth, gridHeight, layerCount],
	format: 'r8uint',
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
```

**3. 网络路径缓冲**

```javascript
// 存储搜索结果的缓冲
const resultBuffer = device.createBuffer({
	size: pathCount * 4 * 3 * 4, // xyz * float32 * pathLength
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
});
```

---

## 5. 实现步骤

### 阶段一：基础 WebGPU 集成（1-2周）

#### 5.1.1 WebGPU 初始化

```javascript
// 初始化 WebGPU
class WebGPURouter {
	constructor() {
		this.device = null;
		this.context = null;
		this.pipeline = null;
	}

	async init() {
		const adapter = await navigator.gpu.requestAdapter();
		this.device = await adapter.requestDevice();
		console.log('WebGPU 初始化成功');

		// 检查特性
		const features = adapter.features;
		if (!features.has('compute-shader')) {
			console.warn('计算着色器不受支持，回退到 CPU');
			return false;
		}
		return true;
	}
}
```

#### 5.1.2 简单性能测试

实现简单的向量加法测试，验证 GPU 确实比 CPU 快。

---

### 阶段二：碰撞检测加速（2-3周）

#### 5.2.1 线段碰撞检测着色器

- 实现 Sweep and Prune 算法的 GPU 版本
- 批量处理 1000+ 线段对

#### 5.2.2 空间哈希 GPU 实现

- 2D 网格哈希
- 快速过滤不可能碰撞的线段

---

### 阶段三：路径搜索加速（3-4周）

#### 5.3.1 单网络路径搜索着色器

- BFS 在 GPU 上的实现
- 或者 A\* 在 GPU 上的实现

#### 5.3.2 多网络并行搜索

- 每个 workgroup 处理一个网络
- 共享障碍物数据

---

### 阶段四：完整集成与优化（3-4周）

#### 5.4.1 CPU-GPU 混合调度

```
┌─────────────────────────────────────────────────────────┐
│  调度策略                                               │
├─────────────────────────────────────────────────────────┤
│  简单网络（<5引脚）→ CPU 直接处理                       │
│  中等网络（5-50引脚）→ GPU 单workgroup处理            │
│  复杂网络（>50引脚）→ GPU 多workgroup协作              │
└─────────────────────────────────────────────────────────┘
```

#### 5.4.2 渐进式结果更新

- 部分网络布线完成后立即显示
- 不需要等所有网络完成

---

## 6. 性能预期

| 任务                | CPU (单核) | GPU (WebGPU) | 预期加速 |
| ------------------- | ---------- | ------------ | -------- |
| 单网络路径搜索      | 100ms      | 1-5ms        | 20-100x  |
| 批量碰撞检测        | 500ms      | 10-50ms      | 10-50x   |
| 距离场预计算        | 2000ms     | 50-100ms     | 20-40x   |
| 完整布线（100网络） | 30s        | 0.5-2s       | 15-60x   |

---

## 7. 兼容性与回退方案

### 7.1 浏览器支持

| 浏览器  | 最低版本 | 状态                   |
| ------- | -------- | ---------------------- |
| Chrome  | 113+     | ✅ 完整支持            |
| Edge    | 113+     | ✅ 完整支持            |
| Firefox | 113+     | ✅ 完整支持（Nightly） |
| Safari  | 17.0+    | ⚠️ 部分支持            |

### 7.2 回退机制

```javascript
// 自动选择最佳方案
async function getBestRouter() {
	if (await WebGPURouter.isSupported()) {
		console.log('使用 WebGPU 加速');
		return new WebGPURouter();
	} else if (await WebGLRouter.isSupported()) {
		console.log('使用 WebGL 加速');
		return new WebGLRouter();
	} else {
		console.log('使用纯 CPU');
		return new OriginalCPURouter();
	}
}
```

---

## 8. 集成到现有代码

### 8.1 与 router.js 的集成

```javascript
// 在现有 router.js 中插入 GPU 加速钩子
class GPURouter extends Router {
	constructor() {
		super();
		this.gpu = new WebGPURouter();
	}

	async route() {
		// 1. 预处理（CPU）
		this.prepare();

		// 2. 上传到 GPU
		await this.gpu.uploadGrid(this.grid);
		await this.gpu.uploadObstacles(this.obstacles);

		// 3. GPU 并行搜索
		const gpuPaths = await this.gpu.searchPaths(this.nets);

		// 4. 回退到 CPU 处理失败的网络
		for (const net of this.nets) {
			if (!gpuPaths.has(net)) {
				gpuPaths.set(net, this.routeNetCPU(net));
			}
		}

		// 5. 后处理
		return gpuPaths;
	}
}
```

### 8.2 添加到 UI

在 `index.html` 中添加 GPU 选项：

```html
<div class="panel">
	<h3>⚡ 加速选项</h3>
	<label>
		<input type="checkbox" id="useGpu" checked />
		使用 GPU 加速（如果可用）
	</label>
	<div id="gpuStatus" style="font-size: 12px; color: #666;">检测中...</div>
</div>
```

---

## 9. 项目文件结构建议

```
e:\kz\auto-router-plugin\
├── iframe\
│   ├── jspcb\
│   │   ├── router.js          # 原路由器（CPU版本）
│   │   ├── gpu\
│   │   │   ├── webgpu_router.js    # WebGPU 主入口
│   │   │   ├── shaders\
│   │   │   │   ├── path_search.wgsl
│   │   │   │   ├── collision.wgsl
│   │   │   │   └── distance_field.wgsl
│   │   │   ├── pipelines\
│   │   │   │   ├── search_pipeline.js
│   │   │   │   ├── collision_pipeline.js
│   │   │   │   └── distance_pipeline.js
│   │   │   └── utils\
│   │   │       ├── buffer_manager.js
│   │   │       └── texture_manager.js
│   │   └── main.js           # 修改以支持 GPU 选项
└── docs\
    └── GPU加速方案.md          # 本文件
```

---

## 10. 风险与注意事项

### 10.1 风险

- **浏览器兼容性**：部分旧浏览器不支持 WebGPU
- **内存限制**：GPU 内存有限，大型 PCB 可能需要分块
- **调试困难**：GPU 代码调试比 CPU 复杂
- **数据传输开销**：CPU-GPU 数据传输可能成为瓶颈

### 10.2 缓解措施

- **渐进式启用**：只有检测到 WebGPU 支持时才启用
- **分块处理**：超大型 PCB 分成多个区域处理
- **保留回退**：GPU 失败时自动切换回 CPU
- **批量传输**：减少数据传输次数

---

## 11. 下一步行动建议

1. **第一周**：

    - 简单 WebGPU demo（向量加法）
    - 性能基准测试
    - 确定可行性

2. **第二周**：

    - 碰撞检测 GPU 实现
    - 集成到现有代码
    - A/B 对比测试

3. **第三周**：

    - 路径搜索 GPU 实现
    - 完整测试
    - 优化与调优

4. **第四周**：
    - 用户界面集成
    - 完整文档
    - 发布准备

---

## 12. 参考资源

- WebGPU 官方文档：https://gpuweb.github.io/gpuweb/
- WebGPU 示例：https://webgpu.github.io/webgpu-samples/
- wgpu-native（Electron用）：https://wgpu.rs/
- 路径搜索 GPU 论文：各种学术论文

---

_文档版本：v1.0 | 日期：2025年6月_
