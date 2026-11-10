/* ========================================
   STRANGE FRONTIERS CARD EDGES
   ========================================
   The hand-drawn wobble on Ability cards' edges, drawn as a vector path so
   it stays smooth at any size: a pixel filter would stair-step it.

     strange-frontiers-character-creator  src/app/card-edges.js (this file)
     portfolio_site                       js/sf-card-edges.js (a copy)

   Both copies must stay identical, like cards.css. Plain JavaScript with no
   imports, so the same file runs in the creator and Player Tools (imported
   by their main.tsx) and on the site (a <script> in javascript-loads.php).

   Each Ability card (.sf-trait-card--ability) gets an <svg class=
   "sf-card-edge"> behind its content: a rounded rectangle the card's size,
   its outline nudged in and out by a slow, smooth wave. The card's name
   seeds the wave, so a card keeps its own wobble every time it's drawn.
   cards.css fills it with the card's background and strokes it with
   --sf-edge, so hover and picked states still color it. It redraws when a
   card changes size (opening, closing, a new width) and finds cards added
   later (React renders, popups). */
(function () {
    if (typeof window === "undefined" || window.sfCardEdges) {
        return;
    }
    window.sfCardEdges = true;

    var SVG_NS = "http://www.w3.org/2000/svg";
    var CARDS = ".sf-trait-card--ability";
    var RADIUS = 12; // the card's corner radius
    var STROKE = 2; // the edge's width, centered on the outline
    var AMPLITUDE = 1.2; // how far the outline wanders, in px
    var WAVE = 160; // about how long one wave is, in px
    var STEP = 3; // px between the outline's points

    // A small seeded random number generator (mulberry32), seeded by a
    // string's FNV-1a hash
    function random(text) {
        var seed = 2166136261;
        for (var i = 0; i < text.length; i++) {
            seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
        }
        return function () {
            seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // The point at distance s along a rounded rectangle's outline, with the
    // outward normal there. The outline starts at the top edge's left end
    // and runs clockwise.
    function outline(x, y, w, h, r) {
        var straightW = Math.max(w - 2 * r, 0);
        var straightH = Math.max(h - 2 * r, 0);
        var arc = (Math.PI * r) / 2;
        var parts = [
            { len: straightW, at: function (t) { return [x + r + t, y, 0, -1]; } },
            { len: arc, at: corner(x + w - r, y + r, -Math.PI / 2) },
            { len: straightH, at: function (t) { return [x + w, y + r + t, 1, 0]; } },
            { len: arc, at: corner(x + w - r, y + h - r, 0) },
            { len: straightW, at: function (t) { return [x + w - r - t, y + h, 0, 1]; } },
            { len: arc, at: corner(x + r, y + h - r, Math.PI / 2) },
            { len: straightH, at: function (t) { return [x, y + h - r - t, -1, 0]; } },
            { len: arc, at: corner(x + r, y + r, Math.PI) },
        ];
        function corner(cx, cy, start) {
            return function (t) {
                var a = start + t / r;
                return [cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)];
            };
        }
        var total = parts.reduce(function (sum, p) { return sum + p.len; }, 0);
        return {
            total: total,
            at: function (s) {
                for (var i = 0; i < parts.length; i++) {
                    if (s <= parts[i].len || i === parts.length - 1) {
                        return parts[i].at(Math.min(s, parts[i].len));
                    }
                    s -= parts[i].len;
                }
            },
        };
    }

    // The wobbling outline as an SVG path, for a card w by h px
    function path(w, h, seed) {
        var inset = STROKE / 2;
        var shape = outline(inset, inset, w - STROKE, h - STROKE, RADIUS - inset);
        var rand = random(seed);
        // Two waves that fit the outline a whole number of times, so the
        // path closes without a seam
        var waves = [
            { k: Math.max(1, Math.round(shape.total / WAVE)), weight: 0.65 },
            { k: Math.max(2, Math.round(shape.total / (WAVE * 0.45))), weight: 0.35 },
        ].map(function (wave) {
            wave.phase = rand() * Math.PI * 2;
            return wave;
        });
        var count = Math.max(24, Math.round(shape.total / STEP));
        var d = "";
        for (var i = 0; i < count; i++) {
            var s = (shape.total * i) / count;
            var p = shape.at(s);
            var offset = 0;
            for (var j = 0; j < waves.length; j++) {
                offset += waves[j].weight * Math.sin((Math.PI * 2 * waves[j].k * s) / shape.total + waves[j].phase);
            }
            offset *= AMPLITUDE;
            d += (i ? "L" : "M") + (p[0] + p[2] * offset).toFixed(2) + " " + (p[1] + p[3] * offset).toFixed(2);
        }
        return d + "Z";
    }

    function draw(card) {
        var w = card.offsetWidth;
        var h = card.offsetHeight;
        if (!w || !h) {
            return;
        }
        var svg = card.querySelector(":scope > .sf-card-edge");
        if (!svg) {
            svg = document.createElementNS(SVG_NS, "svg");
            svg.setAttribute("class", "sf-card-edge");
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("focusable", "false");
            svg.appendChild(document.createElementNS(SVG_NS, "path"));
            card.appendChild(svg);
        }
        if (svg.dataset.size === w + "x" + h) {
            return;
        }
        svg.dataset.size = w + "x" + h;
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", "0 0 " + w + " " + h);
        var name = card.querySelector(".sf-card-name");
        svg.firstChild.setAttribute("d", path(w, h, (name && name.textContent) || "card"));
    }

    var resizes = typeof ResizeObserver === "function"
        ? new ResizeObserver(function (entries) {
            entries.forEach(function (entry) { draw(entry.target); });
        })
        : null;
    var watched = typeof WeakSet === "function" ? new WeakSet() : null;

    function watch(card) {
        if (watched && watched.has(card)) {
            draw(card);
            return;
        }
        if (watched) {
            watched.add(card);
        }
        draw(card);
        if (resizes) {
            resizes.observe(card);
        }
    }

    function scan(root) {
        if (root.matches && root.matches(CARDS)) {
            watch(root);
        }
        if (root.querySelectorAll) {
            root.querySelectorAll(CARDS).forEach(watch);
        }
    }

    function start() {
        scan(document);
        new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1 && !(node.classList && node.classList.contains("sf-card-edge"))) {
                        scan(node);
                    }
                });
                // A card that becomes an Ability card, or one whose edge a
                // render removed
                if (m.type === "attributes" || m.removedNodes.length) {
                    var card = m.target.closest && m.target.closest(CARDS);
                    if (card) {
                        watch(card);
                    }
                }
            });
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
