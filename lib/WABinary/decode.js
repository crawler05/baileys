import * as constants from './constants.js';
const TAGS = constants.TAGS;
export const WSMessageDecodeErrorType = {
    INVALID_FRAME: 'Invalid frame',
    INVALID_DICT_INDEX: 'Invalid dictionary index',
    INVALID_TOKEN: 'Invalid token',
    UNKNOWN_TAG: 'Unknown tag',
    INSUFFICIENT_DATA: 'Insufficient data'
};
export class WSMessageDecodingError extends Error {
    constructor(type, context, ...args) {
        super(`WS message decoding error: ${type}`, ...args);
        this.name = 'WSMessageDecodingError';
        this.type = type;
        this.context = context;
    }
}
/**
 * Decodes a binary node (as received from the WhatsApp server over the WebSocket)
 * into a JS object of shape { tag, attrs, content }.
 */
export const decodeBinaryNode = (buff) => {
    if (!(buff instanceof Uint8Array)) {
        buff = new Uint8Array(buff);
    }
    return decodeBinaryNodeLens(buff).node;
};
const decodeBinaryNodeLens = (buff) => {
    const cursor = { buf: buff };
    let value = readByte(cursor);
    let size = 0;
    if (value === 2) {
        size = readByte(cursor);
    }
    else if (value === 3) {
        size = (readByte(cursor) << 16) | (readByte(cursor) << 8) | readByte(cursor);
    }
    else {
        throw new Error('invalid stream header');
    }
    size += 1; // because length is only the payload size
    cursor.buf = cursor.buf.subarray(0, size);
    const node = decodeNode(cursor);
    if (cursor.buf.length > 0) {
        throw new WSMessageDecodingError(WSMessageDecodeErrorType.INVALID_FRAME, makeContext(cursor));
    }
    return { node };
};
const readByte = (cursor) => {
    if (!cursor.buf.length) {
        throw new WSMessageDecodingError(WSMessageDecodeErrorType.INSUFFICIENT_DATA, makeContext(cursor));
    }
    const val = cursor.buf[0];
    cursor.buf = cursor.buf.subarray(1);
    return val;
};
const makeContext = (cursor) => {
    const start = Math.max(cursor.buf.length - 32, 0);
    const end = Math.min(cursor.buf.length, 32);
    return Buffer.from(cursor.buf.subarray(start, start + end)).toString('base64');
};
const decodeNode = (cursor) => {
    const header = readByte(cursor);
    const nAttr = header & 15;
    const tagSize = header >> 4;
    const tag = readToken(cursor, tagSize);
    if (typeof tag !== 'string') {
        throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
    }
    const attributes = {};
    for (let i = 0; i < nAttr; i++) {
        // each attribute is encoded as a single byte: high nibble = key token, low nibble = value token
        const attrByte = readByte(cursor);
        const key = readToken(cursor, attrByte >> 4);
        if (typeof key !== 'string') {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
        }
        const value = readToken(cursor, attrByte & 15);
        if (value !== undefined && typeof value !== 'string' && !(value instanceof Uint8Array)) {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
        }
        attributes[key] = value;
    }
    let content;
    if (cursor.buf.length > 0) {
        const [nContent, contentStartClose] = readListHeader(cursor);
        if (contentStartClose) {
            // LIST_EMPTY marker: 2 bytes that close the node
            readByte(cursor);
            readByte(cursor);
        }
        else if (nContent === 1) {
            // single string/binary content (no list wrapper)
            content = readToken(cursor, undefined);
        }
        else {
            content = [];
            for (let i = 0; i < nContent; i++) {
                const possibleType = cursor.buf[0] >> 4 & 15;
                // inner nodes must be actual nodes (token type >= 5)
                if (possibleType <= 4) {
                    throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
                }
                const child = readToken(cursor, undefined);
                content.push(child);
            }
            // consume the terminating empty-list marker (2 bytes)
            readByte(cursor);
            readByte(cursor);
        }
    }
    const node = {
        tag,
        attrs: Object.keys(attributes).length ? attributes : undefined,
        content: Array.isArray(content) && !content.length ? undefined : content,
    };
    return node;
};
const readListHeader = (cursor) => {
    const possibleType = cursor.buf[0] >> 4 & 15;
    if (possibleType === TAGS.LIST_EMPTY) {
        return [0, true];
    }
    if (possibleType === TAGS.LIST_8) {
        readByte(cursor); // consume the header byte
        return [readByte(cursor), false];
    }
    if (possibleType === TAGS.LIST_16) {
        readByte(cursor); // consume the header byte
        return [(readByte(cursor) << 8) | readByte(cursor), false];
    }
    // single string/binary content follows (no list wrapper)
    return [1, false];
};
const readToken = (cursor, data) => {
    let token;
    if (data === undefined) {
        token = readByte(cursor);
        data = token & 15;
        token >>= 4;
    }
    else {
        token = data;
    }
    // nibble / hex packed values may have an extended length in the next byte
    if (token === TAGS.NIBBLE_8) {
        if (data > 128) {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.INVALID_TOKEN, makeContext(cursor));
        }
        else if (data === 128) {
            data = readByte(cursor);
        }
        return decodePacked(cursor, data, 'nibble');
    }
    else if (token === TAGS.HEX_8) {
        if (data > 128) {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.INVALID_TOKEN, makeContext(cursor));
        }
        else if (data === 128) {
            data = readByte(cursor);
        }
        return decodePacked(cursor, data, 'hex');
    }
    else if (token >= TAGS.DICTIONARY_0 && token <= TAGS.DICTIONARY_3) {
        // double byte dictionary token
        const dictIndex = token - TAGS.DICTIONARY_0;
        const tokens = constants.DOUBLE_BYTE_TOKENS[dictIndex];
        if (!tokens) {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.INVALID_DICT_INDEX, makeContext(cursor));
        }
        const tokenId = (data << 8) | readByte(cursor);
        if (tokenId >= tokens.length) {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.INVALID_TOKEN, makeContext(cursor));
        }
        return tokens[tokenId];
    }
    else if (token === TAGS.PACKED_MAX) {
        // 127 => the following byte contains the real (nibble/hex) header
        return readToken(cursor, readByte(cursor));
    }
    switch (token) {
        case TAGS.LIST_EMPTY: // empty string
            return '';
        case TAGS.BINARY_8:
            return readBytes(cursor, readByte(cursor));
        case TAGS.BINARY_20:
            return readBytes(cursor, (readByte(cursor) << 16) | (readByte(cursor) << 8) | readByte(cursor));
        case TAGS.BINARY_32:
            return readBytes(cursor, ((readByte(cursor) << 24) | (readByte(cursor) << 16) | (readByte(cursor) << 8) | readByte(cursor)) >>> 0);
        case TAGS.JID_PAIR:
            return decodeJidPair(cursor);
        case TAGS.FB_JID:
            return decodeFBJid(cursor, data);
        case TAGS.ADJID:
            return decodeADJid(cursor, data);
        case TAGS.INTEROP_JID:
            return decodeInteropJid(cursor, data);
        default:
            if (token < 232) {
                // single byte token: when data is 0 the high nibble is the token index,
                // otherwise the low nibble holds the token index
                return constants.SINGLE_BYTE_TOKENS[data === 0 ? token : data];
            }
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
    }
};
const readBytes = (cursor, length) => {
    const buffer = cursor.buf.slice(0, length);
    if (buffer.length !== length) {
        throw new WSMessageDecodingError(WSMessageDecodeErrorType.INSUFFICIENT_DATA, makeContext(cursor));
    }
    cursor.buf = cursor.buf.subarray(length);
    return new Uint8Array(buffer);
};
const decodeJidPair = (cursor) => {
    const user = readToken(cursor, readByte(cursor));
    const server = readToken(cursor, readByte(cursor));
    if (typeof user !== 'string' || typeof server !== 'string') {
        throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
    }
    return `${user}@${server}`;
};
const decodeFBUser = (type, cursor) => {
    const regionCode = readByte(cursor);
    const userIdHigh = (((readByte(cursor) << 8) | readByte(cursor)) + regionCode) << 21;
    const userIdLow = (readByte(cursor) << 16) | (readByte(cursor) << 8) | readByte(cursor);
    return `fb-${type}-${regionCode}-${userIdHigh + userIdLow}`;
};
const decodeFBJid = (cursor, meta) => {
    const type = readByte(cursor);
    if (type === 1) {
        return decodeFBUser('group', cursor);
    }
    else if (type === 2) {
        return decodeFBUser('user', cursor);
    }
    throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
};
const decodeADJid = (cursor, meta) => {
    const length = readByte(cursor);
    const adBA = readBytes(cursor, length);
    const type = readByte(cursor);
    let accountType;
    switch (type) {
        case 1:
            accountType = 'px';
            break;
        case 2:
            accountType = 'in';
            break;
        case 3:
            accountType = 'cc';
            break;
        default:
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.UNKNOWN_TAG, makeContext(cursor));
    }
    return `lid-${Buffer.from(adBA).toString('hex')}@${accountType}`;
};
const decodeInteropJid = (cursor, meta) => {
    const domainType = readByte(cursor);
    const server = readToken(cursor, readByte(cursor));
    const user = readToken(cursor, readByte(cursor));
    const agent = readToken(cursor, readByte(cursor));
    const device = readToken(cursor, readByte(cursor));
    const agentStr = (agent && agent !== '') ? `.${agent}` : '';
    const deviceStr = (device && device !== '') ? `.${device}` : '';
    return `${user}${agentStr}${deviceStr}@${server}`;
};
const NIBBLE_HEX = ['\0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '.', '\0', '\0', '\0'];
const HEX_MAP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
const decodePacked = (cursor, packedLength, type) => {
    const padNibble = packedLength >= 128;
    if (padNibble) {
        packedLength &= 127; // ignore first bit
    }
    const map = type === 'nibble' ? NIBBLE_HEX : HEX_MAP;
    const values = [];
    for (let i = 0; i < packedLength; i++) {
        const packedByte = readByte(cursor);
        const v1 = packedByte >> 4;
        const v2 = packedByte & 15;
        if ((v1 === 15 || v2 === 15) && i !== packedLength - 1) {
            throw new WSMessageDecodingError(WSMessageDecodeErrorType.INVALID_TOKEN, makeContext(cursor));
        }
        values.push(map[v1], map[v2]);
    }
    if (padNibble) {
        values.pop(); // remove padding
    }
    return values.join('');
};
