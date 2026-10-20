# VIZ / LAB · 可视化大屏展厅

**[打开 Home 展厅](https://yinweinidongle.github.io/screen-picture-demo/home.html)**

四张卡片直接展示大屏实际画面，支持按类型筛选、卡片内实时交互预览和进入完整大屏。根目录同样打开展厅。

- [智慧风电监管平台 · Three.js 三维机组](https://yinweinidongle.github.io/screen-picture-demo/wind.html)
- [全国人口统计总览](https://yinweinidongle.github.io/screen-picture-demo/population.html)
- [智慧工厂 · 实时 3D 厂区](https://yinweinidongle.github.io/screen-picture-demo/factory.html)
- [智能巡检运营调度](https://yinweinidongle.github.io/screen-picture-demo/inspection.html)
- [下载厂区 GLB 模型](https://yinweinidongle.github.io/screen-picture-demo/factory-campus.glb)

智慧工厂支持拖动旋转、滚轮缩放、建筑点选、全景、自动环绕，以及菲涅耳轮廓光、极细冰蓝网格与柔和辉光夜景。日夜切换采用从左向右的扫光过渡。页面脚本、样式与素材均已内嵌。GLB 经 Khronos 验证，0 错误、0 警告。

页面数据为视觉演示数据。三维厂区按单张参考图重建，未提供原始 CAD 或三维资产；背面与不可见细部为合理补建。

风电大屏包含透明机舱 Shader、精细传动链、三叶片翼型模型、风机启停、线框、爆炸拆解、发电流光、旋转缩放和模型部件点选。按参考图的可见部分重建，未知原始尺寸和内部结构采用合理建模。业务数据均为演示。

## 部署

GitHub Pages 使用 master 分支根目录，提交后自动更新。

## 素材与许可

D3.js 7.9.0 (ISC)、Three.js r160 (MIT)，内嵌版权声明保留。地理数据来自阿里云 DataV 和 Natural Earth；地球纹理来自 Three.js 官方示例；巡检地形来自 Esri。人口页眉、工厂降级图片与黑白网格纹理由 ImageGen 生成。实时工厂几何由程序建模。
