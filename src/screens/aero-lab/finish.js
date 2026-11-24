/* SPDX-License-Identifier: MIT */
import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  KeepStencilOp,
  ReplaceStencilOp,
  Mesh,
  MeshPhysicalMaterial,
  ShaderMaterial,
  Vector2,
} from 'three';

export const finishes = [
  { name: '熔岩橙', color: '#ed5416', metal: 0.56, rough: 0.25, coat: 0.94 },
  { name: '钛银', color: '#bfc8c8', metal: 0.85, rough: 0.29, coat: 0.82 },
  { name: '曜石黑', color: '#333f46', metal: 0.74, rough: 0.29, coat: 0.94 },
  { name: '冰川蓝', color: '#357aa9', metal: 0.63, rough: 0.22, coat: 1 },
  { name: '赛道绿', color: '#80ac32', metal: 0.49, rough: 0.26, coat: 0.93 },
  { name: '夜驰 · 动漫痛车', color: '#373171', metal: 0.44, rough: 0.3, coat: 0.93, graphic: true },
];

const field = `
  uniform float uRadius;
  varying vec3 vCarWorld;
  float hash3(vec3 p) {
    p = fract(p * .3183099 + vec3(.11,.27,.39));
    p *= 17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
  }
  float valueNoise(vec3 p) {
    vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),
                   mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
                   mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float signedEdge() {
    vec3 p=vCarWorld;
    float noise=.19*(valueNoise(p*9.2)-.5)+.072*(valueNoise(p*32.0)-.5);
    return length((p-vec3(-.32,.50,1.72))*vec3(1.12,1.30,1.0))+noise-uRadius;
  }
`;

// The mask, the old finish and the revealed finish all sample the same world-space field.
function litCoat(original, uniforms, revealed, livery, printable) {
  const material = new MeshPhysicalMaterial({
    normalMap: original.normalMap,
    normalScale: new Vector2(0.035, 0.035),
    clearcoat: 1,
    clearcoatRoughness: 0.13,
    envMapIntensity: 1.05,
    side: original.side,
    depthWrite: !revealed,
    polygonOffset: revealed,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    stencilWrite: revealed,
    stencilWriteMask: 0,
    stencilRef: 1,
    stencilFunc: EqualStencilFunc,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: KeepStencilOp,
  });
  const graphic = { value: 0 };
  material.userData.graphic = graphic;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uGraphic = graphic;
    shader.uniforms.uLivery = { value: livery };
    shader.uniforms.uPrintable = { value: Number(printable) };
    shader.vertexShader =
      'varying vec3 vCarWorld;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n vCarWorld=(modelMatrix*vec4(transformed,1.0)).xyz;',
      );
    shader.fragmentShader =
      field +
      '\nuniform float uEdgeOn, uGraphic, uCarHeight, uPrintable; uniform sampler2D uLivery;\n' +
      shader.fragmentShader
        .replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>' +
            (revealed ? '\n if(signedEdge()>0.)discard;' : ''),
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float vinyl = 0.;
          if (uGraphic > .5) {
            vec3 p = vCarWorld;
            // Both doors use the same upright projection, with the pilot facing the nose.
            float printHeight = uCarHeight * .57;
            float sill = uCarHeight*.155 + .09*smoothstep(1.18,1.49,uCarHeight);
            vec2 uv = vec2((.67-p.z)/(1.82*printHeight), (p.y-sill)/printHeight);
            vec2 inside = smoothstep(vec2(0.), vec2(.02), min(uv, 1.-uv));
            vec4 print = texture2D(uLivery, clamp(uv, 0., 1.));
            vinyl = uPrintable * print.a * inside.x * inside.y * smoothstep(.60,.89,abs(p.x));
            // A pair of offset racing stripes continues the print palette over the bonnet.
            float x = p.x + .28 + .05*p.z;
            float hood = smoothstep(.35,.65,p.y) * smoothstep(.45,.97,p.z);
            float aa = max(fwidth(x), .002);
            float white = 1.-smoothstep(.078-aa,.078+aa,abs(x));
            float orange = 1.-smoothstep(.022-aa,.022+aa,abs(x-.127));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.69,.77,.83), hood*white);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95,.14,.016), hood*orange);
            diffuseColor.rgb = mix(diffuseColor.rgb, print.rgb, vinyl);
          }`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\n metalnessFactor=mix(metalnessFactor,.08,vinyl);',
        )
        .replace(
          '#include <opaque_fragment>',
          `
        if (uEdgeOn > .5) {
          float d=abs(signedEdge());
          float core=1.0-smoothstep(.008,.020+fwidth(d)*.65,d);
          float halo=exp(-d*29.0);
          outgoingLight+=vec3(1.8,3.8,4.1)*core+vec3(.055,.85,1.13)*halo;
        }
        #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () => (revealed ? 'aero-revealed' : 'aero-base');
  return material;
}

export function applyFinish(meshes, livery, height) {
  const uniforms = {
    uRadius: { value: 5.4 },
    uEdgeOn: { value: 0 },
    uCarHeight: { value: height },
  };
  const masks = new Map(),
    coats = new Map(),
    layers = [];
  for (const mesh of meshes) {
    const original = mesh.material;
    const printable = !/mirror/i.test(mesh.name + ' ' + original.name);
    const key = original.uuid + (printable ? '/body' : '/trim');
    if (!coats.has(key))
      coats.set(key, [
        litCoat(original, uniforms, false, livery, printable),
        litCoat(original, uniforms, true, livery, printable),
      ]);
    if (!masks.has(original.side))
      masks.set(
        original.side,
        new ShaderMaterial({
          uniforms,
          side: original.side,
          colorWrite: false,
          depthWrite: false,
          stencilWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
          stencilRef: 1,
          stencilFunc: AlwaysStencilFunc,
          stencilZPass: ReplaceStencilOp,
          vertexShader: `varying vec3 vCarWorld;void main(){
        #include <begin_vertex>
        vCarWorld=(modelMatrix*vec4(transformed,1.)).xyz;
        #include <project_vertex>
      }`,
          fragmentShader:
            field + '\nvoid main(){if(signedEdge()>0.)discard;gl_FragColor=vec4(0.);}',
        }),
      );
    const [oldCoat, newCoat] = coats.get(key);
    mesh.material = oldCoat;
    const mask = new Mesh(mesh.geometry, masks.get(original.side)),
      next = new Mesh(mesh.geometry, newCoat);
    mask.renderOrder = 5;
    next.renderOrder = 6;
    mesh.add(mask, next);
    layers.push(mask, next);
  }
  function setMaterial(material, spec) {
    material.color.set(spec.color);
    material.metalness = spec.metal;
    material.roughness = spec.rough;
    material.clearcoat = spec.coat;
    material.userData.graphic.value = Number(!!spec.graphic);
  }
  return (from, to, progress) => {
    const moving = progress > 0 && progress < 1;
    uniforms.uRadius.value = -0.25 + progress * 5.55;
    uniforms.uEdgeOn.value = Number(moving);
    for (const layer of layers) layer.visible = moving;
    for (const [a, b] of coats.values()) {
      setMaterial(a, finishes[progress >= 1 ? to : from]);
      setMaterial(b, finishes[to]);
    }
  };
}
