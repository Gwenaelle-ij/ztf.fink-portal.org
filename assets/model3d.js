// Conversion de la geometrie Three.js en texte OBJ
function geometryToOBJ(geometry) {
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const uvs = geometry.getAttribute("uv");
    const indices = geometry.getIndex();

    const lines = ["# SOCCA ellipsoid"];

    for (let i = 0; i < positions.count; i++) {
        lines.push(`v ${positions.getX(i)} ${positions.getY(i)} ${positions.getZ(i)}`);
    }
    if (uvs) {
        for (let i = 0; i < uvs.count; i++) {
            lines.push(`vt ${uvs.getX(i)} ${uvs.getY(i)}`);
        }
    }
    if (normals) {
        for (let i = 0; i < normals.count; i++) {
            lines.push(`vn ${normals.getX(i)} ${normals.getY(i)} ${normals.getZ(i)}`);
        }
    }

    // les indices OBJ commencent a 1
    const vertexIndex = i => (indices ? indices.getX(i) : i) + 1;
    const count = indices ? indices.count : positions.count;

    for (let i = 0; i < count; i += 3) {
        const a = vertexIndex(i), b = vertexIndex(i + 1), c = vertexIndex(i + 2);
        lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }

    return lines.join("\n") + "\n";
}


// Lumiere ambiante + Soleil directionnel
function addLights(scene, sunPosition) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunLight.position.copy(sunPosition);
    scene.add(sunLight);
}


window.dash_clientside = Object.assign({}, window.dash_clientside, {
    model3d: {
        draw: function (p) {
            if (!p || !p.a_b || !p.a_c) return "";

            const container = document.getElementById("model-3d");
            if (!container) return "";
            container.innerHTML = "";

            const w = container.clientWidth, h = container.clientHeight;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x111111);

            const camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 1000);
            let zoom = 3;
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(w, h);
            container.appendChild(renderer.domElement);

            // Plein ecran + adaptation du rendu a la taille du conteneur
            const view = document.querySelector(".model3d-view");
            document.getElementById("model3d-fullscreen").onclick = function () {
                if (!document.fullscreenElement) view.requestFullscreen();
                else document.exitFullscreen();
            };
            document.addEventListener("fullscreenchange", function () {
                renderer.setSize(container.clientWidth, container.clientHeight);
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.render(scene, camera);
            });

            // Ellipsoide SOCCA
            // SphereGeometry utilise Y comme axe polaire, SOCCA utilise Z comme axe de rotation
            const geometry = new THREE.SphereGeometry(1, 64, 32);
            geometry.rotateX(Math.PI / 2);
            geometry.scale(1, 1 / p.a_b, 1 / p.a_c);  // rapports d'axes SOCCA
            geometry.computeVertexNormals();

            const grayMaterial = new THREE.MeshLambertMaterial({ color: 0x777777, side: THREE.DoubleSide });
            const object = new THREE.Mesh(geometry, grayMaterial);

            // OBJ en memoire, puis liens View / Download
            const objUrl = URL.createObjectURL(new Blob([geometryToOBJ(geometry)], { type: "text/plain" }));

            const viewLink = document.getElementById("model3d-view-obj");
            viewLink.href = objUrl;
            viewLink.target = "_blank";

            const downloadLink = document.getElementById("model3d-download-obj");
            downloadLink.href = objUrl;
            downloadLink.download = "asteroid_socca.obj";

            // Centrage de l'objet
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            const objectSize = box.getSize(new THREE.Vector3());
            const maxSize = Math.max(objectSize.x, objectSize.y, objectSize.z);
            object.position.sub(center);

            const asteroidGroup = new THREE.Group();
            asteroidGroup.add(object);

            // ordre [x, y, z, w]
            // Orientation : SOCCA seule par defaut, corrigee DAMIT au clic
            let useDamit = false;
            const hasDamit = !!(p.quaternion_damit && p.quaternion_damit.length === 4);

            function applyOrientation() {
                const q = (useDamit && hasDamit) ? p.quaternion_damit : p.quaternion;
                // ordre [x, y, z, w]
                if (q && q.length === 4) asteroidGroup.quaternion.set(q[0], q[1], q[2], q[3]).normalize();
            }
            applyOrientation();
            scene.add(asteroidGroup);

            // Direction du Soleil
            const sunDirection = new THREE.Vector3(0, 0, 1);
            if (p.sun_direction) {
                sunDirection.set(p.sun_direction[0], p.sun_direction[1], p.sun_direction[2]);
            }
            sunDirection.normalize();
            const sunPosition = sunDirection.clone().multiplyScalar(maxSize * 10);
            addLights(scene, sunPosition);

            // Bouton DAMIT : active / desactive la correction
            const damitButton = document.getElementById("model3d-damit-button");
            function updateDamitButton() {
                const on = useDamit && hasDamit;
                damitButton.disabled = !hasDamit;
                damitButton.classList.toggle("active", on);
                damitButton.title = !hasDamit ? "No DAMIT model available"
                                  : on ? "DAMIT correction: ON (click to disable)"
                                       : "DAMIT correction: OFF (click to enable)";
            }
            damitButton.onclick = function () {
                useDamit = !useDamit;
                updateDamitButton();
                applyOrientation();
                renderer.render(scene, camera);
            };
            updateDamitButton();

            camera.position.set(0, 0, maxSize * zoom);
            camera.up.set(0, 1, 0);
            camera.near = maxSize * 0.01;
            camera.far = maxSize * 100;
            camera.updateProjectionMatrix();
            camera.lookAt(0, 0, 0);

            // Zoom
            function setZoom(factor) {
                zoom = Math.min(10, Math.max(1.5, zoom * factor));
                camera.position.set(0, 0, maxSize * zoom);
                renderer.render(scene, camera);
            }
            document.getElementById("model3d-zoom-in").onclick = function () { setZoom(0.8); };
            document.getElementById("model3d-zoom-out").onclick = function () { setZoom(1.25); };

            // Affichage initial de l'asteroide
            renderer.render(scene, camera);

            return "";
        }
    }
});