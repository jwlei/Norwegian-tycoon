"use strict";

// One renderer serves all moving cards. Only the resolved 2D output lives on each preview.
class CardDepth {
    static cache = new Map();
    static states = new WeakMap();
    static warned = false;
    static disabled = false;

    static warn(error) {
        if (!this.warned) {
            console.warn("3D card rendering unavailable; using the original card image.", error);
            this.warned = true;
        }
    }

    static initialize() {
        if (this.gl || this.disabled) { return !!this.gl; }
        this.source = document.createElement("canvas");
        const gl = this.source.getContext("webgl", {
            alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false
        });
        if (!gl) {
            this.disabled = true;
            this.warn("WebGL is not supported.");
            return false;
        }
        this.gl = gl;
        this.source.addEventListener("webglcontextlost", event => {
            event.preventDefault();
            this.disabled = true;
            this.warn("The GPU context was lost.");
            for (const state of [...this.active]) { this.detach(state.element); }
        });
        const compile = (type, source) => {
            const shader = gl.createShader(type);
            if (!shader) { throw new Error("Could not allocate a card shader."); }
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const error = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(error);
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
            precision mediump float;
            uniform sampler2D image;
            uniform vec3 tone;
            uniform vec2 light;
            uniform float face;
            varying vec2 texcoord;
            void main() {
                vec4 pixel = texture2D(image, texcoord);
                vec3 color = mix(tone, pixel.rgb, face);
                float shade = dot(vec2(0.5) - texcoord, light) * 0.10;
                color = mix(color, vec3(1.0), max(0.0, shade) * face);
                color *= 1.0 + min(0.0, shade) * face;
                gl_FragColor = vec4(color * pixel.a, pixel.a);
            }`);
        const program = gl.createProgram();
        if (!program) { throw new Error("Could not allocate the card rendering program."); }
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
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
        this.limit = Math.min(1536, gl.getParameter(gl.MAX_TEXTURE_SIZE),
            gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        return true;
    }

    static async textures(src) {
        if (this.cache.has(src)) {
            const cached = this.cache.get(src);
            this.cache.delete(src);
            this.cache.set(src, cached);
            return cached;
        }
        const pending = (async () => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const svg = new DOMParser().parseFromString(decodeURIComponent(src.slice(src.indexOf(",") + 1)), "image/svg+xml");
            const outline = svg.querySelector("svg > rect");
            if (!outline) { throw new Error("The card SVG has no outer rectangle."); }
            const silhouette = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            silhouette.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            silhouette.setAttribute("viewBox", "0 0 80 120");
            const rect = outline.cloneNode();
            rect.setAttribute("fill", "white");
            rect.setAttribute("stroke", "white");
            silhouette.appendChild(rect);
            const mask = new Image();
            mask.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(silhouette))}`;
            await mask.decode();
            const gl = this.gl;
            const textures = [mask, image].map((source, index) => {
                const canvas = document.createElement("canvas");
                canvas.width = 512;
                canvas.height = 768;
                const context = canvas.getContext("2d");
                if (!context) { throw new Error("Canvas 2D is unavailable."); }
                context.drawImage(source, 0, 0, canvas.width, canvas.height);
                const texture = gl.createTexture();
                if (!texture) { throw new Error("Could not allocate a card texture."); }
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                const sampling = index === 1 && Number(outline.getAttribute("rx")) === 0 ? gl.NEAREST : gl.LINEAR;
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sampling);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sampling);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
                return texture;
            });
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                textures.forEach(texture => gl.deleteTexture(texture));
                throw new Error(`Card texture upload failed (WebGL error ${error}).`);
            }
            return { textures, outline: {
                x: Number(outline.getAttribute("x")) - Number(outline.getAttribute("stroke-width")) / 2,
                y: Number(outline.getAttribute("y")) - Number(outline.getAttribute("stroke-width")) / 2,
                radius: Number(outline.getAttribute("rx")) + Number(outline.getAttribute("stroke-width")) / 2
            } };
        })();
        this.cache.set(src, pending);
        try {
            const result = await pending;
            // A bounded cache avoids retaining every appearance across long sessions.
            if (this.cache.size > 8) {
                const [key, oldest] = this.cache.entries().next().value;
                this.cache.delete(key);
                const entry = await oldest;
                // Live previews own their textures until detached.
                if (![...this.active].some(state => state.src === key)) {
                    entry.textures.forEach(texture => this.gl.deleteTexture(texture));
                } else {
                    this.retired.set(entry, key);
                }
            }
            return result;
        } catch (error) {
            this.cache.delete(src);
            throw error;
        }
    }

    static active = new Set();
    static retired = new Map();

    static attach(element) {
        if (this.states.has(element)) { return; }
        if (this.active.size >= 8) {
            this.warn("The eight-card rendering budget is in use.");
            return;
        }
        const image = element.querySelector("img");
        if (!image) { return; }
        try {
            if (!this.initialize() || this.disabled) { return; }
        } catch (error) {
            this.disabled = true;
            this.warn(error);
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.className = "card-depth-canvas";
        canvas.setAttribute("aria-hidden", "true");
        const context = canvas.getContext("2d");
        if (!context) { this.warn("Canvas 2D is unavailable."); return; }
        const shadow = document.createElement("canvas");
        shadow.className = "card-depth-shadow";
        shadow.setAttribute("aria-hidden", "true");
        const shadowContext = shadow.getContext("2d");
        if (!shadowContext) { this.warn("Shadow canvas is unavailable."); return; }
        const state = { element, canvas, context, shadow, shadowContext, src: image.src,
            pose: { pitch: 0, yaw: 0, roll: 0, lift: 18 }, frame: null };
        this.states.set(element, state);
        this.active.add(state);
        this.textures(image.src).then(entry => {
            if (this.states.get(element) !== state || this.disabled) { return; }
            if (element.isConnected === false) { this.detach(element); return; }
            state.entry = entry;
            element.append(shadow, canvas);
            element.classList.add("has-card-depth");
            this.update(element, state.pose);
        }).catch(error => { this.warn(error); this.detach(element); });
    }

    static update(element, pose) {
        const state = this.states.get(element);
        if (!state || this.disabled) { return; }
        state.pose = { ...state.pose, ...pose };
        element.style.setProperty("--depth-pitch", `${state.pose.pitch}deg`);
        element.style.setProperty("--depth-yaw", `${state.pose.yaw}deg`);
        element.style.setProperty("--depth-roll", `${state.pose.roll}deg`);
        if (!state.entry) { return; }
        const width = parseFloat(element.style.width) || element.offsetWidth;
        const height = parseFloat(element.style.height) || element.offsetHeight;
        if (!width || !height) { return; }
        const { pitch, yaw, roll, lift } = state.pose;
        const key = [width, height, pitch, yaw, roll, lift, window.devicePixelRatio].join(":");
        if (state.key === key) { return; }
        state.key = key;
        const ry = yaw * Math.PI / 180, rx = pitch * Math.PI / 180, rz = roll * Math.PI / 180;
        const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
        const cr = Math.cos(rz), sr = Math.sin(rz);
        const rotate = (x, y, z) => {
            const a = cr * x - sr * y, b = sr * x + cr * y;
            return [cy * a + sy * z, sx * sy * a + cx * b - sx * cy * z,
                -cx * sy * a + sx * b + cx * cy * z];
        };
        const size = Math.ceil(Math.hypot(width, height) + 120);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pixels = Math.max(1, Math.min(Math.round(size * dpr), Math.floor(this.limit / 2)));
        const resolution = pixels * 2;
        const gl = this.gl;
        if (this.source.width !== resolution) { this.source.width = this.source.height = resolution; }
        for (const canvas of [state.canvas, state.shadow]) {
            if (canvas.width !== pixels) { canvas.width = canvas.height = pixels; }
            canvas.style.width = canvas.style.height = `${size}px`;
        }
        state.canvas.dataset.renderSize = String(resolution);
        state.canvas.dataset.outputSize = String(pixels);
        gl.viewport(0, 0, resolution, resolution);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const lx = -.55 * cy + .7 * sx * sy - cx * sy;
        const ly = -.7 * cx + sx;
        gl.uniform2f(this.light, lx * cr + ly * sr, -lx * sr + ly * cr);
        const lz = -.55 * sy - .7 * sx * cy + cx * cy;
        const edgeTone = Math.round(174 + Math.max(-1, Math.min(1, lz)) * 24);
        const corners = [[-width / 2, -height / 2, 0, 0], [width / 2, -height / 2, 1, 0],
            [-width / 2, height / 2, 0, 1], [width / 2, height / 2, 1, 1]];
        for (let sheet = 16; sheet >= -1; sheet--) {
            const face = sheet === -1;
            const z = face ? .01 : -3 * sheet / 16;
            const vertices = corners.map(([x, y, u, v]) => {
                const [a, b, c] = rotate(x, y, z);
                return [a / (size / 2), -b / (size / 2), 1 - c / 900, u, v];
            });
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(
                [0, 1, 2, 2, 1, 3].flatMap(index => vertices[index])), gl.DYNAMIC_DRAW);
            const tone = sheet % 2 ? [edgeTone - 14, edgeTone - 12, edgeTone - 25]
                : [edgeTone + 22, edgeTone + 20, edgeTone + 5];
            gl.uniform3f(this.tone, ...tone.map(value => value / 255));
            gl.uniform1f(this.face, face ? 1 : 0);
            gl.bindTexture(gl.TEXTURE_2D, state.entry.textures[face ? 1 : 0]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        state.context.clearRect(0, 0, pixels, pixels);
        state.context.imageSmoothingEnabled = true;
        state.context.imageSmoothingQuality = "high";
        state.context.drawImage(this.source, 0, 0, pixels, pixels);
        const ctx = state.shadowContext;
        ctx.clearRect(0, 0, pixels, pixels);
        ctx.save();
        ctx.scale(pixels / size, pixels / size);
        ctx.translate(size / 2, size / 2);
        const outline = state.entry.outline;
        const points = [];
        const xInset = outline.x * width / 80, yInset = outline.y * height / 120;
        const radiusX = outline.radius * width / 80, radiusY = outline.radius * height / 120;
        for (const [x, y, angle] of [[-width / 2 + xInset + radiusX, -height / 2 + yInset + radiusY, 180],
            [width / 2 - xInset - radiusX, -height / 2 + yInset + radiusY, 270],
            [width / 2 - xInset - radiusX, height / 2 - yInset - radiusY, 0],
            [-width / 2 + xInset + radiusX, height / 2 - yInset - radiusY, 90]]) {
            for (let step = 0; step <= 12; step++) {
                const radians = (angle + step * 7.5) * Math.PI / 180;
                points.push(rotate(x + Math.cos(radians) * radiusX, y + Math.sin(radians) * radiusY, 0));
            }
        }
        const clearance = lift + Math.max(...points.map(point => Math.abs(point[2]))) + 7;
        ctx.filter = `blur(${5 + lift * .16}px)`;
        ctx.fillStyle = `rgba(1, 9, 4, ${.34 - lift * .0015})`;
        ctx.beginPath();
        points.forEach(([x, y, z], index) => {
            const a = x + .55 * (clearance + z), b = y + .7 * (clearance + z);
            if (index) { ctx.lineTo(a, b); } else { ctx.moveTo(a, b); }
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    static follow(element, animation, poseAtProgress) {
        const state = this.states.get(element);
        if (!state) { return; }
        if (state.frame != null) { cancelAnimationFrame(state.frame); }
        const tick = () => {
            state.frame = null;
            if (this.states.get(element) !== state) { return; }
            if (!element.isConnected) { this.detach(element); return; }
            const progress = animation.effect.getComputedTiming().progress;
            if (progress != null) { this.update(element, poseAtProgress(progress)); }
            if (animation.playState !== "finished" && animation.playState !== "idle") {
                state.frame = requestAnimationFrame(tick);
            }
        };
        tick();
    }

    static returnToHand(element) {
        const state = this.states.get(element);
        if (!state) { return; }
        const pose = { ...state.pose };
        const animation = element.animate([{ opacity: 1 }, { opacity: 1 }], {
            duration: 320, easing: "cubic-bezier(.2,.8,.25,1)"
        });
        this.follow(element, animation, progress => ({
            pitch: pose.pitch * (1 - progress), yaw: pose.yaw * (1 - progress), lift: 18 * (1 - progress)
        }));
    }

    static cancelFollow(element) {
        const state = this.states.get(element);
        if (state && state.frame != null) { cancelAnimationFrame(state.frame); state.frame = null; }
    }

    static detach(element) {
        const state = this.states.get(element);
        if (!state) { return; }
        if (state.frame != null) { cancelAnimationFrame(state.frame); }
        state.canvas.remove();
        state.shadow.remove();
        element.classList.remove("has-card-depth");
        this.states.delete(element);
        this.active.delete(state);
        for (const [entry, src] of this.retired) {
            if (![...this.active].some(active => active.src === src)) {
                entry.textures.forEach(texture => this.gl.deleteTexture(texture));
                this.retired.delete(entry);
            }
        }
    }
}
