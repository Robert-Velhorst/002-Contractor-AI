const { crc32 } = require('node:zlib');

const jpeg = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAEG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AkwFZAAAAAAAAAAAAAAAAAAAAAAB//9k=', 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWNQq0lQq0lggFAAG14ECS6UgboAAAAASUVORK5CYII=', 'base64');

function jpegFixture(description = '') {
  const comment = Buffer.from(description);
  if (comment.length > 65533) throw new RangeError('JPEG fixture comment too long.');
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xfffe, 0);
  marker.writeUInt16BE(comment.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), marker, comment, jpeg.subarray(2)]);
}

function oversizedPng() {
  const bytes = Buffer.from(png);
  bytes.writeUInt32BE(20000, 16);
  bytes.writeUInt32BE(20000, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

function animatedPngFixture() {
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  }
  const idatOffset = png.indexOf(Buffer.from('IDAT'));
  const idat = png.subarray(idatOffset + 4, idatOffset + 4 + png.readUInt32BE(idatOffset - 4));
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
  function frame(sequence) {
    const control = Buffer.alloc(26);
    control.writeUInt32BE(sequence); control.writeUInt32BE(2, 4); control.writeUInt32BE(2, 8);
    control.writeUInt16BE(1, 20); control.writeUInt16BE(10, 22);
    return chunk('fcTL', control);
  }
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([png.subarray(0, 33), chunk('acTL', animation), frame(0),
    chunk('IDAT', idat), frame(1), chunk('fdAT', Buffer.concat([sequence, idat])), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { jpegFixture, png, oversizedPng, animatedPngFixture };
