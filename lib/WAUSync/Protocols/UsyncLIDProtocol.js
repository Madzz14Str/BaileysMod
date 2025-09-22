"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncLIDProtocol = void 0;
class USyncLIDProtocol {
    constructor() {
        this.name = 'lid';
    }
    getQueryElement() {
        return {
            tag: 'lid',
            attrs: {}
        };
    }
    getUserElement(user) {
        if (user.lid) {
            return {
                tag: 'lid',
                attrs: { jid: user.lid }
            };
        }
        else {
            return null;
        }
    }
    parser(node) {
        if (node.tag === 'lid') {
            return node.attrs.val;
        }
        return null;
    }
}
exports.USyncLIDProtocol = USyncLIDProtocol;
