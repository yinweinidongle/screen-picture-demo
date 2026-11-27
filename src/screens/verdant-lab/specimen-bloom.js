/* SPDX-License-Identifier: MIT */
import * as T from 'three';

// Downsample the actual rendered highlights, blur in two directions and composite over
// the transparent plate. The surrounding dashboard remains outside the bloom pass.
export function makeBloom(renderer) {
  const target = (depthBuffer = false) =>
    new T.WebGLRenderTarget(1, 1, { depthBuffer, stencilBuffer: false });
  const beauty = target(true),
    horizontal = target(),
    blurred = target();
  beauty.samples = Math.min(4, renderer.capabilities.maxSamples);
  const uniforms = {
    source: { value: null },
    bloom: { value: null },
    stepSize: { value: new T.Vector2() },
    strength: { value: 1 },
  };
  const vert = 'varying vec2 st; void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const source = `varying vec2 st; uniform sampler2D source,bloom; uniform vec2 stepSize; uniform float strength;`;
  function pass(fragment) {
    return new T.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: source + fragment,
      depthTest: false,
      depthWrite: false,
      blending: T.NoBlending,
    });
  }
  const kernel = `vec3 sum(vec2 s){
    return light(s)*.204164+(light(s+stepSize)+light(s-stepSize))*.180174+
      (light(s+stepSize*2.)+light(s-stepSize*2.))*.123832+
      (light(s+stepSize*3.)+light(s-stepSize*3.))*.066282+
      (light(s+stepSize*4.)+light(s-stepSize*4.))*.027630;
  } void main(){gl_FragColor=vec4(sum(st),1.);}`;
  const extract = pass(
    'vec3 light(vec2 s){vec3 c=texture2D(source,s).rgb;return c*smoothstep(.37,.82,max(c.g,c.b));}' +
      kernel,
  );
  const soften = pass('vec3 light(vec2 s){return texture2D(source,s).rgb;}' + kernel);
  const combine =
    pass(`void main(){vec4 c=texture2D(source,st);vec3 glow=texture2D(bloom,st).rgb*strength;
    gl_FragColor=vec4(c.rgb+glow,max(c.a,max(max(glow.r,glow.g),glow.b)));}`);
  const geo = new T.PlaneGeometry(2, 2),
    quad = new T.Mesh(geo, extract),
    scene = new T.Scene(),
    camera = new T.Camera();
  quad.frustumCulled = false;
  scene.add(quad);
  return {
    resize(w, h) {
      const small = (v) => Math.max(1, Math.ceil(v / 3));
      beauty.setSize(w, h);
      horizontal.setSize(small(w), small(h));
      blurred.setSize(small(w), small(h));
    },
    render(world, view, scan) {
      renderer.setRenderTarget(beauty);
      renderer.render(world, view);
      uniforms.source.value = beauty.texture;
      uniforms.stepSize.value.set(1.22 / horizontal.width, 0);
      quad.material = extract;
      renderer.setRenderTarget(horizontal);
      renderer.render(scene, camera);
      uniforms.source.value = horizontal.texture;
      uniforms.stepSize.value.set(0, 1.22 / horizontal.height);
      quad.material = soften;
      renderer.setRenderTarget(blurred);
      renderer.render(scene, camera);
      uniforms.source.value = beauty.texture;
      uniforms.bloom.value = blurred.texture;
      uniforms.strength.value = 0.08 + 0.69 * scan;
      quad.material = combine;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      beauty.dispose();
      horizontal.dispose();
      blurred.dispose();
      extract.dispose();
      soften.dispose();
      combine.dispose();
      geo.dispose();
    },
  };
}

export function samples(uniforms) {
  const p = [],
    l = [];
  let noise = 143;
  const random = () => (noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 118; i++) {
    const y = 0.34 + random() * 4.1,
      x = (random() - 0.48) * (2.4 - Math.abs(y - 2.5) * 0.36),
      z = -0.35 - random() * 0.4;
    p.push(x, y, z);
    if (i % 7 === 0) l.push(x, y, z, x + 0.03 + random() * 0.13, y + random() * 0.15, z - 0.01);
  }
  const points = new T.BufferGeometry(),
    lines = new T.BufferGeometry();
  points.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  lines.setAttribute('position', new T.Float32BufferAttribute(l, 3));
  const group = new T.Group();
  group.add(
    new T.Points(
      points,
      new T.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        vertexShader: `uniform float clock;varying float fade;void main(){fade=.42+.42*sin(position.y*19.+position.x*31.+clock*.72);gl_PointSize=1.+fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying float fade;uniform float scan;void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.3,.72,.85,(1.-smoothstep(.2,.5,r))*fade*.48*scan);}`,
      }),
    ),
  );
  group.add(
    new T.LineSegments(
      lines,
      new T.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader:
          'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float scan;void main(){gl_FragColor=vec4(.24,.55,.64,.22*scan);}',
      }),
    ),
  );
  return group;
}
