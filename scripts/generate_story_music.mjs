import fs from 'node:fs'
import path from 'node:path'

const sampleRate = 22050
const duration = 18
const tracks = [
  { file: 'nexo-pulso.wav', bpm: 118, chords: [[261.63, 329.63, 392], [293.66, 369.99, 440], [220, 261.63, 329.63], [246.94, 311.13, 369.99]], lead: [523.25, 659.25, 783.99, 659.25], mood: 'animada' },
  { file: 'aurora-neon.wav', bpm: 94, chords: [[220, 261.63, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]], lead: [440, 493.88, 523.25, 659.25], mood: 'calma' },
  { file: 'modo-foco.wav', bpm: 82, chords: [[130.81, 196, 261.63], [146.83, 220, 293.66], [164.81, 246.94, 329.63], [146.83, 220, 293.66]], lead: [392, 440, 493.88, 440], mood: 'foco' },
  { file: 'conexao.wav', bpm: 106, chords: [[196, 246.94, 293.66], [220, 261.63, 329.63], [246.94, 293.66, 369.99], [220, 261.63, 329.63]], lead: [587.33, 659.25, 739.99, 659.25], mood: 'animada' },
  { file: 'respiro.wav', bpm: 72, chords: [[174.61, 220, 261.63], [164.81, 207.65, 246.94], [146.83, 196, 246.94], [164.81, 207.65, 261.63]], lead: [349.23, 392, 440, 392], mood: 'calma' },
  { file: 'passo-a-frente.wav', bpm: 124, chords: [[246.94, 311.13, 369.99], [277.18, 349.23, 415.3], [220, 277.18, 329.63], [246.94, 311.13, 415.3]], lead: [493.88, 622.25, 739.99, 830.61], mood: 'animada' },
]

const outputDir = path.resolve('public', 'music')
fs.mkdirSync(outputDir, { recursive: true })

function envelope(t, beat) {
  const phase = (t % beat) / beat
  return Math.exp(-3.2 * phase)
}

function writeWav(track) {
  const samples = sampleRate * duration
  const data = Buffer.alloc(samples * 2)
  const beat = 60 / track.bpm
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate
    const bar = Math.floor(t / (beat * 4)) % track.chords.length
    const step = Math.floor(t / beat) % track.lead.length
    const chord = track.chords[bar]
    const pad = chord.reduce((sum, frequency, index) => sum + Math.sin(2 * Math.PI * frequency * t + index * 0.3), 0) / chord.length
    const bass = Math.sin(2 * Math.PI * (chord[0] / 2) * t) * envelope(t, beat * 2)
    const lead = Math.sin(2 * Math.PI * track.lead[step] * t) * envelope(t, beat) * (track.mood === 'foco' ? 0.11 : 0.18)
    const kickPhase = t % beat
    const kick = Math.sin(2 * Math.PI * (70 - kickPhase * 35) * t) * Math.exp(-18 * kickPhase)
    const fade = Math.min(1, t / 0.4, (duration - t) / 0.5)
    const value = Math.max(-1, Math.min(1, (pad * 0.22 + bass * 0.18 + lead + kick * 0.12) * fade))
    data.writeInt16LE(Math.round(value * 32767), i * 2)
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  fs.writeFileSync(path.join(outputDir, track.file), Buffer.concat([header, data]))
}

tracks.forEach(writeWav)
console.log(`Geradas ${tracks.length} faixas originais em ${outputDir}`)
