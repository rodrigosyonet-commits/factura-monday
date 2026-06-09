import fs from "fs";

export function decodeBase64(base64) {
  return Buffer.from(base64, "base64");
}

export function saveFile(buffer, filename) {
  const filePath = `/tmp/${filename}`;
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
