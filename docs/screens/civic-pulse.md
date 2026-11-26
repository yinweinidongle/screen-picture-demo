# 榕城 · 智慧市政运行中枢

[在线大屏](https://yinweinidongle.github.io/screen-picture-demo/civic-pulse.html) · [离线单文件](https://yinweinidongle.github.io/screen-picture-demo/standalone/civic-pulse.html)

中央的感知树把排水管网、道路桥梁、公共照明和市容环卫映射到四组树枝。根部的光纹沿枝干向外传播，枝尖在波峰抵达时亮起。

## 操作

- 点击底部的辖区，查看该区的工单、设备和逐时流量。点击树上的领域标签或左侧领域条可以聚焦一组树枝，再次点击可回到全部领域。
- 点击现场动态可查看工单所属片区、承办班组和处置记录，同时向对应树枝发出一次脉冲。“查看工单”打开当前范围内的演示工单列表。
- 在树上拖动旋转，滚轮缩放。键盘聚焦三维视图后，可用方向键转动、加减键缩放、空格暂停、Home 复位。逐时图支持指针悬停和左右方向键读数。
- 手机将三维视图放在指标下方，图表随页面纵向排列。减少动态效果偏好会暂停流光。WebGL 不可用时，Canvas 2D 从同一份三维骨架投影树枝、粒子和标签，支持同样的领域选择。

## 数据口径

画面是 2026 年 11 月 26 日 16 时的一组确定性模拟快照。范围包含福州六城区，统计时段为前一天 17 时至当天 16 时的 24 个小时桶。全市共受理 4,376 件。各领域和辖区均可加总回全市；受理总数等于已办结、处置中与待派单数量之和。按期办结率分母为已办结量，健康指数由终端在线率和按期办结率按 60% 和 40% 加权。现场动态取自 72 条示例明细。[数据与计算](../../src/screens/civic-pulse/data.js)

## 三维场景与素材

视觉设计参考本地“模拟神经系统-vfx”的纵向流纹、分叉处的传播和枝尖微粒。本场景重新编写榕树的空间骨架、根系、分支形态、粒子分布与 GLSL 材质。每条子枝记录分叉点到根部的累计弧长，树皮光纹和枝尖同步采样同一传播函数。选择服务时，其他枝条亮度下降。标签从同一组空间锚点投影到画面上。[骨架与树冠](../../src/screens/civic-pulse/canopy.js) · [材质与脉冲](../../src/screens/civic-pulse/materials.js)

桌面参考尺寸为 1920 × 1080。在 1440 × 810 的 Chromium WebGL 2 实录中，树体、外沿辉光、枝干光晕、粒子和地面刻度共 5 次绘制、105,978 个三角形。动画在页面或三维视图不可见时暂停调度。

滨江夜景由内置 OpenAI ImageGen 生成，原图按 1536 × 1024 导出为 WebP。它作为三维场景背后的独立图层，按容器比例居中裁切。页面截图和 GIF 来自运行中的页面。[滨江夜景素材](../../assets/art/civic-river.webp) · [素材清单](../../assets/manifest.json)

<details>
<summary>滨江夜景生成提示词</summary>

Create a cinematic 3:2 landscape matte painting to sit BEHIND a luminous 3D sculpture in a sophisticated municipal operations dashboard. A fictional panorama inspired by Fuzhou's Min River, seen from a low riverbank in the last indigo light of blue hour. Quiet dark ink-blue sky fills the upper two thirds, very subtle layers of far mountain ridges, damp atmosphere. A fine band of believable mid-rise Chinese city silhouettes and sparsely illuminated warm windows near the lower third, a delicate arched bridge to the far right, reflections and low volumetric mist across black-blue river in the foreground. The middle is the darkest and most open, with the architectural details clustered at the sides. Fine cinematic detail, restrained deep petrol and navy, faint pale cyan haze at the horizon, occasional tiny amber lights; romantic and tangible, crisp architectural silhouettes. Landscape only, edge to edge. No foreground object, no tree, no hologram, no graphical elements, no text, no symbols, no border, no watermark.

</details>
