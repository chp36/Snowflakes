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
    const areaSize = { x: 5, y: 5, z: 5 };
    const radius = 0.1;
    const tessellation = 8;
    const numSnowflakes = 100;

    // Create the base snowflake geometry (a disc) and get its vertex data
    const baseSnowflake = BABYLON.MeshBuilder.CreateDisc("baseSnowflake", { radius, tessellation }, scene);
    const baseVertexData = baseSnowflake.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const baseNormals = baseSnowflake.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    const baseIndices = baseSnowflake.getIndices();

    // Number of vertices in the base snowflake
    const baseVertexCount = baseVertexData.length / 3;

    // Loop through the number of snowflakes you want to generate
    for (let i = 0; i < numSnowflakes; i++) {
        // Random position for each snowflake
        const x = Math.random() * areaSize.x * 2 - areaSize.x;
        const y = Math.random() * areaSize.y * 2;
        const z = Math.random() * areaSize.z * 2 - areaSize.z;

        // Apply the translation to each vertex position for this snowflake
        for (let j = 0; j < baseVertexData.length; j += 3) {
            const px = baseVertexData[j];
            const py = baseVertexData[j + 1];
            const pz = baseVertexData[j + 2];

            // Translate each vertex by the random position of this snowflake
            positions.push(px + x);
            positions.push(py + y);
            positions.push(pz + z);

            // Add normals from the base mesh (these stay the same for each snowflake)
            normals.push(baseNormals[j]);
            normals.push(baseNormals[j + 1]);
            normals.push(baseNormals[j + 2]);
        }

        // Update indices for each snowflake (offset by number of vertices already added)
        for (let j = 0; j < baseIndices.length; j++) {
            indices.push(baseIndices[j] + baseVertexCount * i);
        }
    }

    // Create the final mesh using the accumulated positions, normals, and indices
    const snowflakeMesh = new BABYLON.Mesh("snowflakeMesh", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.indices = indices;
    vertexData.applyToMesh(snowflakeMesh);

    // Dispose the base snowflake mesh as we no longer need it
    baseSnowflake.dispose();

    // Vertex Shader
    const vertexShader = `
        precision highp float;
        attribute vec3 position;
        uniform mat4 worldViewProjection;
        uniform float time;
        uniform float seed;  // Unique seed for each snowflake
        varying vec3 vPos;
        varying float isVisible;

        void main() {
            vec3 updatedPosition = position;

            // Apply a sinusoidal function to the vertical movement of each snowflake
            // This creates the hovering effect with different rates for each snowflake
            updatedPosition.y -= time * 0.5 + 0.1 * sin(time * seed * 2.0);  // Adding sin(time * seed) for variation

            // Apply a sinusoidal function to the horizontal movement (z-direction) of each snowflake
            // This creates the side-to-side effect with different rates for each snowflake
            updatedPosition.x += sin(time * seed * 1.5) * 0.25;  // Adjust multiplier for varying speeds


            // Mark the snowflake as visible if it's within the bounds
            if (updatedPosition.y < -1.0) {
                // Reset to the top if it falls off the screen
                updatedPosition.y += 11.0;  // Reset to a position above the visible area
                isVisible = 1.0;  // Make the snowflake visible again
            } else {
                // Set the visibility to 1 when it's within bounds and falling
                isVisible = 1.0;
            }

            // Pass updated position to fragment shader
            vPos = updatedPosition;

            // Set the new position of the snowflake
            gl_Position = worldViewProjection * vec4(updatedPosition, 1.0);
        }
    `;

    // Fragment Shader
    const fragmentShader = `
        precision highp float;
        varying vec3 vPos;
        varying float isVisible;

        void main() {
            // Only display the snowflake if it's visible (isVisible = 1.0)
            if (isVisible < 1.0 || vPos.y < 0.0 || vPos.y > 10.0) {
                discard;  // Discard fragments outside the visible area
            }

            // Set the color of the snowflake (white)
            gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
    `;

    // Shader Material (Snowflakes Falling)
    const shaderMaterial = new BABYLON.ShaderMaterial("snowflakeShader", scene, {
        vertexSource: vertexShader,
        fragmentSource: fragmentShader,
    }, {
        attributes: ["position"],
        uniforms: ["world", "worldViewProjection", "time", "seed"], // Include 'seed' uniform
    });

    // Set the seed value for each snowflake
    for (let i = 0; i < numSnowflakes; i++) {
        shaderMaterial.setFloat("seed", Math.random() * 2.0 + 0.5);  // Random value for each snowflake
    }

    snowflakeMesh.material = shaderMaterial;

    //---------------SNOW ON GROUND------------------//

    // Create a custom grid mesh (used for snow accumulation)
    const groundSnowMesh = BABYLON.MeshBuilder.CreateGround("ground", {
        width: 10, 
        height: 10, 
        subdivisions: 50,  // You can increase subdivisions for more vertices
    }, scene);

    // Snow on Ground Vertex Shader
    const groundVertexShader = `
        uniform float time;
        uniform float snowAmount;
        uniform mat4 worldViewProjection;

        attribute vec3 position;
        attribute vec3 normal;

        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
            // Simulate snow accumulation based on position and time
            float accumulation = 0.01 * time + sin(time + position.x * 0.5 + position.z * 0.5) * snowAmount;
            vec3 newPosition = position;
            newPosition.y += accumulation;

            vPosition = newPosition;
            vNormal = normal;

            gl_Position = worldViewProjection * vec4(newPosition, 1.0);
        }
    `;

    // Snow on Ground Fragment Shader)
    var groundFragmentShader = `
        precision highp float;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
            // Simple snow appearance (white color)
            gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
    `;

    // Create a custom shader material for snow accumulation
    const groundShaderMaterial = new BABYLON.ShaderMaterial("groundShader", scene, {
        vertexSource: groundVertexShader,
        fragmentSource: groundFragmentShader,
    }, {
        attributes: ["position", "normal"],
        uniforms: ["world", "worldViewProjection", "time", "snowAmount"]
    });

    groundSnowMesh.material = groundShaderMaterial;

    // Time variable for animation
    let time = 0;

    // Snow accumulation parameters
    let accumulationTime = 0;
    const snowAccumulationRate = 0.05;  // Snow build-up rate
    const snowRandomness = 0.02;        // Randomness in accumulation for a more natural look

    function update() {
        time += engine.getDeltaTime() / 1000.0;
        shaderMaterial.setFloat("time", time);
        accumulationTime += engine.getDeltaTime() / 1000.0;
        groundShaderMaterial.setFloat("time", accumulationTime);  // Pass time to shader for animation
        groundShaderMaterial.setFloat("snowAmount", snowAccumulationRate);  // Pass snow accumulation rate
    }

    scene.registerBeforeRender(update);

    shaderMaterial.backFaceCulling = false;

    return scene;
};
