"""Measure paired Azure PCM samples. Requires numpy and praat-parselmouth."""
import argparse
import json
import math
import sys
import wave
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--deps', type=Path)
args = parser.parse_args()
if args.deps:
    sys.path.insert(0, str(args.deps.resolve()))
import numpy as np
import parselmouth

root = args.directory.resolve()
inventory = json.loads((root / 'inventory.json').read_text(encoding='utf-8'))


def measure(path):
    samples = np.fromfile(path, dtype='<i2').astype(float) / 32768
    with wave.open(str(path.with_suffix('.wav')), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes((samples * 32768).astype('<i2').tobytes())
    frame = 160
    count = len(samples) // frame
    rms = np.sqrt(np.mean(samples[:count * frame].reshape(-1, frame) ** 2, axis=1))
    silent = rms < max(0.001, float(np.max(rms)) * 0.015)
    active = np.flatnonzero(~silent)
    inner = silent[active[0]:active[-1] + 1] if len(active) else silent
    gaps = np.diff(np.flatnonzero(np.concatenate(([True], ~inner, [True])))) - 1
    longest_gap = float(np.max(gaps, initial=0)) * .01
    sound = parselmouth.Sound(samples, sampling_frequency=16000)
    frequencies = sound.to_pitch_ac(time_step=.01, pitch_floor=40, pitch_ceiling=600).selected_array['frequency']
    voiced = frequencies[frequencies > 0]
    return {'seconds': round(len(samples) / 16000, 4), 'gap': round(longest_gap, 4),
            'f0': round(float(np.median(voiced)), 3) if len(voiced) else None}


report = []
for voice in inventory['voices']:
    measurements = {}
    for path in sorted(root.glob(f"{voice['index']:02d}-*.pcm")):
        variant = path.stem.split('-', 1)[1]
        measurements[variant] = measure(path)
    result = {**voice, 'measurements': measurements, 'controls': {'pause': False, 'rate': False, 'pitch': False}}
    if all(key in measurements for key in ['baseline-1', 'baseline-2', 'pause', 'slow', 'fast', 'low', 'high']):
        bases = [value for key, value in measurements.items() if key.startswith('baseline-')]
        duration = float(np.median([base['seconds'] for base in bases]))
        pitch = float(np.median([base['f0'] for base in bases]))
        variation = (max(base['seconds'] for base in bases) - min(base['seconds'] for base in bases)) / duration
        pitch_variation = (max(base['f0'] for base in bases) - min(base['f0'] for base in bases)) / pitch
        groups = {name: [value for key, value in measurements.items() if key == name or key.startswith(name + '-')] for name in ['slow', 'fast', 'low', 'high']}
        ratios = {key: round(float(np.median([value['seconds'] for value in groups[key]])) / duration, 3) for key in ['slow', 'fast']}
        ratios.update({key: round(float(np.median([value['f0'] for value in groups[key]])) / pitch, 3) for key in ['low', 'high']})
        def agrees(name, field, predicate):
            return sum(predicate(value[field]) for value in groups[name]) >= math.ceil(len(groups[name]) * .66)
        result['baselineVariation'] = {'duration': round(variation, 3), 'pitch': round(pitch_variation, 3)}
        result['ratios'] = ratios
        result['controls'] = {
            'pause': measurements['pause']['gap'] >= .9 and measurements['pause']['gap'] >= max(base['gap'] for base in bases) + .5,
            'rate': ratios['slow'] >= 1.15 and ratios['fast'] <= .88 and agrees('slow', 'seconds', lambda value: value > duration * 1.12) and agrees('fast', 'seconds', lambda value: value < duration * .9),
            'pitch': ratios['low'] <= .90 and ratios['high'] >= 1.12 and agrees('low', 'f0', lambda value: value < pitch * .9) and agrees('high', 'f0', lambda value: value > pitch * 1.12),
        }
    report.append(result)
    print(voice['player'], result['controls'], result.get('ratios'))
(root / 'measurements.json').write_text(json.dumps({'region': inventory['region'], 'voices': report}, ensure_ascii=False, indent=2), encoding='utf-8')
