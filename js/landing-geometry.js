(function (root) {
    "use strict";

    const WIDTH = 112;
    const HEIGHT = 168;
    const EDGE = 3;
    const VIEW_SHEAR = .28;
    const LIGHT = { x: -.4, y: -.5, z: 1 };
    const radians = degrees => degrees * Math.PI / 180;
    const degrees = angle => angle * 180 / Math.PI;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const mix = (a, b, t) => a + (b - a) * t;
    const rotations = new WeakMap();
    const planes = new WeakMap();

    function rotate(x, y, z, pose) {
        let m = rotations.get(pose);
        if (!m || m.pitch !== pose.pitch || m.yaw !== pose.yaw || m.roll !== pose.roll) {
            const rx = radians(pose.pitch), ry = radians(pose.yaw), rz = radians(pose.roll);
            const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
            const cr = Math.cos(rz), sr = Math.sin(rz);
            m = { pitch: pose.pitch, yaw: pose.yaw, roll: pose.roll,
                xx: cy * cr, xy: -cy * sr, xz: sy,
                yx: sx * sy * cr + cx * sr, yy: -sx * sy * sr + cx * cr, yz: -sx * cy,
                zx: -cx * sy * cr + sx * sr, zy: cx * sy * sr + sx * cr, zz: cx * cy };
            rotations.set(pose, m);
        }
        return {
            x: m.xx * x + m.xy * y + m.xz * z,
            y: m.yx * x + m.yy * y + m.yz * z,
            z: m.zx * x + m.zy * y + m.zz * z
        };
    }

    function world(x, y, z, pose) {
        const point = rotate(x, y, z, pose);
        return { x: point.x + pose.x, y: point.y + pose.y, z: point.z + pose.z };
    }

    function screen(point) {
        return { x: point.x, y: point.y - point.z * VIEW_SHEAR };
    }

    function plane(pose) {
        const width = pose.width || WIDTH, height = pose.height || HEIGHT;
        const previous = planes.get(pose);
        if (previous && previous.x === pose.x && previous.y === pose.y && previous.z === pose.z &&
            previous.pitch === pose.pitch && previous.yaw === pose.yaw && previous.roll === pose.roll &&
            previous.width === width && previous.height === height) { return previous.surface; }
        const normal = rotate(0, 0, 1, pose);
        const a = rotate(width / 2, 0, 0, pose), b = rotate(0, height / 2, 0, pose);
        const surface = { normal, point: { x: pose.x, y: pose.y, z: pose.z },
            extentX: Math.abs(a.x) + Math.abs(b.x), extentY: Math.abs(a.y) + Math.abs(b.y),
            ceiling: pose.z + Math.abs(a.z) + Math.abs(b.z) };
        planes.set(pose, { ...pose, width, height, surface });
        return surface;
    }

    function heightAt(surface, x, y) {
        const { normal: n, point: p } = surface;
        return p.z - (n.x * (x - p.x) + n.y * (y - p.y)) / n.z;
    }

    function signedDistance(point, surface) {
        const { normal: n, point: p } = surface;
        return n.x * (point.x - p.x) + n.y * (point.y - p.y) + n.z * (point.z - p.z);
    }

    function silhouette(pose, z = 0) {
        const width = pose.width || WIDTH, height = pose.height || HEIGHT;
        const inset = .75 * width / 80, insetY = .75 * height / 120;
        const radius = (pose.radius ?? 8.75) * width / 80;
        const radiusY = (pose.radius ?? 8.75) * height / 120;
        const points = [];
        for (const [x, y, angle] of [
            [-width / 2 + inset + radius, -height / 2 + insetY + radiusY, 180],
            [width / 2 - inset - radius, -height / 2 + insetY + radiusY, 270],
            [width / 2 - inset - radius, height / 2 - insetY - radiusY, 0],
            [-width / 2 + inset + radius, height / 2 - insetY - radiusY, 90]
        ]) {
            for (let step = 0; step <= 16; step++) {
                const theta = radians(angle + step * 90 / 16);
                points.push(world(x + Math.cos(theta) * radius, y + Math.sin(theta) * radiusY, z, pose));
            }
        }
        return points;
    }

    function contains(pose, x, y) {
        const a = rotate(1, 0, 0, pose), b = rotate(0, 1, 0, pose);
        const determinant = a.x * b.y - b.x * a.y;
        const dx = x - pose.x, dy = y - pose.y;
        const u = Math.abs((dx * b.y - b.x * dy) / determinant);
        const v = Math.abs((a.x * dy - dx * a.y) / determinant);
        const width = pose.width || WIDTH, height = pose.height || HEIGHT;
        const radius = (pose.radius ?? 8.75) * width / 80, radiusY = (pose.radius ?? 8.75) * height / 120;
        const halfWidth = width / 2 - .75 * width / 80, halfHeight = height / 2 - .75 * height / 120;
        if (u > halfWidth + 1e-7 || v > halfHeight + 1e-7) { return false; }
        const cornerX = Math.max(0, u - halfWidth + radius);
        const cornerY = Math.max(0, v - halfHeight + radiusY);
        if (!radius || !radiusY) { return true; }
        return (cornerX / radius) ** 2 + (cornerY / radiusY) ** 2 <= 1 + 1e-7;
    }

    function supportHeight(cards, x, y) {
        let height = 0;
        for (let index = cards.length - 1; index >= 0; index--) {
            const card = cards[index], surface = plane(card);
            if (surface.ceiling <= height || Math.abs(x - card.x) > surface.extentX ||
                Math.abs(y - card.y) > surface.extentY) { continue; }
            if (contains(card, x, y)) { height = Math.max(height, heightAt(surface, x, y)); }
        }
        return height;
    }

    function samples(pose, z = 0) {
        const points = silhouette(pose, z);
        for (let x = -45; x <= 45; x += 15) {
            for (let y = -70; y <= 70; y += 14) {
                points.push(world(x * (pose.width || WIDTH) / WIDTH, y * (pose.height || HEIGHT) / HEIGHT, z, pose));
            }
        }
        return points;
    }

    function landing(cards, x, y, roll, dimensions = {}) {
        const flat = { ...dimensions, x, y, z: 0, pitch: 0, yaw: 0, roll };
        const contacts = samples(flat);
        const heights = contacts.map(point => supportHeight(cards, point.x, point.y));
        // Fit a gentle resting plane to the support heights, then lift it until the underside clears all supports.
        let xx = 0, yy = 0, xy = 0, xh = 0, yh = 0;
        const mean = heights.reduce((sum, height) => sum + height, 0) / heights.length;
        contacts.forEach((point, index) => {
            const dx = point.x - x, dy = point.y - y, h = heights[index] - mean;
            xx += dx * dx; yy += dy * dy; xy += dx * dy; xh += dx * h; yh += dy * h;
        });
        const determinant = xx * yy - xy * xy;
        const slopeX = clamp((xh * yy - yh * xy) / determinant, -.12, .12) * .8;
        const slopeY = clamp((yh * xx - xh * xy) / determinant, -.12, .12) * .8;
        const pitch = Math.abs(slopeY) < 1e-10 ? 0 : degrees(Math.atan(slopeY));
        const yaw = Math.abs(slopeX) < 1e-10 ? 0 : degrees(Math.atan(-slopeX * Math.cos(radians(pitch))));
        const pose = { ...flat, pitch, yaw };
        pose.z = minimumHeight(cards, pose);
        return pose;
    }

    function minimumHeight(cards, pose) {
        const underside = samples({ ...pose, z: 0 }, -EDGE);
        return Math.max(...underside.map(point => supportHeight(cards, point.x, point.y) - point.z)) + .06;
    }

    function clipAbove(points, surface) {
        const clipped = [];
        for (let index = 0; index < points.length; index++) {
            const a = points[index], b = points[(index + 1) % points.length];
            const da = signedDistance(a, surface), db = signedDistance(b, surface);
            if (da >= 0) { clipped.push(a); }
            if ((da >= 0) !== (db >= 0)) {
                const t = da / (da - db);
                clipped.push({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) });
            }
        }
        return clipped;
    }

    function shadow(caster, receiver = null) {
        const surface = receiver ? plane(receiver)
            : { normal: { x: 0, y: 0, z: 1 }, point: { x: 0, y: 0, z: 0 } };
        const points = clipAbove(silhouette(caster, -EDGE), surface);
        if (!points.length) { return { points: [], blur: .6, opacity: 0, gap: 0 }; }
        const n = surface.normal;
        const denominator = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z;
        const distances = points.map(point => signedDistance(point, surface) / denominator);
        const projected = points.map((point, index) => screen({
            x: point.x - distances[index] * LIGHT.x,
            y: point.y - distances[index] * LIGHT.y,
            z: point.z - distances[index] * LIGHT.z
        }));
        const gap = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
        return { points: projected, blur: .6 + Math.min(90, gap) * .1,
            opacity: .36 - Math.min(100, gap) * .0016, gap };
    }

    function flight(start, target, progress, arc = 32) {
        const t = clamp(progress, 0, 1);
        const travel = 1 - Math.pow(1 - t, 3);
        const settle = t < .7 ? travel : 1 - Math.pow((1 - t) / .3, 2) * .027;
        return {
            x: mix(start.x, target.x, travel), y: mix(start.y, target.y, travel),
            z: mix(start.z, target.z, t * t * (3 - 2 * t)) + Math.sin(Math.PI * t) * arc,
            pitch: mix(start.pitch, target.pitch, settle),
            yaw: mix(start.yaw, target.yaw, settle),
            roll: mix(start.roll, target.roll, travel)
        };
    }

    function position(start, impact, momentum, progress) {
        const t = clamp(progress, 0, 1);
        if (t < .58) {
            const travel = t / .58, ease = 1 - (1 - travel) ** 3;
            const tangent = (travel ** 3 - travel ** 2) * 3 * .58 / .42;
            return { x: mix(start.x, impact.x, ease) + momentum.x * tangent,
                y: mix(start.y, impact.y, ease) + momentum.y * tangent,
                roll: mix(start.roll, impact.roll, ease) + momentum.spin * tangent };
        }
        const slide = 1 - ((1 - t) / .42) ** 3;
        return { x: impact.x + momentum.x * slide, y: impact.y + momentum.y * slide,
            roll: impact.roll + momentum.spin * slide };
    }

    function motion(cards, start, impact, momentum, progress, contact = null) {
        const t = clamp(progress, 0, 1);
        const contactTime = .58;
        const dimensions = Object.fromEntries(["width", "height", "radius"]
            .filter(key => start[key] !== undefined).map(key => [key, start[key]]));
        const target = contact || landing(cards, impact.x, impact.y, impact.roll, dimensions);
        const planar = position(start, impact, momentum, t);
        if (t < contactTime) {
            const travel = t / contactTime;
            const pose = flight(start, target, travel, 26 + momentum.power * 20);
            Object.assign(pose, dimensions);
            Object.assign(pose, planar);
            pose.z = Math.max(pose.z, minimumHeight(cards, pose));
            return { pose, phase: "flight", bounce: 0 };
        }
        const settle = (t - contactTime) / (1 - contactTime);
        const rest = landing(cards, planar.x, planar.y, planar.roll, dimensions);
        const rock = Math.sin(settle * Math.PI * 4) * Math.pow(1 - settle, 2) * momentum.power;
        rest.pitch += rock * 1.6;
        rest.yaw -= rock * 1.1;
        const bounce = Math.abs(Math.sin(settle * Math.PI * 2)) * Math.pow(1 - settle, 2) *
            (2 + momentum.power * 7);
        rest.z = minimumHeight(cards, rest) + bounce;
        return { pose: rest, phase: t === 1 ? "settled" : "contact", bounce };
    }

    const api = { WIDTH, HEIGHT, EDGE, VIEW_SHEAR, LIGHT, rotate, world, screen, plane, heightAt,
        signedDistance, silhouette, contains, samples, supportHeight, landing, minimumHeight, shadow, flight, position, motion };
    if (typeof module !== "undefined" && module.exports) { module.exports = api; }
    else { root.LandingGeometry = api; }
})(globalThis);
