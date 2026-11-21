// On-phone photo check (works offline): sharpness = variance of the Laplacian on a small
// grayscale copy; plus mean brightness. Same idea and threshold (60) as B's OCR quality gate,
// so the person is asked to retake BEFORE spending scarce data on a useless upload.
export interface Quality { quality: 'good' | 'low' | 'unreadable'; sharpness: number; brightness: number }

export const SHARPNESS_MIN = 60

export function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  let sum = 0, sumSq = 0, n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += lap; sumSq += lap * lap; n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

export function judge(sharpness: number, brightness: number): Quality['quality'] {
  if (brightness < 35 || brightness > 235) return 'unreadable'
  return sharpness >= SHARPNESS_MIN ? 'good' : 'low'
}

export async function checkImage(file: Blob): Promise<Quality> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height))
  const w = Math.max(3, Math.round(bmp.width * scale)), h = Math.max(3, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  let b = 0
  for (let i = 0; i < w * h; i++) { const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]; gray[i] = g; b += g }
  const brightness = b / (w * h)
  const sharpness = laplacianVariance(gray, w, h)
  return { quality: judge(sharpness, brightness), sharpness, brightness }
}
