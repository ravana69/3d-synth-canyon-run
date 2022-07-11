const SHOW_STATS = false;
const CANYON_WIDTH = 400;
const CANYON_LENGTH = 120;
const CANYON_SEGMENTS_W = 27;
const CANYON_SEGMENTS_L = 10;
const CLIFF_BASE = 60;
const CLIFF_VARY = 15;
const FLOOR_VARY = 10;
const CANYON_SPEED = 70;
const CAMERA_DRIFT_DISTANCE = 15;
const CAMERA_DRIFT_SPEED = 0.05;

let lastUpdate;
let camera, scene, renderer, composer;
let cameraBaseX, cameraBaseY;
let uResolutionScale;
let uTime;
let canyonA, canyonB;

function init() {
  // stats
  if (SHOW_STATS) {
    const stats = new Stats();
    stats.domElement.classList.add('stats-element');
    document.body.appendChild(stats.domElement);
    requestAnimationFrame(function updateStats(){
      stats.update();
      requestAnimationFrame(updateStats);
    });
  }
  
  // basic setup
  const container = document.getElementById('container');
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 300);
  const cameraDistance = 70;
  const cameraAngle = .05*Math.PI;
  camera.position.z = cameraDistance;
  cameraBaseX = 0;
  cameraBaseY = 0.3 * (CLIFF_BASE + CLIFF_VARY + FLOOR_VARY);
  camera.position.y = cameraBaseY;
  camera.rotation.x = -cameraAngle;
  scene = new THREE.Scene();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  // shader setup
  lastUpdate = new Date().getTime();
  const vertexShader = document.getElementById( 'vertexShader' ).textContent;
  const fragmentShader = document.getElementById( 'fragmentShader' ).textContent;
  uTime = { type: 'f', value: 1.0 };
  uResolutionScale = { type: 'f', value: 1.0 };
  
  // add objects
  const canyonGeometry = new THREE.PlaneGeometry(CANYON_WIDTH, CANYON_LENGTH, CANYON_SEGMENTS_W, CANYON_SEGMENTS_L);
  canyonGeometry.rotateX(-0.5 * Math.PI);
  const reverseGeometry = canyonGeometry.clone();
  const simplexA = new SimplexNoise(Math.floor(0xffff*Math.random()));
  const simplexB = new SimplexNoise(Math.floor(0xffff*Math.random()));
  for (let i = 0, l = canyonGeometry.vertices.length; i < l; i++) {
    const { x, z } = canyonGeometry.vertices[i];
    canyonGeometry.vertices[i].y =
      Math.min(1.0, Math.pow(x/50, 4)) * Math.round(CLIFF_BASE + simplexA.noise2D(x,z) * CLIFF_VARY) + Math.round(simplexB.noise2D(x,z) * FLOOR_VARY);
    reverseGeometry.vertices[i].y = 
      Math.min(1.0, Math.pow(x/50, 4)) * Math.round(CLIFF_BASE + simplexA.noise2D(x,-z) * CLIFF_VARY) + Math.round(simplexB.noise2D(x,-z) * FLOOR_VARY);
  }
  const canyonMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: { uTime, uResolutionScale },
    vertexShader,
    fragmentShader
  });
  canyonMaterial.extensions.derivatives = true;
  canyonA = new THREE.Mesh(geomToBufferGeomWithCenters(canyonGeometry), canyonMaterial);
  scene.add(canyonA);
  canyonB = new THREE.Mesh(geomToBufferGeomWithCenters(reverseGeometry), canyonMaterial);
  canyonB.position.z -= CANYON_LENGTH;
  scene.add(canyonB);
  container.appendChild(renderer.domElement);
  
  // effect composition
  const renderScene = new THREE.RenderPass(scene, camera);
  const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.86);
  bloomPass.threshold = 0.3;
  bloomPass.strength = 2.5 * uResolutionScale.value;
  bloomPass.radius = 0.3 * uResolutionScale.value;
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);
  
  // event listeners
  onWindowResize();
  window.addEventListener( 'resize', onWindowResize, false);
  document.getElementById('resolution').addEventListener('change', onResolutionChange, false);
}

// events
function onWindowResize(evt) {
  camera.aspect =  window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
function onResolutionChange(evt) {
  uResolutionScale.value = parseFloat(evt.target.value);
  bloomPass.strength = 2.5 * uResolutionScale.value;
  bloomPass.radius = 0.3 * uResolutionScale.value;
  renderer.setPixelRatio( window.devicePixelRatio / uResolutionScale.value );
}
function animate() {
  const currentTime = new Date().getTime();
  const timeSinceLastUpdate = currentTime - lastUpdate;
  lastUpdate = currentTime;
  const deltaTime = timeSinceLastUpdate / 1000;
  uTime.value += deltaTime;
  // move canyons
  canyonA.position.z += deltaTime * CANYON_SPEED;
  canyonB.position.z += deltaTime * CANYON_SPEED;
  if (canyonA.position.z > CANYON_LENGTH) {
    canyonA.position.z -= 2*CANYON_LENGTH;
  }
  if (canyonB.position.z > CANYON_LENGTH) {
    canyonB.position.z -= 2*CANYON_LENGTH;
  }
  // drift camera (simple lissajous)
  camera.position.x = cameraBaseX + CAMERA_DRIFT_DISTANCE*Math.sin(7*CAMERA_DRIFT_SPEED*Math.PI*uTime.value);
  camera.position.y = cameraBaseY + CAMERA_DRIFT_DISTANCE*Math.sin(5*CAMERA_DRIFT_SPEED*Math.PI*uTime.value);
  // render
  // renderer.render( scene, camera );
  composer.render();
  requestAnimationFrame( animate );
}

// boot
init();
animate();

// utils
// adapted from https://github.com/mrdoob/three.js/blob/dev/examples/webgl_materials_wireframe.html for wireframe effect
function geomToBufferGeomWithCenters(geom) {
  const buffGeom = new THREE.BufferGeometry().fromGeometry(geom);
  const vectors = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
  const { position } = buffGeom.attributes;
  const centers = new Float32Array(position.count*3);
  for (let i=0, l=position.count; i<l; i++) {
    vectors[i%3].toArray(centers,i*3);
  }
  buffGeom.setAttribute('center', new THREE.BufferAttribute(centers,3));
  return buffGeom;
}
