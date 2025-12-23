import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

class JourneyAnimation {
	constructor(container) {
		this.container = container;
		this.time = 0;
		this.sceneStartTime = 0;
		this.currentScene = 0;
		this.sceneDuration = 4;
		this.transitionDuration = 1.5;
		this.isTransitioning = false;

		this.scenes = [
			{ name: "student", create: () => this.createStudent() },
			{ name: "club", create: () => this.createClub() },
			{ name: "developer", create: () => this.createDeveloper() },
			{ name: "ctf", create: () => this.createCTF() },
			{ name: "champion", create: () => this.createChampion() },
			{ name: "now", create: () => this.createNow() },
		];

		this.init();
		this.currentObjects = this.scenes[0].create();
		this.nextObjects = null;
		this.animate();
	}

	init() {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
		this.camera.position.z = 6;

		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setSize(280, 280);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.container.appendChild(this.renderer.domElement);
	}

	createMaterial(color) {
		return new THREE.LineBasicMaterial({ 
			color, 
			transparent: true, 
			opacity: 1 
		});
	}

	createStudent() {
		const group = new THREE.Group();

		const cubeGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
		const edges = new THREE.EdgesGeometry(cubeGeo);
		const cube = new THREE.LineSegments(edges, this.createMaterial(0x00d4ff));
		group.add(cube);

		const capGeo = new THREE.ConeGeometry(0.5, 0.3, 4);
		const capEdges = new THREE.EdgesGeometry(capGeo);
		const cap = new THREE.LineSegments(capEdges, this.createMaterial(0x00ff88));
		cap.rotation.y = Math.PI / 4;
		cap.position.y = 0.9;
		group.add(cap);

		group.userData.animate = (t) => {
			cube.rotation.x = t * 0.5;
			cube.rotation.y = t * 0.3;
			cap.rotation.y = Math.PI / 4 + t * 0.5;
		};

		this.scene.add(group);
		return group;
	}

	createClub() {
		const group = new THREE.Group();
		const nodeCount = 6;
		const nodes = [];

		for (let i = 0; i < nodeCount; i++) {
			const angle = (i / nodeCount) * Math.PI * 2;
			const geo = new THREE.OctahedronGeometry(0.2);
			const edges = new THREE.EdgesGeometry(geo);
			const node = new THREE.LineSegments(edges, this.createMaterial(0x00ff88));
			node.position.x = Math.cos(angle) * 1.2;
			node.position.y = Math.sin(angle) * 1.2;
			nodes.push(node);
			group.add(node);
		}

		const centerGeo = new THREE.OctahedronGeometry(0.35);
		const centerEdges = new THREE.EdgesGeometry(centerGeo);
		const center = new THREE.LineSegments(centerEdges, this.createMaterial(0x00d4ff));
		group.add(center);

		for (let i = 0; i < nodeCount; i++) {
			const points = [nodes[i].position.clone(), new THREE.Vector3(0, 0, 0)];
			const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
			const mat = this.createMaterial(0x00d4ff);
			mat.opacity = 0.4;
			const line = new THREE.Line(lineGeo, mat);
			group.add(line);
		}

		group.userData.animate = (t) => {
			group.rotation.z = t * 0.3;
			nodes.forEach((node, i) => {
				node.rotation.x = t * 2;
				node.rotation.y = t * 2;
				const pulse = 1 + Math.sin(t * 3 + i) * 0.2;
				node.scale.setScalar(pulse);
			});
			center.rotation.x = t;
			center.rotation.y = t * 0.7;
		};

		this.scene.add(group);
		return group;
	}

	createDeveloper() {
		const group = new THREE.Group();
		const blocks = [];

		const positions = [
			[0, -0.8, 0], [0, -0.3, 0], [0, 0.2, 0],
			[-0.55, -0.8, 0], [0.55, -0.8, 0],
			[-0.55, -0.3, 0], [0.55, -0.3, 0],
		];

		positions.forEach((pos, i) => {
			const height = 0.4 + (i === 2 ? 0.2 : 0);
			const geo = new THREE.BoxGeometry(0.5, height, 0.5);
			const edges = new THREE.EdgesGeometry(geo);
			const block = new THREE.LineSegments(
				edges,
				this.createMaterial(i < 3 ? 0x00d4ff : 0x00ff88)
			);
			block.position.set(...pos);
			block.userData.baseY = pos[1];
			blocks.push(block);
			group.add(block);
		});

		group.userData.animate = (t) => {
			group.rotation.y = Math.sin(t * 0.5) * 0.3;
			blocks.forEach((block, i) => {
				block.position.y = block.userData.baseY + Math.sin(t * 2 + i * 0.5) * 0.05;
			});
		};

		this.scene.add(group);
		return group;
	}

