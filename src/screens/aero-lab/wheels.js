/* SPDX-License-Identifier: MIT */
import * as T from 'three';

export function rollingWheels(group, meshes, centers) {
  const authored = meshes
    .filter((mesh) => mesh.userData.aeroAxle)
    .map((mesh) => {
      const center = mesh.getWorldPosition(new T.Vector3());
      centers.push(center);
      const world = mesh.getWorldQuaternion(new T.Quaternion());
      return {
        mesh,
        rest: mesh.quaternion.clone(),
        axis: new T.Vector3(1, 0, 0).applyQuaternion(world.invert()),
        radius: center.y - 0.006,
      };
    });
  const spin = new T.Quaternion();
  if (authored.length)
    return (distance) => {
      for (const { mesh, rest, axis, radius } of authored)
        mesh.quaternion.copy(rest).multiply(spin.setFromAxisAngle(axis, distance / radius));
    };
  const pivots = centers.map((center) => {
    const pivot = new T.Group();
    group.add(pivot);
    pivot.position.copy(group.worldToLocal(center.clone()));
    pivot.quaternion.copy(group.getWorldQuaternion(new T.Quaternion())).invert();
    pivot.updateMatrixWorld(true);
    return { pivot, rest: pivot.quaternion.clone(), radius: Math.max(0.2, center.y - 0.006) };
  });
  const p = new T.Vector3(),
    box = new T.Box3(),
    axis = new T.Vector3(1, 0, 0);
  for (const mesh of meshes) {
    const name = mesh.name + ' ' + mesh.material.name;
    if (!/tire|tyre|rim|wheel|brake.?disc/i.test(name) || /steer|caliper|brake.?pad/i.test(name))
      continue;
    box.setFromObject(mesh, true).getCenter(p);
    const i = centers.findIndex((center) => center.distanceTo(p) < 0.39);
    if (i < 0) continue;
    // Brakes and suspension can be children of a glTF tyre node.
    for (const child of [...mesh.children]) mesh.parent.attach(child);
    pivots[i].pivot.attach(mesh);
  }
  return (distance) => {
    for (const { pivot, rest, radius } of pivots)
      pivot.quaternion.copy(rest).multiply(spin.setFromAxisAngle(axis, distance / radius));
  };
}
