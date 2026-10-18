// Prints a fresh VAPID key pair for web push. Run once: npm run keys
import { webcrypto as crypto } from 'node:crypto'

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)

console.log('\nSave these as Worker secrets (npx wrangler secret put <NAME>):\n')
console.log('VAPID_PUBLIC_KEY =', pub)
console.log('VAPID_PRIVATE_KEY =', jwk.d)
console.log('\nKeep the private key secret. The public key is safe to share.\n')
