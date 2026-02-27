const textEncoder = new TextEncoder()

export const hashPin = async (pin: string): Promise<string> => {
  const data = textEncoder.encode(pin.trim())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashBytes = Array.from(new Uint8Array(hashBuffer))
  return hashBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

