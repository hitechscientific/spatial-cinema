import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface SpeakerVisualizerProps {
  levels: number[]; // Array of 10 levels: L, R, C, LFE, Ls, Rs, Lb, Rb, Lh, Rh
  isEnabled: boolean;
}

export const SpeakerVisualizer: React.FC<SpeakerVisualizerProps> = ({ levels, isEnabled }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const levelsRef = useRef<number[]>(levels);

  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 350;
    const height = 180;

    // 1. Create Scene & Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05050a, 0.07);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 8.5);
    camera.lookAt(0, 0, 0);

    // 2. Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // 3. Add Lighting
    const ambientLight = new THREE.AmbientLight(0x0f1123, 1.8);
    scene.add(ambientLight);

    const roomLightL = new THREE.PointLight(0x00f2fe, 1.0, 12);
    roomLightL.position.set(-4, 2.5, -2);
    scene.add(roomLightL);

    const roomLightR = new THREE.PointLight(0xff007a, 1.0, 12);
    roomLightR.position.set(4, 2.5, -2);
    scene.add(roomLightR);

    // 4. Create Wireframe Room Boundaries
    const roomGeo = new THREE.BoxGeometry(11, 5, 11);
    const roomWireMat = new THREE.MeshBasicMaterial({
      color: 0x1e2246,
      wireframe: true,
      transparent: true,
      opacity: 0.18
    });
    const roomMesh = new THREE.Mesh(roomGeo, roomWireMat);
    roomMesh.position.y = 1.5;
    scene.add(roomMesh);

    // Floor Grid Helper
    const gridHelper = new THREE.GridHelper(11, 11, 0x2a2c4e, 0x111327);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    // 5. Create Center Head & Headphones
    const headGroup = new THREE.Group();

    // Head Sphere
    const headGeo = new THREE.SphereGeometry(0.75, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x0c0d1b,
      roughness: 0.25,
      metalness: 0.85,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // Headphone Band
    const bandGeo = new THREE.TorusGeometry(0.9, 0.07, 16, 64, Math.PI);
    const headphoneMat = new THREE.MeshStandardMaterial({
      color: 0x25284a,
      roughness: 0.35,
      metalness: 0.75
    });
    const bandMesh = new THREE.Mesh(bandGeo, headphoneMat);
    bandMesh.rotation.x = Math.PI / 2;
    bandMesh.position.y = 0.15;
    headGroup.add(bandMesh);

    // Headphone Ear Cups
    const cupGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.18, 32);
    const leftCup = new THREE.Mesh(cupGeo, headphoneMat);
    leftCup.rotation.z = Math.PI / 2;
    leftCup.position.set(-0.8, 0, 0);
    headGroup.add(leftCup);

    const rightCup = leftCup.clone();
    rightCup.position.x = 0.8;
    headGroup.add(rightCup);

    scene.add(headGroup);

    // 6. Define 10 Speakers (7.1 Surround + 2 Heights)
    interface SpeakerInfo {
      name: string;
      angle: number; // degrees
      radius: number;
      yPos: number;
      color: number;
      index: number;
    }

    const speakerConfigs: SpeakerInfo[] = [
      { name: "C", angle: 0, radius: 3.5, yPos: 0, color: 0x00f2fe, index: 2 },
      { name: "L", angle: -30, radius: 3.5, yPos: 0, color: 0x9b51e0, index: 0 },
      { name: "R", angle: 30, radius: 3.5, yPos: 0, color: 0x9b51e0, index: 1 },
      { name: "Ls", angle: -110, radius: 3.2, yPos: 0.1, color: 0xff007a, index: 4 },
      { name: "Rs", angle: 110, radius: 3.2, yPos: 0.1, color: 0xff007a, index: 5 },
      { name: "Lb", angle: -150, radius: 3.0, yPos: 0.2, color: 0xff007a, index: 6 },
      { name: "Rb", angle: 150, radius: 3.0, yPos: 0.2, color: 0xff007a, index: 7 },
      { name: "Lh", angle: -90, radius: 2.4, yPos: 1.9, color: 0xffaa00, index: 8 }, // Elevated Height L
      { name: "Rh", angle: 90, radius: 2.4, yPos: 1.9, color: 0xffaa00, index: 9 }, // Elevated Height R
      { name: "Sub", angle: 0, radius: 2.2, yPos: -0.6, color: 0x00ff88, index: 3 }
    ];

    const speakerMeshes: THREE.Mesh[] = [];
    const speakerGlows: THREE.Mesh[] = [];
    const speakerLights: THREE.PointLight[] = [];

    speakerConfigs.forEach((config) => {
      const rad = (config.angle * Math.PI) / 180;
      const x = config.radius * Math.sin(rad);
      const z = -config.radius * Math.cos(rad);

      // Speaker Box Geometry
      let boxGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0.32, 0.42, 0.32);
      if (config.name === "Sub") {
        boxGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
      } else if (config.name === "Lh" || config.name === "Rh") {
        boxGeo = new THREE.SphereGeometry(0.2, 16, 16); // Heights are spheres
      }

      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x14152b,
        roughness: 0.35,
        metalness: 0.88,
      });

      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.position.set(x, config.yPos, z);
      
      // Face listener
      if (config.name !== "Sub") {
        mesh.lookAt(0, config.yPos * 0.5, 0);
      }
      scene.add(mesh);
      speakerMeshes.push(mesh);

      // Glowing Cone Ring
      if (config.name !== "Lh" && config.name !== "Rh") {
        const ringGeo = new THREE.RingGeometry(0.08, 0.14, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: config.color,
          side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(0, 0, 0.17);
        mesh.add(ringMesh);
        speakerGlows.push(ringMesh);
      } else {
        // Height speakers direct glow material
        const glowMat = new THREE.MeshBasicMaterial({
          color: config.color,
          transparent: true,
          opacity: 0.8
        });
        const glowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16), glowMat);
        mesh.add(glowSphere);
        speakerGlows.push(glowSphere);
      }

      const pLight = new THREE.PointLight(config.color, 0, 2.5);
      pLight.position.set(x, config.yPos, z);
      scene.add(pLight);
      speakerLights.push(pLight);
    });

    // 7. Particle emission system (sound particles traveling to head)
    interface SoundParticle {
      mesh: THREE.Mesh;
      speakerIdx: number;
      progress: number;
      speed: number;
    }

    const particles: SoundParticle[] = [];
    const pGeo = new THREE.SphereGeometry(0.05, 8, 8);

    const emitParticle = (speakerIdx: number, level: number) => {
      const config = speakerConfigs[speakerIdx];
      const rad = (config.angle * Math.PI) / 180;
      
      const x = config.radius * Math.sin(rad);
      const z = -config.radius * Math.cos(rad);

      const pMat = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: Math.min(level * 1.5, 0.85)
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(x, config.yPos, z);
      scene.add(pMesh);

      particles.push({
        mesh: pMesh,
        speakerIdx,
        progress: 0,
        speed: 0.02 + Math.random() * 0.015
      });
    };

    // 8. Animation Render Loop
    let animationId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      const currentLevels = levelsRef.current;

      // Subtle camera orbit rotation
      const camRad = 8.0;
      const camSpeed = 0.12;
      camera.position.x = camRad * Math.sin(time * camSpeed);
      camera.position.z = camRad * Math.cos(time * camSpeed);
      camera.position.y = 4.2 + Math.sin(time * 0.3) * 0.6;
      camera.lookAt(0, 0.3, 0);

      // Rotate head group to face camera angle slightly
      headGroup.rotation.y = -time * camSpeed + Math.PI;

      // Animate speakers & emit particles
      speakerConfigs.forEach((config, idx) => {
        const mesh = speakerMeshes[idx];
        const light = speakerLights[idx];

        let level = 0;
        if (isEnabled && currentLevels && currentLevels[config.index] !== undefined) {
          level = currentLevels[config.index];
        }

        // Pulse scale
        const scale = 1.0 + level * 0.4;
        mesh.scale.set(scale, scale, scale);

        // Update glow light
        light.intensity = level * 3.8;

        // Emit sound flow particles dynamically
        if (isEnabled && level > 0.22 && Math.random() < 0.18 && particles.length < 32) {
          emitParticle(idx, level);
        }
      });

      // Animate flowing particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress += p.speed;

        if (p.progress >= 1.0) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          if (Array.isArray(p.mesh.material)) {
            p.mesh.material.forEach(m => m.dispose());
          } else {
            p.mesh.material.dispose();
          }
          particles.splice(i, 1);
        } else {
          const config = speakerConfigs[p.speakerIdx];
          const rad = (config.angle * Math.PI) / 180;
          
          // Spherical interpolation towards head coordinates (0, 0.1, 0)
          const targetY = 0.1;
          const startX = config.radius * Math.sin(rad);
          const startZ = -config.radius * Math.cos(rad);

          const curX = startX * (1.0 - p.progress);
          const curY = config.yPos + (targetY - config.yPos) * p.progress;
          const curZ = startZ * (1.0 - p.progress);

          p.mesh.position.set(curX, curY, curZ);

          // Subtly shrink particle as it gets absorbed by head
          const shrink = 1.0 - p.progress * 0.5;
          p.mesh.scale.set(shrink, shrink, shrink);

          // Fade out
          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = (1.0 - p.progress) * 0.8;
        }
      }

      // Pulse room bounding wireframe grid in sync with overall volume
      if (isEnabled && currentLevels && currentLevels.length > 0) {
        const sumLevels = currentLevels.reduce((a, b) => a + b, 0) / currentLevels.length;
        const colorPulse = new THREE.Color().setHSL(0.66 + sumLevels * 0.1, 0.8, 0.25 + sumLevels * 0.15);
        roomWireMat.color.copy(colorPulse);
        roomWireMat.opacity = 0.12 + sumLevels * 0.22;

        // Breathe head mesh scale
        const headScale = 1.0 + sumLevels * 0.08;
        headGroup.scale.set(headScale, headScale, headScale);

        // Flash background lights
        roomLightL.intensity = 1.0 + sumLevels * 1.5;
        roomLightR.intensity = 1.0 + sumLevels * 1.5;
      } else {
        // Idle
        roomWireMat.color.setHex(0x1e2246);
        roomWireMat.opacity = 0.15;
        headGroup.scale.set(1, 1, 1);
        roomLightL.intensity = 0.6;
        roomLightR.intensity = 0.6;
        bandMesh.scale.set(
          1.0 + Math.sin(time * 2) * 0.015,
          1.0 + Math.sin(time * 2) * 0.015,
          1.0
        );
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);

      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }

      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (object.material instanceof Array) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material.dispose();
        }
      });

      renderer.dispose();
    };
  }, [isEnabled]);

  return (
    <div className="relative w-full h-[180px] rounded-xl overflow-hidden bg-studio-950/65 border border-white/5 flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-t from-studio-glow/5 via-transparent to-transparent pointer-events-none" />
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-2 left-3 flex items-center gap-1.5 pointer-events-none">
        <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-studio-glow animate-pulse shadow-glow-cyan' : 'bg-slate-500'}`} />
        <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
          {isEnabled ? 'Aether 3D Engine Active (9.1)' : 'Bypass (Stereo)'}
        </span>
      </div>
    </div>
  );
};
