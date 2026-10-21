"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const sinon_1 = __importDefault(require("sinon"));
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../helpers/app");
const health_service_1 = require("../../src/services/health.service");
suite('Health API', () => {
    teardown(() => sinon_1.default.restore());
    suite('GET /api/health', () => {
        test('deberia retornar 200 con status ok', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockData = { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' };
            sinon_1.default.stub(health_service_1.HealthService.prototype, 'getStatus').returns(mockData);
            const res = yield (0, supertest_1.default)(app_1.app).get('/api/health');
            chai_1.assert.equal(res.status, 200, 'deberia ser 200');
            chai_1.assert.isTrue(res.body.success, 'success deberia ser true');
            chai_1.assert.equal(res.body.data.status, 'ok');
        }));
    });
    suite('POST /api/health/echo', () => {
        test('deberia retornar 200 con el mensaje de echo', () => __awaiter(void 0, void 0, void 0, function* () {
            sinon_1.default.stub(health_service_1.HealthService.prototype, 'echo').returns({ echo: 'hola' });
            const res = yield (0, supertest_1.default)(app_1.app)
                .post('/api/health/echo')
                .send({ message: 'hola' });
            chai_1.assert.equal(res.status, 200, 'deberia ser 200');
            chai_1.assert.isTrue(res.body.success);
            chai_1.assert.equal(res.body.data.echo, 'hola');
        }));
        test('deberia retornar 400 si message esta vacio', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.app)
                .post('/api/health/echo')
                .send({ message: '' });
            chai_1.assert.equal(res.status, 400, 'deberia ser 400');
            chai_1.assert.isFalse(res.body.success);
        }));
        test('deberia retornar 400 si no se envia body', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.app).post('/api/health/echo').send({});
            chai_1.assert.equal(res.status, 400, 'deberia ser 400');
            chai_1.assert.isFalse(res.body.success);
        }));
    });
});
