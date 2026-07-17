#!/usr/bin/env python3
"""把 JLPT 听力脚本合成为多说话人 m4a。

脚本按行解析，每行形如「男：…」「女：…」「店員：…」「ナレーター：…」。
每个不同说话人分配一个固定日语语音（性别尽量匹配），逐行用 macOS `say`
合成 WAV，用 Python wave 模块拼接（行间插入短停顿），最后 afconvert 编码
成 AAC/m4a。全程原创脚本，合成音频无版权问题。

用法:
  python3 tts_listen.py --script script.txt --out out.m4a
  python3 tts_listen.py --json items.json --outdir audio/   # 批量，按 id 命名
"""
import argparse
import json
import os
import re
import struct
import subprocess
import tempfile
import wave

RATE = 22050

# 说话人 → 语音。性别/身份尽量匹配；同性别多角色轮换不同音色以便区分。
MALE = ["Otoya", "Eddy (日语（日本）)", "Reed (日语（日本）)", "Rocko (日语（日本）)"]
FEMALE = ["Kyoko", "Flo (日语（日本）)", "Sandy (日语（日本）)", "Shelley (日语（日本）)"]
# 有些系统没有 Otoya（付费语音包）；运行时用 available_voices() 过滤。
NARRATOR = "Kyoko"

FEMALE_HINTS = ["女", "母", "妻", "娘", "彼女", "おば", "姉", "女性", "店員", "係員", "受付", "先生", "アナウンス", "ナレーター"]
MALE_HINTS = ["男", "父", "夫", "息子", "彼", "おじ", "兄", "男性", "部長", "課長", "社長"]


def available_voices():
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    voices = set()
    for line in out.splitlines():
        # "Kyoko               ja_JP    # ..."  或 "Flo (日语（日本）)        ja_JP ..."
        m = re.match(r"^(.*?)\s{2,}([a-z]{2}_[A-Z]{2})\b", line)
        if m and m.group(2) == "ja_JP":
            voices.add(m.group(1).strip())
    return voices


def assign_voices(speakers, avail):
    male = [v for v in MALE if v in avail] or [v for v in avail if v not in FEMALE]
    female = [v for v in FEMALE if v in avail]
    if not female:
        female = sorted(avail)[:1] or ["Kyoko"]
    if not male:
        male = female
    mapping = {}
    mi = fi = 0
    for sp in speakers:
        is_female = any(h in sp for h in FEMALE_HINTS) and not any(h in sp for h in MALE_HINTS)
        if is_female:
            mapping[sp] = female[fi % len(female)]; fi += 1
        else:
            mapping[sp] = male[mi % len(male)]; mi += 1
    return mapping


def parse_script(text):
    lines = []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        m = re.match(r"^([^:：]{1,12})[:：]\s*(.+)$", raw)
        if m:
            lines.append((m.group(1).strip(), m.group(2).strip()))
        else:
            lines.append(("ナレーター", raw))
    return lines


def say_to_wav(voice, text, path):
    subprocess.run(
        ["say", "-v", voice, "-o", path, "--file-format=WAVE",
         f"--data-format=LEI16@{RATE}", text],
        check=True, capture_output=True,
    )


def read_frames(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def silence(ms):
    return b"\x00\x00" * int(RATE * ms / 1000)


def synth(script_text, out_m4a):
    lines = parse_script(script_text)
    if not lines:
        return False
    avail = available_voices()
    speakers = []
    for sp, _ in lines:
        if sp not in speakers:
            speakers.append(sp)
    vmap = assign_voices(speakers, avail)

    frames = bytearray()
    frames += silence(300)
    with tempfile.TemporaryDirectory() as tmp:
        for i, (sp, txt) in enumerate(lines):
            wavp = os.path.join(tmp, f"{i}.wav")
            say_to_wav(vmap.get(sp, NARRATOR), txt, wavp)
            frames += read_frames(wavp)
            frames += silence(500 if i < len(lines) - 1 else 300)
        wav_all = os.path.join(tmp, "all.wav")
        with wave.open(wav_all, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes(bytes(frames))
        os.makedirs(os.path.dirname(os.path.abspath(out_m4a)) or ".", exist_ok=True)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000",
                        wav_all, out_m4a], check=True, capture_output=True)
    return True


def duration_seconds(m4a):
    out = subprocess.run(["afinfo", m4a], capture_output=True, text=True).stdout
    m = re.search(r"estimated duration:\s*([\d.]+)\s*sec", out)
    return float(m.group(1)) if m else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script")
    ap.add_argument("--out")
    ap.add_argument("--json")
    ap.add_argument("--outdir")
    a = ap.parse_args()
    if a.script and a.out:
        ok = synth(open(a.script, encoding="utf-8").read(), a.out)
        print("OK" if ok else "EMPTY", a.out, f"{duration_seconds(a.out):.1f}s" if ok else "")
    elif a.json and a.outdir:
        items = json.load(open(a.json, encoding="utf-8"))
        os.makedirs(a.outdir, exist_ok=True)
        n = 0
        for it in items:
            p = os.path.join(a.outdir, it["id"] + ".m4a")
            if synth(it["passage"], p):
                n += 1
        print(f"synthesized {n}/{len(items)} -> {a.outdir}")


if __name__ == "__main__":
    main()
