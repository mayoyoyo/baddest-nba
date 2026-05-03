const PBKDF2_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
    }
    return bytes;
}
async function derivePinHash(pin, salt, iterations) {
    const pinBytes = new TextEncoder().encode(pin);
    const rawPin = new Uint8Array(pinBytes.byteLength);
    rawPin.set(pinBytes);
    const rawSalt = new Uint8Array(salt.byteLength);
    rawSalt.set(salt);
    const keyMaterial = await crypto.subtle.importKey("raw", rawPin, "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt: rawSalt,
        iterations,
    }, keyMaterial, HASH_BYTES * 8);
    return new Uint8Array(bits);
}
function timingSafeEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    let diff = 0;
    for (let index = 0; index < left.length; index += 1) {
        diff |= left[index] ^ right[index];
    }
    return diff === 0;
}
export async function hashPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await derivePinHash(pin, salt, PBKDF2_ITERATIONS);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}
export async function verifyPin(pin, storedHash) {
    const [algorithm, iterationText, saltHex, hashHex] = storedHash.split("$");
    if (algorithm !== "pbkdf2" || !iterationText || !saltHex || !hashHex) {
        return false;
    }
    const iterations = Number.parseInt(iterationText, 10);
    if (!Number.isFinite(iterations)) {
        return false;
    }
    const expectedHash = hexToBytes(hashHex);
    const actualHash = await derivePinHash(pin, hexToBytes(saltHex), iterations);
    return timingSafeEqual(actualHash, expectedHash);
}
