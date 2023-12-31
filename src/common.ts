import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import assert from "node:assert";
import { crc } from "./crc32";

import {
  AddressFamily,
  AttributeType,
  BuildHeaderOption,
  Fingerprint,
  MappedAddress,
  Software,
  STUNAttribute,
  STUNClass,
  STUNHeader,
  STUNMessage,
  STUNMethod,
  XORMappedAddress,
} from "./types";

import type { RemoteInfo } from "node:dgram";
import { off } from "node:process";

const MAGIC_COOKIE = 0x2112a442;
const HEADER_LENGTH = 20;

export function parseStunURI(uri: string): { address: string; port: number } {
  if (/^stuns?:*/.test(uri)) {
    const regexResult = /^stuns?:(.*?)(:\d+)?$/.exec(uri);

    if (regexResult?.[1]) {
      const address = regexResult?.[1];
      let port: number;

      if (regexResult[2]) {
        const portMatch = regexResult[2].slice(1);

        if (portMatch) {
          port = parseInt(portMatch);
        } else {
          throw new Error(
            "STUN uri should be in the form of: 'stun:<address>[:port]'",
          );
        }
      } else {
        port = 3478;
      }

      return { address, port };
    } else {
      throw new Error(
        "STUN uri should be in the form of: 'stun:<address>[:port]'",
      );
    }
  } else {
    throw new Error(
      "STUN uri should be in the form of: 'stun:<address>[:port]', which port defaults to 3478",
    );
  }
}

export async function buildHeader(
  options: BuildHeaderOption,
): Promise<STUNHeader> {
  let transactionID: Buffer;

  if (!options.transactionID) {
    transactionID = await promisify(randomBytes)(12);
  } else {
    transactionID = options.transactionID;
  }

  return {
    method: options.method,
    class: options.class,
    transactionID,
  };
}

export function buildAttributes(rinfo: RemoteInfo): STUNAttribute[] {
  const { xAddress, xPort } = xorAddress(rinfo);

  const xorMappedAddress: XORMappedAddress = {
    type: AttributeType.XOR_MAPPED_ADDRESS,
    length: 8,
    family: rinfo.family === "IPv4" ? AddressFamily.IPv4 : AddressFamily.IPv6,
    port: rinfo.port,
    address: rinfo.address,
    xPort,
    xAddress,
  };

  return [xorMappedAddress];
}

export function buildMessage(
  header: STUNHeader,
  attributes: STUNAttribute[],
): STUNMessage {
  return {
    header: header,
    attributes: attributes,
    length: 0, //todo
  };
}

export function serialize(message: STUNMessage): Buffer {
  const bufferSize = calculateBufferSize(message);
  message.length = bufferSize - HEADER_LENGTH;

  const buffer = Buffer.alloc(bufferSize);

  buffer.writeUint16BE(message.header.method | message.header.class, 0);
  buffer.writeUint16BE(message.length, 2);
  buffer.writeUint32BE(MAGIC_COOKIE, 4);
  buffer.fill(message.header.transactionID, 8, 8 + 12);

  let offset = 20;
  for (let attribute of message.attributes) {
    buffer.writeUint16BE(attribute.type, offset);
    offset += 2;
    buffer.writeUint16BE(attribute.length, offset);
    offset += 2;

    switch (attribute.type) {
      case AttributeType.XOR_MAPPED_ADDRESS: {
        offset += 1;

        buffer.writeUint8((attribute as XORMappedAddress).family, offset);
        offset += 1;

        buffer.writeUint16BE((attribute as XORMappedAddress).xPort, offset);
        offset += 2;

        buffer.fill(
          inetPtoN(
            (attribute as XORMappedAddress).xAddress,
            (attribute as XORMappedAddress).family,
          ),
          offset,
        );
        offset += 4;
        break;
      }
    }
  }

  return buffer;
}

