import * as THREE from 'three';

export function createPlasticMaterial(envMap) {
  return new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMap,
    envMapIntensity: 0.32,
    reflectivity: 0.38
  });
}
