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
import { reflectLines } from './line-reflections.js';

export const finishes = [
  { name: '熔岩橙', color: '#df521b', metal: 0.7, rough: 0.32, coat: 1 },
  { name: '钛银', color: '#bfc8c8', metal: 0.85, rough: 0.29, coat: 0.82 },
  { name: '曜石黑', color: '#313b43', metal: 0.62, rough: 0.32, coat: 1 },
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
function litCoat(original, uniforms, revealed, livery, printable, reflections) {
  const atlas = original.name === 'Aventador body paint atlas';
  const material = new MeshPhysicalMaterial({
    map: atlas ? original.map : null,
    normalMap: original.normalMap,
    normalScale: new Vector2(0.035, 0.035),
    clearcoat: 1,
    clearcoatRoughness: 0.075,
    ior: 1.52,
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
  if (atlas) material.defines.AERO_PAINT_ATLAS = 1;
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
      '\nuniform float uEdgeOn, uGraphic, uCarHeight, uPrintable; uniform sampler2D uLivery, uGrain;\n' +
      shader.fragmentShader
        .replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>' +
            (revealed ? '\n if(signedEdge()>0.)discard;' : ''),
        )
        .replace(
          '#include <map_fragment>',
          `float paintCoverage=1.;
          #ifdef AERO_PAINT_ATLAS
            vec3 ink=texture2D(map,vMapUv).rgb;
            // The gold islands in the author's albedo mark the painted sheet metal.
            paintCoverage=smoothstep(.035,.16,ink.r-ink.b)*smoothstep(.044,.20,ink.g-ink.b);
            vec3 enamel=diffuseColor.rgb*mix(.73,1.,sqrt(clamp(ink.r,0.,1.)));
            diffuseColor.rgb=mix(ink,enamel,paintCoverage);
          #endif`,
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
            vinyl = paintCoverage * uPrintable * print.a * inside.x * inside.y * smoothstep(.60,.89,abs(p.x));
            // A pair of offset racing stripes continues the print palette over the bonnet.
            float x = p.x + .28 + .05*p.z;
            float hood = paintCoverage * smoothstep(.35,.65,p.y) * smoothstep(.45,.97,p.z);
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
          '#include <metalnessmap_fragment>\n metalnessFactor=mix(.32,mix(metalnessFactor,.08,vinyl),paintCoverage);',
        )
        .replace(
          '#include <clearcoat_normal_fragment_maps>',
          `#include <clearcoat_normal_fragment_maps>
          vec3 axis=abs(normalize(cross(dFdx(vCarWorld),dFdy(vCarWorld))));
          vec3 blend=pow(axis,vec3(5.));blend/=max(.001,blend.x+blend.y+blend.z);
          vec3 g=texture2D(uGrain,vCarWorld.yz*4.6).rgb*blend.x+
                 texture2D(uGrain,vCarWorld.xz*4.6).rgb*blend.y+
                 texture2D(uGrain,vCarWorld.xy*4.6).rgb*blend.z;
          vec3 ref=axis.y>.92?vec3(1.,0.,0.):vec3(0.,1.,0.);
          vec3 t=normalize(cross(nonPerturbedNormal,mat3(viewMatrix)*ref));
          vec3 b=cross(nonPerturbedNormal,t);
          float baseInk=(1.-vinyl)*paintCoverage;
          normal=normalize(normal+(t*(g.r-.5)+b*(g.g-.5))*.079*baseInk);
          roughnessFactor=clamp(roughnessFactor+(g.b-.5)*.085*baseInk,.12,.78);
          roughnessFactor=mix(.49,roughnessFactor,paintCoverage);
          float face=clamp(dot(nonPerturbedNormal,normalize(vViewPosition)),0.,1.);
          diffuseColor.rgb*=mix(1.,mix(.57,1.13,pow(face,.78)),baseInk);
          #ifdef USE_CLEARCOAT
            vec2 peel=(texture2D(uGrain,(vCarWorld.xy*.71+vCarWorld.zy*.48)).rg-.5);
            clearcoatNormal=normalize(clearcoatNormal+(t*peel.x+b*peel.y)*.006);
          #endif`,
        )
        .replace(
          '#include <lights_physical_fragment>',
          '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n material.clearcoat*=mix(.09,1.,paintCoverage);\n#endif',
        )
        .replace(
          '#include <opaque_fragment>',
          `
        if (uEdgeOn > .5) {
          float d=abs(signedEdge());
          float core=1.0-smoothstep(.008,.020+fwidth(d)*.65,d);
          float halo=exp(-d*29.0);
          outgoingLight+=paintCoverage*(vec3(1.8,3.8,4.1)*core+vec3(.055,.85,1.13)*halo);
        }
        #ifdef AERO_PAINT_ATLAS
          float lens=smoothstep(1.1,1.76,vCarWorld.z)*smoothstep(.54,.72,abs(vCarWorld.x))
            *smoothstep(.39,.53,vCarWorld.y)*(1.-paintCoverage);
          outgoingLight+=vec3(1.45,1.83,2.15)*lens*smoothstep(.038,.29,min(ink.r,min(ink.g,ink.b)));
          float rear=(1.-smoothstep(-2.1,-1.7,vCarWorld.z))*smoothstep(.5,.75,abs(vCarWorld.x));
          outgoingLight+=vec3(1.75,.025,.008)*rear*(1.-paintCoverage)*smoothstep(.045,.32,ink.r-2.*max(ink.g,ink.b));
        #endif
        #include <opaque_fragment>`,
        );
    reflectLines(shader, reflections);
  };
  material.customProgramCacheKey = () =>
    (revealed ? 'aero-revealed' : 'aero-base') + (atlas ? '-atlas' : '');
  return material;
}

export function applyFinish(meshes, livery, height, grain, reflections) {
  const uniforms = {
    uRadius: { value: 5.4 },
    uEdgeOn: { value: 0 },
    uCarHeight: { value: height },
    uGrain: { value: grain },
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
        litCoat(original, uniforms, false, livery, printable, reflections),
        litCoat(original, uniforms, true, livery, printable, reflections),
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
