import type { Comparable } from '@adiwajshing/keyed-db/lib/Types';
import type { Logger } from 'pino';
import { proto } from '../../WAProto';
import type makeMDSocket from '../Socket';
import type { BaileysEventEmitter, Chat, ConnectionState, Contact, GroupMetadata, PresenceData, WAMessage, WAMessageCursor, WAMessageKey } from '../Types';
import { Label } from '../Types/Label';
import { LabelAssociation } from '../Types/LabelAssociation';
import { ObjectRepository } from './object-repository';
type WASocket = ReturnType<typeof makeMDSocket>;
export declare const waChatKey: (pin: boolean) => {
    key: (c: Chat) => string;
    compare: (k1: string, k2: string) => number;
};
export declare const waMessageID: (m: WAMessage) => string;
export declare const waLabelAssociationKey: Comparable<LabelAssociation, string>;
export type BaileysInMemoryStoreConfig = {
    chatKey?: Comparable<Chat, string>;
    labelAssociationKey?: Comparable<LabelAssociation, string>;
    logger?: Logger;
    socket?: WASocket;
};
declare const _default: (config: BaileysInMemoryStoreConfig) => {
    chats: any;
    contacts: {
        [id: string]: Contact;
    };
    messages: {
        [jid: string]: {
            array: WAMessage[];
            get: (id: string) => WAMessage | undefined;
            upsert: (item: WAMessage, mode: "append" | "prepend") => void;
            update: (item: WAMessage) => boolean;
            remove: (item: WAMessage) => boolean;
            updateAssign: (id: string, update: Partial<WAMessage>) => boolean;
            clear: () => void;
            filter: (contain: (item: WAMessage) => boolean) => void;
            toJSON: () => WAMessage[];
            fromJSON: (newItems: WAMessage[]) => void;
        };
    };
    groupMetadata: {
        [id: string]: GroupMetadata;
    };
    state: ConnectionState;
    presences: {
        [id: string]: {
            [participant: string]: PresenceData;
        };
    };
    labels: ObjectRepository<Label>;
    labelAssociations: any;
    bind: (ev: BaileysEventEmitter) => void;
    loadMessages: (jid: string, count: number, cursor: WAMessageCursor) => Promise<proto.IWebMessageInfo[]>;
    getLabels: () => ObjectRepository<Label>;
    getChatLabels: (chatId: string) => LabelAssociation[];
    getMessageLabels: (messageId: string) => string[];
    loadMessage: (jid: string, id: string) => Promise<proto.IWebMessageInfo | undefined>;
    mostRecentMessage: (jid: string) => Promise<proto.IWebMessageInfo>;
    fetchImageUrl: (jid: string, sock: WASocket | undefined) => Promise<string | null | undefined>;
    fetchGroupMetadata: (jid: string, sock: WASocket | undefined) => Promise<GroupMetadata>;
    fetchMessageReceipts: ({ remoteJid, id }: WAMessageKey) => Promise<proto.IUserReceipt[] | null | undefined>;
    toJSON: () => {
        chats: any;
        contacts: {
            [id: string]: Contact;
        };
        messages: {
            [jid: string]: {
                array: WAMessage[];
                get: (id: string) => WAMessage | undefined;
                upsert: (item: WAMessage, mode: "append" | "prepend") => void;
                update: (item: WAMessage) => boolean;
                remove: (item: WAMessage) => boolean;
                updateAssign: (id: string, update: Partial<WAMessage>) => boolean;
                clear: () => void;
                filter: (contain: (item: WAMessage) => boolean) => void;
                toJSON: () => WAMessage[];
                fromJSON: (newItems: WAMessage[]) => void;
            };
        };
        labels: ObjectRepository<Label>;
        labelAssociations: any;
    };
    fromJSON: (json: {
        chats: Chat[];
        contacts: {
            [id: string]: Contact;
        };
        messages: {
            [id: string]: proto.IWebMessageInfo[];
        };
        labels: {
            [labelId: string]: Label;
        };
        labelAssociations: LabelAssociation[];
    }) => void;
    writeToFile: (path: string) => void;
    readFromFile: (path: string) => void;
};
export default _default;
