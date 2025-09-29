"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__esModule = exports.makeWASocket = void 0;
const index_1 = __importDefault(require("./Socket/index"));
exports.makeWASocket = index_1.default;
__exportStar(require("../WAProto/index.js"), exports);
__exportStar(require("./Utils/index"), exports);
__exportStar(require("./Types/index"), exports);
__exportStar(require("./Defaults/index"), exports);
__exportStar(require("./WABinary/index"), exports);
__exportStar(require("./WAM/index"), exports);
__exportStar(require("./WAUSync/index"), exports);
exports.default = index_1.default;
// ESM flag
exports.__esModule = true;
