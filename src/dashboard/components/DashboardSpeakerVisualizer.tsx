import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface SpeakerVisualizerProps {
  levels: number[]; // Array of 10 levels: L, R, C, LFE, Ls, Rs, Lb, Rb, Lh, Rh
  isEnabled: boolean;
}

export const DashboardSpeakerVisualizer: React.FC<SpeakerVisualizerProps> = ({ levels, isEnabled }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const levelsRef = useRef<number[]>(levels);

  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 600;
    const height = 300; // Increased height for fullscreen dashboard layout

    // 1. Create Scene & Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040409, 0.06);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4.5, 8.0);
    camera.lookAt(0, 0.2, 0);

    // 2. Create WebGL2 Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // 3. Add Golden & Amber Lighting
    const ambientLight = new THREE.AmbientLight(0x111326, 2.2);
    scene.add(ambientLight);

    const roomLightL = new THREE.PointLight(0xd4af37, 1.2, 14); // Champagne Gold
    roomLightL.position.set(-5, 2.5, -2);
    scene.add(roomLightL);

    const roomLightR = new THREE.PointLight(0xe5a93b, 1.2, 14); // Warm Amber
    roomLightR.position.set(5, 2.5, -2);
    scene.add(roomLightR);

    // 4. Create Wireframe Room Boundaries
    const roomGeo = new THREE.BoxGeometry(11, 4.5, 11);
    const roomWireMat = new THREE.MeshBasicMaterial({
      color: 0x3d3525, // Soft metallic gold wireframe
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });
    const roomMesh = new THREE.Mesh(roomGeo, roomWireMat);
    roomMesh.position.y = 1.25;
    scene.add(roomMesh);

    // Fine Ground Grid Helper
    const gridHelper = new THREE.GridHelper(11, 15, 0x2b2b3a, 0x11111f);
    gridHelper.position.y = -1.0;
    scene.add(gridHelper);

    // 5. Create Center Head & Headphones
    const headGroup = new THREE.Group();

    // Head Sphere
    const headGeo = new THREE.SphereGeometry(0.72, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a14,
      roughness: 0.35,
      metalness: 0.9,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // Headphone Band
    const bandGeo = new THREE.TorusGeometry(0.85, 0.06, 16, 64, Math.PI);
    const headphoneMat = new THREE.MeshStandardMaterial({
      color: 0x1c1d35,
      roughness: 0.4,
      metalness: 0.8
    });
    const bandMesh = new THREE.Mesh(bandGeo, headphoneMat);
    bandMesh.rotation.x = Math.PI / 2;
    bandMesh.position.y = 0.12;
    headGroup.add(bandMesh);

    // Headphone Cups
    const cupGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 32);
    const leftCup = new THREE.Mesh(cupGeo, headphoneMat);
    leftCup.rotation.z = Math.PI / 2;
    leftCup.position.set(-0.76, 0, 0);
    headGroup.add(leftCup);

    const rightCup = leftCup.clone();
    rightCup.position.x = 0.76;
    headGroup.add(rightCup);

    scene.add(headGroup);

    // 6. Define 10 Speakers (7.1 Surround + 2 Heights)
    interface SpeakerInfo {
      name: string;
      angle: number;
      radius: number;
      yPos: number;
      color: number;
      index: number;
    }

    // Refined Gold, Sand, and Amber color mappings (non-RGB)
    const speakerConfigs: SpeakerInfo[] = [
      { name: "C", angle: 0, radius: 3.5, yPos: 0, color: 0xffdf7a, index: 2 }, // Warm Yellow Gold
      { name: "L", angle: -30, radius: 3.5, yPos: 0, color: 0xd4af37, index: 0 }, // Champagne Gold
      { name: "R", angle: 30, radius: 3.5, yPos: 0, color: 0xd4af37, index: 1 },
      { name: "Ls", angle: -110, radius: 3.2, yPos: 0.1, color: 0xe5973b, index: 4 }, // Warm Orange
      { name: "Rs", angle: 110, radius: 3.2, yPos: 0.1, color: 0xe5973b, index: 5 },
      { name: "Lb", angle: -150, radius: 3.0, yPos: 0.2, color: 0xe5973b, index: 6 },
      { name: "Rb", angle: 150, radius: 3.0, yPos: 0.2, color: 0xe5973b, index: 7 },
      { name: "Lh", angle: -45, radius: 2.8, yPos: 1.6, color: 0xffaa00, index: 8 }, // Amber Height L
      { name: "Rh", angle: 45, radius: 2.8, yPos: 1.6, color: 0xffaa00, index: 9 }, // Amber Height R
      { name: "Sub", angle: 0, radius: 2.2, yPos: -0.6, color: 0xc4b597, index: 3 } // Soft Sand LFE
    ];

    const speakerMeshes: THREE.Mesh[] = [];
    const speakerGlows: THREE.Mesh[] = [];
    const speakerLights: THREE.PointLight[] = [];

    speakerConfigs.forEach((config) => {
      const rad = (config.angle * Math.PI) / 180;
      const x = config.radius * Math.sin(rad);
      const z = -config.radius * Math.cos(rad);

      let boxGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.3);
      if (config.name === "Sub") {
        boxGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
      } else if (config.name === "Lh" || config.name === "Rh") {
        boxGeo = new THREE.SphereGeometry(0.18, 16, 16);
      }

      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x10111f,
        roughness: 0.4,
        metalness: 0.9,
      });

      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.position.set(x, config.yPos, z);
      
      if (config.name !== "Sub") {
        mesh.lookAt(0, config.yPos * 0.5, 0);
      }
      scene.add(mesh);
      speakerMeshes.push(mesh);

      // Subtly Glowing Rings
      if (config.name !== "Lh" && config.name !== "Rh") {
        const ringGeo = new THREE.RingGeometry(0.07, 0.12, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: config.color,
          side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(0, 0, 0.16);
        mesh.add(ringMesh);
        speakerGlows.push(ringMesh);
      } else {
        const glowMat = new THREE.MeshBasicMaterial({
          color: config.color,
          transparent: true,
          opacity: 0.75
        });
        const glowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), glowMat);
        mesh.add(glowSphere);
        speakerGlows.push(glowSphere);
      }

      const pLight = new THREE.PointLight(config.color, 0, 2.2);
      pLight.position.set(x, config.yPos, z);
      scene.add(pLight);
      speakerLights.push(pLight);
    });

    // 7. Sound particle flow physics
    interface SoundParticle {
      mesh: THREE.Mesh;
      speakerIdx: number;
      progress: number;
      speed: number;
    }

    const particles: SoundParticle[] = [];
    const pGeo = new THREE.SphereGeometry(0.045, 8, 8);

    const emitParticle = (speakerIdx: number, level: number) => {
      const config = speakerConfigs[speakerIdx];
      const rad = (config.angle * Math.PI) / 180;
      
      const x = config.radius * Math.sin(rad);
      const z = -config.radius * Math.cos(rad);

      const pMat = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: Math.min(level * 1.4, 0.75)
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(x, config.yPos, z);
      scene.add(pMesh);

      particles.push({
        mesh: pMesh,
        speakerIdx,
        progress: 0,
        speed: 0.015 + Math.random() * 0.012
      });
    };

    // 8. Render & Animation Loop
    let animationId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      const currentLevels = levelsRef.current;

      // Restrained camera orbit speed
      const camRad = 7.5;
      const camSpeed = 0.07;
      camera.position.x = camRad * Math.sin(time * camSpeed);
      camera.position.z = camRad * Math.cos(time * camSpeed);
      camera.position.y = 3.6 + Math.sin(time * 0.2) * 0.4;
      camera.lookAt(0, 0.2, 0);

      headGroup.rotation.y = -time * camSpeed + Math.PI;

      // Animate speakers
      speakerConfigs.forEach((config, idx) => {
        const mesh = speakerMeshes[idx];
        const light = speakerLights[idx];

        let level = 0;
        if (isEnabled && currentLevels && currentLevels[config.index] !== undefined) {
          level = currentLevels[config.index];
        }

        const scale = 1.0 + level * 0.3;
        mesh.scale.set(scale, scale, scale);
        light.intensity = level * 2.8;

        if (isEnabled && level > 0.25 && Math.random() < 0.15 && particles.length < 32) {
          emitParticle(idx, level);
        }
      });

      // Animate particles
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
          
          const targetY = 0.1;
          const startX = config.radius * Math.sin(rad);
          const startZ = -config.radius * Math.cos(rad);

          const curX = startX * (1.0 - p.progress);
          const curY = config.yPos + (targetY - config.yPos) * p.progress;
          const curZ = startZ * (1.0 - p.progress);

          p.mesh.position.set(curX, curY, curZ);

          const shrink = 1.0 - p.progress * 0.55;
          p.mesh.scale.set(shrink, shrink, shrink);

          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = (1.0 - p.progress) * 0.75;
        }
      }

      // Pulse room wireframe and background glow in sync with levels
      if (isEnabled && currentLevels && currentLevels.length > 0) {
        const sumLevels = currentLevels.reduce((a, b) => a + b, 0) / currentLevels.length;
        const colorPulse = new THREE.Color().setHSL(0.12, 0.7, 0.18 + sumLevels * 0.12); // Amber gold pulse
        roomWireMat.color.copy(colorPulse);
        roomWireMat.opacity = 0.1 + sumLevels * 0.15;

        const headScale = 1.0 + sumLevels * 0.05;
        headGroup.scale.set(headScale, headScale, headScale);

        roomLightL.intensity = 0.8 + sumLevels * 1.2;
        roomLightR.intensity = 0.8 + sumLevels * 1.2;
      } else {
        roomWireMat.color.setHex(0x3d3525);
        roomWireMat.opacity = 0.12;
        headGroup.scale.set(1, 1, 1);
        roomLightL.intensity = 0.4;
        roomLightR.intensity = 0.4;
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
    <div className="relative w-full h-[300px] rounded-2xl overflow-hidden bg-slate-950/80 border border-slate-900 flex items-center justify-center shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-t from-amber-500/5 via-transparent to-transparent pointer-events-none" />
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-3 left-4 flex items-center gap-2 pointer-events-none">
        <span className={`w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-amber-400 shadow-glow-cyan animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
          {isEnabled ? 'Aether Spatial v3 — 3D Theater Reference Field' : 'Bypass Output (Normal Stereo)'}
        </span>
      </div>
    </div>
  );
};
