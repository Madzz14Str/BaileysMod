"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SenderKeyDistributionMessage = void 0;
const index_js_1 = require("../../../WAProto/index.js");
const proto_utils_1 = require("../../Utils/proto-utils");
const ciphertext_message_1 = require("./ciphertext-message");
class SenderKeyDistributionMessage extends ciphertext_message_1.CiphertextMessage {
    constructor(id, iteration, chainKey, signatureKey, serialized) {
        super();
        if (serialized) {
            try {
                const message = serialized.slice(1);
                const distributionMessage = (0, proto_utils_1.decodeAndHydrate)(index_js_1.proto.SenderKeyDistributionMessage, message);
                this.serialized = serialized;
                this.id = distributionMessage.id;
                this.iteration = distributionMessage.iteration;
                this.chainKey = distributionMessage.chainKey;
                this.signatureKey = distributionMessage.signingKey;
            }
            catch (e) {
                throw new Error(String(e));
            }
        }
        else {
            const version = this.intsToByteHighAndLow(this.CURRENT_VERSION, this.CURRENT_VERSION);
            this.id = id;
            this.iteration = iteration;
            this.chainKey = chainKey;
            this.signatureKey = signatureKey;
            const message = index_js_1.proto.SenderKeyDistributionMessage.encode(index_js_1.proto.SenderKeyDistributionMessage.create({
                id,
                iteration,
                chainKey,
                signingKey: this.signatureKey
            })).finish();
            this.serialized = Buffer.concat([Buffer.from([version]), message]);
        }
    }
    intsToByteHighAndLow(highValue, lowValue) {
        return (((highValue << 4) | lowValue) & 0xff) % 256;
    }
    serialize() {
        return this.serialized;
    }
    getType() {
        return this.SENDERKEY_DISTRIBUTION_TYPE;
    }
    getIteration() {
        return this.iteration;
    }
    getChainKey() {
        return this.chainKey;
    }
    getSignatureKey() {
        return this.signatureKey;
    }
    getId() {
        return this.id;
    }
}
exports.SenderKeyDistributionMessage = SenderKeyDistributionMessage;
