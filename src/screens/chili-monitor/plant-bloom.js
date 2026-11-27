/* SPDX-License-Identifier: MIT */
import * as THREE from 'three';

const DOWNSAMPLE = 3;
const CORE_SPREAD = 0.72;
const HALO_SPREAD = 1.7;
const CORE_STRENGTH = 0.52;
const HALO_STRENGTH = 0.24;

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const extractShader = /* glsl */ `
  uniform sampler2D source;

  vec3 highlight(vec4 pixel) {
    vec3 color = pixel.rgb / max(0.18, pixel.a);
    float luma = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), color.r * 0.74);
    return pixel.rgb * smoothstep(0.55, 0.83, luma);
  }

  void main() {
    const int span = ${DOWNSAMPLE};
    ivec2 first = ivec2(gl_FragCoord.xy) * span;
    ivec2 edge = textureSize(source, 0) - 1;
    vec3 light = vec3(0.0);
    // Extract each source pixel before averaging; a moving filament keeps its energy.
    for (int y = 0; y < span; y++) {
      for (int x = 0; x < span; x++) {
        light += highlight(texelFetch(source, min(first + ivec2(x, y), edge), 0));
      }
    }
    gl_FragColor = vec4(light / float(span * span), 0.0);
  }
`;

const blurShader = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D source;
  uniform sampler2D haloSource;
  uniform vec2 stepSize;
  uniform float coreSpread;
  uniform float haloSpread;
  layout(location = 0) out vec4 coreOutput;
  layout(location = 1) out vec4 haloOutput;

  vec3 gaussian(sampler2D tex, vec2 delta) {
    vec2 nearTap = delta * 1.384615;
    vec2 farTap = delta * 3.230769;
    return texture2D(tex, vUv).rgb * 0.227027
      + (texture2D(tex, vUv + nearTap).rgb + texture2D(tex, vUv - nearTap).rgb) * 0.316216
      + (texture2D(tex, vUv + farTap).rgb + texture2D(tex, vUv - farTap).rgb) * 0.070270;
  }

  void main() {
    coreOutput = vec4(gaussian(source, stepSize * coreSpread), 0.0);
    haloOutput = vec4(gaussian(haloSource, stepSize * haloSpread), 0.0);
  }
`;

const compositeShader = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D source;
  uniform sampler2D coreLayer;
  uniform sampler2D haloLayer;
  uniform vec2 bloomUvScale;
  uniform float coreStrength;
  uniform float haloStrength;

  float maxChannel(vec3 rgb) {
    return max(rgb.r, max(rgb.g, rgb.b));
  }

  void main() {
    vec4 surface = texture2D(source, vUv);
    vec2 bloomUv = vUv * bloomUvScale;
    vec3 core = texture2D(coreLayer, bloomUv).rgb * coreStrength;
    vec3 halo = texture2D(haloLayer, bloomUv).rgb * haloStrength;
    vec4 behind = vec4(halo, maxChannel(halo)) * (1.0 - surface.a);
    // Screen-blend the tight highlights over the plant and keep the wide halo behind it.
    vec3 color = min(surface.rgb + core * (1.0 - surface.rgb) + behind.rgb, 1.0);
    gl_FragColor = vec4(color, max(surface.a + behind.a, maxChannel(color)));
  }
`;

export function createPlantBloom(renderer) {
  const target = (depthBuffer = false, count = 1) =>
    new THREE.WebGLRenderTarget(1, 1, { depthBuffer, count, stencilBuffer: false });
  const beauty = target(true);
  beauty.samples = Math.min(renderer.capabilities.maxSamples, 2);
  const highlights = target();
  const horizontal = target(false, 2);
  const soft = target(false, 2);
  const uniforms = {
    source: { value: null },
    haloSource: { value: null },
    stepSize: { value: new THREE.Vector2() },
    bloomUvScale: { value: new THREE.Vector2() },
    coreLayer: { value: soft.textures[0] },
    haloLayer: { value: soft.textures[1] },
    coreSpread: { value: CORE_SPREAD },
    haloSpread: { value: HALO_SPREAD },
    coreStrength: { value: CORE_STRENGTH },
    haloStrength: { value: HALO_STRENGTH },
  };

  function pass(fragmentShader, glslVersion = null) {
    return new THREE.ShaderMaterial({
      uniforms,
      glslVersion,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
  }

  const extract = pass(extractShader);
  const blur = pass(blurShader, THREE.GLSL3);
  const composite = pass(compositeShader);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const triangle = new THREE.Mesh(geometry, extract);
  triangle.frustumCulled = false;
  const postScene = new THREE.Scene();
  const postCamera = new THREE.Camera();
  postScene.add(triangle);

  function drawPass(material, source, output) {
    triangle.material = material;
    uniforms.source.value = source.texture;
    renderer.setRenderTarget(output);
    renderer.render(postScene, postCamera);
  }

  return {
    resize(pixelWidth, pixelHeight) {
      const width = Math.max(1, Math.floor(pixelWidth));
      const height = Math.max(1, Math.floor(pixelHeight));
      const smallWidth = Math.ceil(width / DOWNSAMPLE);
      const smallHeight = Math.ceil(height / DOWNSAMPLE);
      beauty.setSize(width, height);
      highlights.setSize(smallWidth, smallHeight);
      horizontal.setSize(smallWidth, smallHeight);
      soft.setSize(smallWidth, smallHeight);
      uniforms.bloomUvScale.value.set(
        width / (smallWidth * DOWNSAMPLE),
        height / (smallHeight * DOWNSAMPLE),
      );
    },

    render(scene, camera) {
      const output = renderer.getRenderTarget();
      renderer.setRenderTarget(beauty);
      renderer.render(scene, camera);

      drawPass(extract, beauty, highlights);
      uniforms.stepSize.value.set(1 / horizontal.width, 0);
      uniforms.haloSource.value = highlights.texture;
      drawPass(blur, highlights, horizontal);
      uniforms.stepSize.value.set(0, 1 / soft.height);
      uniforms.haloSource.value = horizontal.textures[1];
      drawPass(blur, horizontal, soft);
      drawPass(composite, beauty, output);
    },

    dispose() {
      beauty.dispose();
      highlights.dispose();
      horizontal.dispose();
      soft.dispose();
      extract.dispose();
      blur.dispose();
      composite.dispose();
      geometry.dispose();
    },
  };
}
