/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const floorShader = {
  ...Reflector.ReflectorShader,
  vertexShader: Reflector.ReflectorShader.vertexShader
    .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 vFloor;')
    .replace('vUv = textureMatrix', 'vFloor=position.xy; vUv = textureMatrix'),
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec4 vUv; varying vec2 vFloor;
    void main(){
      vec2 uv=vUv.xy/vUv.w;
      float roughMip=1.8+smoothstep(1.2,4.7,length(vFloor))*1.4;
      vec3 image=textureLod(tDiffuse,uv,roughMip).rgb;
      image/=1.+image*.38;
      vec2 p=abs(vFloor);float stripe=1.-smoothstep(.003,.012,abs(p.x-1.73));
      float platform=1.-smoothstep(1.,1.04,max(p.x/1.73,p.y/3.35));
      float dashed=step(.78,fract(vFloor.y*.95))*(1.-smoothstep(3.0,3.35,p.y));
      float grain=fract(sin(dot(floor(vFloor*180.),vec2(12.9898,78.233)))*43758.5453);
      vec3 base=vec3(.032,.039,.041)+platform*vec3(.012,.014,.014);
      base+=(grain-.5)*.0016+vec3(.22,.245,.14)*stripe*dashed;
      gl_FragColor=vec4(base+image*(.145+platform*.03),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function makeStudio(scene, renderer) {
  const floor = new Reflector(new T.PlaneGeometry(90, 90), {
    textureWidth: 640,
    textureHeight: 384,
    multisample: 0,
    clipBias: 0.002,
    shader: floorShader,
  });
  floor.getRenderTarget().stencilBuffer = true;
  floor.getRenderTarget().texture.generateMipmaps = true;
  floor.getRenderTarget().texture.minFilter = T.LinearMipmapLinearFilter;
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shadowFloor = new T.Mesh(
    new T.PlaneGeometry(30, 30),
    new T.ShadowMaterial({ color: 0x080a0c, opacity: 0.31, depthWrite: false }),
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = 0.003;
  shadowFloor.receiveShadow = true;
  shadowFloor.renderOrder = 2;
  scene.add(shadowFloor);
  const ao = document.createElement('canvas');
  ao.width = ao.height = 128;
  const ctx = ao.getContext('2d'),
    grad = ctx.createRadialGradient(64, 64, 5, 64, 64, 63);
  grad.addColorStop(0, 'rgba(0,0,0,.88)');
  grad.addColorStop(0.55, 'rgba(0,0,0,.64)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const contact = new T.Mesh(
    new T.PlaneGeometry(2.93, 5.72),
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(ao),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.009;
  contact.renderOrder = 3;
  scene.add(contact);
  const patches = new T.Group(),
    footprint = new T.PlaneGeometry(0.54, 0.81);
  scene.add(patches);

  const wallMat = new T.ShaderMaterial({
    side: T.BackSide,
    uniforms: { level: { value: 1 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float level;
      void main(){float angle=vUv.x*6.2831853,h=vUv.y;
        float wash=.5+.5*cos(angle*2.-1.1);
        float glow=exp(-pow((h-.24)*4.,2.))*(.55+.45*wash);
        float division=abs(fract(vUv.x*56.)-.5);
        float seam=1.-smoothstep(.001,.016,division);
        vec3 col=vec3(.013,.018,.022)+glow*vec3(.085,.104,.112);
        col*=1.-seam*.13;gl_FragColor=vec4(col*level,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wall = new T.Mesh(new T.CylinderGeometry(14, 14, 11, 96, 1, true), wallMat);
  wall.position.y = 5.45;
  scene.add(wall);
  const lightBars = new T.Group();
  scene.add(lightBars);
  const lightMat = new T.MeshBasicMaterial({
    color: new T.Color(1.55, 1.72, 1.69),
    side: T.DoubleSide,
  });
  const housingMat = new T.MeshStandardMaterial({
    color: '#535d60',
    metalness: 0.67,
    roughness: 0.37,
  });
  const lamp = new T.BoxGeometry(6.7, 0.045, 0.08),
    housing = new T.BoxGeometry(7, 0.16, 0.11);
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI * 2) / 9,
      unit = new T.Group();
    unit.position.set(13.36 * Math.sin(a), 1.94, 13.36 * Math.cos(a));
    unit.rotation.y = a;
    const frame = new T.Mesh(housing, housingMat),
      strip = new T.Mesh(lamp, lightMat);
    strip.position.z = -0.069;
    unit.add(frame, strip);
    lightBars.add(unit);
  }
  const fill = new T.HemisphereLight('#eff5fa', '#514739', 0.34);
  const key = new T.DirectionalLight('#fff0d8', 1.7);
  key.position.set(-2.5, 7, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -4.5,
    right: 4.5,
    top: 4.5,
    bottom: -4.5,
    near: 0.5,
    far: 17,
  });
  key.shadow.normalBias = 0.012;
  key.shadow.bias = -0.0003;
  key.shadow.radius = 5;
  key.shadow.blurSamples = 8;
  const rim = new T.DirectionalLight('#cdeaff', 1.85);
  rim.position.set(3, 3, -4);
  const face = new T.DirectionalLight('#fbf3e2', 0.55);
  face.position.set(2, 2, 5);
  scene.add(fill, key, rim, face);
  scene.background = new T.Color('#455052');
  return {
    placeWheels(wheels) {
      patches.clear();
      for (const p of wheels) {
        const patch = new T.Mesh(footprint, contact.material);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(p.x, 0.012, p.z);
        patch.renderOrder = 4;
        patches.add(patch);
      }
    },
    light(dark) {
      wallMat.uniforms.level.value = dark ? 0.26 : 0.74;
      key.intensity = dark ? 0.6 : 1.55;
      fill.intensity = dark ? 0.15 : 0.3;
      rim.intensity = dark ? 2.2 : 1.85;
      face.intensity = dark ? 0.22 : 0.55;
      scene.environmentIntensity = dark ? 0.49 : 0.78;
      renderer.toneMappingExposure = dark ? 0.81 : 0.91;
    },
    dispose() {
      floor.dispose();
      footprint.dispose();
    },
  };
}
