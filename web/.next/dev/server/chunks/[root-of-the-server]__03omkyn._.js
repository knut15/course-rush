module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:child_process [external] (node:child_process, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:child_process", () => require("node:child_process"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[project]/web/src/app/api/load/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "maxDuration",
    ()=>maxDuration
]);
// 부하 생성기를 **별도 프로세스**로 띄운다(GOAL.md §6).
//
// Next 안에서 직접 요청을 쏘지 않는 이유는 CLI 와 같은 코드를 같은 방식으로 돌려야
// 두 경로의 수치가 일치하기 때문이다. 화면에서 본 값과 터미널에서 본 값이 다르면
// 어느 쪽을 믿어야 할지 알 수 없게 된다.
//
// 한 요청에 한 방식만 돌린다. 여러 방식을 한 요청에 몰면 M3 처럼 오래 걸리는 것 때문에
// 응답이 수십 초씩 늘어지고, 화면은 그동안 아무것도 보여주지 못한다.
// 순차 호출은 프론트가 한다.
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$child_process__$5b$external$5d$__$28$node$3a$child_process$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:child_process [external] (node:child_process, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
;
;
// Next 는 web/ 에서 돈다. 레포 루트는 그 위다.
const ROOT = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(process.cwd(), "..");
const LOADGEN = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(ROOT, "loadgen");
const TSX = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(LOADGEN, "node_modules/.bin/tsx");
const maxDuration = 300;
function run(args) {
    return new Promise((resolve)=>{
        const proc = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$child_process__$5b$external$5d$__$28$node$3a$child_process$2c$__cjs$29$__["spawn"])(TSX, [
            "src/run.ts",
            ...args
        ], {
            cwd: LOADGEN
        });
        let out = "";
        let err = "";
        proc.stdout.on("data", (c)=>out += c.toString());
        proc.stderr.on("data", (c)=>err += c.toString());
        proc.on("error", (e)=>resolve({
                ok: false,
                error: e.message
            }));
        proc.on("close", (code)=>{
            if (code !== 0) {
                resolve({
                    ok: false,
                    error: err.trim() || `부하 생성기가 코드 ${code} 로 끝났습니다.`
                });
                return;
            }
            try {
                resolve({
                    ok: true,
                    data: JSON.parse(out)
                });
            } catch  {
                // --json=true 를 줬는데 JSON 이 아니면 생성기 쪽 출력이 오염된 것이다.
                resolve({
                    ok: false,
                    error: `결과를 읽지 못했습니다: ${out.slice(0, 200)}`
                });
            }
        });
    });
}
async function POST(request) {
    const body = await request.json();
    const mode = body.mode ?? "M1";
    if (!/^M[1-5]$/.test(mode)) {
        return Response.json({
            error: `모르는 방식입니다: ${mode}`
        }, {
            status: 400
        });
    }
    const args = [
        `--mode=${mode}`,
        `--total=${Number(body.total ?? 10000)}`,
        `--concurrency=${Number(body.concurrency ?? 1000)}`,
        `--students=${Number(body.students ?? 10000)}`,
        `--repeat=${Number(body.repeat ?? 1)}`,
        "--json=true",
        "--save=false"
    ];
    if (body.capacity) args.push(`--capacity=${Number(body.capacity)}`);
    if (body.pool) args.push(`--pool=${Number(body.pool)}`);
    const result = await run(args);
    if (!result.ok) return Response.json({
        error: result.error
    }, {
        status: 500
    });
    return Response.json(result.data);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__03omkyn._.js.map