export function parseResponse(
  buffer: Buffer,
  requestMessage: STUNMessage,
): STUNMessage {
  // checks the first two bits are 0
  assert.strictEqual(
    (buffer[0] >> 6) & 0b11,
    0,
    "Invalid STUN message parsing response.",
  );

  // checks magic cookie
  assert.strictEqual(
    buffer.readUint32BE(4),
    MAGIC_COOKIE,
    "Invalid STUN message parsing response.",
  );

  const stunClass = parseStunClass(buffer);
  const stunMethod = parseStunMethod(buffer);

  switch (requestMessage.header.method) {
    case STUNMethod.Binding: {
      assert.strictEqual(
        true,
        [STUNClass.ErrorResponse, STUNClass.SuccessResponse].includes(
          stunClass,
        ),
        "Invalid STUN class parsing response, expecting STUN class `success response` or `error response`.",
      );
      assert.strictEqual(
        stunMethod,
        STUNMethod.Binding,
        "Invalid STUN method parsing response, expecting STUN method `Binding`.",
      );
      break;
    }
  }

  // checks transaction IDs are equal
  const resTransactionID = buffer.subarray(8, 8 + 12);
  const reqTransactionID = requestMessage.header.transactionID;
  for (let i = 0; i < reqTransactionID.length; i++) {
    assert.strictEqual(
      reqTransactionID[i],
      resTransactionID[i],
      "Invalid STUN method parsing response, transaction ID not equal to the STUN request.",
    );
  }

  const length = buffer.readUint16BE(2);
  assert.strictEqual(
    length,
    buffer.length - 20,
    "Invalid STUN message length field.",
  );

  let attributes: STUNAttribute[] = [];

  if (length > 0) {
    attributes = parseAttributes(buffer, 20, length);
  }

  const message: STUNMessage = {
    header: {
      class: stunClass,
      method: stunMethod,
      transactionID: resTransactionID,
    },
    length,
    attributes,
  };

  return message;
}

export function parseRequest(buffer: Buffer): STUNMessage {
  assert.strictEqual(
    buffer[0] >> 6,
    0,
    "Invalid STUN message parsing response.",
  );

  // checks magic cookie
  assert.strictEqual(
    buffer.readUint32BE(4),
    MAGIC_COOKIE,
    "Invalid STUN message parsing response.",
  );

  const stunClass = parseStunClass(buffer);
  const stunMethod = parseStunMethod(buffer);

  console.log(stunClass);
  console.log(stunMethod);

  assert.strictEqual(
    stunClass,
    STUNClass.Request,
    "Expecting a STUN request message.",
  );

  assert.strictEqual(
    stunMethod,
    STUNMethod.Binding,
    "Expecting a STUN binding request.",
  );

  const resTransactionID = buffer.subarray(8, 8 + 12);

  const length = buffer.readUint16BE(2);
  assert.strictEqual(
    length,
    buffer.length - 20,
    "Invalid STUN message length field.",
  );

  let attributes: STUNAttribute[] = [];

  if (length > 0) {
    attributes = parseAttributes(buffer, 20, length);
  }

  const message: STUNMessage = {
    header: {
      class: stunClass,
      method: stunMethod,
      transactionID: resTransactionID,
    },
    length,
    attributes,
  };

  return message;
}

function parseStunClass(buffer: Buffer): STUNClass {
  let firstTwoBytes = buffer.readUint16BE(0);
  firstTwoBytes = firstTwoBytes & 0b100010000;

  if (Object.values(STUNClass).includes(firstTwoBytes)) {
    return firstTwoBytes;
  } else {
    throw new Error("Invalid STUN class while parsing.");
  }
}

function parseStunMethod(buffer: Buffer): STUNMethod {
  let firstTwoBytes = buffer.readUint16BE(0);
  firstTwoBytes = firstTwoBytes & 0b111011101111;

  if (Object.values(STUNMethod).includes(firstTwoBytes)) {
    return firstTwoBytes;
  } else {
    throw new Error("Invalid STUN method while parsing.");
  }
}

function parseAttributes(
  buffer: Buffer,
  offset: number,
  length: number,
): STUNAttribute[] {
  const attributes: STUNAttribute[] = [];

  // 20 represents header length
  while (offset - 20 !== length) {
    const attribute = parseAttribute(buffer, offset);

    // 4 bytes aligned
    if (attribute.length % 4 !== 0) {
      offset += 4 + attribute.length + (4 - (attribute.length % 4));
    } else {
      offset += 4 + attribute.length; /* 4 for type and length field*/
    }

    attributes.push(attribute);
  }

  return attributes;
}

