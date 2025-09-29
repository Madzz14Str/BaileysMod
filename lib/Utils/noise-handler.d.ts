import { proto } from '../../WAProto/index.js';
import type { KeyPair } from '../Types';
import type { BinaryNode } from '../WABinary';
import type { ILogger } from './logger';
export declare const makeNoiseHandler: ({ keyPair: { private: privateKey, public: publicKey }, NOISE_HEADER, logger, routingInfo }: {
    keyPair: KeyPair;
    NOISE_HEADER: Uint8Array;
    logger: ILogger;
    routingInfo?: Buffer | undefined;
}) => {
    encrypt: (plaintext: Uint8Array) => any;
    decrypt: (ciphertext: Uint8Array) => any;
    authenticate: (data: Uint8Array) => void;
    mixIntoKey: (data: Uint8Array) => Promise<void>;
    finishInit: () => Promise<void>;
    processHandshake: ({ serverHello }: proto.HandshakeMessage, noiseKey: KeyPair) => Promise<any>;
    encodeFrame: (data: Buffer | Uint8Array) => any;
    decodeFrame: (newData: Buffer | Uint8Array, onFrame: (buff: Uint8Array | BinaryNode) => void) => Promise<void>;
};
