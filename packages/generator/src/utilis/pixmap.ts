import type { PsPixmap, PsBounds } from "../types/ps";

export class Pixmap implements PsPixmap {
  declare format: number;
  declare width: number;
  declare height: number;
  declare rowBytes: number;
  declare colorMode: number;
  declare channelCount: number;
  declare bitsPerChannel: number;
  declare pixels: Buffer;
  declare bytesPerPixel: number;
  declare padding: number;
  declare bounds: PsBounds;
  declare resolution: number;

  declare iccProfile: any;

  declare getPixel: (n: number) => any;
  declare readChannel: (n?: number) => any;
  constructor(buffer: Buffer) {
    this.format = buffer.readUInt8(0);
    this.width = buffer.readUInt32BE(1);
    this.height = buffer.readUInt32BE(5);
    this.rowBytes = buffer.readUInt32BE(9);
    this.colorMode = buffer.readUInt8(13);
    this.channelCount = buffer.readUInt8(14);
    this.bitsPerChannel = buffer.readUInt8(15);
    this.pixels = buffer.slice(16, 16 + this.width * this.height * this.channelCount);
    this.bytesPerPixel = (this.bitsPerChannel / 8) * this.channelCount;
    this.padding = this.rowBytes - this.width * this.channelCount;
    this.readChannel = this.getReadChannel(this.bitsPerChannel);

    this._initGetPixelMethod(this.channelCount);
  }

  public getReadChannel(bitsPerChannel: number): (n?: number) => any {
    if (16 === bitsPerChannel) {
      return Buffer.prototype.readUInt16BE;
    }
    if (8 === bitsPerChannel) {
      return Buffer.prototype.readUInt8;
    }
    if (32 === bitsPerChannel) {
      return Buffer.prototype.readUInt32BE;
    }
    throw new Error(`Unsupported pixmap bit depth: ${bitsPerChannel}`);
  }

  private getPixel1(n: number) {
    var pixel = this.getRawPixel(n);
    var grey = this.readChannel.call(pixel, 0);
    return {
      r: grey,
      g: grey,
      b: grey,
      a: 255,
    };
  }

  private getPixel3(n: number) {
    var pixel = this.getRawPixel(n);
    return {
      r: this.readChannel.call(pixel, 2),
      g: this.readChannel.call(pixel, 1),
      b: this.readChannel.call(pixel),
      a: 255,
    };
  }

  private getPixel4(n: number) {
    var pixel = this.getRawPixel(n);
    return {
      r: this.readChannel.call(pixel, 1),
      g: this.readChannel.call(pixel, 2),
      b: this.readChannel.call(pixel, 3),
      a: this.readChannel.call(pixel, 0),
    };
  }

  private _initGetPixelMethod(channelCount: number) {
    if (channelCount === 4) {
      this.getPixel = this.getPixel4;
    }
    if (channelCount === 3) {
      this.getPixel = this.getPixel3;
    }
    if (channelCount === 1) {
      this.getPixel = this.getPixel1;
    }
  }

  public getRawPixel(n: number) {
    var i = n * this.bytesPerPixel;
    return this.pixels.slice(i, i + this.bytesPerPixel);
  }
}
