"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SenderKeyState = void 0;
const sender_chain_key_1 = require("./sender-chain-key");
const sender_message_key_1 = require("./sender-message-key");
class SenderKeyState {
    constructor(id, iteration, chainKey, signatureKeyPair, signatureKeyPublic, signatureKeyPrivate, senderKeyStateStructure) {
        this.MAX_MESSAGE_KEYS = 2000;
        if (senderKeyStateStructure) {
            this.senderKeyStateStructure = {
                ...senderKeyStateStructure,
                senderMessageKeys: Array.isArray(senderKeyStateStructure.senderMessageKeys)
                    ? senderKeyStateStructure.senderMessageKeys
                    : []
            };
        }
        else {
            if (signatureKeyPair) {
                signatureKeyPublic = signatureKeyPair.public;
                signatureKeyPrivate = signatureKeyPair.private;
            }
            this.senderKeyStateStructure = {
                senderKeyId: id || 0,
                senderChainKey: {
                    iteration: iteration || 0,
                    seed: Buffer.from(chainKey || [])
                },
                senderSigningKey: {
                    public: Buffer.from(signatureKeyPublic || []),
                    private: Buffer.from(signatureKeyPrivate || [])
                },
                senderMessageKeys: []
            };
        }
    }
    getKeyId() {
        return this.senderKeyStateStructure.senderKeyId;
    }
    getSenderChainKey() {
        return new sender_chain_key_1.SenderChainKey(this.senderKeyStateStructure.senderChainKey.iteration, this.senderKeyStateStructure.senderChainKey.seed);
    }
    setSenderChainKey(chainKey) {
        this.senderKeyStateStructure.senderChainKey = {
            iteration: chainKey.getIteration(),
            seed: chainKey.getSeed()
        };
    }
    getSigningKeyPublic() {
        const publicKey = Buffer.from(this.senderKeyStateStructure.senderSigningKey.public);
        if (publicKey.length === 32) {
            const fixed = Buffer.alloc(33);
            fixed[0] = 0x05;
            publicKey.copy(fixed, 1);
            return fixed;
        }
        return publicKey;
    }
    getSigningKeyPrivate() {
        const privateKey = this.senderKeyStateStructure.senderSigningKey.private;
        return Buffer.from(privateKey || []);
    }
    hasSenderMessageKey(iteration) {
        return this.senderKeyStateStructure.senderMessageKeys.some(key => key.iteration === iteration);
    }
    addSenderMessageKey(senderMessageKey) {
        this.senderKeyStateStructure.senderMessageKeys.push({
            iteration: senderMessageKey.getIteration(),
            seed: senderMessageKey.getSeed()
        });
        if (this.senderKeyStateStructure.senderMessageKeys.length > this.MAX_MESSAGE_KEYS) {
            this.senderKeyStateStructure.senderMessageKeys.shift();
        }
    }
    removeSenderMessageKey(iteration) {
        const index = this.senderKeyStateStructure.senderMessageKeys.findIndex(key => key.iteration === iteration);
        if (index !== -1) {
            const messageKey = this.senderKeyStateStructure.senderMessageKeys[index];
            this.senderKeyStateStructure.senderMessageKeys.splice(index, 1);
            return new sender_message_key_1.SenderMessageKey(messageKey.iteration, messageKey.seed);
        }
        return null;
    }
    getStructure() {
        return this.senderKeyStateStructure;
    }
}
exports.SenderKeyState = SenderKeyState;
