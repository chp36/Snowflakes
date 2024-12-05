var createScene = function () {
    // Scene, Camera, and Light setup
    const scene = new BABYLON.Scene(engine);
    const camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, 1, 10, new BABYLON.Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);
    const light = new BABYLON.DirectionalLight("DirectionalLight", new BABYLON.Vector3(-1, -1, -1), scene);

    // 'ground' mesh for reference
    var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);

    //---------------SNOWFLAKES FALLING------------------//

    // Create an empty array to store positions and other geometry data for all snowflakes
    const positions = [];
    const indices = [];
    const normals = [];
    const areaSize = { x: 10, y: 5, z: 10 }; // Area where snow is falling
    const radius = 0.1;
    const tessellation = 8; // Change the # of snowflake edges
    const numSnowflakes = 1000;

    // Create a base snowflake geometry (disc) to model snowflakes from
    const baseSnowflake = BABYLON.MeshBuilder.CreateDisc("baseSnowflake", { radius, tessellation }, scene);
    const baseVertexData = baseSnowflake.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const baseNormals = baseSnowflake.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    const baseIndices = baseSnowflake.getIndices();

    // Number of vertices in the base snowflake
    const baseVertexCount = baseVertexData.length / 3; // 3 dimensions per vertex (xyz)

    // Loop to create 'numSnowflakes' snowflakes
    for (let i = 0; i < numSnowflakes; i++) {
        // Randomly position each snowflake
        const x = Math.random() * areaSize.x * 2 - areaSize.x;
        const y = Math.random() * areaSize.y * 2;
        const z = Math.random() * areaSize.z * 2 - areaSize.z;

        // Loop through the vertices of the base snowflake and create copies shifted to the given location
        for (let j = 0; j < baseVertexData.length; j += 3) {
            // Base snowflake vertex position
            const px = baseVertexData[j];
            const py = baseVertexData[j + 1];
            const pz = baseVertexData[j + 2];

            // Add new snowflake position shifted from the base snowflake
            positions.push(px + x);
            positions.push(py + y);
            positions.push(pz + z);

            // Add normals (not really used yet)
            normals.push(baseNormals[j]);
            normals.push(baseNormals[j + 1]);
            normals.push(baseNormals[j + 2]);
        }
        
        // Add indices for new snowflake vertices positioned by the snowflake's #
        for (let j = 0; j < baseIndices.length; j++) {
            indices.push(baseIndices[j] + baseVertexCount * i);
        }
    }

    // Create one final mesh to hold all snowflakes with new positions, normals, and indices
    const snowflakeMesh = new BABYLON.Mesh("snowflakeMesh", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.indices = indices;
    vertexData.applyToMesh(snowflakeMesh);

    // Dispose the base snowflake mesh (not needed)
    baseSnowflake.dispose();

    // Snowflakes Vertex Shader
    const snowflakesVertexShader = `
        precision highp float;
        attribute vec3 position;

        uniform mat4 worldViewProjection;
        uniform float time;

        varying float isVisible;

        void main() {
            vec3 updatedPosition = position;

            // Time-based approach (much harder and not working yet), weird b/c it depends on period of each individual snowflake to hit the ground
            // float modTime = mod(time, 20.0);
            // float changeY = modTime * 0.5 + 0.1 * sin(time * 2.0);
            // updatedPosition.y -= changeY;

            // Position-based approach (Fancy Equation #1)
            updatedPosition.y -= time + 0.05 * updatedPosition.x * abs(sin(time * 0.5) + cos(time * 0.3));
            updatedPosition.y = mod(updatedPosition.y, 10.); // Y-range of 10 for falling before being reset
            updatedPosition.y -= 1.; // Since mod function never reaches -1 (our reset point)

            // Wind and turbulence two factors for snowflake shakiness (random noise)
            float wind = sin(updatedPosition.x * 0.3 + updatedPosition.z * 0.2 + time * 0.4) * 0.5;
            float turbulence = sin(3.0 * updatedPosition.y + time * 0.5) * cos(2.0 * updatedPosition.x + time * 0.3) * 0.2;

            // Horizontal Movement (Fancy Equation #2)
            updatedPosition.x += wind + turbulence;

            if (updatedPosition.y < -1.0) {
                // Reset position to top boundary (above visible area)
                updatedPosition.y += 10.0;
            } else if (updatedPosition.y < 0.0) {
                // Invisible, out of bounds
                isVisible = 0.0;
            } else if (updatedPosition.y < 8.0) {
                // Visible, in bounds
                isVisible = 1.0;
            }

            gl_Position = worldViewProjection * vec4(updatedPosition, 1.0);
        }
    `;

    // Snowflakes Fragment Shader
    const snowflakesFragmentShader = `
        precision highp float;

        varying float isVisible;
        
        void main() {
            // Set snowflake to white (will add a mesh with UV mapping here)
            gl_FragColor = vec4(1., 1., 1., isVisible); // isVisible used for transparency (visibility)
        }
    `;

    // Shader Material (Snowflakes Falling)
    const snowflakesShaderMaterial = new BABYLON.ShaderMaterial("snowflakeShader", scene, {
        vertexSource: snowflakesVertexShader,
        fragmentSource: snowflakesFragmentShader,
    }, {
        attributes: ["position"],
        uniforms: ["world", "worldViewProjection", "time"],
    });

    snowflakesShaderMaterial.alpha = 0.5;
    snowflakeMesh.material = snowflakesShaderMaterial;

    //---------------SNOW ON GROUND------------------//

    // Create a custom grid mesh (used for snow accumulation)
    const groundSnowMesh = BABYLON.MeshBuilder.CreateGround("ground", {
        width: 10, 
        height: 10, 
        subdivisions: 50,  // Floor broken up to allow smooth movement
    }, scene);

    // Had to get creative here and use a sand texture mixed with white for snow on the ground
    const groundSnowTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/sand.jpg", scene);
    const groundSnowMaterial = new BABYLON.StandardMaterial("groundSnowMaterial", scene);
    groundSnowMaterial.diffuseTexture = groundSnowTexture;
    groundSnowMesh.material = groundSnowMaterial;

    // Snow on Ground Vertex Shader
    const groundVertexShader = `
        uniform float time;
        uniform float snowAmount;
        uniform mat4 worldViewProjection;

        attribute vec3 position;
        attribute vec3 normal;

        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            // Simulate snow building up over time, varying heights based on position (Fancy Equation #3)
            float accumulation = 0.01 * time + sin(time + position.x * 0.5 + position.z * 0.5) * snowAmount;
            vec3 newPosition = position;
            newPosition.y += accumulation;

            vNormal = normal;
            vPosition = newPosition;

            gl_Position = worldViewProjection * vec4(newPosition, 1.0);
        }
    `;

    // Snow on Ground Fragment Shader
    var groundFragmentShader = `
        uniform sampler2D groundSnowTexture;

        varying vec3 vPosition;

        void main() {
            // Noise here can help make it a little bit rougher on the snow's surface
            vec2 uv = vec2(vPosition.x * 0.1, vPosition.z * 0.1);
            vec4 textureColor = texture2D(groundSnowTexture, uv);

            // Mix sand with white for snow (90% white, 10% sand)
            gl_FragColor = mix(textureColor, vec4(1.0, 1.0, 1.0, 1.0), 0.9);
        }
    `;

    // Create a custom shader material for snow accumulation
    const groundShaderMaterial = new BABYLON.ShaderMaterial("groundShader", scene, {
        vertexSource: groundVertexShader,
        fragmentSource: groundFragmentShader,
    }, {
        attributes: ["position", "normal"],
        uniforms: ["world", "worldViewProjection", "time", "snowAmount"],
        samplers: ["groundSnowTexture"]
    });

    groundSnowMesh.material = groundShaderMaterial;

    let time = 0;
    let accumulationTime = 0;
    const snowAccumulationRate = 0.05; // Slow build up

    function update() {
        time += engine.getDeltaTime() / 1000.0;
        snowflakesShaderMaterial.setFloat("time", time);
        accumulationTime += engine.getDeltaTime() / 1000.0;
        groundShaderMaterial.setFloat("time", accumulationTime);
        groundShaderMaterial.setFloat("snowAmount", snowAccumulationRate);
        groundShaderMaterial.setTexture("groundSnowTexture", groundSnowTexture);
    }

    scene.registerBeforeRender(update);

    snowflakesShaderMaterial.backFaceCulling = false;
    groundShaderMaterial.backFaceCulling = false;

    return scene;
};
