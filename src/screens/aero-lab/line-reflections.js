/* SPDX-License-Identifier: MIT */
import * as T from 'three';

const captureBounds = {
  wind: { low: [-1.24, -0.05, -3.1], high: [1.24, 1.38, 3.1], gain: 1.38 },
  tunnel: { low: [-7, -0.24, -35], high: [7, 7.2, 26], gain: 2.25 },
  pilot: { low: [-7, 0.06, -32], high: [7, 5, 68], gain: 1.35 },
};

// Capture only the emissive ribbons. The HDR studio still supplies the broad
// lighting, while the front and rear probes resolve nearby moving highlights.
export function lineReflections(renderer) {
  const size = matchMedia('(max-width: 700px)').matches ? 160 : 256;
  const positions = [new T.Vector3(0, 0.64, -1.24), new T.Vector3(0, 0.64, 1.24)];
  const scene = new T.Scene();
  scene.background = new T.Color(0);
  const cameras = positions.map((position) => {
    const target = new T.WebGLCubeRenderTarget(size, {
      type: renderer.extensions.has('EXT_color_buffer_float')
        ? T.HalfFloatType
        : T.UnsignedByteType,
      generateMipmaps: true,
      minFilter: T.LinearMipmapLinearFilter,
      depthBuffer: false,
    });
    const camera = new T.CubeCamera(0.035, 160, target);
    camera.position.copy(position);
    return camera;
  });
  const uniforms = {
    lineRear: { value: cameras[0].renderTarget.texture },
    lineFront: { value: cameras[1].renderTarget.texture },
    lineOrigins: { value: positions },
    lineGain: { value: 0 },
    lineLow: { value: new T.Vector3() },
    lineHigh: { value: new T.Vector3() },
  };
  let previous = null,
    lastStamp,
    captured = -Infinity;
  const savedSize = new T.Vector2();
  return {
    uniforms,
    update(sources, mode, stamp, time, force) {
      if (!sources) {
        if (previous) scene.clear();
        previous = null;
        uniforms.lineGain.value = 0;
        return;
      }
      const changed = previous !== sources;
      if (!changed && (stamp === lastStamp || (!force && time - captured < 1000 / 24))) return;
      if (changed) {
        const bounds = captureBounds[mode];
        uniforms.lineGain.value = bounds.gain;
        uniforms.lineLow.value.fromArray(bounds.low);
        uniforms.lineHigh.value.fromArray(bounds.high);
        scene.clear();
        for (const source of sources) {
          const proxy = new T.Mesh(source.geometry, source.material);
          proxy.frustumCulled = false;
          proxy.matrixAutoUpdate = false;
          proxy.renderOrder = source.renderOrder;
          scene.add(proxy);
        }
      }
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i],
          proxy = scene.children[i];
        source.updateWorldMatrix(true, false);
        proxy.matrix.copy(source.matrixWorld);
        proxy.matrixWorldNeedsUpdate = true;
      }
      const viewport = sources[0].material.uniforms.uViewport?.value;
      if (viewport) {
        savedSize.copy(viewport);
        viewport.set(size, size);
      }
      // Do not consume a pending vehicle shadow-map refresh on the emitter-only pass.
      const shadow = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate = false;
      try {
        for (const camera of cameras) camera.update(renderer, scene);
      } finally {
        if (viewport) viewport.copy(savedSize);
        renderer.shadowMap.needsUpdate = shadow;
      }
      previous = sources;
      lastStamp = stamp;
      captured = time;
    },
    dispose() {
      for (const camera of cameras) camera.renderTarget.dispose();
      scene.clear();
    },
  };
}

export function reflectLines(shader, uniforms, glass = false) {
  Object.assign(shader.uniforms, uniforms);
  if (glass)
    shader.vertexShader =
      'varying vec3 vCarWorld;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n vCarWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
    ${glass ? 'varying vec3 vCarWorld;' : ''}
    uniform samplerCube lineRear,lineFront;
    uniform vec3 lineLow,lineHigh,lineOrigins[2];uniform float lineGain;
    vec3 lineRadiance(vec3 point,vec3 N,vec3 V,float rough){
      vec3 ray=normalize((vec4(reflect(-V,N),0.)*viewMatrix).xyz);
      vec3 safe=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.0001));
      vec3 exitT=max((lineLow-point)/safe,(lineHigh-point)/safe);
      vec3 hit=point+ray*max(.01,min(exitT.x,min(exitT.y,exitT.z)));
      vec3 back=textureLod(lineRear,hit-lineOrigins[0],rough*4.).rgb;
      vec3 front=textureLod(lineFront,hit-lineOrigins[1],rough*4.).rgb;
      float grazing=pow(1.-clamp(dot(N,V),0.,1.),3.);
      return mix(back,front,smoothstep(-.95,.95,point.z))*lineGain*(.33+1.22*grazing);
    }`,
    )
    .replace(
      '#include <opaque_fragment>',
      `
    if(lineGain>0.) {
      ${
        glass
          ? 'outgoingLight+=lineRadiance(vCarWorld,normal,normalize(vViewPosition),roughnessFactor);'
          : 'outgoingLight+=lineRadiance(vCarWorld,clearcoatNormal,normalize(vViewPosition),material.clearcoatRoughness)*mix(.09,material.clearcoat,paintCoverage);'
      }
    }
    #include <opaque_fragment>`,
    );
}
