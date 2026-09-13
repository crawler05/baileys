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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeLibSignalRepository = makeLibSignalRepository;
const libsignal = __importStar(require("libsignal"));
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const sender_key_name_1 = require("./Group/sender-key-name");
const sender_key_record_1 = require("./Group/sender-key-record");
const Group_1 = require("./Group");
function makeLibSignalRepository(auth) {
    const storage = signalStorage(auth);
    // ─────────────────────────────────────────────────────────────
    // RACE FIX: per-session async mutex, scoped to THIS repository
    // (each WhatsApp socket/account gets its own lock map, so
    // multi-session bots don't contend across accounts).
    //
    // SessionCipher.encrypt()/decrypt() and GroupCipher.encrypt()/
    // decrypt() internally do: loadSession → mutate ratchet →
    // storeSession, all async. Concurrent calls on the same address
    // (send↔send, or send↔receive) read the SAME pre-mutation state
    // and clobber each other's write → double-ratchet desync with the
    // peer device → permanent "Waiting for this message" on self-chat.
    // Serializing per address / per sender-key makes the critical
    // section atomic.
    const locks = new Map();
    function withSignalLock(key, task) {
        const prev = locks.get(key) || Promise.resolve();
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        const chained = prev.then(() => gate);
        locks.set(key, chained);
        return prev.then(async () => {
            try {
                return await task();
            }
            finally {
                release();
                // prune the map when nobody is queued behind us
                if (locks.get(key) === chained) {
                    locks.delete(key);
                }
            }
        });
    }
    return {
        decryptGroupMessage({ group, authorJid, msg }) {
            const senderName = jidToSignalSenderKeyName(group, authorJid);
            const lockKey = `sk:${senderName.toString()}`;
            return withSignalLock(lockKey, async () => {
                const cipher = new Group_1.GroupCipher(storage, senderName);
                return cipher.decrypt(msg);
            });
        },
        processSenderKeyDistributionMessage({ item, authorJid }) {
            if (!item.groupId) {
                throw new Error('Group ID is required for sender key distribution message');
            }
            const senderName = jidToSignalSenderKeyName(item.groupId, authorJid);
            const senderNameStr = senderName.toString();
            const lockKey = `sk:${senderNameStr}`;
            return withSignalLock(lockKey, async () => {
                const builder = new Group_1.GroupSessionBuilder(storage);
                const senderMsg = new Group_1.SenderKeyDistributionMessage(null, null, null, null, item.axolotlSenderKeyDistributionMessage);
                const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!senderKey) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                await builder.process(senderName, senderMsg);
            });
        },
        decryptMessage({ jid, type, ciphertext }) {
            const addr = jidToSignalProtocolAddress(jid);
            const lockKey = `addr:${addr.toString()}`;
            return withSignalLock(lockKey, async () => {
                const session = new libsignal.SessionCipher(storage, addr);
                switch (type) {
                    case 'pkmsg':
                        return await session.decryptPreKeyWhisperMessage(ciphertext);
                    case 'msg':
                        return await session.decryptWhisperMessage(ciphertext);
                    default:
                        throw new Error(`Unknown message type: ${type}`);
                }
            });
        },
        encryptMessage({ jid, data }) {
            const addr = jidToSignalProtocolAddress(jid);
            const lockKey = `addr:${addr.toString()}`;
            return withSignalLock(lockKey, async () => {
                const cipher = new libsignal.SessionCipher(storage, addr);
                const { type: sigType, body } = await cipher.encrypt(data);
                const type = sigType === 3 ? 'pkmsg' : 'msg';
                return { type, ciphertext: Buffer.from(body, 'binary') };
            });
        },
        encryptGroupMessage({ group, meId, data }) {
            const senderName = jidToSignalSenderKeyName(group, meId);
            const senderNameStr = senderName.toString();
            const lockKey = `sk:${senderNameStr}`;
            return withSignalLock(lockKey, async () => {
                const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!senderKey) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                const builder = new Group_1.GroupSessionBuilder(storage);
                const senderKeyDistributionMessage = await builder.create(senderName);
                const session = new Group_1.GroupCipher(storage, senderName);
                const ciphertext = await session.encrypt(data);
                return {
                    ciphertext,
                    senderKeyDistributionMessage: senderKeyDistributionMessage.serialize()
                };
            });
        },
        injectE2ESession({ jid, session }) {
            const addr = jidToSignalProtocolAddress(jid);
            const lockKey = `addr:${addr.toString()}`;
            return withSignalLock(lockKey, async () => {
                const cipher = new libsignal.SessionBuilder(storage, addr);
                await cipher.initOutgoing(session);
            });
        },
        jidToSignalProtocolAddress(jid) {
            return jidToSignalProtocolAddress(jid).toString();
        }
    };
}
const jidToSignalProtocolAddress = (jid) => {
    const { user, device } = (0, WABinary_1.jidDecode)(jid);
    return new libsignal.ProtocolAddress(user, device || 0);
};
const jidToSignalSenderKeyName = (group, user) => {
    return new sender_key_name_1.SenderKeyName(group, jidToSignalProtocolAddress(user));
};
function signalStorage({ creds, keys }) {
    return {
        loadSession: async (id) => {
            const { [id]: sess } = await keys.get('session', [id]);
            if (sess) {
                return libsignal.SessionRecord.deserialize(sess);
            }
        },
        storeSession: async (id, session) => {
            await keys.set({ session: { [id]: session.serialize() } });
        },
        isTrustedIdentity: () => {
            return true;
        },
        loadPreKey: async (id) => {
            const keyId = id.toString();
            const { [keyId]: key } = await keys.get('pre-key', [keyId]);
            if (key) {
                return {
                    privKey: Buffer.from(key.private),
                    pubKey: Buffer.from(key.public)
                };
            }
        },
        removePreKey: (id) => keys.set({ 'pre-key': { [id]: null } }),
        loadSignedPreKey: () => {
            const key = creds.signedPreKey;
            return {
                privKey: Buffer.from(key.keyPair.private),
                pubKey: Buffer.from(key.keyPair.public)
            };
        },
        loadSenderKey: async (senderKeyName) => {
            const keyId = senderKeyName.toString();
            const { [keyId]: key } = await keys.get('sender-key', [keyId]);
            if (key) {
                return sender_key_record_1.SenderKeyRecord.deserialize(key);
            }
            return new sender_key_record_1.SenderKeyRecord();
        },
        storeSenderKey: async (senderKeyName, key) => {
            const keyId = senderKeyName.toString();
            const serialized = JSON.stringify(key.serialize());
            await keys.set({ 'sender-key': { [keyId]: Buffer.from(serialized, 'utf-8') } });
        },
        getOurRegistrationId: () => creds.registrationId,
        getOurIdentity: () => {
            const { signedIdentityKey } = creds;
            return {
                privKey: Buffer.from(signedIdentityKey.private),
                pubKey: (0, Utils_1.generateSignalPubKey)(signedIdentityKey.public)
            };
        }
    };
}