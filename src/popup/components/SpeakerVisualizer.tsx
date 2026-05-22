import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface SpeakerVisualizerProps {
  levels: number[]; // Array of 8 levels: L, R, C, LFE, Ls, Rs, Lb, Rb
  isEnabled: boolean;
}

export const SpeakerVisualizer: React.FC<SpeakerVisualizerProps> = ({ levels, isEnabled }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const levelsRef = useRef<number[]>(levels);

  // Sync levels ref for the animation loop to prevent dependency re-runs
  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 350;
    const height = 180;

    // 1. Create Scene & Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06060c, 0.08);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 7, 10);
    camera.lookAt(0, 0, 0);

    // 2. Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // 3. Add Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0x1d1e38, 1.5);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x00f2fe, 2, 15);
    cyanLight.position.set(0, 2, 0);
    scene.add(cyanLight);

    const magentaLight = new THREE.PointLight(0xff007a, 1.5, 10);
    magentaLight.position.set(0, -2, -2);
    scene.add(magentaLight);

    // 4. Create Center Head & Headphones Representation
    const headGroup = new THREE.Group();

    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.8, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x121324,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: false,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // Headphone band (Torus)
    const bandGeo = new THREE.TorusGeometry(1.0, 0.08, 16, 64, Math.PI);
    const headphoneMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c4e,
      roughness: 0.4,
      metalness: 0.7
    });
    const bandMesh = new THREE.Mesh(bandGeo, headphoneMat);
    bandMesh.rotation.x = Math.PI / 2;
    bandMesh.position.y = 0.2;
    headGroup.add(bandMesh);

    // Headphone Ear cups (Left & Right cylinders)
    const cupGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 32);
    const leftCup = new THREE.Mesh(cupGeo, headphoneMat);
    leftCup.rotation.z = Math.PI / 2;
    leftCup.position.set(-0.85, 0, 0);
    headGroup.add(leftCup);

    const rightCup = leftCup.clone();
    rightCup.position.x = 0.85;
    headGroup.add(rightCup);

    scene.add(headGroup);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(16, 16, 0x2a2c4e, 0x121324);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    // 5. Create 7 Speakers (Channels: L, R, C, LFE, Ls, Rs, Lb, Rb)
    // Angles in degrees:
    // C: 0, L: -30, R: 30, Ls: -110, Rs: 110, Lb: -150, Rb: 150
    // LFE (Sub) will be placed directly in front below
    interface SpeakerInfo {
      name: string;
      angle: number; // in degrees
      radius: number;
      yPos: number;
      color: number;
      index: number; // Index in the levels array
    }

    const speakerConfigs: SpeakerInfo[] = [
      { name: "C", angle: 0, radius: 3.5, yPos: 0, color: 0x00f2fe, index: 2 },
      { name: "L", angle: -30, radius: 3.5, yPos: 0, color: 0x9b51e0, index: 0 },
      { name: "R", angle: 30, radius: 3.5, yPos: 0, color: 0x9b51e0, index: 1 },
      { name: "Ls", angle: -110, radius: 3.2, yPos: 0.1, color: 0xff007a, index: 4 },
      { name: "Rs", angle: 110, radius: 3.2, yPos: 0.1, color: 0xff007a, index: 5 },
      { name: "Lb", angle: -150, radius: 3.0, yPos: 0.2, color: 0xff007a, index: 6 },
      { name: "Rb", angle: 150, radius: 3.0, yPos: 0.2, color: 0xff007a, index: 7 },
      { name: "Sub", angle: 0, radius: 2.2, yPos: -0.6, color: 0x00ff88, index: 3 }
    ];

    const speakerMeshes: THREE.Mesh[] = [];
    const speakerLights: THREE.PointLight[] = [];
    const speakerGlows: THREE.Mesh[] = [];

    speakerConfigs.forEach((config) => {
      const rad = (config.angle * Math.PI) / 180;
      
      // Compute speaker 3D coordinate
      const x = config.radius * Math.sin(rad);
      const z = -config.radius * Math.cos(rad);

      // Create Speaker Box Mesh
      let boxGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0.35, 0.45, 0.35);
      if (config.name === "Sub") {
        boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Subwoofer is bigger
      }
      
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x1d1e38,
        roughness: 0.3,
        metalness: 0.9,
      });
      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.position.set(x, config.yPos, z);
      mesh.lookAt(0, 0, 0); // Point speaker to face listener
      scene.add(mesh);
      speakerMeshes.push(mesh);

      // Neon Speaker cone ring
      const ringGeo = new THREE.RingGeometry(0.1, 0.16, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: config.color,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(0, 0, 0.19); // Place on the front face of speaker box
      mesh.add(ringMesh);
      speakerGlows.push(ringMesh);

      // Audio activity glow light
      const pLight = new THREE.PointLight(config.color, 0, 3);
      pLight.position.set(x, config.yPos, z);
      scene.add(pLight);
      speakerLights.push(pLight);
    });

    // 6. Soundwave rings pool for active propagation visualization
    interface WaveRing {
      mesh: THREE.Mesh;
      speakerIdx: number;
      progress: number; // 0 to 1
      maxRadius: number;
    }

    const waveRings: WaveRing[] = [];
    const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);

    const triggerWaveRing = (speakerIdx: number, level: number) => {
      const config = speakerConfigs[speakerIdx];
      const rad = (config.angle * Math.PI) / 180;
      const x = config.radius * Math.sin(rad);
      const z = -config.radius * Math.cos(rad);

      const waveMat = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: Math.min(level * 1.5, 0.7),
        side: THREE.DoubleSide,
      });

      const waveMesh = new THREE.Mesh(ringGeometry, waveMat);
      waveMesh.position.set(x, config.yPos, z);
      waveMesh.lookAt(0, 0, 0);
      scene.add(waveMesh);

      waveRings.push({
        mesh: waveMesh,
        speakerIdx,
        progress: 0,
        maxRadius: config.radius
      });
    };

    // 7. Render Animation Loop
    let animationId = 0;
    let clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      const time = clock.getElapsedTime();
      const currentLevels = levelsRef.current;

      // Orbit camera slightly for dynamic 3D depth perception
      const cameraRadius = 8.5;
      const speed = 0.15;
      camera.position.x = cameraRadius * Math.sin(time * speed);
      camera.position.z = cameraRadius * Math.cos(time * speed);
      camera.position.y = 5 + Math.sin(time * 0.4) * 0.8;
      camera.lookAt(0, -0.2, 0);

      // Rotate head slightly to face camera direction subtly
      headGroup.rotation.y = -time * speed + Math.PI;

      // Animate virtual speakers based on channel levels
      speakerConfigs.forEach((config, idx) => {
        const mesh = speakerMeshes[idx];
        const light = speakerLights[idx];
        
        let level = 0;
        if (isEnabled && currentLevels && currentLevels[config.index] !== undefined) {
          level = currentLevels[config.index];
        }

        // Scale speaker box by audio level
        const scaleVal = 1.0 + level * 0.45;
        mesh.scale.set(scaleVal, scaleVal, scaleVal);

        // Update speaker glow light intensity
        light.intensity = level * 3.5;

        // Wave rings spawning logic
        // Spawn a wave ring when a transient burst passes the threshold and cooldown met
        if (isEnabled && level > 0.35 && Math.random() < 0.12 && waveRings.length < 12) {
          triggerWaveRing(idx, level);
        }
      });

      // Animate sound propagation rings moving from speaker to center head
      for (let i = waveRings.length - 1; i >= 0; i--) {
        const ring = waveRings[i];
        ring.progress += 0.035; // propagation speed

        if (ring.progress >= 1.0) {
          // Remove ring from scene and pool
          scene.remove(ring.mesh);
          ring.mesh.geometry.dispose();
          if (Array.isArray(ring.mesh.material)) {
            ring.mesh.material.forEach(m => m.dispose());
          } else {
            ring.mesh.material.dispose();
          }
          waveRings.splice(i, 1);
        } else {
          // Move from speaker to center (0,0,0)
          const config = speakerConfigs[ring.speakerIdx];
          const rad = (config.angle * Math.PI) / 180;
          const currentDistance = config.radius * (1.0 - ring.progress);
          const x = currentDistance * Math.sin(rad);
          const z = -currentDistance * Math.cos(rad);

          ring.mesh.position.set(x, config.yPos * (1.0 - ring.progress), z);
          
          // Scale size of soundwave ring outwards
          const scale = 1.0 + ring.progress * 4.0;
          ring.mesh.scale.set(scale, scale, 1);

          // Fade out as it reaches the listener
          const material = ring.mesh.material as THREE.MeshBasicMaterial;
          material.opacity = (1.0 - ring.progress) * 0.6;
        }
      }

      // Idle breathing headphones animation
      if (!isEnabled) {
        bandMesh.scale.set(
          1.0 + Math.sin(time * 2) * 0.015,
          1.0 + Math.sin(time * 2) * 0.015,
          1.0
        );
      } else {
        // Pulse head / headphones slightly with master level
        const masterLevel = levelsRef.current[0] || 0; // approximate using L level
        const headScale = 1.0 + masterLevel * 0.06;
        headGroup.scale.set(headScale, headScale, headScale);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 8. Handle element resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup resources on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }

      // Dispose Geometries and Materials
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;

        object.geometry.dispose();

        if (object.material instanceof Array) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      });

      renderer.dispose();
    };
  }, [isEnabled]);

  return (
    <div className="relative w-full h-[180px] rounded-xl overflow-hidden bg-studio-950/65 border border-white/5 flex items-center justify-center">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-studio-glow/5 via-transparent to-transparent pointer-events-none" />
      
      {/* 3D Container Canvas Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Dynamic Overlay HUD Info */}
      <div className="absolute top-2 left-3 flex items-center gap-1.5 pointer-events-none">
        <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-studio-glow animate-pulse shadow-glow-cyan' : 'bg-slate-500'}`} />
        <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
          {isEnabled ? '3D Soundfield Active' : 'Bypass (Stereo)'}
        </span>
      </div>
    </div>
  );
};
