/* SPDX-License-Identifier: MIT */
import * as T from 'three';

// Photograph and light cards are filtered together, so rough pigment and clear
// lacquer sample the same studio at their respective reflection roughness.
export function lightingRig(renderer, photograph) {
  const baker = new T.PMREMGenerator(renderer);
  const room = new T.Scene();
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: { photo: { value: photograph }, mode: { value: 0 } },
    vertexShader: `varying vec3 ray;void main(){ray=position;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 ray;uniform sampler2D photo;uniform int mode;
      float card(vec3 d,vec3 axis,vec2 size,float penumbra){
        vec3 n=normalize(axis);vec3 u=normalize(cross(vec3(0.,1.,0.),n));vec3 v=cross(n,u);
        float facing=dot(d,n);
        vec2 p=abs(vec2(dot(d,u),dot(d,v))/max(.001,facing))-size;
        return step(.01,facing)*(1.-smoothstep(-penumbra,penumbra,max(p.x,p.y)));
      }
      void main(){
        vec3 d=normalize(ray);
        vec2 uv=vec2(atan(d.z,d.x)*.15915494+.5,asin(clamp(d.y,-1.,1.))*.31830989+.5);
        vec3 raw=texture2D(photo,uv).rgb;
        vec3 c;
        if(mode==0){
          c=raw/(1.+raw*.16)*.68;
          c*=1.-.67*card(d,vec3(1.,.09,.2),vec2(1.5,.19),.085);
          c+=vec3(3.35,3.52,3.8)*card(d,vec3(1.,.96,-.22),vec2(1.08,.075),.036);
          c+=vec3(2.9,2.75,2.52)*card(d,vec3(-.42,.79,1.),vec2(.76,.28),.12);
          c+=vec3(1.15,1.55,2.)*card(d,vec3(-1.,.38,-.65),vec2(.90,.09),.04);
        }else if(mode==1){
          c=raw/(1.+raw)*.17+vec3(.010,.016,.039);
          c+=vec3(.41,.61,.83)*card(d,vec3(1.,.51,.35),vec2(2.4,.075),.024);
          c+=vec3(.69,.71,.85)*card(d,vec3(-1.,.54,-.10),vec2(2.8,.055),.023);
          c+=vec3(2.75,2.87,3.44)*card(d,vec3(.16,1.,.36),vec2(.82,.17),.075);
          c+=vec3(.50,.72,.95)*card(d,vec3(.65,.31,1.),vec2(.60,.25),.16);
        }else{
          c=mix(vec3(.23,.285,.32),vec3(.25,.47,.77),smoothstep(.0,.78,d.y));
          c*=mix(.19,1.,smoothstep(-.13,.12,d.y));
          c+=vec3(1.6,.65,.28)*exp(-abs(d.y-.08)*8.)*(.5+.5*d.x);
          c+=vec3(4.8,3.,1.7)*card(d,vec3(.72,.24,1.),vec2(.105),.12);
        }
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const geometry = new T.BoxGeometry(8, 8, 8);
  room.add(new T.Mesh(geometry, material));
  const maps = new Map();
  return {
    get(mode) {
      if (!maps.has(mode)) {
        material.uniforms.mode.value = { studio: 0, tunnel: 1, pilot: 2 }[mode];
        maps.set(mode, baker.fromScene(room, 0, 0.1, 20));
      }
      return maps.get(mode).texture;
    },
    dispose() {
      for (const target of maps.values()) target.dispose();
      baker.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}

export function paintGrain() {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  let seed = 0x41ab92;
  const sample = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < data.length; i += 4) {
    const angle = sample() * Math.PI * 2,
      tilt = Math.sqrt(sample());
    data[i] = 128 + Math.round(115 * Math.cos(angle) * tilt);
    data[i + 1] = 128 + Math.round(115 * Math.sin(angle) * tilt);
    data[i + 2] = Math.round(sample() * 255);
    data[i + 3] = 255;
  }
  const texture = new T.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
