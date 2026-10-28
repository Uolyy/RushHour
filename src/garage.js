import * as THREE from 'three';
import { buildPlayerCar, disposeCar } from './carModel.js';

// Гараж: отдельная сцена с «подиумом» и вращающейся машиной.
// Рендерится вместо трассы, когда открыт экран кастомизации.
export class Garage {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1119);
    this.scene.fog = new THREE.Fog(0x0d1119, 14, 34);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 3.4, 10.6);
    this.camera.lookAt(0, 1.15, 0);

    // Свет: тёплый сверху, холодный сзади — машина «блестит».
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fd0ff, 1.5);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x2a2f3a, 0.9));

    // Подиум: тёмный круг + светящееся кольцо.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.55, 0.25, 48),
      new THREE.MeshStandardMaterial({ color: 0x171c26, roughness: 0.85, flatShading: true })
    );
    disc.position.y = -0.13;
    this.scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.05, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd257 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.scene.add(ring);

    // Машина в отдельной группе — её вращаем.
    this.carPivot = new THREE.Group();
    this.carPivot.position.y = 0.55; // приподнята над подиумом — не спорит с подписью снизу
    this.scene.add(this.carPivot);
    this.model = null;
    this.skin = 'stock';
    this.color = 0xc9403a;
    this.spin = 0;
  }

  // Показать машину: пересобираем модель под новый скин/цвет.
  setLook(skin, colorHex) {
    if (this.model && this.skin === skin && this.color === colorHex) return;
    this.skin = skin;
    this.color = colorHex;
    const old = this.model;
    const model = buildPlayerCar(skin, colorHex);
    this.carPivot.add(model.group);
    this.model = model;
    if (old) {
      this.carPivot.remove(old.group);
      disposeCar(old);
    }
    // Мигалка «полиции» мигает и на подиуме.
    this.siren = model.siren || null;
  }

  update(dt) {
    this.spin += dt * 0.55;
    if (this.model) this.carPivot.rotation.y = this.spin;
    if (this.siren) {
      const ph = Math.floor(this.spin * 6) % 2 === 0;
      this.siren.r.emissiveIntensity = ph ? 5 : 0.15;
      this.siren.b.emissiveIntensity = ph ? 0.15 : 5;
    }
  }

  render(renderer, w, h) {
    if (this.camera.aspect !== w / h) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    renderer.render(this.scene, this.camera);
  }
}
