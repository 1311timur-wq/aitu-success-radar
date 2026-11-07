// Types for the vendored QR Code Generator for JavaScript (c) 2009 Kazuhiko Arase, MIT — see qrcode.LICENSE.txt.
export type TypeNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export interface QRCode {
  addData(data: string, mode?: 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
declare const qrcode: (typeNumber: TypeNumber, errorCorrectionLevel: ErrorCorrectionLevel) => QRCode;
export default qrcode;
export { qrcode };
