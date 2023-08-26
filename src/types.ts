export interface STUNHeader {
  class: STUNClass;
  method: STUNMethod;
  transactionID: Buffer;
}

export interface STUNAttribute {
  type: AttributeType;
  length: number;
}

export interface MappedAddress extends STUNAttribute {
  family: AddressFamily;
  port: number;
  address: string;
}

export interface XORMappedAddress extends MappedAddress {
  family: AddressFamily;
  xPort: number;
  xAddress: string;
}

export interface Software extends STUNAttribute {
  description: string;
}

export enum AddressFamily {
  IPv4 = 0x01,
  IPv6 = 0x02
}

export enum AttributeType {
  MAPPED_ADDRESS = 0x0001,
  XOR_MAPPED_ADDRESS = 0x0020,
  SOFTWARE = 0x8022
}

export interface STUNMessage {
  header: STUNHeader;
  length: number;
  attributes: STUNAttribute[];
}

export interface BuildHeaderOption {
  class: STUNClass;
  method: STUNMethod;
}

export enum STUNClass {
  Request = 0b000000000,
  Indication = 0b000010000,
  SuccessResponse = 0b100000000,
  ErrorResponse = 0b100010000
}

export enum STUNMethod {
  Binding = 0b000000000001,
}


