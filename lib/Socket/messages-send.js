"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessagesSocket = void 0;
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const boom_1 = require("@hapi/boom");
const index_js_1 = require("../../WAProto/index.js");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const link_preview_1 = require("../Utils/link-preview");
const make_mutex_1 = require("../Utils/make-mutex");
const WABinary_1 = require("../WABinary");
const WAUSync_1 = require("../WAUSync");
const newsletter_1 = require("./newsletter");
const makeMessagesSocket = (config) => {
    const { logger, linkPreviewImageThumbnailWidth, generateHighQualityLinkPreview, options: httpRequestOptions, patchMessageBeforeSending, cachedGroupMetadata, enableRecentMessageCache, maxMsgRetryCount } = config;
    const sock = (0, newsletter_1.makeNewsletterSocket)(config);
    const { ev, authState, processingMutex, signalRepository, upsertMessage, query, fetchPrivacySettings, sendNode, groupMetadata, groupToggleEphemeral } = sock;
    const userDevicesCache = config.userDevicesCache ||
        new node_cache_1.default({
            stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.USER_DEVICES, // 5 minutes
            useClones: false
        });
    const peerSessionsCache = new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.USER_DEVICES,
        useClones: false
    });
    // Initialize message retry manager if enabled
    const messageRetryManager = enableRecentMessageCache ? new Utils_1.MessageRetryManager(logger, maxMsgRetryCount) : null;
    // Prevent race conditions in Signal session encryption by user
    const encryptionMutex = (0, make_mutex_1.makeKeyedMutex)();
    let mediaConn;
    const refreshMediaConn = async (forceGet = false) => {
        const media = await mediaConn;
        if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
            mediaConn = (async () => {
                const result = await query({
                    tag: 'iq',
                    attrs: {
                        type: 'set',
                        xmlns: 'w:m',
                        to: WABinary_1.S_WHATSAPP_NET
                    },
                    content: [{ tag: 'media_conn', attrs: {} }]
                });
                const mediaConnNode = (0, WABinary_1.getBinaryNodeChild)(result, 'media_conn');
                const node = {
                    hosts: (0, WABinary_1.getBinaryNodeChildren)(mediaConnNode, 'host').map(({ attrs }) => ({
                        hostname: attrs.hostname,
                        maxContentLengthBytes: +attrs.maxContentLengthBytes
                    })),
                    auth: mediaConnNode.attrs.auth,
                    ttl: +mediaConnNode.attrs.ttl,
                    fetchDate: new Date()
                };
                logger.debug('fetched media conn');
                return node;
            })();
        }
        return mediaConn;
    };
    /**
     * generic send receipt function
     * used for receipts of phone call, read, delivery etc.
     * */
    const sendReceipt = async (jid, participant, messageIds, type) => {
        if (!messageIds || messageIds.length === 0) {
            throw new boom_1.Boom('missing ids in receipt');
        }
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0]
            }
        };
        const isReadReceipt = type === 'read' || type === 'read-self';
        if (isReadReceipt) {
            node.attrs.t = (0, Utils_1.unixTimestampSeconds)().toString();
        }
        if (type === 'sender' && (0, WABinary_1.isPnUser)(jid)) {
            node.attrs.recipient = jid;
            node.attrs.to = participant;
        }
        else {
            node.attrs.to = jid;
            if (participant) {
                node.attrs.participant = participant;
            }
        }
        if (type) {
            node.attrs.type = type;
        }
        const remainingMessageIds = messageIds.slice(1);
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ];
        }
        logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages');
        await sendNode(node);
    };
    /** Correctly bulk send receipts to multiple chats, participants */
    const sendReceipts = async (keys, type) => {
        const recps = (0, Utils_1.aggregateMessageKeysNotFromMe)(keys);
        for (const { jid, participant, messageIds } of recps) {
            await sendReceipt(jid, participant, messageIds, type);
        }
    };
    /** Bulk read messages. Keys can be from different chats & participants */
    const readMessages = async (keys) => {
        const privacySettings = await fetchPrivacySettings();
        // based on privacy settings, we have to change the read type
        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
        await sendReceipts(keys, readType);
    };
    /** Fetch all the devices we've to send a message to */
    const getUSyncDevices = async (jids, useCache, ignoreZeroDevices) => {
        const deviceResults = [];
        if (!useCache) {
            logger.debug('not using cache for devices');
        }
        const toFetch = [];
        const jidsWithUser = jids
            .map(jid => {
            const decoded = (0, WABinary_1.jidDecode)(jid);
            const user = decoded?.user;
            const device = decoded?.device;
            const isExplicitDevice = typeof device === 'number' && device >= 0;
            if (isExplicitDevice && user) {
                deviceResults.push({
                    user,
                    device,
                    jid
                });
                return null;
            }
            jid = (0, WABinary_1.jidNormalizedUser)(jid);
            return { jid, user };
        })
            .filter(jid => jid !== null);
        let mgetDevices;
        if (useCache && userDevicesCache.mget) {
            const usersToFetch = jidsWithUser.map(j => j?.user).filter(Boolean);
            mgetDevices = await userDevicesCache.mget(usersToFetch);
        }
        for (const { jid, user } of jidsWithUser) {
            if (useCache) {
                const devices = mgetDevices?.[user] ||
                    (userDevicesCache.mget ? undefined : (await userDevicesCache.get(user)));
                if (devices) {
                    const isLidJid = jid.includes('@lid');
                    const devicesWithJid = devices.map(d => ({
                        ...d,
                        jid: isLidJid ? (0, WABinary_1.jidEncode)(d.user, 'lid', d.device) : (0, WABinary_1.jidEncode)(d.user, 's.whatsapp.net', d.device)
                    }));
                    deviceResults.push(...devicesWithJid);
                    logger.trace({ user }, 'using cache for devices');
                }
                else {
                    toFetch.push(jid);
                }
            }
            else {
                toFetch.push(jid);
            }
        }
        if (!toFetch.length) {
            return deviceResults;
        }
        const requestedLidUsers = new Set();
        for (const jid of toFetch) {
            if (jid.includes('@lid')) {
                const user = (0, WABinary_1.jidDecode)(jid)?.user;
                if (user)
                    requestedLidUsers.add(user);
            }
        }
        const query = new WAUSync_1.USyncQuery().withContext('message').withDeviceProtocol();
        for (const jid of toFetch) {
            query.withUser(new WAUSync_1.USyncUser().withId(jid)); // todo: investigate - the idea here is that <user> should have an inline lid field with the lid being the pn equivalent
        }
        const result = await sock.executeUSyncQuery(query);
        if (result) {
            const extracted = (0, Utils_1.extractDeviceJids)(result?.list, authState.creds.me.id, ignoreZeroDevices);
            const deviceMap = {};
            for (const item of extracted) {
                deviceMap[item.user] = deviceMap[item.user] || [];
                deviceMap[item.user]?.push(item);
            }
            // Process each user's devices as a group for bulk LID migration
            for (const [user, userDevices] of Object.entries(deviceMap)) {
                const isLidUser = requestedLidUsers.has(user);
                // Process all devices for this user
                for (const item of userDevices) {
                    const finalJid = isLidUser
                        ? (0, WABinary_1.jidEncode)(user, 'lid', item.device)
                        : (0, WABinary_1.jidEncode)(item.user, 's.whatsapp.net', item.device);
                    deviceResults.push({
                        ...item,
                        jid: finalJid
                    });
                    logger.debug({
                        user: item.user,
                        device: item.device,
                        finalJid,
                        usedLid: isLidUser
                    }, 'Processed device with LID priority');
                }
            }
            if (userDevicesCache.mset) {
                // if the cache supports mset, we can set all devices in one go
                await userDevicesCache.mset(Object.entries(deviceMap).map(([key, value]) => ({ key, value })));
            }
            else {
                for (const key in deviceMap) {
                    if (deviceMap[key])
                        await userDevicesCache.set(key, deviceMap[key]);
                }
            }
            const userDeviceUpdates = {};
            for (const [userId, devices] of Object.entries(deviceMap)) {
                if (devices && devices.length > 0) {
                    userDeviceUpdates[userId] = devices.map(d => d.device?.toString() || '0');
                }
            }
            if (Object.keys(userDeviceUpdates).length > 0) {
                try {
                    await authState.keys.set({ 'device-list': userDeviceUpdates });
                    logger.debug({ userCount: Object.keys(userDeviceUpdates).length }, 'stored user device lists for bulk migration');
                }
                catch (error) {
                    logger.warn({ error }, 'failed to store user device lists');
                }
            }
        }
        return deviceResults;
    };
    const assertSessions = async (jids) => {
        let didFetchNewSession = false;
        const uniqueJids = [...new Set(jids)]; // Deduplicate JIDs
        const jidsRequiringFetch = [];
        // Check peerSessionsCache and validate sessions using libsignal loadSession
        for (const jid of uniqueJids) {
            const signalId = signalRepository.jidToSignalProtocolAddress(jid);
            const cachedSession = peerSessionsCache.get(signalId);
            if (cachedSession !== undefined) {
                if (cachedSession) {
                    continue; // Session exists in cache
                }
            }
            else {
                const sessionValidation = await signalRepository.validateSession(jid);
                const hasSession = sessionValidation.exists;
                peerSessionsCache.set(signalId, hasSession);
                if (hasSession) {
                    continue;
                }
            }
            jidsRequiringFetch.push(jid);
        }
        if (jidsRequiringFetch.length) {
            // LID if mapped, otherwise original
            const wireJids = await Promise.all(jidsRequiringFetch.map(async (jid) => {
                if (jid.includes('@s.whatsapp.net')) {
                    const lid = await signalRepository.lidMapping.getLIDForPN(jid);
                    return lid ? lid : jid;
                }
                return jid;
            }));
            logger.debug({ jidsRequiringFetch, wireJids }, 'fetching sessions');
            const result = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'encrypt',
                    type: 'get',
                    to: WABinary_1.S_WHATSAPP_NET
                },
                content: [
                    {
                        tag: 'key',
                        attrs: {},
                        content: wireJids.map(jid => ({
                            tag: 'user',
                            attrs: { jid }
                        }))
                    }
                ]
            });
            await (0, Utils_1.parseAndInjectE2ESessions)(result, signalRepository);
            didFetchNewSession = true;
            // Cache fetched sessions using wire JIDs
            for (const wireJid of wireJids) {
                const signalId = signalRepository.jidToSignalProtocolAddress(wireJid);
                peerSessionsCache.set(signalId, true);
            }
        }
        return didFetchNewSession;
    };
    const sendPeerDataOperationMessage = async (pdoMessage) => {
        //TODO: for later, abstract the logic to send a Peer Message instead of just PDO - useful for App State Key Resync with phone
        if (!authState.creds.me?.id) {
            throw new boom_1.Boom('Not authenticated');
        }
        const protocolMessage = {
            protocolMessage: {
                peerDataOperationRequestMessage: pdoMessage,
                type: index_js_1.proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
            }
        };
        const meJid = (0, WABinary_1.jidNormalizedUser)(authState.creds.me.id);
        const msgId = await relayMessage(meJid, protocolMessage, {
            additionalAttributes: {
                category: 'peer',
                push_priority: 'high_force'
            }
        });
        return msgId;
    };
    const createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
        if (!recipientJids.length) {
            return { nodes: [], shouldIncludeDeviceIdentity: false };
        }
        const patched = await patchMessageBeforeSending(message, recipientJids);
        const patchedMessages = Array.isArray(patched)
            ? patched
            : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));
        let shouldIncludeDeviceIdentity = false;
        const meId = authState.creds.me.id;
        const meLid = authState.creds.me?.lid;
        const meLidUser = meLid ? (0, WABinary_1.jidDecode)(meLid)?.user : null;
        const encryptionPromises = patchedMessages.map(async ({ recipientJid: jid, message: patchedMessage }) => {
            if (!jid)
                return null;
            let msgToEncrypt = patchedMessage;
            if (dsmMessage) {
                const { user: targetUser } = (0, WABinary_1.jidDecode)(jid);
                const { user: ownPnUser } = (0, WABinary_1.jidDecode)(meId);
                const ownLidUser = meLidUser;
                const isOwnUser = targetUser === ownPnUser || (ownLidUser && targetUser === ownLidUser);
                const isExactSenderDevice = jid === meId || (meLid && jid === meLid);
                if (isOwnUser && !isExactSenderDevice) {
                    msgToEncrypt = dsmMessage;
                    logger.debug({ jid, targetUser }, 'Using DSM for own device');
                }
            }
            const bytes = (0, Utils_1.encodeWAMessage)(msgToEncrypt);
            const mutexKey = jid;
            const node = await encryptionMutex.mutex(mutexKey, async () => {
                const { type, ciphertext } = await signalRepository.encryptMessage({
                    jid,
                    data: bytes
                });
                if (type === 'pkmsg') {
                    shouldIncludeDeviceIdentity = true;
                }
                return {
                    tag: 'to',
                    attrs: { jid },
                    content: [
                        {
                            tag: 'enc',
                            attrs: {
                                v: '2',
                                type,
                                ...(extraAttrs || {})
                            },
                            content: ciphertext
                        }
                    ]
                };
            });
            return node;
        });
        const nodes = (await Promise.all(encryptionPromises)).filter(node => node !== null);
        return { nodes, shouldIncludeDeviceIdentity };
    };
    const relayMessage = async (jid, message, { messageId: msgId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, statusJidList }) => {
        const meId = authState.creds.me.id;
        const meLid = authState.creds.me?.lid;
        const isRetryResend = Boolean(participant?.jid);
        let shouldIncludeDeviceIdentity = isRetryResend;
        const statusJid = 'status@broadcast';
        const { user, server } = (0, WABinary_1.jidDecode)(jid);
        const isGroup = server === 'g.us';
        const isStatus = jid === statusJid;
        const isLid = server === 'lid';
        const isNewsletter = server === 'newsletter';
        const finalJid = jid;
        // ADDRESSING CONSISTENCY: Match own identity to conversation context
        // TODO: investigate if this is true
        let ownId = meId;
        if (isLid && meLid) {
            ownId = meLid;
            logger.debug({ to: jid, ownId }, 'Using LID identity for @lid conversation');
        }
        else {
            logger.debug({ to: jid, ownId }, 'Using PN identity for @s.whatsapp.net conversation');
        }
        msgId = msgId || (0, Utils_1.generateMessageIDV2)(sock.user?.id);
        useUserDevicesCache = useUserDevicesCache !== false;
        useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus;
        const participants = [];
        const destinationJid = !isStatus ? finalJid : statusJid;
        const binaryNodeContent = [];
        const devices = [];
        const meMsg = {
            deviceSentMessage: {
                destinationJid,
                message
            },
            messageContextInfo: message.messageContextInfo
        };
        const extraAttrs = {};
        if (participant) {
            if (!isGroup && !isStatus) {
                additionalAttributes = { ...additionalAttributes, device_fanout: 'false' };
            }
            const { user, device } = (0, WABinary_1.jidDecode)(participant.jid);
            devices.push({
                user,
                device,
                jid: participant.jid
            });
        }
        await authState.keys.transaction(async () => {
            const mediaType = getMediaType(message);
            if (mediaType) {
                extraAttrs['mediatype'] = mediaType;
            }
            if (isNewsletter) {
                const patched = patchMessageBeforeSending ? await patchMessageBeforeSending(message, []) : message;
                const bytes = (0, Utils_1.encodeNewsletterMessage)(patched);
                binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: {},
                    content: bytes
                });
                const stanza = {
                    tag: 'message',
                    attrs: {
                        to: jid,
                        id: msgId,
                        type: getMessageType(message),
                        ...(additionalAttributes || {})
                    },
                    content: binaryNodeContent
                };
                logger.debug({ msgId }, `sending newsletter message to ${jid}`);
                await sendNode(stanza);
                return;
            }
            if ((0, Utils_1.normalizeMessageContent)(message)?.pinInChatMessage) {
                extraAttrs['decrypt-fail'] = 'hide'; // todo: expand for reactions and other types
            }
            if (isGroup || isStatus) {
                const [groupData, senderKeyMap] = await Promise.all([
                    (async () => {
                        let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined; // todo: should we rely on the cache specially if the cache is outdated and the metadata has new fields?
                        if (groupData && Array.isArray(groupData?.participants)) {
                            logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata');
                        }
                        else if (!isStatus) {
                            groupData = await groupMetadata(jid);
                        }
                        return groupData;
                    })(),
                    (async () => {
                        if (!participant && !isStatus) {
                            const result = await authState.keys.get('sender-key-memory', [jid]); // TODO: check out what if the sender key memory doesn't include the LID stuff now?
                            return result[jid] || {};
                        }
                        return {};
                    })()
                ]);
                if (!participant) {
                    const participantsList = groupData && !isStatus ? groupData.participants.map(p => p.id) : [];
                    if (isStatus && statusJidList) {
                        participantsList.push(...statusJidList);
                    }
                    if (!isStatus) {
                        const groupAddressingMode = groupData?.addressingMode || (isLid ? Types_1.WAMessageAddressingMode.LID : Types_1.WAMessageAddressingMode.PN);
                        additionalAttributes = {
                            ...additionalAttributes,
                            addressing_mode: groupAddressingMode
                        };
                    }
                    const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false);
                    devices.push(...additionalDevices);
                }
                if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
                    additionalAttributes = {
                        ...additionalAttributes,
                        expiration: groupData.ephemeralDuration.toString()
                    };
                }
                const patched = await patchMessageBeforeSending(message);
                if (Array.isArray(patched)) {
                    throw new boom_1.Boom('Per-jid patching is not supported in groups');
                }
                const bytes = (0, Utils_1.encodeWAMessage)(patched);
                const groupAddressingMode = groupData?.addressingMode || (isLid ? 'lid' : 'pn');
                const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId;
                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId: groupSenderIdentity
                });
                const senderKeyRecipients = [];
                for (const device of devices) {
                    const deviceJid = device.jid;
                    const hasKey = !!senderKeyMap[deviceJid];
                    if (!hasKey && !isRetryResend) {
                        senderKeyRecipients.push(deviceJid);
                        senderKeyMap[deviceJid] = true;
                    }
                }
                if (senderKeyRecipients.length) {
                    logger.debug({ senderKeyJids: senderKeyRecipients }, 'sending new sender key');
                    const senderKeyMsg = {
                        senderKeyDistributionMessage: {
                            axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
                            groupId: destinationJid
                        }
                    };
                    const senderKeySessionTargets = senderKeyRecipients;
                    await assertSessions(senderKeySessionTargets);
                    const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs);
                    shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity;
                    participants.push(...result.nodes);
                }
                if (isRetryResend) {
                    const { type, ciphertext: encryptedContent } = await signalRepository.encryptMessage({
                        data: bytes,
                        jid: participant?.jid
                    });
                    binaryNodeContent.push({
                        tag: 'enc',
                        attrs: {
                            v: '2',
                            type,
                            count: participant.count.toString()
                        },
                        content: encryptedContent
                    });
                }
                else {
                    binaryNodeContent.push({
                        tag: 'enc',
                        attrs: { v: '2', type: 'skmsg', ...extraAttrs },
                        content: ciphertext
                    });
                    await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } });
                }
            }
            else {
                const { user: ownUser } = (0, WABinary_1.jidDecode)(ownId);
                if (!participant) {
                    const targetUserServer = isLid ? 'lid' : 's.whatsapp.net';
                    devices.push({
                        user,
                        device: 0,
                        jid: (0, WABinary_1.jidEncode)(user, targetUserServer, 0)
                    });
                    // Own user matches conversation addressing mode
                    if (user !== ownUser) {
                        const ownUserServer = isLid ? 'lid' : 's.whatsapp.net';
                        const ownUserForAddressing = isLid && meLid ? (0, WABinary_1.jidDecode)(meLid).user : (0, WABinary_1.jidDecode)(meId).user;
                        devices.push({
                            user: ownUserForAddressing,
                            device: 0,
                            jid: (0, WABinary_1.jidEncode)(ownUserForAddressing, ownUserServer, 0)
                        });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        // Clear placeholders and enumerate actual devices
                        devices.length = 0;
                        // Use conversation-appropriate sender identity
                        const senderIdentity = isLid && meLid
                            ? (0, WABinary_1.jidEncode)((0, WABinary_1.jidDecode)(meLid)?.user, 'lid', undefined)
                            : (0, WABinary_1.jidEncode)((0, WABinary_1.jidDecode)(meId)?.user, 's.whatsapp.net', undefined);
                        // Enumerate devices for sender and target with consistent addressing
                        const sessionDevices = await getUSyncDevices([senderIdentity, jid], true, false);
                        devices.push(...sessionDevices);
                        logger.debug({
                            deviceCount: devices.length,
                            devices: devices.map(d => `${d.user}:${d.device}@${(0, WABinary_1.jidDecode)(d.jid)?.server}`)
                        }, 'Device enumeration complete with unified addressing');
                    }
                }
                const allRecipients = [];
                const meRecipients = [];
                const otherRecipients = [];
                const { user: mePnUser } = (0, WABinary_1.jidDecode)(meId);
                const { user: meLidUser } = meLid ? (0, WABinary_1.jidDecode)(meLid) : { user: null };
                for (const { user, jid } of devices) {
                    const isExactSenderDevice = jid === meId || (meLid && jid === meLid);
                    if (isExactSenderDevice) {
                        logger.debug({ jid, meId, meLid }, 'Skipping exact sender device (whatsmeow pattern)');
                        continue;
                    }
                    // Check if this is our device (could match either PN or LID user)
                    const isMe = user === mePnUser || (meLidUser && user === meLidUser);
                    if (isMe) {
                        meRecipients.push(jid);
                    }
                    else {
                        otherRecipients.push(jid);
                    }
                    allRecipients.push(jid);
                }
                await assertSessions(allRecipients);
                const [{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 }, { nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }] = await Promise.all([
                    // For own devices: use DSM if available (1:1 chats only)
                    createParticipantNodes(meRecipients, meMsg || message, extraAttrs),
                    createParticipantNodes(otherRecipients, message, extraAttrs, meMsg)
                ]);
                participants.push(...meNodes);
                participants.push(...otherNodes);
                if (meRecipients.length > 0 || otherRecipients.length > 0) {
                    extraAttrs['phash'] = (0, Utils_1.generateParticipantHashV2)([...meRecipients, ...otherRecipients]);
                }
                shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2;
            }
            if (participants.length) {
                if (additionalAttributes?.['category'] === 'peer') {
                    const peerNode = participants[0]?.content?.[0];
                    if (peerNode) {
                        binaryNodeContent.push(peerNode); // push only enc
                    }
                }
                else {
                    binaryNodeContent.push({
                        tag: 'participants',
                        attrs: {},
                        content: participants
                    });
                }
            }
            const stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    to: destinationJid,
                    type: getMessageType(message),
                    ...(additionalAttributes || {})
                },
                content: binaryNodeContent
            };
            // if the participant to send to is explicitly specified (generally retry recp)
            // ensure the message is only sent to that person
            // if a retry receipt is sent to everyone -- it'll fail decryption for everyone else who received the msg
            if (participant) {
                if ((0, WABinary_1.isJidGroup)(destinationJid)) {
                    stanza.attrs.to = destinationJid;
                    stanza.attrs.participant = participant.jid;
                }
                else if ((0, WABinary_1.areJidsSameUser)(participant.jid, meId)) {
                    stanza.attrs.to = participant.jid;
                    stanza.attrs.recipient = destinationJid;
                }
                else {
                    stanza.attrs.to = participant.jid;
                }
            }
            else {
                stanza.attrs.to = destinationJid;
            }
            if (shouldIncludeDeviceIdentity) {
                ;
                stanza.content.push({
                    tag: 'device-identity',
                    attrs: {},
                    content: (0, Utils_1.encodeSignedDeviceIdentity)(authState.creds.account, true)
                });
                logger.debug({ jid }, 'adding device identity');
            }
            if (additionalNodes && additionalNodes.length > 0) {
                ;
                stanza.content.push(...additionalNodes);
            }
            logger.debug({ msgId }, `sending message to ${participants.length} devices`);
            await sendNode(stanza);
            // Add message to retry cache if enabled
            if (messageRetryManager && !participant) {
                messageRetryManager.addRecentMessage(destinationJid, msgId, message);
            }
        }, meId);
        return msgId;
    };
    const getMessageType = (message) => {
        if (message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3) {
            return 'poll';
        }
        if (message.eventMessage) {
            return 'event';
        }
        if (getMediaType(message) !== '') {
            return 'media';
        }
        return 'text';
    };
    const getMediaType = (message) => {
        if (message.imageMessage) {
            return 'image';
        }
        else if (message.videoMessage) {
            return message.videoMessage.gifPlayback ? 'gif' : 'video';
        }
        else if (message.audioMessage) {
            return message.audioMessage.ptt ? 'ptt' : 'audio';
        }
        else if (message.contactMessage) {
            return 'vcard';
        }
        else if (message.documentMessage) {
            return 'document';
        }
        else if (message.contactsArrayMessage) {
            return 'contact_array';
        }
        else if (message.liveLocationMessage) {
            return 'livelocation';
        }
        else if (message.stickerMessage) {
            return 'sticker';
        }
        else if (message.listMessage) {
            return 'list';
        }
        else if (message.listResponseMessage) {
            return 'list_response';
        }
        else if (message.buttonsResponseMessage) {
            return 'buttons_response';
        }
        else if (message.orderMessage) {
            return 'order';
        }
        else if (message.productMessage) {
            return 'product';
        }
        else if (message.interactiveResponseMessage) {
            return 'native_flow_response';
        }
        else if (message.groupInviteMessage) {
            return 'url';
        }
        return '';
    };
    const getPrivacyTokens = async (jids) => {
        const t = (0, Utils_1.unixTimestampSeconds)().toString();
        const result = await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'privacy'
            },
            content: [
                {
                    tag: 'tokens',
                    attrs: {},
                    content: jids.map(jid => ({
                        tag: 'token',
                        attrs: {
                            jid: (0, WABinary_1.jidNormalizedUser)(jid),
                            t,
                            type: 'trusted_contact'
                        }
                    }))
                }
            ]
        });
        return result;
    };
    const waUploadToServer = (0, Utils_1.getWAUploadToServer)(config, refreshMediaConn);
    const waitForMsgMediaUpdate = (0, Utils_1.bindWaitForEvent)(ev, 'messages.media-update');
    return {
        ...sock,
        getPrivacyTokens,
        assertSessions,
        relayMessage,
        sendReceipt,
        sendReceipts,
        readMessages,
        refreshMediaConn,
        waUploadToServer,
        fetchPrivacySettings,
        sendPeerDataOperationMessage,
        createParticipantNodes,
        getUSyncDevices,
        messageRetryManager,
        updateMediaMessage: async (message) => {
            const content = (0, Utils_1.assertMediaContent)(message.message);
            const mediaKey = content.mediaKey;
            const meId = authState.creds.me.id;
            const node = await (0, Utils_1.encryptMediaRetryRequest)(message.key, mediaKey, meId);
            let error = undefined;
            await Promise.all([
                sendNode(node),
                waitForMsgMediaUpdate(async (update) => {
                    const result = update.find(c => c.key.id === message.key.id);
                    if (result) {
                        if (result.error) {
                            error = result.error;
                        }
                        else {
                            try {
                                const media = await (0, Utils_1.decryptMediaRetryData)(result.media, mediaKey, result.key.id);
                                if (media.result !== index_js_1.proto.MediaRetryNotification.ResultType.SUCCESS) {
                                    const resultStr = index_js_1.proto.MediaRetryNotification.ResultType[media.result];
                                    throw new boom_1.Boom(`Media re-upload failed by device (${resultStr})`, {
                                        data: media,
                                        statusCode: (0, Utils_1.getStatusCodeForMediaRetry)(media.result) || 404
                                    });
                                }
                                content.directPath = media.directPath;
                                content.url = (0, Utils_1.getUrlFromDirectPath)(content.directPath);
                                logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful');
                            }
                            catch (err) {
                                error = err;
                            }
                        }
                        return true;
                    }
                })
            ]);
            if (error) {
                throw error;
            }
            ev.emit('messages.update', [{ key: message.key, update: { message: message.message } }]);
            return message;
        },
        sendMessage: async (jid, content, options = {}) => {
            const userJid = authState.creds.me.id;
            if (typeof content === 'object' &&
                'disappearingMessagesInChat' in content &&
                typeof content['disappearingMessagesInChat'] !== 'undefined' &&
                (0, WABinary_1.isJidGroup)(jid)) {
                const { disappearingMessagesInChat } = content;
                const value = typeof disappearingMessagesInChat === 'boolean'
                    ? disappearingMessagesInChat
                        ? Defaults_1.WA_DEFAULT_EPHEMERAL
                        : 0
                    : disappearingMessagesInChat;
                await groupToggleEphemeral(jid, value);
            }
            else {
                const fullMsg = await (0, Utils_1.generateWAMessage)(jid, content, {
                    logger,
                    userJid,
                    getUrlInfo: text => (0, link_preview_1.getUrlInfo)(text, {
                        thumbnailWidth: linkPreviewImageThumbnailWidth,
                        fetchOpts: {
                            timeout: 3000,
                            ...(httpRequestOptions || {})
                        },
                        logger,
                        uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
                    }),
                    //TODO: CACHE
                    getProfilePicUrl: sock.profilePictureUrl,
                    getCallLink: sock.createCallLink,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    messageId: (0, Utils_1.generateMessageIDV2)(sock.user?.id),
                    ...options
                });
                const isEventMsg = 'event' in content && !!content.event;
                const isDeleteMsg = 'delete' in content && !!content.delete;
                const isEditMsg = 'edit' in content && !!content.edit;
                const isPinMsg = 'pin' in content && !!content.pin;
                const isPollMessage = 'poll' in content && !!content.poll;
                const additionalAttributes = {};
                const additionalNodes = [];
                // required for delete
                if (isDeleteMsg) {
                    // if the chat is a group, and I am not the author, then delete the message as an admin
                    if ((0, WABinary_1.isJidGroup)(content.delete?.remoteJid) && !content.delete?.fromMe) {
                        additionalAttributes.edit = '8';
                    }
                    else {
                        additionalAttributes.edit = '7';
                    }
                }
                else if (isEditMsg) {
                    additionalAttributes.edit = '1';
                }
                else if (isPinMsg) {
                    additionalAttributes.edit = '2';
                }
                else if (isPollMessage) {
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            polltype: 'creation'
                        }
                    });
                }
                else if (isEventMsg) {
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            event_type: 'creation'
                        }
                    });
                }
                await relayMessage(jid, fullMsg.message, {
                    messageId: fullMsg.key.id,
                    useCachedGroupMetadata: options.useCachedGroupMetadata,
                    additionalAttributes,
                    statusJidList: options.statusJidList,
                    additionalNodes
                });
                if (config.emitOwnEvents) {
                    process.nextTick(() => {
                        processingMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                return fullMsg;
            }
        }
    };
};
exports.makeMessagesSocket = makeMessagesSocket;
