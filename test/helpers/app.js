"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const server_1 = require("../../src/presentation/server");
const routes_1 = require("../../src/presentation/routes");
const server = new server_1.Server({
    port: 3001,
    routes: routes_1.AppRoutes.routes,
});
// Setup middleware and routes (but chai-http will handle the port)
server.start();
exports.app = server.app;
