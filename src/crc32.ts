let crcTableComputed = false;
let crcTable: number[] = [];

export function crc(buffer: Buffer, offset: number, length: number) {
  return updateCrc(0, buffer, offset, length);
}

function updateCrc(crc: number, buffer: Buffer, offset: number, length: number) {
  let c = crc ^ 0xffffffff;

  if (!crcTableComputed) {
    makeCrcTable();
  }

  for (let n = 0; n < length; n++) {
    c = crcTable[(c ^ buffer[offset + n]) & 0xff] ^ (c >>> 8);
  }

  return c ^ 0xffffffff
}

function makeCrcTable() {
  let c: number;

  for (let n = 0; n < 256; n++) {
    c = n;

    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }

  crcTableComputed = true;
}