function parseAttribute(buffer: Buffer, offset: number): STUNAttribute {
  const type = buffer.readUint16BE(offset);

  const length = buffer.readUint16BE(offset + 2);

  switch (type) {
    case AttributeType.XOR_MAPPED_ADDRESS: {
      assert.strictEqual(
        buffer.readUint8(offset + 4),
        0,
        "Invalid XOR-MAPPED-ADDRESS attribute value, value should starts with 0x00.",
      );

      const family = buffer.readUint8(offset + 5);
      const xPort = buffer.readUint16BE(offset + 6);
      const port = xPort ^ (MAGIC_COOKIE >>> 16);

      let xAddress: string, address: string;
      if (family === AddressFamily.IPv4) {
        xAddress = inetNtoP(buffer, offset + 8, AddressFamily.IPv4);

        const addressBuffer = Buffer.alloc(4);
        addressBuffer.writeInt32BE(
          buffer.readInt32BE(offset + 8) ^ MAGIC_COOKIE,
        );
        address = inetNtoP(addressBuffer, 0, AddressFamily.IPv4);
      } else {
        //todo ipv6
        xAddress = "";
        address = "";
      }

      const attribute: XORMappedAddress = {
        type,
        length,
        family,
        xPort,
        port,
        xAddress,
        address,
      };
      return attribute;
    }
    case AttributeType.MAPPED_ADDRESS: {
      assert.strictEqual(
        buffer.readUint8(offset + 4),
        0,
        "Invalid XOR-MAPPED-ADDRESS attribute value, value should starts with 0x00.",
      );

      const family = buffer.readUint8(offset + 5);
      const port = buffer.readUint16BE(offset + 6);

      let address: string;
      if (family === AddressFamily.IPv4) {
        address = inetNtoP(buffer, offset + 8, AddressFamily.IPv4);
      } else {
        //todo ipv6
        address = "";
      }

      const attribute: MappedAddress = {
        type,
        length,
        family,
        port,
        address,
      };
      return attribute;
    }
    case AttributeType.SOFTWARE: {
      const attribute: Software = {
        type,
        length,
        description: buffer.toString("utf-8", offset + 4, offset + 4 + length),
      };

      return attribute;
    }
    case AttributeType.FINGERPRINT: {
      const fingerprint = buffer.readUInt32BE(offset + 4);

      const computedFingerprint = (crc(buffer, 0, offset) ^ 0x5354554e) >>> 0;

      assert.strictEqual(
        fingerprint,
        computedFingerprint,
        "Fingerprint attribute contains wrong CRC32 value.",
      );

      const attribute: Fingerprint = {
        type,
        length,
        fingerprint,
      };

      return attribute;
    }
    default: {
      return { type, length };
    }
  }
}

function inetNtoP(buffer: Buffer, offset: number, family: AddressFamily) {
  if (family === AddressFamily.IPv4) {
    const bytes = [];
    for (let i = 0; i < 4; i++) {
      const byte = buffer.readUint8(offset + i);
      bytes.push(byte);
    }

    return bytes.map((byte) => byte.toString()).join(".");
  } else {
    //todo
    return "";
  }
}

function inetPtoN(address: string, family: AddressFamily): Buffer {
  if (family === AddressFamily.IPv4) {
    const buffer = Buffer.alloc(4);

    const byteStrs = address.split(".");

    if (byteStrs.length !== 4) {
      throw new Error("invalid IPv4 address.");
    }

    for (let i = 0; i < byteStrs.length; i++) {
      buffer.writeUint8(parseInt(byteStrs[i], 10), i);
    }

    return buffer;
  } else {
    throw new Error("IPv6 inetPtoN not implemented yet!");
  }
}

function xorAddress(rinfo: RemoteInfo): { xAddress: string; xPort: number } {
  if (rinfo.family === "IPv4") {
    const octets = rinfo.address.split(".");

    const int32 =
      (parseInt(octets[0], 10) << 24) |
      (parseInt(octets[1], 10) << 16) |
      (parseInt(octets[2], 10) << 8) |
      parseInt(octets[3], 10);

    const xored = int32 ^ MAGIC_COOKIE;

    const xAddress =
      ((xored >>> 24) & 0xff) +
      "." +
      ((xored >>> 16) & 0xff) +
      "." +
      ((xored >>> 8) & 0xff) +
      "." +
      (xored & 0xff);

    return {
      xAddress,
      xPort: rinfo.port ^ (MAGIC_COOKIE >>> 16),
    };
  } else {
    throw new Error("IPv6 address not implemented yet!");
  }
}

function calculateBufferSize(message: STUNMessage): number {
  let length = HEADER_LENGTH;

  for (const attribute of message.attributes) {
    let attributeLength = 4 /*type + length fileds*/ + attribute.length;

    if (attributeLength % 4 !== 0) {
      attributeLength += 4 - (attributeLength % 4); //padding
    }

    length += attributeLength;
  }

  return length;
}
