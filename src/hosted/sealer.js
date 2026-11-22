import crypto from 'node:crypto'

export function createSealer (secret) {
  const key = crypto.createHash('sha256').update(secret).digest()

  function seal (data) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
  }

  function open (value) {
    try {
      const raw = Buffer.from(value, 'base64url')
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      const decrypted = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()])
      return JSON.parse(decrypted.toString('utf8'))
    } catch {
      return undefined
    }
  }

  return { seal, open }
}