	createCTF() {
		const group = new THREE.Group();

		const flagShape = new THREE.Shape();
		flagShape.moveTo(0, 0.8);
		flagShape.lineTo(1.5, 0.4);
		flagShape.lineTo(0, 0);
		flagShape.lineTo(0, 0.8);

		const flagGeo = new THREE.ShapeGeometry(flagShape);
		const flagEdges = new THREE.EdgesGeometry(flagGeo);
		const flag = new THREE.LineSegments(flagEdges, this.createMaterial(0x00ff88));
		flag.position.set(-0.2, -0.2, 0);
		group.add(flag);

		const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 8);
		const poleEdges = new THREE.EdgesGeometry(poleGeo);
		const pole = new THREE.LineSegments(poleEdges, this.createMaterial(0x00d4ff));
		pole.position.set(-0.2, -0.2, 0);
		group.add(pole);

		const bracketGeo = new THREE.TorusGeometry(0.15, 0.02, 8, 6);
		const bracketEdges = new THREE.EdgesGeometry(bracketGeo);
		const bracket1 = new THREE.LineSegments(bracketEdges, this.createMaterial(0x00d4ff));
		bracket1.position.set(-1, 0.3, 0);
		bracket1.rotation.y = Math.PI / 2;
		group.add(bracket1);

		const bracket2 = new THREE.LineSegments(bracketEdges.clone(), this.createMaterial(0x00d4ff));
		bracket2.position.set(1.5, 0.3, 0);
		bracket2.rotation.y = Math.PI / 2;
		group.add(bracket2);

		group.userData.animate = (t) => {
			group.rotation.y = Math.sin(t * 0.4) * 0.4;
			flag.position.z = Math.sin(t * 3) * 0.05;
			bracket1.rotation.x = t * 2;
			bracket2.rotation.x = -t * 2;
		};

