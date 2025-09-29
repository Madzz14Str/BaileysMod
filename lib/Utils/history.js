"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistoryMsg = exports.downloadAndProcessHistorySyncNotification = exports.processHistoryMessage = exports.downloadHistory = void 0;
const util_1 = require("util");
const zlib_1 = require("zlib");
const index_js_1 = require("../../WAProto/index.js");
const Types_1 = require("../Types");
const generics_1 = require("./generics");
const messages_1 = require("./messages");
const messages_media_1 = require("./messages-media");
const proto_utils_1 = require("./proto-utils");
const inflatePromise = (0, util_1.promisify)(zlib_1.inflate);
const downloadHistory = async (msg, options) => {
    const stream = await (0, messages_media_1.downloadContentFromMessage)(msg, 'md-msg-hist', { options });
    const bufferArray = [];
    for await (const chunk of stream) {
        bufferArray.push(chunk);
    }
    let buffer = Buffer.concat(bufferArray);
    // decompress buffer
    buffer = await inflatePromise(buffer);
    const syncData = (0, proto_utils_1.decodeAndHydrate)(index_js_1.proto.HistorySync, buffer);
    return syncData;
};
exports.downloadHistory = downloadHistory;
const processHistoryMessage = (item) => {
    const messages = [];
    const contacts = [];
    const chats = [];
    switch (item.syncType) {
        case index_js_1.proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP:
        case index_js_1.proto.HistorySync.HistorySyncType.RECENT:
        case index_js_1.proto.HistorySync.HistorySyncType.FULL:
        case index_js_1.proto.HistorySync.HistorySyncType.ON_DEMAND:
            for (const chat of item.conversations) {
                contacts.push({
                    id: chat.id,
                    name: chat.name || undefined,
                    lid: chat.lidJid || undefined,
                    phoneNumber: chat.pnJid || undefined
                });
                const msgs = chat.messages || [];
                delete chat.messages;
                for (const item of msgs) {
                    const message = item.message;
                    messages.push(message);
                    if (!chat.messages?.length) {
                        // keep only the most recent message in the chat array
                        chat.messages = [{ message }];
                    }
                    if (!message.key.fromMe && !chat.lastMessageRecvTimestamp) {
                        chat.lastMessageRecvTimestamp = (0, generics_1.toNumber)(message.messageTimestamp);
                    }
                    if ((message.messageStubType === Types_1.WAMessageStubType.BIZ_PRIVACY_MODE_TO_BSP ||
                        message.messageStubType === Types_1.WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB) &&
                        message.messageStubParameters?.[0]) {
                        contacts.push({
                            id: message.key.participant || message.key.remoteJid,
                            verifiedName: message.messageStubParameters?.[0]
                        });
                    }
                }
                chats.push({ ...chat });
            }
            break;
        case index_js_1.proto.HistorySync.HistorySyncType.PUSH_NAME:
            for (const c of item.pushnames) {
                contacts.push({ id: c.id, notify: c.pushname });
            }
            break;
    }
    return {
        chats,
        contacts,
        messages,
        syncType: item.syncType,
        progress: item.progress
    };
};
exports.processHistoryMessage = processHistoryMessage;
const downloadAndProcessHistorySyncNotification = async (msg, options) => {
    const historyMsg = await (0, exports.downloadHistory)(msg, options);
    return (0, exports.processHistoryMessage)(historyMsg);
};
exports.downloadAndProcessHistorySyncNotification = downloadAndProcessHistorySyncNotification;
const getHistoryMsg = (message) => {
    const normalizedContent = !!message ? (0, messages_1.normalizeMessageContent)(message) : undefined;
    const anyHistoryMsg = normalizedContent?.protocolMessage?.historySyncNotification;
    return anyHistoryMsg;
};
exports.getHistoryMsg = getHistoryMsg;
