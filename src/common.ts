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

const MAGIC_COOKIE = 0x2112a442;
const HEADER_LENGTH = 20;

export async function buildHeader(
  options: BuildHeaderOption,
): Promise<STUNHeader> {
  const transactionID = await promisify(randomBytes)(12);

  return {
    method: options.method,
    class: options.class,
    transactionID,
  };
}

export function buildMessage(
  header: STUNHeader,
  attributes: STUNAttribute[],
): STUNMessage {
  return {
    header: header,
    attributes: [],
    length: 0, //todo
  };
}

export function serialize(message: STUNMessage): Buffer {
  const buffer = Buffer.alloc(message.length + HEADER_LENGTH);

  buffer.writeUint16BE(message.header.method | message.header.class, 0);
  buffer.writeUint16BE(message.length, 2);
  buffer.writeUint32BE(MAGIC_COOKIE, 4);
  buffer.fill(message.header.transactionID, 8, 8 + 12);

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
        addressBuffer.writeUint32BE(
          buffer.readUint32BE(offset + 8) ^ MAGIC_COOKIE,
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
