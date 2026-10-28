"use strict";

class DepthCardRenderer {
    static async loadTexture(source) {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 1536;
        const context = canvas.getContext("2d");
        if (!context) { throw new Error("Card rendering requires a 2D canvas."); }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    constructor(stage, artwork, silhouette, samples, antialias) {
        this.samples = samples;
        this.output = document.createElement("canvas");
        this.output.className = "rendered-card";
        this.output.setAttribute("aria-hidden", "true");
        stage.appendChild(this.output);
        this.context = this.output.getContext("2d");
        this.source = document.createElement("canvas");
        const gl = this.source.getContext("webgl", { alpha: true, antialias, premultipliedAlpha: true });
        if (!gl || !this.context) { throw new Error("This comparison requires WebGL and Canvas 2D."); }
        this.gl = gl;
        this.output.dataset.samples = String(samples);
        this.output.dataset.msaa = String(gl.getContextAttributes().antialias);
        if (antialias && !gl.getContextAttributes().antialias) {
            throw new Error("This browser could not enable WebGL multisample anti-aliasing.");
        }
        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`Card shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
            }
            return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, `
            attribute vec3 position;
            attribute vec2 uv;
            varying vec2 texcoord;
            void main() {
                gl_Position = vec4(position.xy, 0.0, position.z);
                texcoord = uv;
            }`);
        const fragment = compile(gl.FRAGMENT_SHADER, `
            precision highp float;
            uniform sampler2D image;
            uniform vec3 tone;
            uniform vec3 light;
            uniform float face;
            varying vec2 texcoord;
            void main() {
                vec4 pixel = texture2D(image, texcoord);
                vec3 color = mix(tone, pixel.rgb, face);
                float shade = dot(vec2(0.5) - texcoord, light.xy) * 0.10;
                color = mix(color, vec3(1.0), max(0.0, shade) * face);
                color *= 1.0 + min(0.0, shade) * face;
                gl_FragColor = vec4(color * pixel.a, pixel.a);
            }`);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Card shader linking failed: ${gl.getProgramInfoLog(program)}`);
        }
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        const position = gl.getAttribLocation(program, "position");
        const uv = gl.getAttribLocation(program, "uv");
        gl.enableVertexAttribArray(position);
        gl.enableVertexAttribArray(uv);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
        this.tone = gl.getUniformLocation(program, "tone");
        this.light = gl.getUniformLocation(program, "light");
        this.face = gl.getUniformLocation(program, "face");
        this.textures = [silhouette, artwork].map(image => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            return texture;
        });
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    render(yaw, pitch, settings) {
        const gl = this.gl;
        const dpr = window.devicePixelRatio || 1;
        const pixels = Math.round(320 * dpr);
        const resolution = pixels * this.samples;
        if (resolution > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
            resolution > gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) {
            throw new Error(`Requested ${resolution}px card render target exceeds this GPU's limits.`);
        }
        if (this.source.width !== resolution) {
            this.source.width = this.source.height = resolution;
            this.output.width = this.output.height = pixels;
        }
        this.output.dataset.renderSize = String(resolution);
        this.output.dataset.outputSize = String(pixels);
        gl.viewport(0, 0, resolution, resolution);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const ry = yaw * Math.PI / 180, rx = pitch * Math.PI / 180;
        const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
        const lx = -.55 * cy + .7 * sx * sy - cx * sy;
        const ly = -.7 * cx + sx;
        const lz = -.55 * sy - .7 * sx * cy + cx * cy;
        gl.uniform3f(this.light, lx, ly, lz);
        const edgeTone = Math.round(174 + Math.max(-1, Math.min(1, lz)) * 24);
        const corners = [[-64, -96, 0, 0], [64, -96, 1, 0], [-64, 96, 0, 1], [64, 96, 1, 1]];
        for (let sheet = 16; sheet >= -1; sheet--) {
            const face = sheet === -1;
            const z = face ? .01 : -settings.thickness * sheet / 16;
            const vertices = corners.map(([x, y, u, v]) => {
                const rotatedX = cy * x + sy * z;
                const rotatedY = sx * sy * x + cx * y - sx * cy * z - settings.lift;
                const rotatedZ = -cx * sy * x + sx * y + cx * cy * z;
                return [rotatedX / 160, -rotatedY / 160, 1 - rotatedZ / 850, u, v];
            });
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(
                [0, 1, 2, 2, 1, 3].flatMap(index => vertices[index])), gl.DYNAMIC_DRAW);
            const tone = sheet % 2
                ? [edgeTone - 14, edgeTone - 12, edgeTone - 25]
                : [edgeTone + 22, edgeTone + 20, edgeTone + 5];
            gl.uniform3f(this.tone, ...tone.map(value => value / 255));
            gl.uniform1f(this.face, face ? 1 : 0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[face ? 1 : 0]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        // Resolve the entire projected card to display pixels; CSS never rotates the output.
        this.context.clearRect(0, 0, pixels, pixels);
        this.context.imageSmoothingEnabled = true;
        this.context.imageSmoothingQuality = "high";
        this.context.drawImage(this.source, 0, 0, pixels, pixels);
    }
}