		this.scene.add(group);
		return group;
	}

	createChampion() {
		const group = new THREE.Group();

		const podiumGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
		const podiumEdges = new THREE.EdgesGeometry(podiumGeo);
		const podium = new THREE.LineSegments(podiumEdges, this.createMaterial(0xcd7f32));
		podium.position.set(0, -0.6, 0);
		group.add(podium);

		const starShape = new THREE.Shape();
		const outerRadius = 0.5;
		const innerRadius = 0.2;
		for (let i = 0; i < 10; i++) {
			const radius = i % 2 === 0 ? outerRadius : innerRadius;
			const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
			const x = Math.cos(angle) * radius;
			const y = Math.sin(angle) * radius;
			if (i === 0) starShape.moveTo(x, y);
			else starShape.lineTo(x, y);
		}
		starShape.closePath();

		const starGeo = new THREE.ShapeGeometry(starShape);
		const starEdges = new THREE.EdgesGeometry(starGeo);
		const star = new THREE.LineSegments(starEdges, this.createMaterial(0x00ff88));
		star.position.y = 0.5;
		group.add(star);

		const ringGeo = new THREE.TorusGeometry(0.35, 0.05, 8, 32);
		const ringEdges = new THREE.EdgesGeometry(ringGeo);
		const ring = new THREE.LineSegments(ringEdges, this.createMaterial(0x00d4ff));
		ring.position.y = 0.5;
		group.add(ring);

		group.userData.animate = (t) => {
			star.rotation.z = t * 0.5;
			ring.rotation.x = Math.PI / 2 + Math.sin(t) * 0.2;
			ring.rotation.z = t * 0.3;
			const glow = 1 + Math.sin(t * 3) * 0.1;
			star.scale.setScalar(glow);
		};

		this.scene.add(group);
		return group;
	}

	createNow() {
		const group = new THREE.Group();

		const coreGeo = new THREE.IcosahedronGeometry(0.4);
		const coreEdges = new THREE.EdgesGeometry(coreGeo);
		const core = new THREE.LineSegments(coreEdges, this.createMaterial(0x00d4ff));
		group.add(core);

		const colors = [0x00ff88, 0x00d4ff, 0x5eead4];
		const dots = [];

		for (let i = 0; i < 3; i++) {
			const orbitGeo = new THREE.TorusGeometry(0.8 + i * 0.3, 0.02, 8, 32);
			const orbitEdges = new THREE.EdgesGeometry(orbitGeo);
			const mat = this.createMaterial(colors[i]);
			mat.opacity = 0.6;
			const orbit = new THREE.LineSegments(orbitEdges, mat);
			orbit.rotation.x = Math.PI / 2 + (i - 1) * 0.5;
			orbit.rotation.y = i * 0.4;
			group.add(orbit);

			const dotGeo = new THREE.SphereGeometry(0.08);
			const dotEdges = new THREE.EdgesGeometry(dotGeo);
			const dot = new THREE.LineSegments(dotEdges, this.createMaterial(colors[i]));
			dot.userData.orbitRadius = 0.8 + i * 0.3;
			dot.userData.orbitIndex = i;
			dots.push(dot);
			group.add(dot);
		}

		group.userData.animate = (t) => {
			core.rotation.x = t * 0.5;
			core.rotation.y = t * 0.7;

			dots.forEach((dot) => {
				const idx = dot.userData.orbitIndex;
				const angle = t * (1 + idx * 0.3);
				const r = dot.userData.orbitRadius;
				dot.position.x = Math.cos(angle) * r;
				dot.position.y = Math.sin(angle) * r * Math.cos((idx - 1) * 0.5);
				dot.position.z = Math.sin(angle) * r * Math.sin((idx - 1) * 0.5);
			});
		};

		this.scene.add(group);
		return group;
	}

	setGroupOpacity(group, opacity) {
		group.traverse((child) => {
			if (child.material) {
				child.material.opacity = opacity;
			}
		});
	}

	animate() {
		requestAnimationFrame(() => this.animate());
		this.time += 0.016;

		const elapsed = this.time - this.sceneStartTime;

		if (this.currentObjects?.userData?.animate) {
			this.currentObjects.userData.animate(this.time);
		}

		if (elapsed > this.sceneDuration && !this.isTransitioning) {
			this.isTransitioning = true;
			const nextIndex = (this.currentScene + 1) % this.scenes.length;
			this.nextObjects = this.scenes[nextIndex].create();
			this.nextObjects.scale.setScalar(0);
			this.setGroupOpacity(this.nextObjects, 0);
		}

		if (this.isTransitioning && this.nextObjects) {
			if (this.nextObjects.userData?.animate) {
				this.nextObjects.userData.animate(this.time);
			}

			const transitionElapsed = elapsed - this.sceneDuration;
			const progress = Math.min(transitionElapsed / this.transitionDuration, 1);

			const ease = progress < 0.5
				? 4 * progress * progress * progress
				: 1 - Math.pow(-2 * progress + 2, 3) / 2;

			this.currentObjects.scale.setScalar(1 - ease);
			this.currentObjects.rotation.y = ease * Math.PI;
			this.setGroupOpacity(this.currentObjects, 1 - ease);

			this.nextObjects.scale.setScalar(ease);
			this.nextObjects.rotation.y = (1 - ease) * -Math.PI;
			this.setGroupOpacity(this.nextObjects, ease);

			if (progress >= 1) {
				this.scene.remove(this.currentObjects);
				this.currentObjects = this.nextObjects;
				this.nextObjects = null;
				this.currentScene = (this.currentScene + 1) % this.scenes.length;
				this.sceneStartTime = this.time;
				this.isTransitioning = false;
			}
		}

		this.renderer.render(this.scene, this.camera);
	}
}

document.addEventListener("DOMContentLoaded", () => {
	const container = document.getElementById("about-3d");
	if (container) {
		new JourneyAnimation(container);
	}
});
