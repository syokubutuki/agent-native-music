"""Mixer: track strips -> groups -> returns -> master bus -> loudness target.

mix.yaml schema:

    mix:
      sidechain_source: kick               # track whose note onsets drive ducking
      tracks:
        lead:
          gain_db: -4
          pan: 0.0
          width: 1.0
          lpf: 16000        # static track filters (also automatable)
          hpf: 150
          chain: [ {type: peak, freq: 3000, gain_db: 1.5} ]
          sidechain: {depth: 0.3, release: 0.4}   # release in beats; or a number = depth
          sends: {reverb: -10, delay: -16}         # dB, post-fader
          group: music
          mute: false
      groups:
        music: {chain: [...], gain_db: 0}
      returns:
        reverb: {chain: [{type: reverb, decay: 3.2, ...}], gain_db: 0, sidechain: {depth: 0.4}}
      master:
        chain: [...]
        target_lufs: -9.5
        ceiling_db: -1.0
        limiter: {release_ms: 80, lookahead_ms: 5}
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pyloudnorm as pyln

from ..composition.realize import stable_seed
from ..score import Score
from ..synthesis.dsp import db_to_amp, limiter, pan_gains, svf_stereo, true_peak_db
from .automation import curve_array, duck_envelope, targets_for
from .effects import apply_chain, width as apply_width


@dataclass
class MixResult:
    master: np.ndarray
    post_fader: dict[str, np.ndarray] = field(default_factory=dict)  # per track, post-fader stereo
    groups: dict[str, np.ndarray] = field(default_factory=dict)
    returns: dict[str, np.ndarray] = field(default_factory=dict)
    pre_limiter_lufs: float = 0.0
    master_gain_db: float = 0.0
    limiter_max_gr_db: float = 0.0
    final_lufs: float = 0.0
    final_true_peak_db: float = 0.0


def _filters(x, sr, static: dict, autos: dict, n, spb):
    for p, mode in (("hpf", "highpass"), ("lpf", "lowpass")):
        if p in autos:
            a = autos[p]
            c = curve_array(a["points"], a.get("curve", "exp"), n, sr, spb)
            x = svf_stereo(x, c, sr, mode, 0.707, 24 if mode == "highpass" else 12)
        elif static.get(p):
            x = svf_stereo(x, float(static[p]), sr, mode, 0.707, 24 if mode == "highpass" else 12)
    return x


def _gain_pan_width(x, sr, static: dict, autos: dict, n, spb):
    if "gain_db" in autos:
        a = autos["gain_db"]
        g = db_to_amp(curve_array(a["points"], a.get("curve", "linear"), n, sr, spb))
    else:
        g = float(db_to_amp(static.get("gain_db", 0.0)))
    x = x * g
    if "width" in autos:
        w = curve_array(autos["width"]["points"], "linear", n, sr, spb)
        x = apply_width(x, w)
    elif static.get("width", 1.0) != 1.0:
        x = apply_width(x, float(static["width"]))
    if "pan" in autos:
        pn = np.clip(curve_array(autos["pan"]["points"], "linear", n, sr, spb), -1, 1)
        th = (pn + 1) * np.pi / 4
        x = np.stack([x[0] * np.cos(th) * np.sqrt(2), x[1] * np.sin(th) * np.sqrt(2)])
    elif static.get("pan", 0.0):
        l, r = pan_gains(float(static["pan"]))
        x = np.stack([x[0] * l * np.sqrt(2), x[1] * r * np.sqrt(2)])
    return x


def _sc_params(v, default_release=0.45):
    if v is None:
        return 0.0, default_release, 2.0
    if isinstance(v, (int, float)):
        return float(v), default_release, 2.0
    return float(v.get("depth", 0.0)), float(v.get("release", default_release)), float(v.get("shape", 2.0))


def mix(score: Score, stems: dict[str, np.ndarray], mix_spec: dict, sr: int, seed: int) -> MixResult:
    n = next(iter(stems.values())).shape[1]
    spb = score.sec_per_beat()
    autos_all = score.automation
    tcfg = mix_spec.get("tracks") or {}
    sc_src = mix_spec.get("sidechain_source", "kick")
    onsets = []
    try:
        onsets = sorted({round(nt.start * spb, 6) for nt in score.track(sc_src).notes})
    except KeyError:
        pass
    duck_cache: dict[tuple, np.ndarray] = {}

    def duck(v):
        depth, rel_beats, shape = _sc_params(v)
        k = (depth, rel_beats, shape)
        if k not in duck_cache:
            duck_cache[k] = duck_envelope(onsets, n, sr, depth, rel_beats * spb, shape=shape)
        return duck_cache[k]

    returns_cfg = mix_spec.get("returns") or {}
    groups_cfg = mix_spec.get("groups") or {}
    send_bus = {r: np.zeros((2, n)) for r in returns_cfg}
    group_bus = {g: np.zeros((2, n)) for g in groups_cfg}
    master_in = np.zeros((2, n))
    res = MixResult(master=np.zeros((2, n)))

    for tr in score.tracks:
        if tr.name not in stems:
            continue
        cfg = tcfg.get(tr.name, {})
        if cfg.get("mute", tr.mute):
            continue
        autos = targets_for(autos_all, tr.name)
        x = stems[tr.name]
        x = _filters(x, sr, cfg, autos, n, spb)
        x = apply_chain(x, sr, cfg.get("chain"), score.tempo, stable_seed(seed, tr.name, "chain"))
        if cfg.get("sidechain") and tr.name != sc_src:
            x = x * duck(cfg["sidechain"])[None, :]
        x = _gain_pan_width(x, sr, cfg, autos, n, spb)
        res.post_fader[tr.name] = x
        for rname, lvl in (cfg.get("sends") or {}).items():
            if rname not in send_bus:
                raise ValueError(f"Track {tr.name} sends to unknown return '{rname}'")
            key = f"send.{rname}"
            if key in autos:
                a = autos[key]
                g = db_to_amp(curve_array(a["points"], a.get("curve", "linear"), n, sr, spb))
            else:
                g = float(db_to_amp(lvl))
            send_bus[rname] += x * g
        grp = cfg.get("group")
        if grp:
            if grp not in group_bus:
                raise ValueError(f"Track {tr.name} routed to unknown group '{grp}'")
            group_bus[grp] += x
        else:
            master_in += x

    for gname, gcfg in groups_cfg.items():
        autos = targets_for(autos_all, gname)
        x = _filters(group_bus[gname], sr, gcfg, autos, n, spb)
        x = apply_chain(x, sr, gcfg.get("chain"), score.tempo, stable_seed(seed, gname))
        x = _gain_pan_width(x, sr, gcfg, autos, n, spb)
        res.groups[gname] = x
        master_in += x

    for rname, rcfg in returns_cfg.items():
        autos = targets_for(autos_all, rname)
        x = apply_chain(send_bus[rname], sr, rcfg.get("chain"), score.tempo, stable_seed(seed, "return", rname))
        x = _filters(x, sr, rcfg, autos, n, spb)
        if rcfg.get("sidechain"):
            x = x * duck(rcfg["sidechain"])[None, :]
        x = _gain_pan_width(x, sr, rcfg, autos, n, spb)
        res.returns[rname] = x
        master_in += x

    mcfg = mix_spec.get("master") or {}
    autos = targets_for(autos_all, "master")
    x = _filters(master_in, sr, mcfg, autos, n, spb)
    x = apply_chain(x, sr, mcfg.get("chain"), score.tempo, stable_seed(seed, "master"))
    x = _gain_pan_width(x, sr, {k: v for k, v in mcfg.items() if k != "gain_db"}, autos, n, spb)

    meter = pyln.Meter(sr)
    target = float(mcfg.get("target_lufs", -10.0))
    ceiling = float(mcfg.get("ceiling_db", -1.0))
    lim = mcfg.get("limiter") or {}
    pre = meter.integrated_loudness(x.T)
    res.pre_limiter_lufs = float(pre)
    gain_db = target - pre
    y, gcurve = x, np.ones(n)
    for _ in range(4):  # limiting lowers loudness; iterate the input gain
        y, gcurve = limiter(x * db_to_amp(gain_db), sr, ceiling, float(lim.get("lookahead_ms", 5)),
                            float(lim.get("release_ms", 80)))
        got = meter.integrated_loudness(y.T)
        if abs(got - target) < 0.1:
            break
        gain_db += target - got
        gain_db = min(gain_db, 24.0)
    # safety: guarantee the true-peak ceiling after limiting
    tp = true_peak_db(y)
    if tp > ceiling:
        y = y * db_to_amp(ceiling - tp - 0.05)
    res.master = y
    res.master_gain_db = float(gain_db)
    res.limiter_max_gr_db = float(-20 * np.log10(max(np.min(gcurve), 1e-9)))
    res.final_lufs = float(meter.integrated_loudness(y.T))
    res.final_true_peak_db = float(true_peak_db(y))
    return res
