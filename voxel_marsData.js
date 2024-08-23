// https://discourse.threejs.org/t/who-can-tell-me-how-to-render-data3dtexture-rgb-in-three-js/63941

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';


let renderer, scene, camera;
let mesh;
document.getElementById('fileInput').addEventListener('change', handleFileSelect, false);

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            let result = evt.target.result;
            const data = JSON.parse(evt.target.result);
            init(data);
            animate();
        };
        reader.readAsText(file); // 读取文件为文本
    }
}

function init(data) {

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 10000000 );
    camera.position.set( 1, 1, 2 );

    new OrbitControls( camera, renderer.domElement );

    // Texture
    let cols=data.cols;
    let rows=data.rows;
    let heights=data.heights;
    let xmax=data.xmax;
    let xmin=data.xmin;
    let ymax=data.ymax;
    let ymin=data.ymin;
    let zmax=data.zmax;
    let zmin=data.zmin;
    let values=data.values;

    const colors = [
        [0,0,0,0],
        [170,36,250,1],
        [212,142,254,1],
        [238,2,48,1],
        [254,100,92,1],
        [254,172,172,1],
        [140,140,0,0.9],
        [200,200,2,0.8],
        [252,244,100,0.7],
        [16,146,26,0.6],
        [0,234,0,0.5],
        [166,252,168,0.4],
        [30,38,208,0.3],
        [122,114,238,0.2],
        [192,192,254,1]
    ]

    var steps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65]
    var resolution = new THREE.Vector3(cols,rows,heights);
    var rgbVoxelArray = new Float32Array(resolution.x * resolution.y * resolution.z * 4);

    for (let z = 0; z < resolution.z; z++)
    {
        let zOffset = z * resolution.x * resolution.y;
        for (let y = 0; y < resolution.y; y++)
        {
            let yOffset = y * resolution.x;
            for (let x = 0; x < resolution.x; x++)
            {
                const index = x + yOffset + zOffset;

                let val = values[index];
                if(val!=null){
                    let xcolor = colors[0];
                    for(let i=0;i<steps.length;i++){
                        if(val<0){
                            xcolor=colors[0];
                            break;
                        }
                        if(val<steps[i]){
                            xcolor=colors[i];
                            // xcolor=colors[i-1];
                            break;
                        }
                    }
                    rgbVoxelArray[4*index] = xcolor[0]/255;
                    rgbVoxelArray[4*index+1] = xcolor[1]/255;
                    rgbVoxelArray[4*index+2] = xcolor[2]/255;
                    rgbVoxelArray[4*index+3] = xcolor[3];
                }
            }
        }
    }

    var texture = new THREE.Data3DTexture(
        rgbVoxelArray,
        resolution.x,
        resolution.y,
        resolution.z,
    );
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    // Material

    const vertexShader = /* glsl */`
				in vec3 position;

				uniform mat4 modelMatrix;
				uniform mat4 modelViewMatrix;
				uniform mat4 projectionMatrix;
				uniform vec3 cameraPos;

				out vec3 vOrigin;
				out vec3 vDirection;

				void main() {
					vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

					vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
					vDirection = position - vOrigin;

					gl_Position = projectionMatrix * mvPosition;
				}
			`;

    const fragmentShader = /* glsl */`
				precision highp float;
				precision highp sampler3D;

				uniform mat4 modelViewMatrix;
				uniform mat4 projectionMatrix;

				in vec3 vOrigin;
				in vec3 vDirection;

				out vec4 color;

				uniform sampler3D map;

				uniform float threshold;
				uniform float steps;

				vec2 hitBox( vec3 orig, vec3 dir ) {
					const vec3 box_min = vec3( - 0.5 );
					const vec3 box_max = vec3( 0.5 );
					vec3 inv_dir = 1.0 / dir;
					vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
					vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
					vec3 tmin = min( tmin_tmp, tmax_tmp );
					vec3 tmax = max( tmin_tmp, tmax_tmp );
					float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
					float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
					return vec2( t0, t1 );
				}

				float sample1( vec3 p ) {
					return texture( map, p ).r;
				}

				
				vec4 sample2( vec3 p ) {
					return texture( map, p );
				}

				#define epsilon .0001

				vec3 normal( vec3 coord ) {
					if ( coord.x < epsilon ) return vec3( 1.0, 0.0, 0.0 );
					if ( coord.y < epsilon ) return vec3( 0.0, 1.0, 0.0 );
					if ( coord.z < epsilon ) return vec3( 0.0, 0.0, 1.0 );
					if ( coord.x > 1.0 - epsilon ) return vec3( - 1.0, 0.0, 0.0 );
					if ( coord.y > 1.0 - epsilon ) return vec3( 0.0, - 1.0, 0.0 );
					if ( coord.z > 1.0 - epsilon ) return vec3( 0.0, 0.0, - 1.0 );

					float step = 0.01;
					float x = sample1( coord + vec3( - step, 0.0, 0.0 ) ) - sample1( coord + vec3( step, 0.0, 0.0 ) );
					float y = sample1( coord + vec3( 0.0, - step, 0.0 ) ) - sample1( coord + vec3( 0.0, step, 0.0 ) );
					float z = sample1( coord + vec3( 0.0, 0.0, - step ) ) - sample1( coord + vec3( 0.0, 0.0, step ) );

					return normalize( vec3( x, y, z ) );
				}

				vec4 BlendUnder(vec4 color, vec4 newColor)
				{
					color.rgb += (1.0 - color.a) * newColor.a * newColor.rgb;
					color.a += (1.0 - color.a) * newColor.a;
					return color;
				}


				void main(){

					vec3 rayDir = normalize( vDirection );
					vec2 bounds = hitBox( vOrigin, rayDir );

					if ( bounds.x > bounds.y ) discard;

					bounds.x = max( bounds.x, 0.0 );

					vec3 p = vOrigin + bounds.x * rayDir;
					vec3 inc = 1.0 / abs( rayDir );
					float delta = min( inc.x, min( inc.y, inc.z ) );
					delta /= steps;

					for ( float t = bounds.x; t < bounds.y; t += delta ) {

						vec4 samplerColor = sample2( p + 0.5 );
						samplerColor.a *= .02;
						color = BlendUnder(color, samplerColor);

						p += rayDir * delta;

					}
					

					if ( color.a == 0.0 ) discard;

				}
			`;

    const geometry = new THREE.BoxGeometry( resolution.x*1, resolution.y*1, resolution.z*1 );
    const material = new THREE.RawShaderMaterial( {
        glslVersion: THREE.GLSL3,
        uniforms: {
            map: { value: texture },
            cameraPos: { value: new THREE.Vector3() },
            threshold: { value: 0.0 },
            steps: { value: 1000 }
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        transparent:true
    } );

    let height=1;
    mesh = new THREE.Mesh( geometry, material );
    mesh.scale.set(10,10,height)
    mesh.rotateX(Math.PI);
    scene.add( mesh );

    //

    const parameters = { threshold: 0.8, steps: 1000,height:1,rotateX:Math.PI,rotateY:0,rotateZ:0 };

    function update() {

        material.uniforms.threshold.value = parameters.threshold;
        material.uniforms.steps.value = parameters.steps;
        mesh.scale.set(10,10,parameters.height)
        // mesh.rotateX(0.1);
        // mesh.rotateY(0.1);
        // mesh.rotateZ(0.1);
    }

    const gui = new GUI();
    gui.add( parameters, 'steps', 0, 5000, 1 ).onChange( update );
    gui.add( parameters, 'height', 1, 10, 1 ).onChange( update );
    // gui.add( parameters, 'rotateX', 0, Math.PI, 0.001 ).onChange( update );
    // gui.add( parameters, 'rotateY', 0, Math.PI, 0.001 ).onChange( update );
    // gui.add( parameters, 'rotateZ', 0, Math.PI, 0.001 ).onChange( update );

    window.addEventListener( 'resize', onWindowResize );
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );

}


function animate() {

    requestAnimationFrame( animate );

    mesh.material.uniforms.cameraPos.value.copy( camera.position );

    renderer.render( scene, camera );

}
