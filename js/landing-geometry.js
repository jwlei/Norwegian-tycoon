(function (root) {
    "use strict";

    const WIDTH = 112;
    const HEIGHT = 168;
    const EDGE = 3;
    const VIEW_SHEAR = .28;
    const LIGHT = { x: -.4, y: -.5, z: 1 };
    const CONTACT = .64;
    const SLIDE = 1 - CONTACT;
    // Slide-to-air distance ratio that gives one constant deceleration from throw to rest.
    const UNIFORM_SLIDE = 1 / (2 * CONTACT / SLIDE + (CONTACT / SLIDE) ** 2);
    // Points on each card outline (four corners of 17 points each), listed before interior samples.
    const CONTOUR_POINTS = 68;
    // A blurred shadow stays visible to about 2.5 blur radii beyond its edge.
    const HALO = 2.5;
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

    function insideOutline(pose, u, v, margin = 0) {
        const width = pose.width || WIDTH, height = pose.height || HEIGHT;
        const radius = (pose.radius ?? 8.75) * width / 80, radiusY = (pose.radius ?? 8.75) * height / 120;
        const halfWidth = width / 2 - .75 * width / 80 + margin, halfHeight = height / 2 - .75 * height / 120 + margin;
        u = Math.abs(u);
        v = Math.abs(v);
        if (u > halfWidth + 1e-7 || v > halfHeight + 1e-7) { return false; }
        if (!radius || !radiusY) { return true; }
        const cornerX = Math.max(0, u - halfWidth + radius + margin);
        const cornerY = Math.max(0, v - halfHeight + radiusY + margin);
        return (cornerX / (radius + margin)) ** 2 + (cornerY / (radiusY + margin)) ** 2 <= 1 + 1e-7;
    }

    // Inverts an affine map from card-local (u, v) to 2D, given the images of the unit axes.
    function insideAffine(pose, a, b, origin, x, y, margin = 0) {
        const determinant = a.x * b.y - b.x * a.y;
        const dx = x - origin.x, dy = y - origin.y;
        return insideOutline(pose, (dx * b.y - b.x * dy) / determinant, (a.x * dy - dx * a.y) / determinant, margin);
    }

    function contains(pose, x, y) {
        return insideAffine(pose, rotate(1, 0, 0, pose), rotate(0, 1, 0, pose), pose, x, y);
    }

    // Per-pose memo, rebuilt if the same pose object is later changed.
    function memo(map, pose, compute) {
        const entry = map.get(pose);
        if (entry && entry.x === pose.x && entry.y === pose.y && entry.z === pose.z && entry.pitch === pose.pitch &&
            entry.yaw === pose.yaw && entry.roll === pose.roll && entry.width === pose.width &&
            entry.height === pose.height) { return entry.value; }
        const value = compute(pose);
        map.set(pose, { x: pose.x, y: pose.y, z: pose.z, pitch: pose.pitch, yaw: pose.yaw, roll: pose.roll,
            width: pose.width, height: pose.height, value });
        return value;
    }

    const footprints = new WeakMap();
    // The card's projected top face and underside, with a screen-space bounding box around both.
    function footprint(pose) {
        return memo(footprints, pose, () => {
            const a = screen(rotate(1, 0, 0, pose)), b = screen(rotate(0, 1, 0, pose)), top = screen(pose);
            const n = rotate(0, 0, 1, pose);
            const base = screen({ x: pose.x - n.x * EDGE, y: pose.y - n.y * EDGE, z: pose.z - n.z * EDGE });
            const w = (pose.width || WIDTH) / 2 + 1, h = (pose.height || HEIGHT) / 2 + 1;
            const ex = Math.abs(a.x) * w + Math.abs(b.x) * h, ey = Math.abs(a.y) * w + Math.abs(b.y) * h;
            return { a, b, top, base, minX: Math.min(top.x, base.x) - ex, maxX: Math.max(top.x, base.x) + ex,
                minY: Math.min(top.y, base.y) - ey, maxY: Math.max(top.y, base.y) + ey };
        });
    }

    // Whether a screen point lies within the card's projected top face.
    function screenContains(pose, x, y) {
        const f = footprint(pose);
        return insideAffine(pose, f.a, f.b, f.top, x, y);
    }

    // Whether a screen point is hidden by the card, including its 3px edge (top face or underside).
    // Slivers under a quarter pixel cannot show a shadow, so they count as covered.
    function screenCovers(pose, x, y) {
        const f = footprint(pose);
        if (x < f.minX || x > f.maxX || y < f.minY || y > f.maxY) { return false; }
        return insideAffine(pose, f.a, f.b, f.top, x, y, .25) || insideAffine(pose, f.a, f.b, f.base, x, y, .25);
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
        return { points: projected, blur: blurFor(gap), opacity: .36 - Math.min(100, gap) * .0016, gap };
    }

    function blurFor(gap) {
        return .6 + Math.min(90, gap) * .1;
    }

    const sampleCache = new WeakMap(), castCache = new WeakMap(), boundsCache = new WeakMap();

    // Outline points at most `spacing` apart, including along the straight edges between the rounded corners.
    function outline(pose, z, spacing) {
        const corners = silhouette(pose, z), points = [];
        corners.forEach((a, index) => {
            const b = corners[(index + 1) % corners.length];
            const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / spacing));
            for (let step = 0; step < steps; step++) {
                const t = step / steps;
                points.push({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) });
            }
        });
        return points;
    }

    function interior(pose, z) {
        return samples(pose, z).slice(CONTOUR_POINTS);
    }

    // Exposure is sampled densely along the edge, where partly covered cards leave thin visible slivers.
    const surfaceSamples = pose => memo(sampleCache, pose, () => outline(pose, 0, 4).concat(interior(pose, 0)));
    const castSamples = pose => memo(castCache, pose, () => {
        const contour = outline(pose, -EDGE, 6);
        return { contour, points: contour.concat(interior(pose, -EDGE)) };
    });

    // Screen box containing every shadow the caster can cast, from its own footprint down to the felt.
    function shadowBounds(caster) {
        return memo(boundsCache, caster, () => {
            const f = footprint(caster);
            let { minX, maxX, minY, maxY } = f;
            for (const point of castSamples(caster).contour) {
                const distance = Math.max(0, point.z) / LIGHT.z;
                const s = screen({ x: point.x - distance * LIGHT.x, y: point.y - distance * LIGHT.y, z: 0 });
                minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
                minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
            }
            const spread = HALO * blurFor(caster.z);
            return { minX: minX - spread, maxX: maxX + spread, minY: minY - spread, maxY: maxY + spread };
        });
    }

    // Whether a point on some surface lies in the caster's shadow, widened by `margin` for the blur halo.
    function shadowedBy(caster, point, margin = 0) {
        const surface = plane(caster), n = surface.normal;
        const toward = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z;
        if (toward <= 1e-9) { return false; }
        const t = -(signedDistance(point, surface) + EDGE) / toward;
        if (t <= 0) { return false; }
        // Follow the light ray to the underside, then step to the top face for the outline test.
        const x = point.x + LIGHT.x * t + n.x * EDGE, y = point.y + LIGHT.y * t + n.y * EDGE;
        return insideAffine(caster, rotate(1, 0, 0, caster), rotate(0, 1, 0, caster), caster, x, y, margin);
    }

    function coveredBy(occluders, point) {
        const s = screen(point);
        for (const occluder of occluders) {
            if (screenCovers(occluder, s.x, s.y)) { return true; }
        }
        return false;
    }

    // Receiver surface points not hidden beneath occluders; a shadow can only show at these points.
    function exposedPoints(receiver, occluders) {
        return surfaceSamples(receiver).filter(point => !coveredBy(occluders, point));
    }

    // The caster's underside projected along the light onto a surface (null for the felt), plus a ring just
    // outside the shadow edge where its blur halo still shows. `outlineOnly` skips the interior samples.
    function projectedSamples(caster, surface, outlineOnly = false) {
        const target = surface || { normal: { x: 0, y: 0, z: 1 }, point: { x: 0, y: 0, z: 0 } };
        const n = target.normal;
        const denominator = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z;
        const points = [], contour = [];
        let total = 0;
        const source = castSamples(caster);
        for (const [index, point] of (outlineOnly ? source.contour : source.points).entries()) {
            const distance = signedDistance(point, target) / denominator;
            if (distance <= 0) { continue; }
            const projected = { x: point.x - distance * LIGHT.x, y: point.y - distance * LIGHT.y, z: point.z - distance * LIGHT.z };
            points.push(projected);
            if (index < source.contour.length) { contour.push(projected); total += distance; }
        }
        if (!contour.length) { return { points, contour, halo: [] }; }
        const cx = contour.reduce((sum, point) => sum + point.x, 0) / contour.length;
        const cy = contour.reduce((sum, point) => sum + point.y, 0) / contour.length;
        const spread = HALO * blurFor(total / contour.length);
        const halo = contour.map(point => {
            const dx = point.x - cx, dy = point.y - cy, length = Math.hypot(dx, dy) || 1;
            const x = point.x + dx / length * spread, y = point.y + dy / length * spread;
            return { x, y, z: surface ? heightAt(surface, x, y) : 0 };
        });
        return { points, contour, halo };
    }

    // True when some of the caster's shadow on `receiver` (null for the felt) is not hidden beneath `occluders`.
    // `exposed` optionally supplies the receiver's points already known to be uncovered by part of the occluders.
    function shadowVisible(caster, receiver, occluders, exposed = null) {
        const covered = point => coveredBy(occluders, point);
        if (!receiver) {
            // Most felt shadows show at their soft edge, so test the outline before the interior.
            const { contour, halo } = projectedSamples(caster, null, true);
            if (halo.some(point => !covered(point)) || contour.some(point => !covered(point))) { return true; }
            return projectedSamples(caster, null).points.some(point => !covered(point));
        }
        const bounds = shadowBounds(caster), f = footprint(receiver);
        if (f.maxX < bounds.minX || f.minX > bounds.maxX || f.maxY < bounds.minY || f.minY > bounds.maxY) { return false; }
        const open = exposed || exposedPoints(receiver, occluders);
        // A fully covered receiver can never show a shadow, whatever casts it.
        if (!open.length) { return false; }
        const spread = HALO * blurFor(Math.max(0, caster.z - receiver.z));
        for (const point of open) {
            if (shadowedBy(caster, point, spread) && !covered(point)) { return true; }
        }
        // Catch shadows smaller than the sample spacing by also testing the shadow's own outline and halo.
        const { contour, halo } = projectedSamples(caster, plane(receiver), true);
        for (const point of halo.concat(contour)) {
            if (contains(receiver, point.x, point.y) && !covered(point)) { return true; }
        }
        return false;
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

    // Slide length for a throw whose airborne part covers `distance`, before the per-card cap.
    function slideDistance(distance, power = .55, height = HEIGHT) {
        const ratio = UNIFORM_SLIDE * (.75 + .45 * clamp(power, 0, 1));
        return clamp(distance * ratio, 3, height * .45);
    }

    // Same as slideDistance, measured from the hand to the final resting point.
    function slideDistanceToRest(distance, power = .55, height = HEIGHT) {
        const ratio = UNIFORM_SLIDE * (.75 + .45 * clamp(power, 0, 1));
        return clamp(distance * ratio / (1 + ratio), 3, height * .45);
    }

    function position(start, impact, momentum, progress) {
        const t = clamp(progress, 0, 1);
        if (t < CONTACT) {
            // A quadratic arrival matching the slide's initial velocity keeps speed and deceleration continuous.
            const u = t / CONTACT, rate = 2 * CONTACT / SLIDE;
            const curve = (from, to, end) => {
                const outgoing = end * rate, incoming = 2 * (to - from) - outgoing;
                return from + incoming * u + (outgoing - incoming) * u * u / 2;
            };
            return { x: curve(start.x, impact.x, momentum.x), y: curve(start.y, impact.y, momentum.y),
                roll: curve(start.roll, impact.roll, momentum.spin) };
        }
        const slide = 1 - ((1 - t) / SLIDE) ** 2;
        return { x: impact.x + momentum.x * slide, y: impact.y + momentum.y * slide,
            roll: impact.roll + momentum.spin * slide };
    }

    // Unit mass, rectangular inertia, and a normal impulse at the actual outline contact.
    function wallImpulse(pose, velocity, normal, contact, restitution = .35) {
        const arm = { x: contact.x - pose.x, y: contact.y - pose.y };
        const lever = arm.x * normal.y - arm.y * normal.x;
        const inertia = ((pose.width || WIDTH) ** 2 + (pose.height || HEIGHT) ** 2) / 12;
        const angular = radians(velocity.spin);
        const approach = velocity.x * normal.x + velocity.y * normal.y + angular * lever;
        if (approach >= 0) { return { ...velocity }; }
        const impulse = -(1 + restitution) * approach / (1 + lever * lever / inertia);
        return { x: velocity.x + normal.x * impulse, y: velocity.y + normal.y * impulse,
            spin: degrees(angular + lever * impulse / inertia) };
    }

    // The player-facing edge admits a throw, then contains it after the whole card enters.
    function wallTrajectory(rest, bounds, throwMotion, offset = { x: 0, y: 0 }) {
        if (!throwMotion.launch && Math.abs(throwMotion.x) < 1 && throwMotion.y > -1) { return null; }
        const width = rest.width || WIDTH, height = rest.height || HEIGHT;
        const start = { ...rest, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height + height,
            z: 0, pitch: 0, yaw: 0, roll: rest.roll - throwMotion.spin };
        const launch = throwMotion.launch;
        if (launch) {
            start.x = bounds.left + (launch.x + 1) * bounds.width / 2 + offset.x;
            start.y = bounds.top + (launch.y + 1) * bounds.height / 2 + offset.y;
            start.roll = 0;
            const endX = start.x + launch.vx * bounds.width / 2;
            const endY = start.y + launch.vy * bounds.height / 2;
            const radius = Math.hypot(width, height) / 2;
            if (Math.min(start.x, endX) > bounds.left + radius &&
                Math.max(start.x, endX) < bounds.left + bounds.width - radius &&
                Math.min(start.y, endY) > bounds.top + radius &&
                Math.max(start.y, endY) < bounds.top + bounds.height - radius) { return null; }
        }
        const distance = Math.hypot(rest.x - start.x, rest.y - start.y);
        const overshoot = slideDistanceToRest(distance, throwMotion.power, height);
        const end = { x: throwMotion.x <= -1 ? bounds.left - overshoot :
            throwMotion.x >= 1 ? bounds.left + bounds.width + overshoot : rest.x,
            y: throwMotion.y <= -1 ? bounds.top - overshoot : rest.y };
        let velocity = { x: 2 * (end.x - start.x), y: 2 * (end.y - start.y), spin: 2 * throwMotion.spin };
        if (launch) {
            velocity.x = launch.vx * bounds.width;
            velocity.y = launch.vy * bounds.height;
        }
        const inertia = (width * width + height * height) / 12;
        const speed = v => Math.sqrt(v.x * v.x + v.y * v.y + inertia * radians(v.spin) ** 2);
        // Keep friction constant after an impact loses energy, so a rebound stops sooner rather than coasting.
        const durationScale = 1.6;
        const friction = speed(velocity) / durationScale;
        const pose = { ...start };
        const frames = [{ x: pose.x, y: pose.y, roll: pose.roll }], collisions = [];
        const walls = [
            { normal: { x: 1, y: 0 }, distance: point => point.x - bounds.left },
            { normal: { x: -1, y: 0 }, distance: point => bounds.left + bounds.width - point.x },
            { normal: { x: 0, y: 1 }, distance: point => point.y - bounds.top }
        ];
        const bottom = { normal: { x: 0, y: -1 },
            distance: point => bounds.top + bounds.height - point.y };
        let entered = silhouette(pose).every(point => bottom.distance(point) >= 0);
        let enteredStep = entered ? 0 : Infinity;
        const steps = 240;
        for (let step = 1; step <= steps; step++) {
            const incomingSpeed = speed(velocity);
            if (!incomingSpeed) {
                frames.push({ x: pose.x, y: pose.y, roll: pose.roll });
                continue;
            }
            const dt = durationScale / steps;
            const damping = Math.max(0, 1 - friction * dt / incomingSpeed);
            const travel = (1 + damping) * dt / 2;
            pose.x += velocity.x * travel;
            pose.y += velocity.y * travel;
            pose.roll += velocity.spin * travel;
            if (!entered && silhouette(pose).every(point => bottom.distance(point) >= 0)) {
                entered = true;
                enteredStep = step;
            }
            for (const wall of entered ? [...walls, bottom] : walls) {
                const points = silhouette(pose);
                const gap = Math.min(...points.map(wall.distance));
                if (gap >= 0) { continue; }
                const contacts = points.filter(point => wall.distance(point) <= gap + 1e-6);
                const contact = contacts.reduce((sum, point) =>
                    ({ x: sum.x + point.x / contacts.length, y: sum.y + point.y / contacts.length }), { x: 0, y: 0 });
                const next = wallImpulse(pose, velocity, wall.normal, contact, .2 + .2 * throwMotion.power);
                if (next.x !== velocity.x || next.y !== velocity.y || next.spin !== velocity.spin) {
                    collisions.push({ progress: step / steps, normal: wall.normal,
                        incoming: velocity, outgoing: next, contact, pose: { ...pose } });
                    velocity = next;
                }
                pose.x -= gap * wall.normal.x;
                pose.y -= gap * wall.normal.y;
            }
            const outgoingSpeed = speed(velocity);
            const drag = outgoingSpeed ? Math.max(0, 1 - friction * dt / outgoingSpeed) : 0;
            velocity = { x: velocity.x * drag, y: velocity.y * drag, spin: velocity.spin * drag };
            frames.push({ x: pose.x, y: pose.y, roll: pose.roll });
        }
        if (!collisions.length) { return null; }
        const distances = [0];
        for (let index = 1; index < frames.length; index++) {
            distances.push(distances[index - 1] + Math.hypot(frames[index].x - frames[index - 1].x,
                frames[index].y - frames[index - 1].y));
        }
        return {
            start, collisions, final: frames[steps], frameCount: frames.length, durationScale,
            distanceAtProgress(progress) {
                const index = clamp(progress, 0, 1) * steps;
                return distances[steps] ? mix(distances[Math.floor(index)],
                    distances[Math.min(steps, Math.floor(index) + 1)], index % 1) / distances[steps] : 0;
            },
            positionAtProgress(progress) {
                const index = clamp(progress, 0, 1) * steps;
                const a = frames[Math.floor(index)], b = frames[Math.min(steps, Math.floor(index) + 1)];
                const position = { x: mix(a.x, b.x, index % 1), y: mix(a.y, b.y, index % 1),
                    roll: mix(a.roll, b.roll, index % 1) };
                if (index % 1) {
                    // Interpolated rotation can put a corner slightly beyond two contained samples.
                    const points = silhouette({ ...start, ...position });
                    if (index >= 1) {
                        position.x += Math.max(0, bounds.left - Math.min(...points.map(point => point.x))) -
                            Math.max(0, Math.max(...points.map(point => point.x)) - bounds.left - bounds.width);
                        position.y += Math.max(0, bounds.top - Math.min(...points.map(point => point.y)));
                    }
                    if (index >= enteredStep) {
                        position.y -= Math.max(0, Math.max(...points.map(point => point.y)) - bounds.top - bounds.height);
                    }
                }
                return position;
            }
        };
    }

    function overlaps(a, b, margin = 0) {
        const polygons = [a, b].map(pose => silhouette({ z: 0, pitch: 0, yaw: 0, ...pose })
            .filter((_, index) => index % 17 == 0 || index % 17 == 8 || index % 17 == 16).map(screen));
        for (const polygon of polygons) {
            for (let index = 0; index < polygon.length; index++) {
                const p = polygon[index], q = polygon[(index + 1) % polygon.length];
                const length = Math.hypot(q.x - p.x, q.y - p.y);
                if (length < 1e-8) { continue; }
                const axis = { x: (q.y - p.y) / length, y: (p.x - q.x) / length };
                const ranges = polygons.map(points => {
                    const projections = points.map(point => point.x * axis.x + point.y * axis.y);
                    return { min: Math.min(...projections), max: Math.max(...projections) };
                });
                if (Math.min(ranges[0].max, ranges[1].max) - Math.max(ranges[0].min, ranges[1].min) <= margin) {
                    return false;
                }
            }
        }
        return true;
    }

    function overlapCoverage(a, b) {
        const polygon = pose => silhouette({ z: 0, pitch: 0, yaw: 0, ...pose }).map(screen);
        const area = points => Math.abs(points.reduce((sum, p, index) => {
            const q = points[(index + 1) % points.length];
            return sum + p.x * q.y - p.y * q.x;
        }, 0)) / 2;
        const clip = polygon(b);
        let intersection = polygon(a);
        for (let index = 0; index < clip.length && intersection.length; index++) {
            const p = clip[index], q = clip[(index + 1) % clip.length];
            const side = point => (q.x - p.x) * (point.y - p.y) - (q.y - p.y) * (point.x - p.x);
            const input = intersection;
            intersection = [];
            for (let i = 0; i < input.length; i++) {
                const start = input[i], end = input[(i + 1) % input.length];
                const from = side(start), to = side(end);
                if ((from >= 0) !== (to >= 0)) {
                    const t = from / (from - to);
                    intersection.push({ x: mix(start.x, end.x, t), y: mix(start.y, end.y, t) });
                }
                if (to >= 0) { intersection.push(end); }
            }
        }
        return area(intersection) / area(clip);
    }

    // Fit readable plays without changing their physical rotation.
    function arrangePlay(cards, previous, bounds, momentum = { x: 0, y: 0 }, preserveFan = false) {
        const first = cards[0], roll = first.roll;
        const width = Math.max(...cards.map(card => card.width || WIDTH));
        const height = Math.max(...cards.map(card => card.height || HEIGHT));
        const c = Math.abs(Math.cos(radians(roll))), s = Math.abs(Math.sin(radians(roll)));
        const extent = { x: c * width / 2 + s * height / 2, y: s * width / 2 + c * height / 2, c, s };
        const inset = Math.min(8, Math.max(0, bounds.width / 2 - extent.x),
            Math.max(0, bounds.height / 2 - extent.y));
        const availableWidth = bounds.width - inset * 2, availableHeight = bounds.height - inset * 2;
        let step = width * .36;
        if (cards.length > 1) {
            step = Math.min(step, extent.c > 1e-8 ? Math.max(0, (availableWidth - extent.x * 2) /
                ((cards.length - 1) * extent.c)) : Infinity,
            extent.s > 1e-8 ? Math.max(0, (availableHeight - extent.y * 2) /
                ((cards.length - 1) * extent.s)) : Infinity);
        }
        const desired = first;
        const candidates = [-1, 1].map(direction => {
            const dx = Math.cos(radians(roll)) * step * direction;
            const dy = Math.sin(radians(roll)) * step * direction;
            const spanX = dx * (cards.length - 1), spanY = dy * (cards.length - 1);
            const minX = bounds.left + inset + extent.x - Math.min(0, spanX);
            const maxX = bounds.left + bounds.width - inset - extent.x - Math.max(0, spanX);
            const minY = bounds.top + inset + extent.y - Math.min(0, spanY);
            const maxY = bounds.top + bounds.height - inset - extent.y - Math.max(0, spanY);
            const fit = point => ({ x: clamp(point.x, minX, maxX), y: clamp(point.y, minY, maxY) });
            let anchor = fit(desired);
            const top = point => ({ ...first, x: point.x + spanX, y: point.y + spanY, roll });
            // Leave room for the small support-aware tilt applied by the renderer.
            const covers = point => overlapCoverage(top(point), previous) >= .12;
            if (previous && !covers(anchor)) {
                const near = fit({ x: previous.x - spanX, y: previous.y - (previous.z || 0) * VIEW_SHEAR - spanY });
                if (!covers(near)) { return null; }
                let low = 0, high = 1;
                for (let iteration = 0; iteration < 16; iteration++) {
                    const t = (low + high) / 2;
                    const point = { x: mix(near.x, anchor.x, t), y: mix(near.y, anchor.y, t) };
                    if (covers(point)) { low = t; } else { high = t; }
                }
                anchor = { x: mix(near.x, anchor.x, low), y: mix(near.y, anchor.y, low) };
            }
            const poses = cards.map((card, index) => {
                const base = { ...card, x: anchor.x + dx * index, y: anchor.y + dy * index, roll };
                if (!index) { return base; }
                // Reuse the play's seeded layout jitter; never reroll cards during a refresh.
                const splay = { x: clamp((card.x - first.x - index * (cards[1].x - first.x)) * .15, -2, 2),
                    y: clamp((card.y - first.y) * .15, -3, 3),
                    roll: clamp((card.roll - first.roll) * .2, -2, 2) };
                for (let amount = 1; amount >= 1 / 256; amount /= 2) {
                    const pose = { ...base, x: base.x + splay.x * amount, y: base.y + splay.y * amount,
                        roll: base.roll + splay.roll * amount };
                    const inside = silhouette({ ...pose, z: 0, pitch: 0, yaw: 0 }).every(point =>
                        point.x >= bounds.left && point.x <= bounds.left + bounds.width &&
                        point.y >= bounds.top && point.y <= bounds.top + bounds.height);
                    if (inside && (!previous || index < cards.length - 1 || overlapCoverage(pose, previous) >= .12)) {
                        return pose;
                    }
                }
                return base;
            });
            const againstMomentum = dx * momentum.x + dy * momentum.y < -1e-6;
            return { poses, cost: Math.hypot(anchor.x - desired.x, anchor.y - desired.y) +
                ((preserveFan ? direction < 0 : againstMomentum) ? Math.hypot(bounds.width, bounds.height) : 0) };
        }).filter(Boolean);
        if (!candidates.length) { throw new Error("The table cannot fit an overlapping card fan."); }
        return candidates.sort((a, b) => a.cost - b.cost)[0].poses;
    }

    function settlePosition(position, final, target, progress, bounds, fanStart = CONTACT) {
        const t = progress >= 1 ? 1 : clamp((progress - fanStart) / (1 - fanStart), 0, 1);
        // A wall impulse starts the upper cards' extra slide immediately, then friction slows it.
        const blend = fanStart < CONTACT ? 1 - (1 - t) ** 2 : t * t * (3 - 2 * t);
        const pose = { ...target, x: position.x + (target.x - final.x) * blend,
            y: position.y + (target.y - final.y) * blend,
            roll: position.roll,
            z: (target.z || 0) * blend, pitch: (target.pitch || 0) * blend, yaw: (target.yaw || 0) * blend };
        if (bounds) {
            const points = silhouette(pose).map(screen);
            const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
            const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
            pose.x += Math.max(0, bounds.left - minX) - Math.max(0, maxX - bounds.left - bounds.width);
            pose.y += Math.max(0, bounds.top - minY);
            const entered = silhouette({ ...pose, ...position, z: 0, pitch: 0, yaw: 0 })
                .every(point => point.y <= bounds.top + bounds.height);
            if (entered) {
                pose.y -= Math.max(0, maxY - bounds.top - bounds.height);
            }
        }
        return { x: pose.x, y: pose.y, roll: pose.roll };
    }

    function motion(cards, start, impact, momentum, progress, contact = null, trajectory = null) {
        const t = clamp(progress, 0, 1);
        const contactTime = CONTACT;
        const dimensions = Object.fromEntries(["width", "height", "radius"]
            .filter(key => start[key] !== undefined).map(key => [key, start[key]]));
        const target = contact || landing(cards, impact.x, impact.y, impact.roll, dimensions);
        const planar = trajectory ? trajectory(t) : position(start, impact, momentum, t);
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

    const api = { WIDTH, HEIGHT, EDGE, VIEW_SHEAR, LIGHT, CONTACT, slideDistance, slideDistanceToRest, rotate, world, screen, plane, heightAt,
        signedDistance, silhouette, contains, screenContains, screenCovers, samples, supportHeight, landing, minimumHeight, shadow,
        shadowedBy, shadowVisible, exposedPoints, flight, position, wallImpulse, wallTrajectory,
        overlaps, overlapCoverage, arrangePlay, settlePosition, motion };
    if (typeof module !== "undefined" && module.exports) { module.exports = api; }
    else { root.LandingGeometry = api; }
})(globalThis);
