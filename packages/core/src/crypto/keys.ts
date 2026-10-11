import {
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importJWK,
  importPKCS8,
  importSPKI,
  type JWK,
} from "jose";

export const SIGNING_ALG = "EdDSA";

export interface SigningKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

export function generateSigningKeyPair(): Promise<SigningKeyPair> {
  return generateKeyPair("Ed25519", { extractable: true });
}

export function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
  return exportPKCS8(key);
}

export function exportPublicKeyPem(key: CryptoKey): Promise<string> {
  return exportSPKI(key);
}

export function importPrivateKeyPem(pem: string): Promise<CryptoKey> {
  return importPKCS8(pem, SIGNING_ALG, { extractable: true });
}

export function importPublicKeyPem(pem: string): Promise<CryptoKey> {
  return importSPKI(pem, SIGNING_ALG, { extractable: true });
}

export async function publicKeyFromPrivate(privateKey: CryptoKey): Promise<CryptoKey> {
  const { d: _d, ...publicJwk } = await exportJWK(privateKey);
  const key = await importJWK(publicJwk, SIGNING_ALG);
  if (!(key instanceof CryptoKey)) throw new TypeError("Expected an Ed25519 public key");
  return key;
}

// ARCHITECTURE §5.5: kid = first 8 chars of the public key thumbprint.
export async function keyId(publicKey: CryptoKey): Promise<string> {
  return (await calculateJwkThumbprint(await exportJWK(publicKey))).slice(0, 8);
}

export async function publicJwk(publicKey: CryptoKey): Promise<JWK> {
  return {
    ...(await exportJWK(publicKey)),
    kid: await keyId(publicKey),
    alg: SIGNING_ALG,
    use: "sig",
  };
}
