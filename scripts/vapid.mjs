// Web Push (VAPID) key pair as two base64url strings: the raw private scalar and the raw uncompressed public point.
import { generateKeyPairSync } from "node:crypto";

export function newVapidKeys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  return { VAPID_PRIVATE: jwk.d, VAPID_PUBLIC: pub.toString("base64url") };
}
